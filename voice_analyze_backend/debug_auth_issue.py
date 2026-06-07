"""
Debug authentication issue - check if token validation is working
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv()

from jose import jwt, JWTError
from datetime import datetime

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-use-long-random-string-min-32-chars")
ALGORITHM = "HS256"

print("=" * 70)
print("Authentication Debug")
print("=" * 70)
print()
print(f"SECRET_KEY: {SECRET_KEY[:30]}... (length: {len(SECRET_KEY)})")
print()

# Test with a sample token structure
print("Testing token validation logic...")
print()

# Get token from user
print("To test your actual token:")
print("1. Open browser console on localhost:3000")
print("2. Run: localStorage.getItem('tarannum_auth_token')")
print("3. Copy the token")
print()
print("Then run:")
print("  python test_auth_token.py <your_token>")
print()
print("=" * 70)
print()
print("Common issues:")
print("1. Token expired - Check 'exp' field in token")
print("2. SECRET_KEY mismatch - Token generated with different key")
print("3. Token not sent - Check Network tab for Authorization header")
print()
print("Quick fix: Log out and log back in to get fresh token")
