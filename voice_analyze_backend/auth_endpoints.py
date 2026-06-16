"""
Authentication endpoints for multi-user platform.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from database import User, UserRole, SessionLocal, get_db
from auth import (
    get_password_hash, authenticate_user, create_access_token,
    get_current_user, get_current_active_user, get_current_admin_user,
    ACCESS_TOKEN_EXPIRE_MINUTES, verify_password, get_user_by_email,
    SECRET_KEY
)
import hashlib
import html
import hmac
import json
import logging
import os
import secrets
import re
from urllib import request, error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
debug_router = APIRouter(prefix="/api/debug", tags=["debug"])

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_RESENDS = 3


# Request/Response Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    ic_number: Optional[str] = None
    address: Optional[str] = None
    role: str = "student"  # Default to student (allow both "student" and "qari")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ResendOtpRequest(BaseModel):
    email: EmailStr


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str
    role: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    full_name: Optional[str]
    is_active: bool
    is_approved: bool
    created_at: str
    last_login: Optional[str] = None


class MessageResponse(BaseModel):
    message: str


def _normalize_email(email: str) -> str:
    """Normalize email addresses consistently before lookup/storage."""
    return email.strip().lower()


def _role_value(role) -> str:
    """Return a stable string role value for enum or plain string roles."""
    return getattr(role, "value", role)


def _generate_otp() -> str:
    """Generate a secure 6-digit numeric OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(email: str, otp_code: str) -> str:
    """Hash OTP with an app secret so raw OTP is never stored."""
    message = f"{_normalize_email(email)}:{otp_code}".encode("utf-8")
    return hmac.new(SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _safe_resend_error_body(raw_body: str, otp_code: str) -> str:
    """Return a sanitized Resend error body safe for logs."""
    sanitized = raw_body.replace(otp_code, "[OTP_REDACTED]")
    sanitized = re.sub(r"\b\d{6}\b", "[OTP_REDACTED]", sanitized)
    return sanitized[:1000]


def _normalize_email_address_config(value: Optional[str]) -> Optional[str]:
    """Normalize env email values, including accidental markdown mailto format."""
    if not value:
        return None

    cleaned = value.strip()
    markdown_match = re.match(r"^(.*?)\s*\[([^\]]+)\]\(mailto:([^)]+)\)\s*$", cleaned)
    if markdown_match:
        display_name = markdown_match.group(1).strip()
        email_address = markdown_match.group(3).strip()
        return f"{display_name} <{email_address}>" if display_name else email_address

    mailto_match = re.match(r"^\[?([^\]]+)\]?\(mailto:([^)]+)\)\s*$", cleaned)
    if mailto_match:
        return mailto_match.group(2).strip()

    return cleaned


def _email_config():
    """Return normalized Resend email configuration."""
    return {
        "from": _normalize_email_address_config(os.getenv("EMAIL_FROM")),
        "reply_to": _normalize_email_address_config(os.getenv("EMAIL_REPLY_TO")),
        "api_key_present": bool(os.getenv("RESEND_API_KEY")),
    }


def log_email_config_startup():
    """Log masked email config at startup without exposing secrets."""
    config = _email_config()
    logger.info(
        "Email config: EMAIL_FROM=%s EMAIL_REPLY_TO=%s RESEND_API_KEY present=%s",
        config["from"] or "[missing]",
        config["reply_to"] or "[missing]",
        config["api_key_present"],
    )


def _send_verification_email(email: str, otp_code: str):
    """Send OTP email through Resend."""
    api_key = os.getenv("RESEND_API_KEY")
    config = _email_config()
    email_from = config["from"]
    email_reply_to = config["reply_to"]

    if not api_key or not email_from:
        raise RuntimeError("Email service is not configured.")

    escaped_otp = html.escape(otp_code)
    html_body = (
        "<p>Assalamualaikum,</p>"
        "<p>Your Tarannum AI verification code is:</p>"
        f"<p style=\"font-size:24px;font-weight:700;letter-spacing:4px;\">{escaped_otp}</p>"
        "<p>This code will expire in 10 minutes.</p>"
        "<p>If you did not request this, please ignore this email.</p>"
        "<p>Tarannum AI</p>"
    )

    payload = {
        "from": email_from,
        "to": [email],
        "subject": "Tarannum AI Email Verification Code",
        "html": html_body,
    }
    if email_reply_to:
        payload["reply_to"] = email_reply_to

    req = request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "TarannumAI/1.0 (+https://tarannum.ai)",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if response.status >= 400:
                logger.error(
                    "Resend returned HTTP %s while sending verification email to %s: %s",
                    response.status,
                    email,
                    _safe_resend_error_body(response_body, otp_code),
                )
                raise RuntimeError("Failed to send verification email.")
            logger.info(
                "Resend accepted verification email for %s with HTTP %s: %s",
                email,
                response.status,
                _safe_resend_error_body(response_body, otp_code),
            )
    except error.HTTPError as e:
        response_body = e.read().decode("utf-8", errors="replace")
        logger.error(
            "Resend returned HTTP %s while sending verification email to %s: %s",
            e.code,
            email,
            _safe_resend_error_body(response_body, otp_code),
        )
        raise RuntimeError("Failed to send verification email.") from e
    except Exception as e:
        logger.error("Failed to send verification email: %s", e)
        raise RuntimeError("Failed to send verification email.") from e


@debug_router.get("/email-config")
async def get_email_config_debug():
    """Return non-secret email configuration for deployment debugging."""
    config = _email_config()
    return {
        "sender": config["from"],
        "reply_to": config["reply_to"],
        "resend_api_key_present": config["api_key_present"],
    }


def _set_new_otp(user: User, otp_code: str, now: datetime, resend_count: int = 0):
    """Attach a fresh OTP challenge to a user record."""
    user.otp_code_hash = _hash_otp(user.email, otp_code)
    user.otp_expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    user.otp_consumed_at = None
    user.otp_attempt_count = 0
    user.otp_last_sent_at = now
    user.otp_resend_count = resend_count


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user."""
    try:
        # Validate password requirements
        password = user_data.password
        
        # Check minimum length
        if len(password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters long"
            )
        
        # Check maximum length (72 characters to avoid bcrypt issues)
        if len(password) > 72:
            raise HTTPException(
                status_code=400,
                detail="Password must be 72 characters or less"
            )
        
        # Check for required character types
        has_uppercase = any(c.isupper() for c in password)
        has_lowercase = any(c.islower() for c in password)
        has_number = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        if not has_uppercase:
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one uppercase letter"
            )
        if not has_lowercase:
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one lowercase letter"
            )
        if not has_number:
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one number"
            )
        if not has_special:
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"
            )
        
        normalized_email = _normalize_email(user_data.email)

        # Check if user already exists
        existing_user = get_user_by_email(db, normalized_email)
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )
        
        # Validate role - allow student and qari registration
        if user_data.role not in ["student", "qari"]:
            raise HTTPException(
                status_code=403,
                detail="Only student and qari accounts can be created through registration."
            )
        
        # Set approval status based on role
        # Students: approved immediately (no admin approval needed)
        # Qaris: require admin approval
        if user_data.role == "student":
            is_approved = True  # Students don't need approval
        elif user_data.role == "qari":
            is_approved = False  # Qaris need admin approval
        else:
            is_approved = False  # Default to False for safety
        
        # Create new user
        try:
            hashed_password = get_password_hash(user_data.password)
        except ValueError as e:
            # Handle password hashing errors with user-friendly messages
            error_msg = str(e)
            raise HTTPException(
                status_code=400,
                detail=error_msg
            )
        ic_number = user_data.ic_number.strip() if user_data.ic_number else None
        address = user_data.address.strip() if user_data.address else None
        now = datetime.utcnow()
        otp_code = _generate_otp()

        new_user = User(
            email=normalized_email,
            hashed_password=hashed_password,
            role=user_data.role,
            full_name=user_data.full_name,
            ic_number=ic_number or None,
            address=address or None,
            is_active=True,
            is_approved=is_approved,
            email_verified=False,
            email_verified_at=None,
        )
        _set_new_otp(new_user, otp_code, now, resend_count=0)

        try:
            _send_verification_email(normalized_email, otp_code)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"New user registered: {new_user.email} (role: {new_user.role})")
        
        return {
            "id": str(new_user.id),
            "email": new_user.email,
            "role": new_user.role,
            "full_name": new_user.full_name,
            "is_active": new_user.is_active,
            "is_approved": new_user.is_approved,
            "created_at": new_user.created_at.isoformat() if new_user.created_at else "",
            "last_login": new_user.last_login.isoformat() if new_user.last_login else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error registering user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token."""
    try:
        normalized_email = _normalize_email(credentials.email)
        # First check if user exists and verify password to give specific error messages
        existing_user = get_user_by_email(db, normalized_email)
        user = None
        
        if existing_user:
            # User exists, check password
            if existing_user.hashed_password and verify_password(credentials.password, existing_user.hashed_password):
                role_value = _role_value(existing_user.role)
                if role_value != UserRole.ADMIN.value and not existing_user.email_verified:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Please verify your email before logging in.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                # Password is correct, check if user needs approval (both students and qaris)
                if role_value == UserRole.STUDENT.value and not existing_user.is_approved:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Your account is pending admin approval. Please wait for approval before logging in.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                elif role_value == UserRole.QARI.value and not existing_user.is_approved:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Your account is pending admin approval. Please wait for approval before logging in.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                # Password correct and approved, proceed with authentication
                user = authenticate_user(db, normalized_email, credentials.password)
            else:
                # Password incorrect
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect email or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        else:
            # User doesn't exist
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "role": user.role},
            expires_delta=access_token_expires
        )
        
        logger.info(f"User logged in: {user.email}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify a user's email address using a one-time OTP."""
    normalized_email = _normalize_email(payload.email)
    otp_code = payload.otp_code.strip()

    if not otp_code.isdigit() or len(otp_code) != 6:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user = get_user_by_email(db, normalized_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.email_verified:
        return {"message": "Email verified successfully."}

    now = datetime.utcnow()
    if not user.otp_code_hash or not user.otp_expires_at or user.otp_consumed_at:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new OTP.")

    if user.otp_expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new OTP.")

    if (user.otp_attempt_count or 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many invalid OTP attempts. Please request a new OTP.")

    expected_hash = _hash_otp(normalized_email, otp_code)
    if not hmac.compare_digest(user.otp_code_hash, expected_hash):
        user.otp_attempt_count = (user.otp_attempt_count or 0) + 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user.email_verified = True
    user.email_verified_at = now
    user.otp_consumed_at = now
    user.otp_attempt_count = 0
    db.commit()

    return {"message": "Email verified successfully."}


@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)):
    """Resend an email verification OTP with cooldown and resend limits."""
    normalized_email = _normalize_email(payload.email)
    user = get_user_by_email(db, normalized_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.email_verified:
        return {"message": "Email verified successfully."}

    now = datetime.utcnow()
    if user.otp_last_sent_at:
        cooldown_until = user.otp_last_sent_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS)
        if cooldown_until > now:
            raise HTTPException(status_code=429, detail="You may request a new OTP after 60 seconds.")

    otp_still_valid = bool(user.otp_expires_at and user.otp_expires_at > now)
    current_resend_count = user.otp_resend_count or 0
    if otp_still_valid and current_resend_count >= OTP_MAX_RESENDS:
        raise HTTPException(status_code=429, detail="Too many OTP resend requests. Please try again later.")

    otp_code = _generate_otp()
    next_resend_count = current_resend_count + 1 if otp_still_valid else 1
    _set_new_otp(user, otp_code, now, resend_count=next_resend_count)

    try:
        _send_verification_email(normalized_email, otp_code)
    except RuntimeError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(e))

    db.commit()
    return {"message": "OTP has been sent to your email."}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current user information."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_approved": current_user.is_approved,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else "",
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None
    }
