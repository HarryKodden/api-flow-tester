from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from tools.bruno_export import bruno_export_filename, collection_to_bruno
from webapp.auth import current_user_required
from webapp.db import get_db
from webapp.models import Collection, Scenario, User, WorkspaceFolder
from webapp.workspace import (
    COLLECTION_FILENAME,
    EXAMPLES_DIR,
    LIBRARY_READONLY,
    attach_scenario,
    clone_library_path,
    clone_workspace_collection_to_user,
    collection_document_for_client,
    empty_collection_document,
    is_collection_document,
    is_collection_filename,
    is_workspace_path,
    load_collection_env_values,
    next_owned_collection_position,
    owned_collection,
    parse_workspace_path,
    resolve_examples_path,
    safe_filename,
    unique_scenario_name,
    utcnow,
    workspace_collection_path,
    workspace_scenario_path,
)

ORDER_FILE = ".order.json"
WORKSPACE_ROOT = "workspace"
WORKSPACE_FOLDER_PREFIX = "ws-folder/"

router = APIRouter(prefix="/api/explorer", tags=["explorer"])


def folder_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value or "").strip()).strip("._")
    return cleaned[:80] or "folder"


def normalize_folder_path(value: str) -> str:
    parts = [folder_slug(part) for part in str(value or "").replace("\\", "/").split("/") if part.strip()]
    return "/".join(part for part in parts if part)


def join_folder_path(parent: str, name: str) -> str:
    parent_path = normalize_folder_path(parent)
    leaf = folder_slug(name)
    return f"{parent_path}/{leaf}" if parent_path else leaf


def split_folder_path(path: str) -> tuple[str, str]:
    parts = [part for part in normalize_folder_path(path).split("/") if part]
    if not parts:
        return "", ""
    return "/".join(parts[:-1]), parts[-1]


def folder_full_path(folder: WorkspaceFolder) -> str:
    return join_folder_path(folder.parent, folder.name)


def rewrite_folder_prefix(value: str, old: str, new: str) -> str:
    raw = str(value or "")
    if raw == old:
        return new
    if old and raw.startswith(f"{old}/"):
        return f"{new}{raw[len(old):]}"
    return raw


def is_workspace_folder_path(path: str) -> bool:
    raw = str(path or "").strip()
    return raw == WORKSPACE_ROOT or raw.startswith(WORKSPACE_FOLDER_PREFIX)


def workspace_folder_name(path: str) -> str:
    raw = str(path or "").strip()
    if raw.startswith(WORKSPACE_FOLDER_PREFIX):
        return raw[len(WORKSPACE_FOLDER_PREFIX) :]
    return ""


def workspace_folder_path(name: str) -> str:
    rel = normalize_folder_path(name)
    return f"{WORKSPACE_FOLDER_PREFIX}{rel}" if rel else WORKSPACE_ROOT


def get_workspace_folder(db: Session, user: User, path: str) -> WorkspaceFolder | None:
    parent, name = split_folder_path(path)
    if not name:
        return None
    return db.scalar(
        select(WorkspaceFolder).where(
            WorkspaceFolder.owner_id == user.id,
            WorkspaceFolder.parent == parent,
            WorkspaceFolder.name == name,
        )
    )


def read_order(directory: Path) -> list[str]:
    path = directory / ORDER_FILE
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(payload, list):
        return [str(item) for item in payload if isinstance(item, str) and item.strip()]
    names = payload.get("items") if isinstance(payload, dict) else None
    if isinstance(names, list):
        return [str(item) for item in names if isinstance(item, str) and item.strip()]
    return []


def write_order(directory: Path, names: list[str]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / ORDER_FILE).write_text(json.dumps(names, indent=2) + "\n", encoding="utf-8")


def append_order(directory: Path, name: str) -> None:
    names = read_order(directory)
    if name not in names:
        names.append(name)
        write_order(directory, names)


def sort_named(entries: list[dict[str, Any]], order: list[str]) -> list[dict[str, Any]]:
    if not order:
        return entries
    rank = {name: index for index, name in enumerate(order)}
    return sorted(entries, key=lambda item: (rank.get(item.get("order_key") or item.get("name"), 10_000), str(item.get("name") or "").lower()))


