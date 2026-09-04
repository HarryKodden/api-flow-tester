from __future__ import annotations

import uuid

from sqlalchemy import select

from webapp.db import SessionLocal
from webapp.models import Collection, Scenario, User
from webapp.workspace import workspace_collection_path


def _name(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _create_other_user() -> User:
    with SessionLocal() as db:
        user = User(
            issuer="test",
            sub=f"other-{uuid.uuid4().hex[:8]}",
            email=f"{_name('user')}@example.org",
            name=_name("Colleague"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def test_list_users_excludes_current_user(client):
    other = _create_other_user()
    response = client.get("/api/users")
    assert response.status_code == 200
    users = response.json()["users"]
    ids = {item["id"] for item in users}
    assert other.id in ids
    me = client.get("/api/me").json()["user"]["id"]
    assert me not in ids


def test_share_workspace_collection_to_another_user(client):
    other = _create_other_user()
    created = client.post(
        "/api/explorer/create",
        json={"kind": "collection", "name": _name("Shared"), "target": "workspace"},
    )
    assert created.status_code == 200
    collection_path = created.json()["path"]
    collection_id = created.json()["id"]

    scenario = client.post(
        "/api/explorer/create",
        json={"kind": "scenario", "name": "login", "target": collection_path},
    )
    assert scenario.status_code == 200

    shared = client.post(
        "/api/explorer/share-collection",
        json={"path": collection_path, "user_id": other.id},
    )
    assert shared.status_code == 200
    body = shared.json()
    assert body["status"] == "shared"
    assert body["recipient_id"] == other.id
    assert body["collection_id"] != collection_id

    with SessionLocal() as db:
        recipient_collection = db.scalar(select(Collection).where(Collection.id == body["collection_id"]))
        assert recipient_collection is not None
        assert recipient_collection.owner_id == other.id
        scenarios = db.scalars(select(Scenario).where(Scenario.collection_id == recipient_collection.id)).all()
        assert len(scenarios) == 1
        assert scenarios[0].owner_id == other.id
        assert scenarios[0].name == "login.json"


def test_share_library_collection_to_another_user(client):
    other = _create_other_user()
    shared = client.post(
        "/api/explorer/share-collection",
        json={"path": "demo/suite.json", "user_id": other.id},
    )
    assert shared.status_code == 200
    body = shared.json()
    assert body["recipient_id"] == other.id
    assert body["collection_path"] == workspace_collection_path(body["collection_id"])

    with SessionLocal() as db:
        recipient_collection = db.scalar(select(Collection).where(Collection.id == body["collection_id"]))
        assert recipient_collection is not None
        assert recipient_collection.owner_id == other.id
        scenarios = db.scalars(select(Scenario).where(Scenario.collection_id == recipient_collection.id)).all()
        assert len(scenarios) >= 1


def test_share_rejects_self(client):
    me = client.get("/api/me").json()["user"]["id"]
    created = client.post(
        "/api/explorer/create",
        json={"kind": "collection", "name": _name("Mine"), "target": "workspace"},
    )
    assert created.status_code == 200
    response = client.post(
        "/api/explorer/share-collection",
        json={"path": created.json()["path"], "user_id": me},
    )
    assert response.status_code == 400
