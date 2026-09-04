from __future__ import annotations

from tools.oauth_helpers import (
    absolute_url,
    basic_auth_header,
    generate_pkce,
    is_same_origin_url,
    query_param,
    resolve_redirect_url,
)


def test_resolve_redirect_url_joins_relative_location():
    assert (
        resolve_redirect_url("https://api.example.org/clients", "/clients/")
        == "https://api.example.org/clients/"
    )
    assert (
        resolve_redirect_url("https://api.example.org/clients", "https://other.example.org/done")
        == "https://other.example.org/done"
    )


def test_is_same_origin_url():
    assert is_same_origin_url("https://api.example.org/a", "https://api.example.org/b")
    assert not is_same_origin_url("https://api.example.org/a", "http://api.example.org/a")
    assert not is_same_origin_url("https://api.example.org/a", "https://other.example.org/a")
    assert not is_same_origin_url("", "/clients")


def test_absolute_url_and_query_param():
    assert absolute_url("https://api.example.org", "/users") == "https://api.example.org/users"
    assert absolute_url("https://api.example.org/", "users") == "https://api.example.org/users"
    assert absolute_url("https://ignored.example.org", "https://api.example.org/users") == "https://api.example.org/users"
    assert query_param("https://api.example.org/cb?code=99&state=x", "code") == "99"
    assert query_param("https://api.example.org/cb", "code", "missing") == "missing"


def test_pkce_and_basic_auth():
    pkce = generate_pkce()
    assert len(pkce["verifier"]) == 64
    assert pkce["method"] == "S256"
    assert pkce["challenge"]
    assert basic_auth_header("ada", "secret") == "Basic YWRhOnNlY3JldA=="
