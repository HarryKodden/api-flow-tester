from __future__ import annotations

from tools.bruno_export import collection_to_bruno
from tools.bruno_import import convert_bruno_collection, is_bruno_collection
from tools.openapi_import import convert_openapi_document, is_openapi_document


def test_bruno_round_trip_import():
    suite = {
        "name": "demo",
        "description": "Demo",
        "environments": {"public": {"server": "https://api.example.org", "token": "secret"}},
    }
    scenarios = [
        (
            "users.json",
            {
                "name": "users",
                "steps": [
                    {
                        "name": "list_users",
                        "method": "GET",
                        "path": "{{ env.server }}/users",
                        "headers": {"Accept": "application/json"},
                        "expected_status": 200,
                    },
                    {
                        "name": "create_user",
                        "method": "POST",
                        "path": "{{ env.server }}/users",
                        "json": {"name": "Ada"},
                        "auth": {"type": "bearer", "token": "{{ env.token }}"},
                    },
                ],
            },
        )
    ]
    exported = collection_to_bruno(suite, scenarios)
    assert is_bruno_collection(exported)
    imported = convert_bruno_collection(exported)
    assert len(imported["steps"]) == 2
    assert imported["steps"][0]["method"] == "GET"
    assert imported["steps"][0]["path"] == "{{server}}/users"
    assert imported["steps"][1]["json"] == {"name": "Ada"}
    assert imported["steps"][1]["auth"]["type"] == "bearer"
    assert imported["environments"]["public"]["server"] == "https://api.example.org"


def test_openapi3_import_builds_steps_and_server_env():
    spec = {
        "openapi": "3.0.3",
        "info": {"title": "Pets", "version": "1.0.0"},
        "servers": [{"url": "https://pets.example.org"}],
        "paths": {
            "/pets/{petId}": {
                "get": {
                    "operationId": "getPet",
                    "summary": "Get pet",
                    "parameters": [
                        {"name": "petId", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "verbose", "in": "query", "schema": {"type": "boolean"}, "example": True},
                    ],
                    "responses": {"200": {"description": "ok"}},
                },
                "post": {
                    "operationId": "createPet",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["name"],
                                    "properties": {
                                        "name": {"type": "string", "example": "Rex"},
                                        "tag": {"type": "string"},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"201": {"description": "created"}},
                },
            }
        },
    }
    assert is_openapi_document(spec)
    scenario = convert_openapi_document(spec)
    assert scenario["selected_environment"] == "default"
    assert scenario["environments"]["default"]["server"] == "https://pets.example.org"
    assert len(scenario["steps"]) == 2
    get_step = next(step for step in scenario["steps"] if step["name"] == "getPet")
    assert get_step["method"] == "GET"
    assert get_step["path"].startswith("{{ env.server }}/pets/{{petId}}")
    assert "verbose=True" in get_step["path"] or "verbose=true" in get_step["path"].lower()
    post_step = next(step for step in scenario["steps"] if step["name"] == "createPet")
    assert post_step["json"]["name"] == "Rex"


def test_swagger2_import():
    spec = {
        "swagger": "2.0",
        "info": {"title": "Legacy", "version": "1"},
        "host": "legacy.example.org",
        "basePath": "/v1",
        "schemes": ["https"],
        "paths": {
            "/clients": {
                "get": {
                    "operationId": "listClients",
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }
    scenario = convert_openapi_document(spec)
    assert scenario["environments"]["default"]["server"] == "https://legacy.example.org/v1"
    assert scenario["steps"][0]["path"] == "{{ env.server }}/clients"


def _create_workspace_collection(client, name: str = "Import Target") -> str:
    created = client.post(
        "/api/explorer/create",
        json={"kind": "collection", "name": name, "target": "workspace"},
    )
    assert created.status_code == 200
    collection_id = created.json()["id"]
    assert collection_id
    return collection_id


def test_import_requires_collection_id(client):
    response = client.post(
        "/api/scenarios/import/file",
        files={
            "file": (
                "pets.json",
                b'{"openapi":"3.0.0","info":{"title":"Pets"},"paths":{"/pets":{"get":{"operationId":"listPets","responses":{"200":{"description":"ok"}}}}}}',
                "application/json",
            )
        },
    )
    assert response.status_code == 400


def test_import_endpoint_accepts_openapi(client):
    collection_id = _create_workspace_collection(client, "OpenAPI Suite")
    response = client.post(
        f"/api/scenarios/import/file?collection_id={collection_id}",
        files={
            "file": (
                "pets.json",
                b'{"openapi":"3.0.0","info":{"title":"Pets"},"paths":{"/pets":{"get":{"operationId":"listPets","responses":{"200":{"description":"ok"}}}}}}',
                "application/json",
            )
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["step_count"] == 1
    assert body["collection_id"] == collection_id
    assert body["scenario"]["steps"][0]["name"] == "listPets"


def test_import_endpoint_accepts_bruno(client):
    collection_id = _create_workspace_collection(client, "Bruno Suite")
    collection = collection_to_bruno(
        {"name": "Bruno Import", "environments": {}},
        [
            (
                "one.json",
                {"name": "one", "steps": [{"name": "ping", "method": "GET", "path": "https://api.example.org/ping"}]},
            )
        ],
    )
    import json

    response = client.post(
        f"/api/scenarios/import/file?collection_id={collection_id}",
        files={"file": ("collection.bruno.json", json.dumps(collection).encode("utf-8"), "application/json")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["step_count"] == 1
    assert body["collection_id"] == collection_id
    assert body["scenario"]["steps"][0]["path"] == "https://api.example.org/ping"


def test_export_bruno_endpoint(client):
    response = client.get("/api/explorer/export-bruno?path=demo/suite.json")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "demo"
    assert body["version"] == "1"
    assert any(item.get("type") == "folder" for item in body["items"])
    assert "attachment" in (response.headers.get("content-disposition") or "").lower()
