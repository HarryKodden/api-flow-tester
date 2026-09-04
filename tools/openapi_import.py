"""Convert OpenAPI / Swagger documents into Flow Tester scenario documents."""

from __future__ import annotations

import copy
import re
from typing import Any
from urllib.parse import urlencode


_HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})
_PATH_PARAM_RE = re.compile(r"\{([^}/]+)\}")


def is_openapi_document(payload: dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("openapi") is not None or payload.get("swagger") is not None:
        return isinstance(payload.get("paths"), dict)
    return False


def openapi_suggested_name(payload: dict[str, Any]) -> str:
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    title = str(info.get("title") or "").strip()
    return title or "openapi_import"


def _resolve_ref(document: dict[str, Any], node: Any, depth: int = 0) -> Any:
    if depth > 8 or not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return {key: _resolve_ref(document, value, depth) for key, value in node.items()}
    current: Any = document
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            return node
        current = current[part]
    if isinstance(current, dict):
        return _resolve_ref(document, copy.deepcopy(current), depth + 1)
    return copy.deepcopy(current)


def _schema_example(schema: Any, document: dict[str, Any], depth: int = 0) -> Any:
    if depth > 6 or not isinstance(schema, dict):
        return None
    schema = _resolve_ref(document, schema, depth)
    if not isinstance(schema, dict):
        return None
    if "example" in schema:
        return schema["example"]
    if "default" in schema:
        return schema["default"]
    if "enum" in schema and isinstance(schema["enum"], list) and schema["enum"]:
        return schema["enum"][0]
    schema_type = schema.get("type")
    if "properties" in schema or schema_type == "object":
        props = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        required = set(schema.get("required") or [])
        out: dict[str, Any] = {}
        for key, prop in props.items():
            if required and key not in required and depth > 0:
                continue
            value = _schema_example(prop, document, depth + 1)
            if value is not None:
                out[key] = value
        return out
    if schema_type == "array":
        item = _schema_example(schema.get("items"), document, depth + 1)
        return [item] if item is not None else []
    if schema_type == "integer":
        return 0
    if schema_type == "number":
        return 0
    if schema_type == "boolean":
        return False
    if schema_type == "string":
        return ""
    return None


def _request_body_example(operation: dict[str, Any], document: dict[str, Any]) -> tuple[Any | None, dict[str, str]]:
    headers: dict[str, str] = {}
    body = operation.get("requestBody")
    if not isinstance(body, dict):
        # Swagger 2 body parameter
        for param in operation.get("parameters") or []:
            if not isinstance(param, dict) or param.get("in") != "body":
                continue
            schema = param.get("schema") if isinstance(param.get("schema"), dict) else {}
            example = schema.get("example")
            if example is None:
                example = _schema_example(schema, document)
            return example, headers
        return None, headers

    body = _resolve_ref(document, body)
    content = body.get("content") if isinstance(body, dict) and isinstance(body.get("content"), dict) else {}
    preferred = (
        "application/json",
        "application/problem+json",
        "text/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "text/plain",
    )
    media_types = [name for name in preferred if name in content] + [name for name in content if name not in preferred]
    for media_type in media_types:
        media = content.get(media_type)
        if not isinstance(media, dict):
            continue
        example = media.get("example")
        if example is None and isinstance(media.get("examples"), dict):
            first = next(iter(media["examples"].values()), None)
            if isinstance(first, dict) and "value" in first:
                example = first["value"]
        if example is None:
            example = _schema_example(media.get("schema"), document)
        if example is None:
            continue
        if media_type and media_type != "multipart/form-data":
            headers["Content-Type"] = media_type
        return example, headers
    return None, headers


def _merge_parameters(*groups: Any) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for group in groups:
        if isinstance(group, list):
            merged.extend(item for item in group if isinstance(item, dict))
    return merged


def _path_with_params(path: str, parameters: list[dict[str, Any]], document: dict[str, Any]) -> str:
    rendered = _PATH_PARAM_RE.sub(lambda match: "{{" + match.group(1) + "}}", path)
    query: list[tuple[str, str]] = []
    for param in parameters:
        param = _resolve_ref(document, param)
        if not isinstance(param, dict) or param.get("in") != "query":
            continue
        name = str(param.get("name") or "").strip()
        if not name:
            continue
        example = param.get("example")
        if example is None and isinstance(param.get("schema"), dict):
            example = param["schema"].get("example", param["schema"].get("default"))
        if example is None:
            example = f"{{{{{name}}}}}"
        else:
            example = str(example)
        query.append((name, example))
    if not query:
        return rendered
    return f"{rendered}?{urlencode(query, doseq=True)}"


def _headers_from_parameters(parameters: list[dict[str, Any]], document: dict[str, Any]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for param in parameters:
        param = _resolve_ref(document, param)
        if not isinstance(param, dict) or param.get("in") != "header":
            continue
        name = str(param.get("name") or "").strip()
        if not name:
            continue
        example = param.get("example")
        if example is None and isinstance(param.get("schema"), dict):
            example = param["schema"].get("example", param["schema"].get("default"))
        headers[name] = "" if example is None else str(example)
    return headers


def _servers(payload: dict[str, Any]) -> list[str]:
    servers = payload.get("servers")
    urls: list[str] = []
    if isinstance(servers, list):
        for server in servers:
            if isinstance(server, dict) and server.get("url"):
                urls.append(str(server["url"]).rstrip("/"))
    host = str(payload.get("host") or "").strip()
    if host:
        schemes = payload.get("schemes") if isinstance(payload.get("schemes"), list) else ["https"]
        scheme = str(schemes[0] if schemes else "https")
        base_path = str(payload.get("basePath") or "").rstrip("/")
        urls.append(f"{scheme}://{host}{base_path}")
    return urls


def convert_openapi_document(payload: dict[str, Any]) -> dict[str, Any]:
    paths = payload.get("paths")
    if not isinstance(paths, dict) or not paths:
        raise ValueError("OpenAPI document has no paths")

    steps: list[dict[str, Any]] = []
    used_names: set[str] = set()
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        path_item = _resolve_ref(payload, path_item)
        if not isinstance(path_item, dict):
            continue
        shared_params = path_item.get("parameters") if isinstance(path_item.get("parameters"), list) else []
        for method, operation in path_item.items():
            if str(method).lower() not in _HTTP_METHODS or not isinstance(operation, dict):
                continue
            operation = _resolve_ref(payload, operation)
            if not isinstance(operation, dict):
                continue
            base_name = str(
                operation.get("operationId")
                or operation.get("summary")
                or f"{method.upper()} {path}"
            ).strip()
            name = base_name
            counter = 2
            while name.lower() in used_names:
                name = f"{base_name}_{counter}"
                counter += 1
            used_names.add(name.lower())

            parameters = _merge_parameters(shared_params, operation.get("parameters"))
            step: dict[str, Any] = {
                "name": name,
                "method": str(method).upper(),
                "path": _path_with_params(str(path), parameters, payload),
            }
            description = str(operation.get("description") or operation.get("summary") or "").strip()
            if description:
                step["description"] = description

            headers = _headers_from_parameters(parameters, payload)
            body_example, body_headers = _request_body_example(operation, payload)
            headers.update(body_headers)
            if headers:
                step["headers"] = headers
            if body_example is not None:
                if isinstance(body_example, (dict, list)) or (
                    headers.get("Content-Type", "").startswith("application/json")
                    or headers.get("Content-Type", "").endswith("+json")
                ):
                    step["json"] = body_example
                else:
                    step["data"] = body_example
            steps.append(step)

    if not steps:
        raise ValueError("No HTTP operations found in OpenAPI document")

    server_urls = _servers(payload)
    environments: dict[str, dict[str, Any]] = {}
    selected = ""
    if server_urls:
        environments["default"] = {"server": server_urls[0]}
        selected = "default"
        # Rewrite relative paths to use {{ env.server }} when servers exist.
        for step in steps:
            path = str(step.get("path") or "")
            if path.startswith("/"):
                step["path"] = "{{ env.server }}" + path

    return {
        "name": openapi_suggested_name(payload),
        "description": str((payload.get("info") or {}).get("description") or "")
        if isinstance(payload.get("info"), dict)
        else "",
        "base_url": server_urls[0] if server_urls else "",
        "random_generators": {},
        "environments": environments,
        "selected_environment": selected,
        "steps": steps,
    }
