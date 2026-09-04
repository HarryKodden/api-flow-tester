from __future__ import annotations

from tools.scenario_runner import (
    apply_env_overrides,
    apply_suite_defaults,
    expand_environment_values,
    finalize_environment_values,
    is_suite,
    missing_environment_dependencies,
    resolve_base_url,
    resolve_environment_values,
)
from webapp.app import _base_url_from_steps, _get_scenario_environment_values


SCENARIO_WITH_ENVS = {
    "selected_environment": "",
    "environments": {
        "dev": {
            "server": "https://dev.example.org",
            "token": "dev-token",
        },
        "prod": {
            "server": "https://prod.example.org",
            "token": "",
        },
    },
    "steps": [
        {
            "method": "GET",
            "path": "https://public.example.org/clients",
            "expected_status": 200,
        }
    ],
}


def test_no_environment_selected_returns_empty_values():
    assert resolve_environment_values(SCENARIO_WITH_ENVS, "") == {}
    assert resolve_environment_values(SCENARIO_WITH_ENVS, None) == {}
    assert _get_scenario_environment_values(SCENARIO_WITH_ENVS, "") == {}
    assert _get_scenario_environment_values(SCENARIO_WITH_ENVS, None) == {}


def test_named_environment_is_used_when_selected():
    values = resolve_environment_values(SCENARIO_WITH_ENVS, "dev")
    assert values["server"] == "https://dev.example.org"
    assert values["token"] == "dev-token"
    assert resolve_base_url(SCENARIO_WITH_ENVS, "dev") == "https://dev.example.org"


def test_file_selected_environment_is_the_default():
    scenario = {**SCENARIO_WITH_ENVS, "selected_environment": "dev"}
    assert resolve_environment_values(scenario, None)["token"] == "dev-token"
    assert resolve_base_url(scenario, None) == "https://dev.example.org"


def test_absolute_steps_need_no_environment_values():
    missing = missing_environment_dependencies({}, SCENARIO_WITH_ENVS["steps"])
    assert missing == []


def test_missing_placeholder_is_reported():
    steps = [{"method": "GET", "path": "{{ env.token }}/users", "headers": {"Authorization": "Bearer {{ token }}"}}]
    missing = missing_environment_dependencies({}, steps)
    assert "token" in missing


def test_unused_empty_environment_keys_are_not_required():
    env = {"server": "https://api.example.org", "unused": ""}
    steps = [{"method": "GET", "path": "https://api.example.org/health"}]
    assert missing_environment_dependencies(env, steps) == []


def test_connection_key_satisfied_by_any_host():
    env = {"server": "https://api.example.org"}
    steps = [{"method": "GET", "path": "{{ base_url }}/health"}]
    assert missing_environment_dependencies(env, steps) == []


def test_expand_and_finalize_environment_values():
    values = expand_environment_values(
        {
            "server": "https://staging.example.org",
            "token_url": "{{ server }}/oauth/token",
        }
    )
    assert values["token_url"] == "https://staging.example.org/oauth/token"
    finalized = finalize_environment_values({"server": "https://staging.example.org"})
    assert finalized["server"] == "https://staging.example.org"
    assert finalized["base_url"] == "https://staging.example.org"


def test_apply_env_overrides_nested_and_blank():
    values = apply_env_overrides({"token": "old", "nested": {"id": "1"}}, {"token": "new", "nested.id": "2", "blank": ""})
    assert values["token"] == "new"
    assert values["nested"]["id"] == "2"
    assert "blank" not in values


def test_apply_suite_defaults_merges_environments_without_forcing_selection():
    child = {"environments": {"dev": {"token": "child"}}, "selected_environment": "", "steps": []}
    suite = {
        "environments": {"dev": {"server": "https://suite.example.org", "token": "suite"}},
        "selected_environment": "",
        "base_url": "",
    }
    merged = apply_suite_defaults(child, suite)
    assert merged["environments"]["dev"]["server"] == "https://suite.example.org"
    assert merged["environments"]["dev"]["token"] == "suite"
    assert merged.get("selected_environment", "") == ""


def test_is_suite_and_base_url_from_steps():
    assert is_suite({"scenarios": ["a.json"], "steps": []})
    assert not is_suite({"scenarios": [], "steps": [{"path": "/"}]})
    assert _base_url_from_steps([{"path": "/relative"}, {"path": "https://api.example.org/clients"}]) == "https://api.example.org"
    assert _base_url_from_steps([{"path": "/relative"}]) == ""