def next_folder_position(db: Session, user: User, parent: str = "") -> int:
    current = db.scalar(
        select(func.max(WorkspaceFolder.position)).where(
            WorkspaceFolder.owner_id == user.id,
            WorkspaceFolder.parent == parent,
        )
    )
    return int(current or 0) + 1


def collection_node(collection: Collection) -> dict[str, Any]:
    document = collection_document_for_client(collection)
    members = document.get("scenarios") if isinstance(document.get("scenarios"), list) else []
    return {
        "type": "file",
        "kind": "collection",
        "name": collection.name or COLLECTION_FILENAME,
        "path": workspace_collection_path(collection.id),
        "source": "workspace",
        "folder": collection.folder or "",
        "base_url": (collection.document or {}).get("base_url"),
        "step_count": 0,
        "member_count": len(members),
        "members": members,
    }


def workspace_tree(user: User, db: Session) -> dict[str, Any]:
    folders = db.scalars(
        select(WorkspaceFolder).where(WorkspaceFolder.owner_id == user.id).order_by(WorkspaceFolder.position, WorkspaceFolder.name)
    ).all()
    collections = db.scalars(
        select(Collection)
        .options(selectinload(Collection.scenarios))
        .where(Collection.owner_id == user.id)
        .order_by(Collection.position, Collection.name)
    ).all()
    by_parent: dict[str, list[WorkspaceFolder]] = {}
    for folder in folders:
        by_parent.setdefault(folder.parent or "", []).append(folder)
    by_folder: dict[str, list[Collection]] = {}
    for collection in collections:
        by_folder.setdefault(collection.folder or "", []).append(collection)

    def folder_children(parent: str) -> list[dict[str, Any]]:
        children: list[dict[str, Any]] = []
        for folder in by_parent.get(parent, []):
            path = folder_full_path(folder)
            children.append({
                "type": "dir",
                "kind": "folder",
                "name": folder.name,
                "path": workspace_folder_path(path),
                "source": "workspace",
                "order_key": folder.name,
                "children": folder_children(path),
            })
        children.extend(collection_node(item) for item in by_folder.get(parent, []))
        return children

    return {
        "type": "dir",
        "kind": "folder",
        "name": "My workspace",
        "path": WORKSPACE_ROOT,
        "source": "workspace",
        "children": folder_children(""),
    }


def create_workspace_folder(db: Session, user: User, name: str, parent: str = "") -> dict[str, Any]:
    parent_path = normalize_folder_path(parent)
    if parent_path and get_workspace_folder(db, user, parent_path) is None:
        raise HTTPException(status_code=404, detail="Parent folder not found")
    slug = folder_slug(name)
    exists = get_workspace_folder(db, user, join_folder_path(parent_path, slug))
    if exists:
        raise HTTPException(status_code=409, detail="Folder already exists")
    folder = WorkspaceFolder(
        owner_id=user.id,
        name=slug,
        parent=parent_path,
        position=next_folder_position(db, user, parent_path),
    )
    db.add(folder)
    db.flush()
    path = folder_full_path(folder)
    return {"status": "created", "kind": "folder", "path": workspace_folder_path(path), "name": slug, "parent": parent_path}


def create_workspace_collection(db: Session, user: User, name: str, folder: str) -> dict[str, Any]:
    folder_name = normalize_folder_path(folder)
    if folder_name and get_workspace_folder(db, user, folder_name) is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    document = empty_collection_document(name)
    collection = Collection(
        owner_id=user.id,
        name=name.strip() or "Untitled",
        description="",
        selected_environment="",
        folder=folder_name,
        position=next_owned_collection_position(db, user, folder_name),
        document=document,
    )
    db.add(collection)
    db.flush()
    return {"status": "created", "kind": "collection", "id": collection.id, "path": workspace_collection_path(collection.id), "name": collection.name}


def create_workspace_scenario(db: Session, user: User, collection_path: str, name: str) -> dict[str, Any]:
    collection_id, _filename = parse_workspace_path(collection_path)
    collection = owned_collection(db, user, collection_id)
    filename = unique_scenario_name(collection, name)
    scenario = attach_scenario(db, user, collection, filename, {"name": Path(filename).stem, "steps": []})
    return {
        "status": "created",
        "kind": "scenario",
        "path": workspace_scenario_path(collection.id, scenario.name),
        "collection_path": workspace_collection_path(collection.id),
        "name": scenario.name,
    }


