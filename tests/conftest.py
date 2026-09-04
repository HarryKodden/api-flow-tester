from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DATA_DIR = Path(__file__).resolve().parent / ".data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["DATA_DIR"] = str(DATA_DIR)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(DATA_DIR / 'test.db').as_posix()}"
os.environ["SESSION_SECRET"] = "test-session-secret"
for key in ("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "SESSION_SECURE"):
    os.environ.pop(key, None)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from webapp.app import app

    with TestClient(app) as test_client:
        yield test_client
