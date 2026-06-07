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

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-use-long-random-string-min-32-chars")
ALGORITHM = "HS256"

def test_token(token: str):
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
    # if len(sys.argv) < 2:
    #     print("Usage: python test_auth_token.py <jwt_token>")
    #     print()
    #     print("To get your token:")
    #     print("1. Open browser console on localhost:3000")
    #     print("2. Run: localStorage.getItem('tarannum_auth_token')")
    #     print("3. Copy the token and run this script")
    #     sys.exit(1)
    
    token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NDJjMTM0MC1mNDA3LTRlOWUtOTM0MC0xZmQ3MGU1M2U3YWYiLCJlbWFpbCI6ImFkbWluQGdtYWlsLmNvbSIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTc2OTg5MzM3Nn0.LHPlJrouvJQQ2oD9iab62wzba3rc6V-QCMOzCEJrd2k'
    print(f"Testing token: {token[:50]}...")
    print(f"Using SECRET_KEY: {SECRET_KEY[:20]}...")
    print()
    test_token(token)
