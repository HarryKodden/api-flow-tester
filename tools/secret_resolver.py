#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

try:
    import yaml
except Exception:  # pragma: no cover
    yaml = None

SECRET_REF_RE = re.compile(r"^\$\{secret:([A-Za-z0-9_.:-]+)\}$")
SENSITIVE_TEXT_RE = re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)([^\s\"']+)")


def _path_get(data: Any, path: str) -> Any:
    current = data
    for chunk in path.split("."):
        if not isinstance(current, dict) or chunk not in current:
            return None
        current = current[chunk]
    return current


def _normalize_env_key(name: str) -> str:
    return "LTI_SECRET_" + re.sub(r"[^A-Za-z0-9]", "_", name).upper()


def _parse_secret_blob(raw_text: str, source: str) -> dict[str, Any]:
    parsed: Any = None
    try:
        parsed = json.loads(raw_text)
    except Exception:
        if yaml is None:
            raise ValueError(f"Failed to parse secrets in {source} as JSON (PyYAML unavailable for YAML fallback)")
        parsed = yaml.safe_load(raw_text)

    if not isinstance(parsed, dict):
        raise ValueError(f"Secrets source {source} must be a JSON/YAML object")

    if isinstance(parsed.get("secrets"), dict):
        return dict(parsed["secrets"])
    return dict(parsed)


def load_secret_store(secrets_file: str | None = None) -> dict[str, Any]:
    """Load secrets from optional file plus env vars (LTI_SECRET_*).

    If a secrets file appears to be SOPS-encrypted and `sops` is available,
    the function attempts `sops -d <file>` before parsing.
    """
    store: dict[str, Any] = {}

    for key, value in os.environ.items():
        if key.startswith("LTI_SECRET_"):
            store[key.removeprefix("LTI_SECRET_").lower()] = value

    chosen_file = secrets_file or os.environ.get("LTI_SECRETS_FILE")
    if not chosen_file:
        return store

    path = Path(chosen_file)
    if not path.exists():
        raise FileNotFoundError(f"Secrets file not found: {path}")

    raw_text = path.read_text(encoding="utf-8")
    looks_sops = "\nsops:" in raw_text or path.suffix in {".enc", ".sops"} or ".enc." in path.name
    if looks_sops and shutil.which("sops"):
        proc = subprocess.run(["sops", "-d", str(path)], capture_output=True, text=True)
        if proc.returncode != 0:
            if secrets_file:
                raise ValueError(f"Failed to decrypt SOPS secrets file {path}: {proc.stderr.strip()}")
            return store
        raw_text = proc.stdout
    elif looks_sops and secrets_file:
        raise ValueError(f"Secrets file {path} is SOPS-encrypted but the sops CLI is not available")
    elif looks_sops:
        return store

    loaded = _parse_secret_blob(raw_text, str(path))
    for key, value in loaded.items():
        store[str(key).lower()] = value

    return store


def resolve_secret_reference(ref: str, secret_store: dict[str, Any], strict: bool = True) -> Any:
    match = SECRET_REF_RE.match(ref.strip())
    if not match:
        return ref

    name = match.group(1)
    lower_name = name.lower()

    if lower_name in secret_store:
        return secret_store[lower_name]

    nested = _path_get(secret_store, lower_name)
    if nested is not None:
        return nested

    env_key = _normalize_env_key(name)
    if env_key in os.environ:
        return os.environ[env_key]

    if strict:
        raise KeyError(f"Secret not found: {name}")
    return ref


def resolve_secret_refs_in_obj(value: Any, secret_store: dict[str, Any], strict: bool = True) -> Any:
    if isinstance(value, str):
        return resolve_secret_reference(value, secret_store, strict=strict)
    if isinstance(value, dict):
        return {k: resolve_secret_refs_in_obj(v, secret_store, strict=strict) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_secret_refs_in_obj(v, secret_store, strict=strict) for v in value]
    return value


def mask_sensitive_text(text: str, extra_secret_values: list[str] | None = None) -> str:
    if not text:
        return text

    masked = SENSITIVE_TEXT_RE.sub(lambda m: m.group(1) + "***", text)
    for value in extra_secret_values or []:
        if isinstance(value, str) and value:
            masked = masked.replace(value, "***")
    return masked
