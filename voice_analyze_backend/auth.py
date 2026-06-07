"""
Authentication and authorization utilities for multi-user platform.
"""
import os
import hashlib
import base64
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import User, UserRole, SessionLocal, get_db

# Bcrypt has a 72-byte limit for passwords
BCRYPT_MAX_PASSWORD_LENGTH = 72


# JWT settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-use-long-random-string-min-32-chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _prepare_password_for_bcrypt(password: str) -> str:
    """
    Prepare password for bcrypt hashing.
    
    Bcrypt has a 72-byte limit. If the password is longer, we hash it with SHA-256
    first to get a fixed 32-byte hash, then bcrypt that. This preserves security
    while staying within bcrypt's limits.
    
    Args:
        password: The plain text password
        
    Returns:
        Password string ready for bcrypt (either original if <= 72 bytes, or base64-encoded SHA-256 hash)
    """
    password_bytes = password.encode('utf-8')
    
    if len(password_bytes) <= BCRYPT_MAX_PASSWORD_LENGTH:
        # Password is within bcrypt's limit, use as-is
        return password
    else:
        # Password is too long, hash it with SHA-256 first
        # SHA-256 produces 32 bytes, which is well within bcrypt's 72-byte limit
        # We use base64 encoding to ensure it's a valid string for bcrypt
        sha256_hash_bytes = hashlib.sha256(password_bytes).digest()
        # Base64 encode the hash to get a safe string representation (44 chars, < 72 bytes)
        base64_hash = base64.b64encode(sha256_hash_bytes).decode('ascii')
        return base64_hash


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    prepared_password = _prepare_password_for_bcrypt(plain_password)
    # Use bcrypt directly to avoid passlib backend detection issues
    password_bytes = prepared_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    try:
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt.
    
    Automatically handles passwords longer than 72 bytes by hashing with SHA-256 first.
    
    Args:
        password: The plain text password to hash
        
    Returns:
        Bcrypt hash string (UTF-8 encoded)
    """
    # Prepare password (hash with SHA-256 if too long)
    prepared_password = _prepare_password_for_bcrypt(password)
    
    # Hash using bcrypt directly (avoids passlib backend detection issues)
    password_bytes = prepared_password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    # Return as string
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """Get user by ID."""
    try:
        from uuid import UUID
        user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
        return db.query(User).filter(User.id == user_uuid).first()
    except (ValueError, AttributeError):
        return None


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not user.hashed_password:
        return None  # Public users don't have passwords
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    
    # Students must be approved by admin before they can login
    if user.role == UserRole.STUDENT and not user.is_approved:
        return None  # Student not approved yet
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get the current user from JWT token (optional - returns None if not authenticated)."""
    import logging
    logger = logging.getLogger(__name__)
    
    if not token:
        logger.debug("No token provided in request")
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            logger.warning("Token payload missing 'sub' field")
            return None
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        return None
    
    user = get_user_by_id(db, user_id)
    if not user:
        logger.warning(f"User {user_id} not found in database")
        return None
    if not user.is_active:
        logger.warning(f"User {user_id} is inactive")
        return None
    
    logger.debug(f"Successfully authenticated user: {user_id}, role: {user.role}")
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user from JWT token (required)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        raise credentials_exception
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = get_user_by_id(db, user_id)
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get the current active user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get the current user and verify they are an admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Admin access required."
        )
    return current_user


async def get_current_qari_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get the current user and verify they are a Qari."""
    if current_user.role != UserRole.QARI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Qari access required."
        )
    if not current_user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Qari account is pending approval."
        )
    return current_user


async def get_current_student_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get the current user and verify they are a student."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Student access required."
        )
    return current_user


async def require_registered_user(
    current_user: Optional[User] = Depends(get_current_user_optional)
) -> User:
    """Require a registered user (not public)."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please register or login."
        )
    return current_user
