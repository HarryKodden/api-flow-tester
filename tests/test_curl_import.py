from __future__ import annotations

import pytest

from tools.curl_import import parse_curl_command


def test_parse_get_with_header_and_full_url():
    parsed = parse_curl_command(
        "curl -sS -X GET https://api.example.org/clients -H 'X-API-Key: secret'"
    )
    assert parsed["method"] == "GET"
    assert parsed["path"] == "https://api.example.org/clients"
    assert parsed["headers"]["X-API-Key"] == "secret"
    assert parsed["follow_redirects"] is True
    assert parsed["name"] == "clients"


def test_parse_data_without_method_defaults_to_post():
    parsed = parse_curl_command("curl https://api.example.org/items -d 'name=Ada'")
    assert parsed["method"] == "POST"
    assert parsed["data"] == "name=Ada"


def test_parse_json_flag_sets_body_and_headers():
    parsed = parse_curl_command('curl --json \'{"name":"Ada"}\' https://api.example.org/items')
    assert parsed["method"] == "POST"
    assert parsed["json"] == {"name": "Ada"}
    assert parsed["headers"]["Content-Type"] == "application/json"
    assert parsed["headers"]["Accept"] == "application/json"


def test_parse_basic_auth_timeout_and_location():
    parsed = parse_curl_command(
        "curl -L -u ada:secret -m 12 --url https://api.example.org/health"
    )
    assert parsed["follow_redirects"] is True
    assert parsed["timeout"] == 12
    assert parsed["headers"]["Authorization"].startswith("Basic ")


def test_parse_multiline_and_rejects_empty():
    parsed = parse_curl_command(
        "curl -sS \\\n  https://api.example.org/status \\\n  -H 'Accept: application/json'"
    )
    assert parsed["path"] == "https://api.example.org/status"
    with pytest.raises(ValueError, match="Paste a curl command"):
        parse_curl_command("")
    with pytest.raises(ValueError, match="missing a URL"):
        parse_curl_command("curl -sS")
