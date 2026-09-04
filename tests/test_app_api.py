from __future__ import annotations

from webapp.app import mask_sensitive_text


def test_health_and_index(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    page = client.get("/")
    assert page.status_code == 200
    assert "API Flow Tester" in page.text or "Regression" in page.text or "suite" in page.text.lower()


def test_me_uses_local_user_when_oidc_is_unset(client):
    me = client.get("/api/me")
    assert me.status_code == 200
    body = me.json()
    assert body["authenticated"] is True
    assert body["oidc_enabled"] is False
    assert body["user"]["name"] == "Local user"


def test_scenarios_tree_includes_public_library(client):
    response = client.get("/api/scenarios")
    assert response.status_code == 200
    tree = response.json()
    names = [child.get("name") for child in tree.get("children") or []]
    assert "Public library" in names


def test_parse_curl_endpoint(client):
    response = client.post(
        "/api/parse-curl",
        json={"curl": "curl -sS -X GET https://api.example.org/clients -H 'X-API-Key: secret'"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["path"] == "https://api.example.org/clients"
    assert body["headers"]["X-API-Key"] == "secret"
    empty = client.post("/api/parse-curl", json={"curl": ""})
    assert empty.status_code == 400


def test_preview_step_without_environment(client):
    response = client.post(
        "/api/preview-step",
        json={
            "scenario": {
                "environments": {"dev": {"server": "https://dev.example.org", "unused": ""}},
                "selected_environment": "",
                "steps": [
                    {
                        "name": "list_clients",
                        "method": "GET",
                        "path": "https://api.example.org/clients",
                        "expected_status": 200,
                    }
                ],
            },
            "step_index": 0,
            "base_url": "",
            "selected_environment": "",
            "environment_overrides": {},
            "hydrate_prior": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["request"]["url"] == "https://api.example.org/clients"
    assert body["unresolved"] == []


def test_preview_step_requires_referenced_env_value(client):
    response = client.post(
        "/api/preview-step",
        json={
            "scenario": {
                "environments": {"dev": {"token": ""}},
                "selected_environment": "dev",
                "steps": [{"method": "GET", "path": "https://api.example.org/{{ env.token }}"}],
            },
            "step_index": 0,
            "selected_environment": "dev",
        },
    )
    assert response.status_code == 400
    assert "token" in response.json()["detail"]


def test_mask_sensitive_text():
    assert mask_sensitive_text("Authorization: Bearer super-secret") == "Authorization: Bearer ***"
    assert mask_sensitive_text("authorization = bearer abc.def") == "authorization = bearer ***"
    assert mask_sensitive_text("plain text") == "plain text"
    assert mask_sensitive_text("") == ""
