#!/usr/bin/env python3
"""OAuth/OIDC helpers for loadtester scenario steps (PKCE, DPoP, JWT stubs, URL utils)."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import string
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_json(obj: Any) -> str:
    return b64url(json.dumps(obj, separators=(",", ":"), sort_keys=False).encode("utf-8"))


def generate_pkce() -> dict[str, str]:
    alphabet = string.ascii_letters + string.digits + "-._~"
    verifier = "".join(secrets.choice(alphabet) for _ in range(64))
    challenge = b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    return {"verifier": verifier, "challenge": challenge, "method": "S256"}


def basic_auth_header(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def ath_hash(access_token: str) -> str:
    return b64url(hashlib.sha256(access_token.encode("ascii")).digest())


class DPoPKey:
    """In-memory P-256 key used to mint DPoP proofs (RFC 9449)."""

    def __init__(self, private_key: ec.EllipticCurvePrivateKey | None = None):
        self._key = private_key or ec.generate_private_key(ec.SECP256R1())

    @property
    def jwk_public(self) -> dict[str, str]:
        pub = self._key.public_key().public_numbers()
        return {
            "kty": "EC",
            "crv": "P-256",
            "x": b64url(pub.x.to_bytes(32, "big")),
            "y": b64url(pub.y.to_bytes(32, "big")),
            "alg": "ES256",
            "use": "sig",
        }

    @property
    def jkt(self) -> str:
        # RFC 7638 thumbprint over required members only, sorted
        required = {"crv": self.jwk_public["crv"], "kty": "EC", "x": self.jwk_public["x"], "y": self.jwk_public["y"]}
        digest = hashlib.sha256(json.dumps(required, separators=(",", ":"), sort_keys=True).encode("utf-8")).digest()
        return b64url(digest)

    def proof(self, htm: str, htu: str, nonce: str | None = None, access_token: str | None = None) -> str:
        header = {"alg": "ES256", "typ": "dpop+jwt", "jwk": self.jwk_public}
        claims: dict[str, Any] = {
            "jti": str(uuid.uuid4()),
            "htm": htm.upper(),
            "htu": htu,
            "iat": int(time.time()),
        }
        if nonce:
            claims["nonce"] = nonce
        if access_token:
            claims["ath"] = ath_hash(access_token)
        signing_input = f"{b64url_json(header)}.{b64url_json(claims)}".encode("ascii")
        der_sig = self._key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der_sig)
        sig = b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
        return f"{b64url_json(header)}.{b64url_json(claims)}.{sig}"


# Worker-local key store (name -> DPoPKey)
_DPOP_KEYS: dict[str, DPoPKey] = {}
_DPOP_LOCK = threading.Lock()


def get_dpop_key(name: str = "default") -> DPoPKey:
    with _DPOP_LOCK:
        if name not in _DPOP_KEYS:
            _DPOP_KEYS[name] = DPoPKey()
        return _DPOP_KEYS[name]


def reset_dpop_key(name: str = "default") -> DPoPKey:
    with _DPOP_LOCK:
        _DPOP_KEYS[name] = DPoPKey()
        return _DPOP_KEYS[name]


def mock_attestation_jwt(client_id: str, audience: str) -> str:
    """Unsigned-ish mock JWT matching shell test_attestation_auth.sh (fake signature)."""
    now = int(time.time())
    header = {"alg": "ES256", "typ": "JWT"}
    payload = {
        "iss": "test-attestor",
        "sub": client_id,
        "aud": audience,
        "iat": now,
        "exp": now + 3600,
        "att_type": "hsm",
        "att_level": "high",
        "att_hardware_backed": True,
        "att_device_integrity": "verified",
        "nonce": "test-nonce-123",
    }
    return f"{b64url_json(header)}.{b64url_json(payload)}.{b64url(b'test signature')}"


def query_param(url: str, name: str, default: str = "") -> str:
    if not url:
        return default
    values = parse_qs(urlparse(url).query).get(name, [])
    return values[0] if values else default


def absolute_url(base_url: str, path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    return f"{base_url.rstrip('/')}{path_or_url if path_or_url.startswith('/') else '/' + path_or_url}"


class _JSONHandler(BaseHTTPRequestHandler):
    payload: bytes = b"{}"

    def do_GET(self):  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.payload)))
        self.end_headers()
        self.wfile.write(self.payload)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return


_CIMD_SERVERS: dict[int, HTTPServer] = {}
_CIMD_LOCK = threading.Lock()


def start_cimd_metadata_server(port: int, metadata: dict[str, Any]) -> str:
    """Serve CIMD client metadata JSON on 127.0.0.1:port. Idempotent per port."""
    body = json.dumps(metadata).encode("utf-8")

    class Handler(_JSONHandler):
        payload = body

    with _CIMD_LOCK:
        existing = _CIMD_SERVERS.get(port)
        if existing is not None:
            return f"http://127.0.0.1:{port}/client.json"
        server = HTTPServer(("127.0.0.1", port), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        _CIMD_SERVERS[port] = server
        return f"http://127.0.0.1:{port}/client.json"


def form_encode(data: Any) -> str | None:
    if data is None:
        return None
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        return urlencode({str(k): "" if v is None else str(v) for k, v in data.items()})
    return str(data)
