"""
Authentication endpoints for multi-user platform.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import timedelta
from database import User, UserRole, SessionLocal, get_db
from auth import (
    get_password_hash, authenticate_user, create_access_token,
    get_current_user, get_current_active_user, get_current_admin_user,
    ACCESS_TOKEN_EXPIRE_MINUTES, verify_password, get_user_by_email
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["authentication"])


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
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == user_data.email).first()
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

        new_user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            role=user_data.role,
            full_name=user_data.full_name,
            ic_number=ic_number or None,
            address=address or None,
            is_active=True,
            is_approved=is_approved
        )
        
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
        # First check if user exists and verify password to give specific error messages
        existing_user = get_user_by_email(db, credentials.email)
        user = None
        
        if existing_user:
            # User exists, check password
            if existing_user.hashed_password and verify_password(credentials.password, existing_user.hashed_password):
                # Password is correct, check if user needs approval (both students and qaris)
                if existing_user.role == UserRole.STUDENT and not existing_user.is_approved:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Your account is pending admin approval. Please wait for approval before logging in.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                elif existing_user.role == UserRole.QARI and not existing_user.is_approved:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Your account is pending admin approval. Please wait for approval before logging in.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                # Password correct and approved, proceed with authentication
                user = authenticate_user(db, credentials.email, credentials.password)
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
