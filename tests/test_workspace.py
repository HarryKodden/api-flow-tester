from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from webapp.explorer import (
    folder_slug,
    join_folder_path,
    normalize_folder_path,
    rewrite_folder_prefix,
    sort_named,
    split_folder_path,
    workspace_folder_path,
)
from webapp.workspace import (
    empty_collection_document,
    is_collection_document,
    is_workspace_path,
    parse_workspace_path,
    safe_filename,
    string_env_map,
    unique_scenario_name,
    workspace_collection_path,
    workspace_scenario_path,
)


def test_workspace_paths():
    assert is_workspace_path("workspace/abc/collection.json")
    assert is_workspace_path("workspace/abc/suite.json")
    assert is_workspace_path("./workspace/abc/lookup.json")
    assert not is_workspace_path("examples/demo/collection.json")
    assert workspace_collection_path("abc") == "workspace/abc/collection.json"
    assert workspace_scenario_path("abc", "lookup.json") == "workspace/abc/lookup.json"
    assert parse_workspace_path("workspace/abc/collection.json") == ("abc", "collection.json")
    assert parse_workspace_path("workspace/abc/suite.json") == ("abc", "suite.json")


def test_parse_workspace_path_rejects_bad_values():
    with pytest.raises(HTTPException):
        parse_workspace_path("examples/demo/collection.json")
    with pytest.raises(HTTPException):
        parse_workspace_path("workspace/abc")
    with pytest.raises(HTTPException):
        parse_workspace_path("workspace/abc/.hidden")


def test_safe_filename_and_unique_scenario_name():
    assert safe_filename("Lookup User") == "Lookup_User.json"
    assert safe_filename("already.json") == "already.json"
    collection = SimpleNamespace(scenarios=[SimpleNamespace(name="lookup.json")])
    assert unique_scenario_name(collection, "other") == "other.json"
    assert unique_scenario_name(collection, "lookup") == "lookup_2.json"


def test_empty_collection_and_env_map():
    document = empty_collection_document("Demo", "desc")
    assert document["name"] == "Demo"
    assert document["selected_environment"] == ""
    assert document["environments"] == {}
    assert is_collection_document({"scenarios": ["a.json"], "steps": []})
    assert is_collection_document({"scenarios": [], "steps": []})
    assert not is_collection_document({"scenarios": [], "steps": [{"path": "/"}]})
    assert string_env_map({"token": " abc ", "blank": "", "none": None, "": "x"}) == {"token": "abc"}


def test_explorer_folder_helpers():
    assert folder_slug("My Folder!") == "My_Folder"
    assert normalize_folder_path("Parent/Child Folder") == "Parent/Child_Folder"
    assert join_folder_path("Parent", "Child") == "Parent/Child"
    assert split_folder_path("Parent/Child") == ("Parent", "Child")
    assert rewrite_folder_prefix("Parent/Child", "Parent", "Moved") == "Moved/Child"
    assert workspace_folder_path("Team/QA") == "ws-folder/Team/QA"
    ordered = sort_named(
        [{"name": "b", "order_key": "b"}, {"name": "a", "order_key": "a"}],
        ["b", "a"],
    )
    assert [item["name"] for item in ordered] == ["b", "a"]