def create_library_folder(parent: str, name: str) -> dict[str, Any]:
    slug = folder_slug(name)
    base = resolve_examples_path(parent) if parent else EXAMPLES_DIR
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="Parent folder not found")
    dest = base / slug
    if dest.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")
    dest.mkdir(parents=True, exist_ok=False)
    append_order(base, slug)
    relative = f"{parent}/{slug}" if parent else slug
    return {"status": "created", "kind": "folder", "path": relative, "name": slug}


def create_library_collection(folder: str, name: str) -> dict[str, Any]:
    base = resolve_examples_path(folder) if folder else EXAMPLES_DIR
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="Folder not found")
    filename = COLLECTION_FILENAME
    if (base / filename).exists():
        filename = safe_filename(name)
    if (base / filename).exists():
        raise HTTPException(status_code=409, detail="Collection file already exists")
    document = empty_collection_document(name.strip() or Path(filename).stem)
    (base / filename).write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    append_order(base, filename)
    relative = f"{folder}/{filename}" if folder else filename
    return {"status": "created", "kind": "collection", "path": relative, "name": document["name"]}


def create_library_scenario(collection_path: str, name: str) -> dict[str, Any]:
    collection_file = resolve_examples_path(collection_path)
    if not collection_file.is_file():
        raise HTTPException(status_code=404, detail="Collection not found")
    collection = json.loads(collection_file.read_text(encoding="utf-8"))
    if not isinstance(collection, dict):
        raise HTTPException(status_code=400, detail="Invalid collection")
    filename = safe_filename(name)
    dest = collection_file.parent / filename
    if dest.exists():
        filename = unique_scenario_name_in_dir(collection_file.parent, filename)
        dest = collection_file.parent / filename
    dest.write_text(json.dumps({"name": Path(filename).stem, "steps": []}, indent=2) + "\n", encoding="utf-8")
    members = collection.get("scenarios") if isinstance(collection.get("scenarios"), list) else []
    members = [item for item in members if isinstance(item, str)]
    if filename not in members:
        members.append(filename)
    collection["scenarios"] = members
    collection["steps"] = []
    collection_file.write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")
    relative = str(dest.relative_to(EXAMPLES_DIR)).replace("\\", "/")
    return {"status": "created", "kind": "scenario", "path": relative, "collection_path": collection_path, "name": filename}


def unique_scenario_name_in_dir(directory: Path, desired: str) -> str:
    candidate = safe_filename(desired)
    if not (directory / candidate).exists():
        return candidate
    stem = Path(candidate).stem
    for idx in range(2, 1000):
        next_name = f"{stem}_{idx}.json"
        if not (directory / next_name).exists():
            return next_name
    raise HTTPException(status_code=500, detail="Failed to allocate a unique scenario name")


def load_item_document(db: Session, user: User, path: str) -> tuple[dict[str, Any], str]:
    if is_workspace_path(path):
        collection_id, filename = parse_workspace_path(path)
        collection = owned_collection(db, user, collection_id)
        if is_collection_filename(filename):
            return collection_document_for_client(collection), "collection"
        scenario = next((item for item in collection.scenarios if item.name == filename), None)
        if scenario is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return dict(scenario.document or {}), "scenario"
    file_path = resolve_examples_path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    payload = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    return payload, "collection" if is_collection_document(payload) or is_collection_filename(file_path.name) else "scenario"


