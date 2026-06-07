"""
Subscription and billing service for Milestone 4.
Manages student subscriptions and Qari commission tracking.
"""
from database import User, StudentQariRelationship, SessionLocal
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, extract
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class SubscriptionService:
    """Manages subscriptions and commissions."""
    
    @staticmethod
    def activate_subscription(
        user_id: str,
        tier: str = "basic",
        duration_days: int = 30,
        db: Optional[Session] = None
    ) -> bool:
        """
        Activate subscription for user.
        
        Args:
            user_id: UUID of the user
            tier: Subscription tier ('basic', 'premium', etc.)
            duration_days: Duration of subscription in days
            db: Database session (optional)
        
        Returns:
            True if successful
        """
        db_session = db or SessionLocal()
        try:
            user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            user = db_session.query(User).filter(User.id == user_uuid).first()
            
            if not user:
                raise ValueError(f"User {user_id} not found")
            
            user.subscription_status = "active"
            user.subscription_tier = tier
            user.subscription_start = datetime.utcnow()
            user.subscription_end = datetime.utcnow() + timedelta(days=duration_days)
            
            db_session.commit()
            logger.info(f"Activated {tier} subscription for user {user_id} (expires: {user.subscription_end})")
            return True
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error activating subscription: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def deactivate_subscription(
        user_id: str,
        db: Optional[Session] = None
    ) -> bool:
        """Deactivate subscription for user."""
        db_session = db or SessionLocal()
        try:
            user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            user = db_session.query(User).filter(User.id == user_uuid).first()
            
            if not user:
                return False
            
            user.subscription_status = "expired"
            db_session.commit()
            logger.info(f"Deactivated subscription for user {user_id}")
            return True
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error deactivating subscription: {e}", exc_info=True)
            return False
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def check_subscription_status(
        user_id: str,
        db: Optional[Session] = None
    ) -> Dict:
        """
        Check subscription status for user.
        
        Returns:
            Dictionary with subscription information
        """
        db_session = db or SessionLocal()
        try:
            user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            user = db_session.query(User).filter(User.id == user_uuid).first()
            
            if not user:
                return {"status": "none", "is_active": False}
            
            is_active = (
                user.subscription_status == "active" and
                user.subscription_end and
                user.subscription_end > datetime.utcnow()
            )
            
            # Auto-expire if past end date
            if user.subscription_status == "active" and user.subscription_end and user.subscription_end <= datetime.utcnow():
                user.subscription_status = "expired"
                db_session.commit()
                is_active = False
            
            return {
                "status": user.subscription_status or "none",
                "tier": user.subscription_tier,
                "start": user.subscription_start.isoformat() if user.subscription_start else None,
                "end": user.subscription_end.isoformat() if user.subscription_end else None,
                "is_active": is_active,
                "days_remaining": (
                    (user.subscription_end - datetime.utcnow()).days
                    if is_active and user.subscription_end else 0
                )
            }
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def calculate_monthly_commission(
        qari_id: str,
        month: int,
        year: int,
        db: Optional[Session] = None
    ) -> Dict:
        """
        Calculate Qari's commission for a specific month.
        
        Args:
            qari_id: UUID of the Qari
            month: Month number (1-12)
            year: Year (e.g., 2025)
            db: Database session (optional)
        
        Returns:
            Dictionary with commission details
        """
        db_session = db or SessionLocal()
        try:
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            
            # Get active students with subscriptions
            relationships = db_session.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.qari_id == qari_uuid,
                    StudentQariRelationship.is_active == True
                )
            ).all()
            
            total_commission = 0.0
            student_count = 0
            student_details = []
            
            # Subscription tier pricing (configurable)
            TIER_PRICING = {
                "basic": 20.0,  # $20/month
                "premium": 50.0,  # $50/month
                "enterprise": 100.0  # $100/month
            }
            
            for rel in relationships:
                student = db_session.query(User).filter(User.id == rel.student_id).first()
                if student and student.subscription_status == "active":
                    # Check if subscription was active during the specified month
                    if student.subscription_start and student.subscription_end:
                        month_start = datetime(year, month, 1)
                        if month == 12:
                            month_end = datetime(year + 1, 1, 1)
                        else:
                            month_end = datetime(year, month + 1, 1)
                        
                        # Check if subscription overlaps with the month
                        if (student.subscription_start < month_end and 
                            student.subscription_end > month_start):
                            
                            commission_rate = rel.commission_rate or 0.0
                            monthly_fee = TIER_PRICING.get(student.subscription_tier or "basic", 20.0)
                            commission = monthly_fee * (commission_rate / 100)
                            
                            total_commission += commission
                            student_count += 1
                            
                            student_details.append({
                                "student_id": str(student.id),
                                "student_email": student.email,
                                "subscription_tier": student.subscription_tier,
                                "monthly_fee": monthly_fee,
                                "commission_rate": commission_rate,
                                "commission": round(commission, 2)
                            })
            
            return {
                "qari_id": qari_id,
                "month": month,
                "year": year,
                "active_students": student_count,
                "total_commission": round(total_commission, 2),
                "currency": "USD",
                "student_details": student_details
            }
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_subscription_statistics(
        db: Optional[Session] = None
    ) -> Dict:
        """Get overall subscription statistics."""
        db_session = db or SessionLocal()
        try:
            total_users = db_session.query(User).count()
            active_subscriptions = db_session.query(User).filter(
                and_(
                    User.subscription_status == "active",
                    User.subscription_end > datetime.utcnow()
                )
            ).count()
            
            expired_subscriptions = db_session.query(User).filter(
                User.subscription_status == "expired"
            ).count()
            
            # Count by tier
            tier_counts = {}
            for tier in ["basic", "premium", "enterprise"]:
                count = db_session.query(User).filter(
                    and_(
                        User.subscription_tier == tier,
                        User.subscription_status == "active",
                        User.subscription_end > datetime.utcnow()
                    )
                ).count()
                tier_counts[tier] = count
            
            return {
                "total_users": total_users,
                "active_subscriptions": active_subscriptions,
                "expired_subscriptions": expired_subscriptions,
                "by_tier": tier_counts
            }
            
        finally:
            if not db:
                db_session.close()


# Global instance
subscription_service = SubscriptionService()
