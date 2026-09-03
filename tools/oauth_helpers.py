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
from urllib.parse import parse_qs, urlencode, urlparse

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


class _ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


_CIMD_SERVERS: dict[int, HTTPServer] = {}
_CIMD_URLS: dict[int, str] = {}
_CIMD_LOCK = threading.Lock()


def stop_cimd_metadata_servers() -> None:
    with _CIMD_LOCK:
        servers = list(_CIMD_SERVERS.values())
        _CIMD_SERVERS.clear()
        _CIMD_URLS.clear()
    for server in servers:
        try:
            server.shutdown()
        except Exception:
            pass
        try:
            server.server_close()
        except Exception:
            pass


def start_cimd_metadata_server(
    port: int,
    metadata: dict[str, Any],
    *,
    advertise_host: str = "127.0.0.1",
) -> str:
    """Serve CIMD client metadata. Reuses a live server on the same port, or binds another if busy."""
    host = (advertise_host or "127.0.0.1").strip() or "127.0.0.1"
    requested = int(port)

    with _CIMD_LOCK:
        existing = _CIMD_SERVERS.get(requested)
        if existing is not None:
            return _CIMD_URLS.get(requested, f"http://{host}:{requested}/client.json")

        holder: dict[str, bytes] = {"payload": b"{}"}

        class Handler(_JSONHandler):
            def do_GET(self):  # noqa: N802
                body = holder["payload"]
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        try:
            server = _ReusableHTTPServer(("0.0.0.0", requested), Handler)
        except OSError as exc:
            if getattr(exc, "errno", None) not in {48, 98}:
                raise
            server = _ReusableHTTPServer(("0.0.0.0", 0), Handler)

        actual_port = int(server.server_address[1])
        url = f"http://{host}:{actual_port}/client.json"
        payload = dict(metadata or {})
        payload["client_id"] = url
        holder["payload"] = json.dumps(payload).encode("utf-8")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        _CIMD_SERVERS[requested] = server
        _CIMD_URLS[requested] = url
        if actual_port != requested:
            _CIMD_SERVERS[actual_port] = server
            _CIMD_URLS[actual_port] = url
        return url


def form_encode(data: Any) -> str | None:
    if data is None:
        return None
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        return urlencode({str(k): "" if v is None else str(v) for k, v in data.items()})
    return str(data)
