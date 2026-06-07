"""
Verify Milestone 4 environment variables are set correctly.
This script checks if all required and recommended variables are configured.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if it exists
load_dotenv()

def check_env_var(name: str, required: bool = False, validator=None):
    """Check if an environment variable is set and optionally validate it."""
    value = os.getenv(name)
    status = "[OK]" if value else "[MISSING]"
    
    if not value:
        if required:
            return status, f"{name} is REQUIRED but not set"
        else:
            return status, f"{name} is not set (optional)"
    
    # Run validator if provided
    if validator:
        valid, message = validator(name, value)
        if not valid:
            return "[WARN]", f"{name} is set but {message}"
    
    return status, f"{name} = {value[:50]}{'...' if len(value) > 50 else ''}"


def validate_secret_key(name: str, value: str):
    """Validate SECRET_KEY is long enough."""
    if len(value) < 32:
        return False, f"too short (min 32 chars, got {len(value)})"
    return True, ""


def validate_url(name: str, value: str):
    """Validate URL format."""
    if not value.startswith(("http://", "https://")):
        return False, "invalid URL format (should start with http:// or https://)"
    return True, ""


def validate_boolean(name: str, value: str):
    """Validate boolean value."""
    if value.lower() not in ("true", "false", "1", "0", "yes", "no"):
        return False, "invalid boolean value (should be true/false)"
    return True, ""


def validate_environment(name: str, value: str):
    """Validate ENVIRONMENT value."""
    valid = ["development", "staging", "production"]
    if value.lower() not in valid:
        return False, f"invalid value (should be one of: {', '.join(valid)})"
    return True, ""


def check_all_variables():
    """Check all Milestone 4 environment variables."""
    print("=" * 70)
    print("Milestone 4 Environment Variables Verification")
    print("=" * 70)
    print()
    
    # Required variables
    print("REQUIRED VARIABLES:")
    print("-" * 70)
    
    checks = [
        ("DATABASE_URL", True, None),
        ("SECRET_KEY", True, validate_secret_key),
        ("ENVIRONMENT", True, validate_environment),
        ("DEBUG", True, validate_boolean),
        ("ALLOWED_ORIGINS", True, None),
    ]
    
    required_passed = 0
    for name, required, validator in checks:
        status, message = check_env_var(name, required, validator)
        print(f"{status} {message}")
        if status == "[OK]":
            required_passed += 1
    
    print()
    print(f"Required: {required_passed}/{len(checks)} passed")
    print()
    
    # Recommended variables
    print("RECOMMENDED VARIABLES:")
    print("-" * 70)
    
    recommended_checks = [
        ("ENABLE_RATE_LIMITING", False, validate_boolean),
        ("RATE_LIMIT_PER_MINUTE", False, None),
        ("RATE_LIMIT_PER_HOUR", False, None),
        ("RATE_LIMIT_BURST", False, None),
        ("RATE_LIMIT_EXCLUDE_LOCALHOST", False, validate_boolean),
    ]
    
    recommended_passed = 0
    for name, required, validator in recommended_checks:
        status, message = check_env_var(name, required, validator)
        print(f"{status} {message}")
        if status == "[OK]":
            recommended_passed += 1
    
    print()
    print(f"Recommended: {recommended_passed}/{len(recommended_checks)} passed")
    print()
    
    # Optional variables
    print("OPTIONAL VARIABLES:")
    print("-" * 70)
    
    optional_checks = [
        ("REDIS_URL", False, None),
        ("USE_ASYNC_PROCESSING", False, validate_boolean),
        ("CLOUD_STORAGE_TYPE", False, None),
        ("S3_BUCKET_NAME", False, None),
        ("AWS_ACCESS_KEY_ID", False, None),
        ("AWS_SECRET_ACCESS_KEY", False, None),
        ("AWS_REGION", False, None),
    ]
    
    optional_passed = 0
    for name, required, validator in optional_checks:
        status, message = check_env_var(name, required, validator)
        print(f"{status} {message}")
        if status == "[OK]":
            optional_passed += 1
    
    print()
    print(f"Optional: {optional_passed}/{len(optional_checks)} passed")
    print()
    
    # Summary
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    
    total_required = len(checks)
    total_recommended = len(recommended_checks)
    total_optional = len(optional_checks)
    
    print(f"Required:     {required_passed}/{total_required} [OK]")
    print(f"Recommended: {recommended_passed}/{total_recommended} [OK]")
    print(f"Optional:    {optional_passed}/{total_optional} [OK]")
    print()
    
    # Overall status
    if required_passed == total_required:
        print("[OK] All required variables are set correctly!")
        if recommended_passed == total_recommended:
            print("[OK] All recommended variables are set!")
        else:
            print(f"[WARN] {total_recommended - recommended_passed} recommended variables missing")
    else:
        print(f"[ERROR] {total_required - required_passed} required variables missing!")
        print("   Fix these before deploying to production.")
    
    print()
    print("=" * 70)
    
    # Specific checks
    print()
    print("SPECIFIC CHECKS:")
    print("-" * 70)
    
    # Check ALLOWED_ORIGINS format
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "")
    if allowed_origins:
        origins = [o.strip() for o in allowed_origins.split(",")]
        print(f"✅ ALLOWED_ORIGINS contains {len(origins)} origin(s):")
        for origin in origins:
            if origin == "*":
                print(f"   [WARN] {origin} (allows all origins - less secure)")
            elif origin.startswith("https://"):
                print(f"   [OK] {origin}")
            elif origin.startswith("http://"):
                print(f"   [WARN] {origin} (HTTP not HTTPS - less secure)")
            else:
                print(f"   [WARN] {origin} (check format)")
    
    # Check ENVIRONMENT
    env = os.getenv("ENVIRONMENT", "").lower()
    if env == "production":
        print("[OK] ENVIRONMENT=production (correct for production)")
    elif env:
        print(f"[WARN] ENVIRONMENT={env} (should be 'production' for production)")
    else:
        print("[ERROR] ENVIRONMENT not set")
    
    # Check DEBUG
    debug = os.getenv("DEBUG", "").lower()
    if debug == "false":
        print("[OK] DEBUG=false (correct for production)")
    elif debug == "true":
        print("[WARN] DEBUG=true (should be false in production)")
    else:
        print("[ERROR] DEBUG not set")
    
    # Check SECRET_KEY length
    secret_key = os.getenv("SECRET_KEY", "")
    if secret_key:
        if len(secret_key) >= 32:
            print(f"[OK] SECRET_KEY length: {len(secret_key)} chars (good)")
        else:
            print(f"[ERROR] SECRET_KEY length: {len(secret_key)} chars (min 32 required)")
    
    print()
    print("=" * 70)
    print()
    print("TIP: For Railway, check Variables in Railway Dashboard")
    print("TIP: For local testing, set variables in .env file")
    print()


if __name__ == "__main__":
    check_all_variables()
