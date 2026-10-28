"""
Test JWT token validation
Run this to check if a token is valid
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv()

from jose import jwt, JWTError

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must be configured with at least 32 characters")
ALGORITHM = "HS256"

def validate_token(token: str):
    """Test if a JWT token is valid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        email = payload.get("email", "N/A")
        role = payload.get("role", "N/A")
        exp = payload.get("exp", "N/A")
        
        print(f"[OK] Token is valid!")
        print(f"  User ID: {user_id}")
        print(f"  Email: {email}")
        print(f"  Role: {role}")
        print(f"  Expires: {exp}")
        return True
    except JWTError as e:
        print(f"[FAIL] Token is invalid: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] Error validating token: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python test_auth_token.py <jwt_token>")
        sys.exit(1)
    validate_token(sys.argv[1])
