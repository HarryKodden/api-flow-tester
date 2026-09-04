from __future__ import annotations

import json
import os
import uuid
from base64 import b64encode

from itsdangerous import TimestampSigner
from sqlalchemy import select

from webapp.db import SessionLocal
from webapp.models import Collection, CollectionShare, User
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


def _as_user(client, user_id: str) -> None:
    signer = TimestampSigner(os.environ["SESSION_SECRET"])
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    client.cookies.set("aft_session", signer.sign(payload).decode("utf-8"))


def test_list_users_excludes_current_user(client):
    other = _create_other_user()
    response = client.get("/api/users")
    assert response.status_code == 200
    users = response.json()["users"]
    ids = {item["id"] for item in users}
    assert other.id in ids
    me = client.get("/api/me").json()["user"]["id"]
    assert me not in ids


def test_live_share_workspace_collection(client):
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
        json={"path": collection_path, "user_id": other.id, "permission": "edit"},
    )
    assert shared.status_code == 200
    body = shared.json()
    assert body["status"] == "shared"
    assert body["mode"] == "live"
    assert body["permission"] == "edit"
    assert body["recipient_id"] == other.id
    assert body["collection_id"] == collection_id

    with SessionLocal() as db:
        share = db.scalar(
            select(CollectionShare).where(
                CollectionShare.collection_id == collection_id,
                CollectionShare.user_id == other.id,
            )
        )
        assert share is not None
        assert share.permission == "edit"
        assert db.scalar(select(Collection).where(Collection.owner_id == other.id)) is None

    _as_user(client, other.id)
    tree = client.get("/api/scenarios").json()
    shared_roots = [child for child in tree.get("children") or [] if child.get("path") == "shared"]
    assert len(shared_roots) == 1
    assert tree["children"][1]["path"] == "shared"
    shared_names = {item["name"] for item in shared_roots[0].get("children") or []}
    assert created.json()["name"] in shared_names

    opened = client.get(f"/api/workspace/file?path={collection_path}")
    assert opened.status_code == 200
    assert opened.json()["_access"]["permission"] == "edit"

    saved = client.post(
        f"/api/workspace/file?path={scenario.json()['path']}",
        json={"name": "login", "steps": [{"name": "ping", "method": "GET", "path": "/"}]},
    )
    assert saved.status_code == 200


def test_live_share_read_only_blocks_writes(client):
    other = _create_other_user()
    created = client.post(
        "/api/explorer/create",
        json={"kind": "collection", "name": _name("Readonly"), "target": "workspace"},
    )
    assert created.status_code == 200
    collection_path = created.json()["path"]
    client.post(
        "/api/explorer/share-collection",
        json={"path": collection_path, "user_id": other.id, "permission": "read"},
    )

    _as_user(client, other.id)
    blocked = client.post(
        f"/api/workspace/file?path={collection_path}",
        json={"name": "Nope", "scenarios": [], "steps": []},
    )
    assert blocked.status_code == 403


def test_share_library_collection_live_shares_via_owner_workspace(client):
    other = _create_other_user()
    me = client.get("/api/me").json()["user"]["id"]
    shared = client.post(
        "/api/explorer/share-collection",
        json={"path": "demo/suite.json", "user_id": other.id, "permission": "read"},
    )
    assert shared.status_code == 200
    body = shared.json()
    assert body["mode"] == "live"
    assert body["permission"] == "read"
    assert body["recipient_id"] == other.id
    assert body["collection_path"] == workspace_collection_path(body["collection_id"])

    with SessionLocal() as db:
        collection = db.scalar(select(Collection).where(Collection.id == body["collection_id"]))
        assert collection is not None
        assert collection.owner_id == me
        share = db.scalar(
            select(CollectionShare).where(
                CollectionShare.collection_id == collection.id,
                CollectionShare.user_id == other.id,
            )
        )
        assert share is not None
        assert share.permission == "read"
        assert db.scalar(select(Collection).where(Collection.owner_id == other.id)) is None

    _as_user(client, other.id)
    tree = client.get("/api/scenarios").json()
    shared_root = next(child for child in tree.get("children") or [] if child.get("path") == "shared")
    assert any(item.get("path") == body["collection_path"] for item in shared_root.get("children") or [])


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


def test_fork_diff_and_sync(client):
    other = _create_other_user()
    created = client.post(
        "/api/explorer/create",
        json={"kind": "collection", "name": _name("Source"), "target": "workspace"},
    )
    assert created.status_code == 200
    collection_path = created.json()["path"]
    collection_id = created.json()["id"]
    scenario = client.post(
        "/api/explorer/create",
        json={"kind": "scenario", "name": "alpha", "target": collection_path},
    )
    assert scenario.status_code == 200
    scenario_path = scenario.json()["path"]

    shared = client.post(
        "/api/explorer/share-collection",
        json={"path": collection_path, "user_id": other.id, "permission": "read"},
    )
    assert shared.status_code == 200
    owner_id = client.get("/api/me").json()["user"]["id"]

    _as_user(client, other.id)
    forked = client.post("/api/explorer/fork-collection", json={"path": collection_path})
    assert forked.status_code == 200
    fork_body = forked.json()
    assert fork_body["source_collection_id"] == collection_id
    fork_path = fork_body["path"]

    identical = client.get(f"/api/explorer/diff-collection?path={fork_path}")
    assert identical.status_code == 200
    assert identical.json()["identical"] is True

    _as_user(client, owner_id)
    client.post(
        f"/api/workspace/file?path={scenario_path}",
        json={"name": "alpha", "steps": [{"name": "changed", "method": "GET", "path": "/v2"}]},
    )
    client.post(
        "/api/explorer/create",
        json={"kind": "scenario", "name": "beta", "target": collection_path},
    )

    _as_user(client, other.id)
    diff = client.get(f"/api/explorer/diff-collection?path={fork_path}")
    assert diff.status_code == 200
    body = diff.json()
    assert body["identical"] is False
    assert "alpha.json" in body["changed_scenarios"]
    assert "beta.json" in body["added_in_source"]

    synced = client.post("/api/explorer/sync-collection", json={"path": fork_path})
    assert synced.status_code == 200
    assert synced.json()["status"] == "synced"
    after = client.get(f"/api/explorer/diff-collection?path={fork_path}")
    assert after.json()["identical"] is True
