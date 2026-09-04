"""Convert Bruno collection JSON into Flow Tester scenario documents."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode


_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"})


def is_bruno_collection(payload: dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    items = payload.get("items")
    if not isinstance(items, list):
        return False
    if payload.get("info") is not None and payload.get("item") is not None:
        return False
    if str(payload.get("type", "")).startswith("collection.insomnia"):
        return False
    if "openapi" in payload or "swagger" in payload or "paths" in payload:
        # Prefer OpenAPI detection when those keys dominate.
        if isinstance(payload.get("paths"), dict) and ("openapi" in payload or "swagger" in payload):
            return False
    version = str(payload.get("version") or "")
    if version in {"1", "1.0"} and isinstance(payload.get("root"), dict):
        return True
    return any(_looks_like_bruno_item(item) for item in items if isinstance(item, dict))


def _looks_like_bruno_item(item: dict[str, Any]) -> bool:
    item_type = str(item.get("type") or "")
    if item_type in {"http-request", "graphql-request", "folder"}:
        return True
    if isinstance(item.get("request"), dict) and isinstance(item.get("uid"), str):
        return True
    if item_type == "folder" or isinstance(item.get("items"), list):
        return True
    return False


def _enabled_pairs(entries: Any) -> list[tuple[str, str]]:
    if not isinstance(entries, list):
        return []
    pairs: list[tuple[str, str]] = []
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("enabled") is False:
            continue
        name = str(entry.get("name") or entry.get("key") or "").strip()
        if not name:
            continue
        value = entry.get("value")
        pairs.append((name, "" if value is None else str(value)))
    return pairs


def _path_from_bruno_request(request: dict[str, Any]) -> str:
    url = str(request.get("url") or "").strip() or "/"
    query: list[tuple[str, str]] = []
    if isinstance(request.get("params"), list):
        for entry in request["params"]:
            if not isinstance(entry, dict) or entry.get("enabled") is False:
                continue
            if str(entry.get("type") or "query") != "query":
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            query.append((name, "" if entry.get("value") is None else str(entry.get("value"))))
    if not query:
        return url
    if "?" in url:
        return url
    return f"{url}?{urlencode(query, doseq=True)}"


def _headers_from_bruno(request: dict[str, Any]) -> dict[str, str]:
    return {name: value for name, value in _enabled_pairs(request.get("headers"))}


def _body_from_bruno(request: dict[str, Any]) -> tuple[Any | None, Any | None]:
    body = request.get("body")
    if not isinstance(body, dict):
        return None, None
    mode = str(body.get("mode") or "none").lower()
    if mode == "json":
        raw = body.get("json")
        if raw is None:
            return None, None
        if isinstance(raw, (dict, list)):
            return raw, None
        text = str(raw).strip()
        if not text:
            return None, None
        try:
            return json.loads(text), None
        except Exception:
            return text, None
    if mode in {"text", "xml"}:
        text = body.get("text") if mode == "text" else body.get("xml")
        if text is None or str(text) == "":
            return None, None
        return None, str(text)
    if mode == "formurlencoded":
        data = {name: value for name, value in _enabled_pairs(body.get("formUrlEncoded"))}
        return None, data or None
    return None, None


def _auth_from_bruno(request: dict[str, Any]) -> dict[str, Any] | None:
    auth = request.get("auth")
    if not isinstance(auth, dict):
        return None
    mode = str(auth.get("mode") or "").lower()
    if mode == "bearer":
        bearer = auth.get("bearer") if isinstance(auth.get("bearer"), dict) else {}
        token = str(bearer.get("token") or "").strip()
        if token:
            return {"type": "bearer", "token": token}
    if mode == "basic":
        basic = auth.get("basic") if isinstance(auth.get("basic"), dict) else {}
        return {
            "type": "basic",
            "username": str(basic.get("username") or ""),
            "password": str(basic.get("password") or ""),
        }
    return None


def _flatten_bruno_items(items: Any, prefix: str = "") -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    flat: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "request").strip() or "request"
        item_type = str(item.get("type") or "")
        if item_type == "folder" or (isinstance(item.get("items"), list) and "request" not in item):
            nested_prefix = f"{prefix}{name} / " if prefix or name else prefix
            flat.extend(_flatten_bruno_items(item.get("items"), nested_prefix))
            continue
        if item_type == "graphql-request":
            continue
        request = item.get("request")
        if not isinstance(request, dict):
            continue
        method = str(request.get("method") or "GET").upper()
        if method not in _HTTP_METHODS:
            continue
        step_name = f"{prefix}{name}" if prefix else name
        step: dict[str, Any] = {
            "name": step_name,
            "method": method,
            "path": _path_from_bruno_request(request),
        }
        headers = _headers_from_bruno(request)
        if headers:
            step["headers"] = headers
        payload_json, payload_data = _body_from_bruno(request)
        if payload_json is not None:
            step["json"] = payload_json
        elif payload_data is not None:
            step["data"] = payload_data
        auth = _auth_from_bruno(request)
        if auth:
            step["auth"] = auth
        docs = str(request.get("docs") or "").strip()
        if docs:
            step["description"] = docs
        flat.append(step)
    return flat


def _environments_from_bruno(payload: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], str]:
    environments: dict[str, dict[str, Any]] = {}
    selected = ""
    for entry in payload.get("environments") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "Environment").strip() or "Environment"
        values: dict[str, Any] = {}
        for variable in entry.get("variables") or []:
            if not isinstance(variable, dict) or variable.get("enabled") is False:
                continue
            key = str(variable.get("name") or "").strip()
            if not key:
                continue
            values[key] = "" if variable.get("value") is None else str(variable.get("value"))
        environments[name] = values
        if not selected:
            selected = name
    return environments, selected


def convert_bruno_collection(payload: dict[str, Any]) -> dict[str, Any]:
    steps = _flatten_bruno_items(payload.get("items"))
    if not steps:
        raise ValueError("No HTTP requests found in Bruno collection")
    environments, selected = _environments_from_bruno(payload)
    inferred_base = ""
    if selected and environments.get(selected):
        env = environments[selected]
        inferred_base = str(env.get("server") or env.get("base_url") or env.get("baseUrl") or "")
    return {
        "name": str(payload.get("name") or "bruno_import"),
        "description": str((payload.get("root") or {}).get("docs") or "") if isinstance(payload.get("root"), dict) else "",
        "base_url": inferred_base,
        "random_generators": {},
        "environments": environments,
        "selected_environment": selected,
        "steps": steps,
    }


def bruno_suggested_name(payload: dict[str, Any]) -> str:
    name = str(payload.get("name") or "").strip()
    if name:
        return name
    root = payload.get("root")
    if isinstance(root, dict):
        meta = root.get("meta")
        if isinstance(meta, dict) and meta.get("name"):
            return str(meta["name"])
    return "bruno_import"
