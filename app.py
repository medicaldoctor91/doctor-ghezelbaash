from __future__ import annotations

import os
import threading
from typing import Any

import jwt
from flask import Flask, jsonify, request
from jwt import PyJWKClient

from commons_tasks import CommonsError, run_deleted_clinic_cleanup

ISSUER = "https://token.actions.githubusercontent.com"
JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks"
DEFAULT_AUD = "ghezelbaash-commons-toolforge"
DEFAULT_REPO = "medicaldoctor91/doctor-ghezelbaash"
DEFAULT_REF = "refs/heads/commons-dispatch"
DEFAULT_ACTOR = "medicaldoctor91"
ACTION = "commons-cleanup-deleted-clinic-q140288589-v1"

app = Flask(__name__)
_lock = threading.Lock()
_jwks = PyJWKClient(JWKS_URL, cache_keys=True)


def _claims(token: str) -> dict[str, Any]:
    key = _jwks.get_signing_key_from_jwt(token).key
    claims = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=os.getenv("GITHUB_OIDC_AUDIENCE", DEFAULT_AUD),
        issuer=ISSUER,
        options={"require": ["exp", "iat", "iss", "aud", "sub", "repository", "ref"]},
    )
    expected_repo = os.getenv("GITHUB_ALLOWED_REPOSITORY", DEFAULT_REPO)
    expected_ref = os.getenv("GITHUB_ALLOWED_REF", DEFAULT_REF)
    expected_actor = os.getenv("GITHUB_ALLOWED_ACTOR", DEFAULT_ACTOR)
    if claims.get("repository") != expected_repo:
        raise PermissionError("repository claim rejected")
    if claims.get("ref") != expected_ref:
        raise PermissionError("ref claim rejected")
    if claims.get("actor") != expected_actor:
        raise PermissionError("actor claim rejected")
    if claims.get("event_name") != "push":
        raise PermissionError("event_name claim rejected")
    expected_sub = f"repo:{expected_repo}:ref:{expected_ref}"
    if claims.get("sub") != expected_sub:
        raise PermissionError("subject claim rejected")
    return claims


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "service": "ghezelbaash-commons-bot"})


@app.post("/dispatch")
def dispatch():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"ok": False, "error": "missing bearer token"}), 401
    try:
        claims = _claims(auth[7:])
    except Exception as exc:
        return jsonify({"ok": False, "error": f"OIDC rejected: {type(exc).__name__}"}), 403

    if request.content_length and request.content_length > 4096:
        return jsonify({"ok": False, "error": "request too large"}), 413
    body = request.get_json(silent=True) or {}
    if body.get("action") != ACTION:
        return jsonify({"ok": False, "error": "unknown action"}), 400
    dry_run = body.get("dry_run") is not False

    if not _lock.acquire(blocking=False):
        return jsonify({"ok": False, "error": "another transaction is running"}), 409
    try:
        result = run_deleted_clinic_cleanup(dry_run=dry_run)
        result["github_run_id"] = claims.get("run_id")
        result["github_sha"] = claims.get("sha")
        return jsonify(result)
    except CommonsError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 409
    except Exception as exc:
        app.logger.exception("dispatch failed")
        return jsonify({"ok": False, "error": f"internal failure: {type(exc).__name__}"}), 500
    finally:
        _lock.release()
