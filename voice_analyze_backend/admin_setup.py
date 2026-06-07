"""
Admin User Setup and Password Reset Utility

This script helps you:
1. Create a new admin user
2. Reset an existing user's password
3. Set a user's role to admin
4. List all users

Usage:
    python admin_setup.py --create-admin --email admin@example.com --password yourpassword
    python admin_setup.py --reset-password --email user@example.com --password newpassword
    python admin_setup.py --set-admin --email user@example.com
    python admin_setup.py --list-users
"""
import argparse
import sys
from pathlib import Path

# Add parent directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, User, UserRole
from auth import get_password_hash
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_admin_user(email: str, password: str, full_name: str = None):
    """Create a new admin user."""
    db = SessionLocal()
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            logger.error(f"User with email {email} already exists!")
            return False
        
        # Create new admin user
        hashed_password = get_password_hash(password)
        new_user = User(
            email=email,
            hashed_password=hashed_password,
            role=UserRole.ADMIN,
            is_active=True,
            is_approved=True,  # Admin is auto-approved
            full_name=full_name or "Administrator"
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"✅ Admin user created successfully!")
        logger.info(f"   Email: {email}")
        logger.info(f"   ID: {new_user.id}")
        logger.info(f"   Role: {new_user.role}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error creating admin user: {e}", exc_info=True)
        return False
    finally:
        db.close()


def reset_password(email: str, new_password: str):
    """Reset password for an existing user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            logger.error(f"❌ User with email {email} not found!")
            return False
        
        # Update password
        hashed_password = get_password_hash(new_password)
        user.hashed_password = hashed_password
        
        db.commit()
        
        logger.info(f"✅ Password reset successfully for {email}")
        logger.info(f"   User ID: {user.id}")
        logger.info(f"   Role: {user.role}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error resetting password: {e}", exc_info=True)
        return False
    finally:
        db.close()


def set_admin_role(email: str):
    """Set a user's role to admin."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            logger.error(f"❌ User with email {email} not found!")
            return False
        
        # Update role
        old_role = user.role
        user.role = UserRole.ADMIN
        user.is_approved = True  # Admin is auto-approved
        
        db.commit()
        
        logger.info(f"✅ User role updated successfully!")
        logger.info(f"   Email: {email}")
        logger.info(f"   Old Role: {old_role}")
        logger.info(f"   New Role: {user.role}")
        logger.info(f"   ⚠️  Note: User needs to login again to get new token with admin role")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error setting admin role: {e}", exc_info=True)
        return False
    finally:
        db.close()


def list_users():
    """List all users in the database."""
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        
        if not users:
            logger.info("No users found in database.")
            return
        
        logger.info(f"\n📋 Found {len(users)} user(s):\n")
        logger.info(f"{'Email':<40} {'Role':<15} {'Active':<10} {'Approved':<10} {'ID'}")
        logger.info("-" * 100)
        
        for user in users:
            logger.info(
                f"{user.email:<40} {user.role:<15} "
                f"{'Yes' if user.is_active else 'No':<10} "
                f"{'Yes' if user.is_approved else 'No':<10} "
                f"{user.id}"
            )
        
        logger.info("")
        
    except Exception as e:
        logger.error(f"❌ Error listing users: {e}", exc_info=True)
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Admin User Setup and Password Reset Utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create a new admin user
  python admin_setup.py --create-admin --email admin@example.com --password securepass123

  # Reset password for existing user
  python admin_setup.py --reset-password --email user@example.com --password newpass123

  # Set existing user to admin role
  python admin_setup.py --set-admin --email user@example.com

  # List all users
  python admin_setup.py --list-users
        """
    )
    
    parser.add_argument(
        "--create-admin",
        action="store_true",
        help="Create a new admin user"
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password for existing user"
    )
    parser.add_argument(
        "--set-admin",
        action="store_true",
        help="Set existing user's role to admin"
    )
    parser.add_argument(
        "--list-users",
        action="store_true",
        help="List all users in database"
    )
    parser.add_argument(
        "--email",
        type=str,
        help="User email address"
    )
    parser.add_argument(
        "--password",
        type=str,
        help="Password (for create-admin or reset-password)"
    )
    parser.add_argument(
        "--full-name",
        type=str,
        help="Full name (optional, for create-admin)"
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.create_admin:
        if not args.email or not args.password:
            logger.error("❌ --email and --password are required for --create-admin")
            sys.exit(1)
        success = create_admin_user(args.email, args.password, args.full_name)
        sys.exit(0 if success else 1)
    
    elif args.reset_password:
        if not args.email or not args.password:
            logger.error("❌ --email and --password are required for --reset-password")
            sys.exit(1)
        success = reset_password(args.email, args.password)
        sys.exit(0 if success else 1)
    
    elif args.set_admin:
        if not args.email:
            logger.error("❌ --email is required for --set-admin")
            sys.exit(1)
        success = set_admin_role(args.email)
        sys.exit(0 if success else 1)
    
    elif args.list_users:
        list_users()
        sys.exit(0)
    
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
