from __future__ import annotations

import uuid


def _name(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_rename_rejects_public_library(client):
    response = client.post(
        "/api/explorer/rename",
        json={"path": "demo/suite.json", "name": "Renamed"},
    )
    assert response.status_code == 403


def test_rename_folder_suite_and_scenario(client):
    folder = client.post(
        "/api/explorer/create",
        json={"kind": "folder", "name": _name("Team"), "target": "workspace"},
    )
    assert folder.status_code == 200
    folder_path = folder.json()["path"]

    renamed_folder = client.post(
        "/api/explorer/rename",
        json={"path": folder_path, "name": _name("Squad")},
    )
    assert renamed_folder.status_code == 200
    assert renamed_folder.json()["name"].startswith("Squad-")
    assert renamed_folder.json()["path"].startswith("ws-folder/Squad-")

    suite = client.post(
        "/api/explorer/create",
        json={"kind": "suite", "name": "Original", "target": renamed_folder.json()["path"]},
    )
    assert suite.status_code == 200
    suite_path = suite.json()["path"]

    renamed_suite = client.post(
        "/api/explorer/rename",
        json={"path": suite_path, "name": "Renamed Suite"},
    )
    assert renamed_suite.status_code == 200
    assert renamed_suite.json()["name"] == "Renamed Suite"
    assert renamed_suite.json()["path"] == suite_path

    scenario = client.post(
        "/api/explorer/create",
        json={"kind": "scenario", "name": "first_case", "target": suite_path},
    )
    assert scenario.status_code == 200
    scenario_path = scenario.json()["path"]

    renamed_scenario = client.post(
        "/api/explorer/rename",
        json={"path": scenario_path, "name": "login flow"},
    )
    assert renamed_scenario.status_code == 200
    body = renamed_scenario.json()
    assert body["name"] == "login_flow.json"
    assert body["path"].endswith("/login_flow.json")

    other = client.post(
        "/api/explorer/create",
        json={"kind": "scenario", "name": "other", "target": suite_path},
    )
    assert other.status_code == 200
    conflict = client.post(
        "/api/explorer/rename",
        json={"path": other.json()["path"], "name": "login_flow"},
    )
    assert conflict.status_code == 409


def test_rename_same_folder_name_is_noop(client):
    created = client.post(
        "/api/explorer/create",
        json={"kind": "folder", "name": _name("Keep"), "target": "workspace"},
    )
    assert created.status_code == 200
    current = created.json()["name"]
    response = client.post(
        "/api/explorer/rename",
        json={"path": created.json()["path"], "name": current},
    )
    assert response.status_code == 200
    assert response.json()["path"] == created.json()["path"]
    assert response.json()["name"] == current
