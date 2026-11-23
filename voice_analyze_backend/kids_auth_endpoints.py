"""Token exchange between central Tarannum.ai auth and an isolated Kids API."""

import asyncio
import json
import logging
import os
from datetime import timedelta
from urllib import error, request

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_user_by_email
from database import User, UserRole, get_db


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/kids/auth", tags=["kids-auth"])


class CentralTokenExchangeRequest(BaseModel):
    central_access_token: str


class KidsTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: str
    full_name: str | None = None


def _central_auth_base_url() -> str:
    return os.getenv("KIDS_CENTRAL_AUTH_BASE_URL", "").strip().rstrip("/")


def _fetch_central_user(base_url: str, token: str) -> dict:
    """Validate a central token without ever receiving or storing a password."""
    central_request = request.Request(
        f"{base_url}/api/auth/me",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with request.urlopen(central_request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sesi Tarannum.ai tidak sah atau telah tamat.",
            ) from exc
        logger.warning("Central auth returned HTTP %s", exc.code)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Autentikasi pusat Tarannum.ai tidak tersedia.",
        ) from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Central auth request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Autentikasi pusat Tarannum.ai tidak tersedia.",
        ) from exc


def _upsert_shadow_student(db: Session, central_user: dict) -> User:
    email = str(central_user.get("email") or "").strip().lower()
    role = str(central_user.get("role") or "").strip().lower()
    if not email or role != UserRole.STUDENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tarannum Kids memerlukan akaun pelajar Tarannum.ai.",
        )
    if not central_user.get("is_active") or not central_user.get("is_approved"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akaun pelajar belum aktif atau belum diluluskan.",
        )

    user = get_user_by_email(db, email)
    if user is None:
        user = User(
            email=email,
            hashed_password=None,
            role=UserRole.STUDENT.value,
            account_type=str(central_user.get("account_type") or "student"),
            is_active=True,
            is_approved=True,
            email_verified=True,
            admin_provisioned=True,
            full_name=central_user.get("full_name"),
        )
        db.add(user)
    else:
        existing_role = getattr(user.role, "value", user.role)
        if existing_role != UserRole.STUDENT.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mel ini telah digunakan oleh peranan lain dalam Tarannum Kids.",
            )
        user.is_active = True
        user.is_approved = True
        user.email_verified = True
        user.admin_provisioned = True
        if central_user.get("full_name"):
            user.full_name = central_user["full_name"]
    db.commit()
    db.refresh(user)
    return user


@router.post("/exchange", response_model=KidsTokenResponse)
async def exchange_central_token(
    payload: CentralTokenExchangeRequest,
    db: Session = Depends(get_db),
):
    """Exchange a verified central session for a token scoped to the Kids API."""
    base_url = _central_auth_base_url()
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sambungan autentikasi pusat Tarannum.ai belum dikonfigurasi.",
        )
    token = payload.central_access_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token Tarannum.ai diperlukan.")

    central_user = await asyncio.to_thread(_fetch_central_user, base_url, token)
    user = _upsert_shadow_student(db, central_user)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return KidsTokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        email=user.email,
        role=user.role,
        full_name=user.full_name,
    )