def copy_scenario(db: Session, user: User, source: str, dest_collection: str) -> dict[str, Any]:
    document, kind = load_item_document(db, user, source)
    if kind != "scenario":
        raise HTTPException(status_code=400, detail="Source must be a scenario")
    name = Path(source).name
    if is_workspace_path(dest_collection):
        collection_id, _filename = parse_workspace_path(dest_collection)
        collection = owned_collection(db, user, collection_id)
        saved = attach_scenario(db, user, collection, name, document)
        return {
            "status": "copied",
            "path": workspace_scenario_path(collection.id, saved.name),
            "collection_path": workspace_collection_path(collection.id),
        }
    collection_file = resolve_examples_path(dest_collection)
    if not collection_file.is_file():
        raise HTTPException(status_code=404, detail="Destination collection not found")
    filename = unique_scenario_name_in_dir(collection_file.parent, name)
    dest = collection_file.parent / filename
    dest.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    collection = json.loads(collection_file.read_text(encoding="utf-8"))
    members = collection.get("scenarios") if isinstance(collection.get("scenarios"), list) else []
    members = [item for item in members if isinstance(item, str)]
    members.append(filename)
    collection["scenarios"] = members
    collection_file.write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")
    return {
        "status": "copied",
        "path": str(dest.relative_to(EXAMPLES_DIR)).replace("\\", "/"),
        "collection_path": dest_collection,
    }


def reorder_workspace_collections(db: Session, user: User, folder: str, items: list[str]) -> None:
    collections = db.scalars(select(Collection).where(Collection.owner_id == user.id, Collection.folder == folder)).all()
    by_path = {workspace_collection_path(item.id): item for item in collections}
    for index, path in enumerate(items):
        collection = by_path.get(path)
        if collection is not None:
            collection.position = index


def reorder_workspace_folders(db: Session, user: User, parent: str, items: list[str]) -> None:
    parent_path = workspace_folder_name(parent) if is_workspace_folder_path(parent) else ""
    folders = db.scalars(
        select(WorkspaceFolder).where(WorkspaceFolder.owner_id == user.id, WorkspaceFolder.parent == parent_path)
    ).all()
    by_path = {workspace_folder_path(folder_full_path(item)): item for item in folders}
    for index, path in enumerate(items):
        folder = by_path.get(path)
        if folder is not None:
            folder.position = index


def reorder_collection_scenarios(db: Session, user: User, collection_path: str, items: list[str]) -> None:
    names = [Path(item).name for item in items]
    if is_workspace_path(collection_path):
        collection_id, _filename = parse_workspace_path(collection_path)
        collection = owned_collection(db, user, collection_id)
        payload = collection_document_for_client(collection)
        payload["scenarios"] = names
        collection.document = payload
        return
    collection_file = resolve_examples_path(collection_path)
    collection = json.loads(collection_file.read_text(encoding="utf-8"))
    collection["scenarios"] = names
    collection_file.write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")


def delete_workspace_folder(db: Session, user: User, path: str) -> dict[str, Any]:
    rel = workspace_folder_name(path)
    folder = get_workspace_folder(db, user, rel)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    occupied = db.scalar(select(func.count()).select_from(Collection).where(Collection.owner_id == user.id, Collection.folder == rel))
    nested = db.scalar(
        select(func.count()).select_from(WorkspaceFolder).where(
            WorkspaceFolder.owner_id == user.id,
            WorkspaceFolder.parent == rel,
        )
    )
    if occupied or nested:
        raise HTTPException(status_code=409, detail="Folder is not empty")
    db.delete(folder)
    return {"status": "deleted", "kind": "folder", "path": path}


def move_workspace_folder(db: Session, user: User, path: str, dest: str) -> dict[str, Any]:
    rel = workspace_folder_name(path)
    folder = get_workspace_folder(db, user, rel)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    dest_path = workspace_folder_name(dest) if is_workspace_folder_path(dest) else ""
    if dest_path and get_workspace_folder(db, user, dest_path) is None:
        raise HTTPException(status_code=404, detail="Destination folder not found")
    if dest_path == rel or dest_path.startswith(f"{rel}/"):
        raise HTTPException(status_code=400, detail="Cannot move a folder into itself")
    new_path = join_folder_path(dest_path, folder.name)
    if get_workspace_folder(db, user, new_path) is not None:
        raise HTTPException(status_code=409, detail="A folder with that name already exists there")
    old_path = rel
    folder.parent = dest_path
    folder.position = next_folder_position(db, user, dest_path)
    for item in db.scalars(select(WorkspaceFolder).where(WorkspaceFolder.owner_id == user.id)).all():
        if item.id == folder.id:
            continue
        item.parent = rewrite_folder_prefix(item.parent, old_path, new_path)
    for collection in db.scalars(select(Collection).where(Collection.owner_id == user.id)).all():
        collection.folder = rewrite_folder_prefix(collection.folder, old_path, new_path)
    return {"status": "moved", "kind": "folder", "path": workspace_folder_path(new_path), "parent": dest_path}


