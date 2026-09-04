"""Parse a curl command into scenario step fields."""
from __future__ import annotations

import base64
import json
import re
import shlex
from typing import Any
from urllib.parse import urlparse

SKIP_HEADERS = {
    "host",
    "content-length",
    "connection",
    "accept-encoding",
    "transfer-encoding",
}

FLAG_ARGS = {
    "-X",
    "--request",
    "-H",
    "--header",
    "-d",
    "--data",
    "--data-raw",
    "--data-binary",
    "--data-ascii",
    "--json",
    "--url",
    "-u",
    "--user",
    "-m",
    "--max-time",
    "-A",
    "--user-agent",
    "--connect-timeout",
}

BARE_FLAGS = {
    "-s",
    "-S",
    "-sS",
    "-k",
    "-L",
    "-v",
    "-g",
    "-I",
    "-G",
    "-f",
    "--silent",
    "--show-error",
    "--insecure",
    "--location",
    "--compressed",
    "--fail",
    "--head",
    "--get",
    "--include",
    "-i",
}


def _normalize_curl_text(text: str) -> str:
    cleaned = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"\\\s*\n", " ", cleaned)
    return cleaned.strip()


def _split_tokens(text: str) -> list[str]:
    try:
        return shlex.split(_normalize_curl_text(text), posix=True)
    except ValueError as exc:
        raise ValueError(f"Could not parse curl: {exc}") from exc


def _is_curl(token: str) -> bool:
    name = token.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    return name in {"curl", "curl.exe"}


def _strip_assignment_prefix(tokens: list[str]) -> list[str]:
    while tokens and "=" in tokens[0] and not tokens[0].startswith("-") and "://" not in tokens[0]:
        tokens = tokens[1:]
    return tokens


def _option_and_inline(token: str) -> tuple[str, str | None]:
    if token.startswith("--") and "=" in token:
        name, value = token.split("=", 1)
        return name, value
    if token.startswith("-") and not token.startswith("--") and len(token) > 2:
        return token[:2], token[2:]
    return token, None


def _parse_header(raw: str) -> tuple[str, str] | None:
    if ":" not in raw:
        return None
    name, value = raw.split(":", 1)
    name = name.strip()
    if not name or name.lower() in SKIP_HEADERS:
        return None
    return name, value.strip()


def _looks_like_json(value: str) -> bool:
    stripped = value.lstrip()
    return stripped.startswith("{") or stripped.startswith("[")


def _basic_auth_header(user_pass: str) -> str:
    token = base64.b64encode(user_pass.encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _default_name(url: str, method: str) -> str:
    parsed = urlparse(url)
    segment = [part for part in parsed.path.split("/") if part]
    if segment:
        return segment[-1].split("?")[0][:80]
    host = parsed.hostname or "request"
    return f"{method.lower()}_{host.replace('.', '_')}"[:80]


def parse_curl_command(text: str) -> dict[str, Any]:
    tokens = _strip_assignment_prefix(_split_tokens(text))
    if not tokens:
        raise ValueError("Paste a curl command")
    if _is_curl(tokens[0]):
        tokens = tokens[1:]
    elif not (tokens[0].startswith("-") or tokens[0].startswith("http://") or tokens[0].startswith("https://") or tokens[0].startswith("/")):
        raise ValueError("Paste a curl command")

    method = "GET"
    method_explicit = False
    url = ""
    headers: dict[str, str] = {}
    body: str | None = None
    json_forced = False
    follow_redirects = False
    timeout: float | None = None
    index = 0
    while index < len(tokens):
        token = tokens[index]
        option, inline = _option_and_inline(token) if token.startswith("-") else (token, None)
        if option in {"-I", "--head"}:
            method = "HEAD"
            method_explicit = True
            index += 1
            continue
        if option in {"-L", "--location"}:
            follow_redirects = True
            index += 1
            continue
        if option in BARE_FLAGS:
            index += 1
            continue
        if option in FLAG_ARGS:
            value = inline
            if value is None:
                index += 1
                if index >= len(tokens):
                    raise ValueError(f"Missing value for {option}")
                value = tokens[index]
            if option in {"-X", "--request"}:
                method = str(value or "GET").upper() or "GET"
                method_explicit = True
            elif option in {"-H", "--header"}:
                parsed = _parse_header(value)
                if parsed:
                    headers[parsed[0]] = parsed[1]
            elif option in {"-d", "--data", "--data-raw", "--data-binary", "--data-ascii"}:
                body = value
            elif option == "--json":
                body = value
                json_forced = True
            elif option == "--url":
                url = value
            elif option in {"-u", "--user"}:
                headers["Authorization"] = _basic_auth_header(value)
            elif option in {"-m", "--max-time", "--connect-timeout"}:
                try:
                    timeout = float(value)
                except ValueError:
                    timeout = None
            elif option in {"-A", "--user-agent"}:
                headers["User-Agent"] = value
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        if not url:
            url = token
        index += 1

    if not url:
        raise ValueError("curl is missing a URL")
    if body is not None and not method_explicit:
        method = "POST"
    if json_forced:
        if not any(key.lower() == "content-type" for key in headers):
            headers["Content-Type"] = "application/json"
        if not any(key.lower() == "accept" for key in headers):
            headers["Accept"] = "application/json"

    result: dict[str, Any] = {
        "method": method,
        "path": url,
        "headers": headers,
        "name": _default_name(url, method),
        "follow_redirects": True if follow_redirects or url.startswith("http://") or url.startswith("https://") else False,
    }
    if timeout is not None and timeout > 0:
        result["timeout"] = timeout

    content_type = next((value for key, value in headers.items() if key.lower() == "content-type"), "")
    if body is not None:
        if json_forced or "json" in content_type.lower() or _looks_like_json(body):
            try:
                result["json"] = json.loads(body)
            except json.JSONDecodeError:
                if json_forced or "json" in content_type.lower():
                    result["json"] = body
                else:
                    result["data"] = body
        else:
            result["data"] = body
    return result
