"""
System monitoring and health checks for Milestone 4.
Provides comprehensive system health metrics for production management.
"""
from database import SessionLocal, UserSession, User, AnalysisResult, StudentProgress
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging
import os

logger = logging.getLogger(__name__)


class MonitoringService:
    """System health and usage monitoring."""
    
    @staticmethod
    def get_system_health(db=None) -> Dict:
        """
        Get comprehensive system health metrics.
        
        Returns:
            Dictionary with system health information
        """
        db_session = db or SessionLocal()
        try:
            # Active users (last 24h)
            yesterday = datetime.utcnow() - timedelta(days=1)
            active_users_24h = db_session.query(
                func.count(func.distinct(UserSession.user_id))
            ).filter(
                and_(
                    UserSession.user_id.isnot(None),
                    UserSession.created_at >= yesterday
                )
            ).scalar() or 0
            
            # Active users (last 7 days)
            week_ago = datetime.utcnow() - timedelta(days=7)
            active_users_7d = db_session.query(
                func.count(func.distinct(UserSession.user_id))
            ).filter(
                and_(
                    UserSession.user_id.isnot(None),
                    UserSession.created_at >= week_ago
                )
            ).scalar() or 0
            
            # Processing queue status (if Celery is available)
            queue_status = {"active": 0, "queued": 0, "available": False}
            try:
                from task_queue import celery_app
                inspect = celery_app.control.inspect()
                active_tasks = inspect.active() or {}
                scheduled_tasks = inspect.scheduled() or {}
                queue_status = {
                    "active": sum(len(tasks) for tasks in active_tasks.values()),
                    "queued": sum(len(tasks) for tasks in scheduled_tasks.values()),
                    "available": True
                }
            except Exception as e:
                logger.debug(f"Celery not available: {e}")
            
            # Storage usage (local files)
            storage_usage = 0
            storage_files = 0
            try:
                from pathlib import Path
                uploads_dir = Path(__file__).parent / "uploads"
                if uploads_dir.exists():
                    for file_path in uploads_dir.rglob('*'):
                        if file_path.is_file():
                            storage_usage += file_path.stat().st_size
                            storage_files += 1
            except Exception as e:
                logger.warning(f"Could not calculate storage usage: {e}")
            
            # Server resources (if psutil is available)
            server_metrics = {}
            try:
                import psutil
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                
                server_metrics = {
                    "cpu_percent": round(cpu_percent, 2),
                    "memory_percent": round(memory.percent, 2),
                    "memory_available_gb": round(memory.available / (1024 ** 3), 2),
                    "memory_total_gb": round(memory.total / (1024 ** 3), 2),
                    "disk_percent": round(disk.percent, 2),
                    "disk_free_gb": round(disk.free / (1024 ** 3), 2),
                    "disk_total_gb": round(disk.total / (1024 ** 3), 2)
                }
            except ImportError:
                logger.debug("psutil not available for server metrics")
            except Exception as e:
                logger.warning(f"Could not get server metrics: {e}")
            
            # Database statistics
            total_sessions = db_session.query(UserSession).count()
            total_users = db_session.query(User).count()
            total_progress = db_session.query(StudentProgress).count()
            total_analyses = db_session.query(AnalysisResult).count()
            
            # Recent activity (last hour)
            hour_ago = datetime.utcnow() - timedelta(hours=1)
            recent_sessions = db_session.query(UserSession).filter(
                UserSession.created_at >= hour_ago
            ).count()
            
            # Assessment sessions count
            assessment_sessions = db_session.query(UserSession).filter(
                UserSession.is_assessment == True
            ).count()
            
            # Database connection test
            db_connected = True
            try:
                db_session.execute(func.now())
            except Exception:
                db_connected = False
            
            return {
                "status": "healthy" if db_connected else "degraded",
                "timestamp": datetime.utcnow().isoformat(),
                "active_users": {
                    "last_24h": active_users_24h,
                    "last_7d": active_users_7d
                },
                "processing_queue": queue_status,
                "storage": {
                    "total_mb": round(storage_usage / (1024 ** 2), 2),
                    "total_gb": round(storage_usage / (1024 ** 3), 2),
                    "file_count": storage_files
                },
                "server": server_metrics,
                "database": {
                    "connected": db_connected,
                    "total_sessions": total_sessions,
                    "total_users": total_users,
                    "total_progress": total_progress,
                    "total_analyses": total_analyses,
                    "assessment_sessions": assessment_sessions
                },
                "recent_activity": {
                    "sessions_last_hour": recent_sessions
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting system health: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_processing_status() -> Dict:
        """
        Get audio processing queue status.
        
        Returns:
            Dictionary with queue status
        """
        try:
            from task_queue import celery_app
            inspect = celery_app.control.inspect()
            
            return {
                "available": True,
                "active": inspect.active() or {},
                "scheduled": inspect.scheduled() or {},
                "reserved": inspect.reserved() or {},
                "stats": inspect.stats() or {}
            }
        except Exception as e:
            logger.debug(f"Celery not available: {e}")
            return {
                "available": False,
                "message": "Async processing not configured"
            }
    
    @staticmethod
    def get_storage_metrics() -> Dict:
        """
        Get detailed storage metrics.
        
        Returns:
            Dictionary with storage breakdown
        """
        try:
            from pathlib import Path
            from database import Reference, UserSession
            
            db = SessionLocal()
            try:
                # Cloud storage usage (if configured)
                cloud_storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local")
                
                # Local storage breakdown
                uploads_dir = Path(__file__).parent / "uploads"
                references_size = 0
                sessions_size = 0
                cache_size = 0
                
                if uploads_dir.exists():
                    # References
                    ref_dir = uploads_dir / "references"
                    if ref_dir.exists():
                        for f in ref_dir.rglob('*'):
                            if f.is_file():
                                references_size += f.stat().st_size
                    
                    # Sessions
                    sessions_dir = uploads_dir / "temp_audio"
                    if sessions_dir.exists():
                        for f in sessions_dir.rglob('*'):
                            if f.is_file():
                                sessions_size += f.stat().st_size
                    
                    # Cache
                    cache_dir = uploads_dir / "pitch_cache"
                    if cache_dir.exists():
                        for f in cache_dir.rglob('*'):
                            if f.is_file():
                                cache_size += f.stat().st_size
                
                # Database counts
                total_references = db.query(Reference).count()
                total_sessions = db.query(UserSession).count()
                
                return {
                    "cloud_storage_type": cloud_storage_type,
                    "local_storage": {
                        "references_mb": round(references_size / (1024 ** 2), 2),
                        "sessions_mb": round(sessions_size / (1024 ** 2), 2),
                        "cache_mb": round(cache_size / (1024 ** 2), 2),
                        "total_mb": round((references_size + sessions_size + cache_size) / (1024 ** 2), 2)
                    },
                    "database_counts": {
                        "references": total_references,
                        "sessions": total_sessions
                    }
                }
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error getting storage metrics: {e}", exc_info=True)
            return {"error": str(e)}


# Global instance
monitoring_service = MonitoringService()