def delete_library_folder(path: str) -> dict[str, Any]:
    folder = resolve_examples_path(path)
    if not folder.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    leftovers = [item for item in folder.iterdir() if item.name != ORDER_FILE]
    if leftovers:
        raise HTTPException(status_code=409, detail="Folder is not empty")
    order_path = folder / ORDER_FILE
    if order_path.is_file():
        order_path.unlink()
    folder.rmdir()
    parent = folder.parent
    if parent != folder:
        names = [name for name in read_order(parent) if name != folder.name]
        if names:
            write_order(parent, names)
        elif (parent / ORDER_FILE).is_file():
            (parent / ORDER_FILE).unlink()
    return {"status": "deleted", "kind": "folder", "path": path}


@router.post("/create")
def create_item(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    kind = str(payload.get("kind") or "").strip()
    name = str(payload.get("name") or "").strip()
    target = str(payload.get("target") or "").strip()
    if kind not in {"folder", "collection", "scenario"}:
        raise HTTPException(status_code=400, detail="kind must be folder, collection, or scenario")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if kind == "folder":
        parent = workspace_folder_name(target) if is_workspace_folder_path(target) and target != WORKSPACE_ROOT else ""
        return create_workspace_folder(db, user, name, parent)
    if kind == "collection":
        folder = workspace_folder_name(target) if is_workspace_folder_path(target) else ""
        return create_workspace_collection(db, user, name, folder)
    collection_path = target
    if not collection_path:
        raise HTTPException(status_code=400, detail="Open a workspace collection first")
    if not is_workspace_path(collection_path):
        raise HTTPException(status_code=403, detail=LIBRARY_READONLY)
    return create_workspace_scenario(db, user, collection_path, name)


@router.post("/reorder")
def reorder_items(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    parent = str(payload.get("parent") or "").strip()
    kind = str(payload.get("kind") or "").strip()
    items = payload.get("items")
    if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
        raise HTTPException(status_code=400, detail="items must be a list of paths")
    if kind == "scenarios":
        if not is_workspace_path(parent):
            raise HTTPException(status_code=403, detail=LIBRARY_READONLY)
        reorder_collection_scenarios(db, user, parent, items)
        return {"status": "ok"}
    if kind == "folders":
        reorder_workspace_folders(db, user, parent, items)
        return {"status": "ok"}
    if is_workspace_folder_path(parent) or parent == WORKSPACE_ROOT:
        reorder_workspace_collections(db, user, workspace_folder_name(parent), items)
        return {"status": "ok"}
    raise HTTPException(status_code=403, detail=LIBRARY_READONLY)


@router.post("/copy-scenario")
def copy_scenario_route(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    source = str(payload.get("source") or "").strip()
    dest = str(payload.get("destination") or "").strip()
    if not source or not dest:
        raise HTTPException(status_code=400, detail="source and destination are required")
    if not is_workspace_path(dest):
        raise HTTPException(status_code=403, detail=LIBRARY_READONLY)
    return copy_scenario(db, user, source, dest)


@router.post("/move-collection")
def move_collection_route(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    path = str(payload.get("path") or "").strip()
    dest = str(payload.get("destination") or "").strip()
    if not is_workspace_path(path):
        raise HTTPException(status_code=403, detail=LIBRARY_READONLY)
    if dest not in {"", WORKSPACE_ROOT} and not is_workspace_folder_path(dest):
        raise HTTPException(status_code=400, detail="Destination must be a workspace folder")
    collection_id, _filename = parse_workspace_path(path)
    collection = owned_collection(db, user, collection_id)
    folder = workspace_folder_name(dest) if is_workspace_folder_path(dest) else ""
    if folder and get_workspace_folder(db, user, folder) is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    collection.folder = folder
    collection.position = next_owned_collection_position(db, user, folder)
    return {"status": "moved", "path": workspace_collection_path(collection.id), "folder": folder}


@router.post("/move-folder")
def move_folder_route(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    path = str(payload.get("path") or "").strip()
    dest = str(payload.get("destination") or "").strip()
    if not is_workspace_folder_path(path) or path == WORKSPACE_ROOT:
        raise HTTPException(status_code=400, detail="Source must be a workspace folder")
    if dest not in {"", WORKSPACE_ROOT} and not is_workspace_folder_path(dest):
        raise HTTPException(status_code=400, detail="Destination must be a workspace folder")
    return move_workspace_folder(db, user, path, dest)


def rename_workspace_folder(db: Session, user: User, path: str, name: str) -> dict[str, Any]:
    rel = workspace_folder_name(path)
    folder = get_workspace_folder(db, user, rel)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    slug = folder_slug(name)
    if slug == folder.name:
        return {"status": "renamed", "kind": "folder", "path": path, "name": slug}
    new_rel = join_folder_path(folder.parent, slug)
    if get_workspace_folder(db, user, new_rel) is not None:
        raise HTTPException(status_code=409, detail="A folder with that name already exists")
    old_rel = rel
    folder.name = slug
    for item in db.scalars(select(WorkspaceFolder).where(WorkspaceFolder.owner_id == user.id)).all():
        if item.id == folder.id:
            continue
        item.parent = rewrite_folder_prefix(item.parent, old_rel, new_rel)
    for collection in db.scalars(select(Collection).where(Collection.owner_id == user.id)).all():
        collection.folder = rewrite_folder_prefix(collection.folder, old_rel, new_rel)
    return {
        "status": "renamed",
        "kind": "folder",
        "path": workspace_folder_path(new_rel),
        "from": path,
        "name": slug,
    }


def rename_workspace_collection(db: Session, user: User, path: str, name: str) -> dict[str, Any]:
    collection_id, filename = parse_workspace_path(path)
    if not is_collection_filename(filename):
        raise HTTPException(status_code=400, detail="Not a collection path")
    collection = owned_collection(db, user, collection_id)
    new_name = name.strip() or "Untitled"
    collection.name = new_name
    payload = collection_document_for_client(collection)
    payload["name"] = new_name
    collection.document = payload
    collection.updated_at = utcnow()
    return {"status": "renamed", "kind": "collection", "path": path, "name": new_name}


def rename_workspace_scenario(db: Session, user: User, path: str, name: str) -> dict[str, Any]:
    collection_id, filename = parse_workspace_path(path)
    if is_collection_filename(filename):
        raise HTTPException(status_code=400, detail="Not a scenario path")
    collection = owned_collection(db, user, collection_id)
    scenario = next((item for item in collection.scenarios if item.name == filename), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    candidate = safe_filename(name)
    taken = {item.name.lower() for item in collection.scenarios if item.id != scenario.id}
    if candidate.lower() in taken:
        raise HTTPException(status_code=409, detail="A scenario with that name already exists")
    old_name = scenario.name
    document = dict(scenario.document or {})
    document["name"] = Path(candidate).stem
    scenario.document = document
    scenario.name = candidate
    scenario.updated_at = utcnow()
    payload = collection_document_for_client(collection)
    members = payload.get("scenarios") if isinstance(payload.get("scenarios"), list) else []
    replaced = [candidate if item == old_name else item for item in members if isinstance(item, str)]
    if candidate not in replaced:
        replaced.append(candidate)
    payload["scenarios"] = replaced
    collection.document = payload
    collection.updated_at = utcnow()
    return {
        "status": "renamed",
        "kind": "scenario",
        "path": workspace_scenario_path(collection.id, candidate),
        "from": path,
        "collection_path": workspace_collection_path(collection.id),
        "name": candidate,
    }


@router.post("/rename")
def rename_item(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    path = str(payload.get("path") or "").strip()
    name = str(payload.get("name") or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if is_workspace_folder_path(path) and path != WORKSPACE_ROOT:
        return rename_workspace_folder(db, user, path, name)
    if is_workspace_path(path):
        _collection_id, filename = parse_workspace_path(path)
        if is_collection_filename(filename):
            return rename_workspace_collection(db, user, path, name)
        return rename_workspace_scenario(db, user, path, name)
    raise HTTPException(status_code=403, detail=LIBRARY_READONLY)


@router.delete("/folder")
def delete_folder(
    path: str = Query(..., min_length=1),
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if is_workspace_folder_path(path) and path != WORKSPACE_ROOT:
        return delete_workspace_folder(db, user, path)
    if is_workspace_folder_path(path):
        raise HTTPException(status_code=400, detail="Cannot delete the workspace root")
    raise HTTPException(status_code=403, detail=LIBRARY_READONLY)


def _merge_collection_environments(base: dict[str, Any], overrides_by_env: dict[str, dict[str, str]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    names = set(base) | set(overrides_by_env)
    for name in names:
        values = dict(base.get(name) or {}) if isinstance(base.get(name), dict) else {}
        values.update(overrides_by_env.get(name) or {})
        merged[name] = values
    return merged


def load_collection_export_payload(db: Session, user: User, path: str) -> tuple[dict[str, Any], list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    if is_workspace_path(path):
        collection_id, filename = parse_workspace_path(path)
        if not is_collection_filename(filename):
            raise HTTPException(status_code=400, detail="Export is only available for collections")
        collection = owned_collection(db, user, collection_id)
        document = collection_document_for_client(collection)
        members = [(item.name, dict(item.document or {})) for item in collection.scenarios]
        env_base = document.get("environments") if isinstance(document.get("environments"), dict) else {}
        overrides: dict[str, dict[str, str]] = {}
        for env_name in env_base:
            private = load_collection_env_values(db, user, collection.id, str(env_name))
            if private:
                overrides[str(env_name)] = private
        environments = _merge_collection_environments(env_base, overrides)
        return document, members, environments

    file_path = resolve_examples_path(path)
    if not file_path.is_file() or file_path.suffix.lower() != ".json":
        raise HTTPException(status_code=404, detail="Collection not found")
    payload = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid collection JSON")
    if not (is_collection_document(payload) or is_collection_filename(file_path.name)):
        raise HTTPException(status_code=400, detail="Export is only available for collections")
    members: list[tuple[str, dict[str, Any]]] = []
    for member in payload.get("scenarios") or []:
        if not isinstance(member, str) or not member.strip():
            continue
        member_path = file_path.parent / Path(member).name
        if not member_path.is_file():
            members.append((Path(member).name, {"name": Path(member).stem, "steps": []}))
            continue
        try:
            member_doc = json.loads(member_path.read_text(encoding="utf-8"))
        except Exception:
            member_doc = {"name": Path(member).stem, "steps": []}
        if not isinstance(member_doc, dict):
            member_doc = {"name": Path(member).stem, "steps": []}
        members.append((Path(member).name, member_doc))
    environments = payload.get("environments") if isinstance(payload.get("environments"), dict) else {}
    return payload, members, environments


@router.get("/export-bruno")
def export_collection_bruno(
    path: str = Query(..., min_length=1),
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> Response:
    collection, members, environments = load_collection_export_payload(db, user, path)
    collection = collection_to_bruno(collection, members, environments=environments)
    filename = bruno_export_filename(str(collection.get("name") or "collection"))
    body = json.dumps(collection, indent=2, ensure_ascii=False) + "\n"
    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
    }
    return Response(content=body, media_type="application/json", headers=headers)


@router.post("/share-collection")
def share_collection(
    payload: dict[str, Any],
    user: User = Depends(current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    path = str(payload.get("path") or "").strip()
    recipient_id = str(payload.get("user_id") or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    if not recipient_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if recipient_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot share a collection with yourself")

    recipient = db.scalar(select(User).where(User.id == recipient_id))
    if recipient is None:
        raise HTTPException(status_code=404, detail="User not found")

    if is_workspace_path(path):
        collection_id, filename = parse_workspace_path(path)
        if not is_collection_filename(filename):
            raise HTTPException(status_code=400, detail="Share is only available for collections")
        source = owned_collection(db, user, collection_id)
        shared = clone_workspace_collection_to_user(db, source, recipient)
    else:
        shared = clone_library_path(db, recipient, path)

    return {
        "status": "shared",
        "path": path,
        "recipient_id": recipient.id,
        "recipient_name": recipient.name or recipient.email or recipient.id,
        "collection_id": shared.id,
        "collection_path": workspace_collection_path(shared.id),
        "name": shared.name,
    }
