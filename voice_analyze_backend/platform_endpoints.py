"""
Platform endpoints for Qari, Student, and Admin functionality.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, desc
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from database import User, UserRole, get_db
from auth import (
    get_current_user, get_current_admin_user, get_current_qari_user,
    get_current_student_user, require_registered_user, get_current_user_optional
)
from qari_service import qari_service
from progress_service import progress_service
from db_reference_library import db_reference_library
from db_session_service import db_session_service
from selected_recording_service import selected_recording_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/platform", tags=["platform"])


def _generate_unique_referral_code(db: Session) -> str:
    """Generate a unique Qari referral code."""
    import secrets
    import string

    code_length = 8
    while True:
        code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(code_length))
        existing = db.query(User).filter(User.referral_code == code).first()
        if not existing:
            return code


def _ensure_qari_referral_code(qari: User, db: Session) -> str:
    """Ensure an approved Qari has a referral code."""
    if not qari.referral_code:
        qari.referral_code = _generate_unique_referral_code(db)
        db.commit()
        db.refresh(qari)
    return qari.referral_code


# Request Models
class AssignQariRequest(BaseModel):
    qari_id: str
    referral_code: Optional[str] = None


class QariContentRequest(BaseModel):
    reference_id: str
    surah_number: Optional[int] = None
    surah_name: Optional[str] = None
    ayah_number: Optional[int] = None
    maqam: Optional[str] = None


class UpdateQariContentRequest(BaseModel):
    surah_number: Optional[int] = None
    surah_name: Optional[str] = None
    ayah_number: Optional[int] = None
    maqam: Optional[str] = None


class StudentActivityEventRequest(BaseModel):
    event_type: str
    reference_id: Optional[str] = None
    session_id: Optional[str] = None
    duration_seconds: Optional[float] = None
    playback_position: Optional[float] = None
    metadata: Optional[dict] = None
    occurred_at: Optional[datetime] = None


# Qari Endpoints
@router.post("/qari/content")
async def add_qari_content(
    content: QariContentRequest,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Add content to Qari's library."""
    try:
        qari_content = qari_service.add_content_to_qari(
            qari_id=str(current_user.id),
            reference_id=content.reference_id,
            surah_number=content.surah_number,
            surah_name=content.surah_name,
            ayah_number=content.ayah_number,
            maqam=content.maqam,
            db=db
        )
        return {"success": True, "content_id": str(qari_content.id)}
    except Exception as e:
        logger.error(f"Error adding Qari content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/content")
async def get_qari_content(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get Qari's content library."""
    try:
        content = qari_service.get_qari_content(str(current_user.id), db=db)
        return {"content": content, "count": len(content)}
    except Exception as e:
        logger.error(f"Error getting Qari content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/qari/content/{content_id}")
async def update_qari_content(
    content_id: str,
    content: UpdateQariContentRequest,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Update Qari content metadata (surah/ayah settings)."""
    try:
        qari_content = qari_service.update_qari_content(
            content_id=content_id,
            qari_id=str(current_user.id),
            surah_number=content.surah_number,
            surah_name=content.surah_name,
            ayah_number=content.ayah_number,
            maqam=content.maqam,
            db=db
        )
        return {"success": True, "content_id": str(qari_content.id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating Qari content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/qari/content/{content_id}")
async def delete_qari_content(
    content_id: str,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Remove content from Qari's library."""
    try:
        qari_service.delete_qari_content(
            content_id=content_id,
            qari_id=str(current_user.id),
            db=db
        )
        return {"success": True, "message": "Content removed from library"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting Qari content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/students")
async def get_qari_students(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get all students for a Qari (Qari Dashboard)."""
    try:
        students = qari_service.get_qari_students(str(current_user.id), db=db)
        
        # Get detailed statistics for each student
        for student in students:
            stats = progress_service.get_student_statistics(student["student_id"], db=db)
            student["statistics"] = stats
        
        return {"students": students, "count": len(students)}
    except Exception as e:
        logger.error(f"Error getting Qari students: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/students/{student_id}")
async def get_student_details(
    student_id: str,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific student (scores, recordings, progress)."""
    try:
        from database import StudentQariRelationship, UserSession, AnalysisResult, Reference, StudentProgress
        from uuid import UUID
        
        # Verify the student belongs to this Qari
        student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
        relationship = db.query(StudentQariRelationship).filter(
            and_(
                StudentQariRelationship.student_id == student_uuid,
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).first()
        
        if not relationship:
            raise HTTPException(status_code=403, detail="Student not found or not assigned to this Qari")
        
        # Get student user info
        student_user = db.query(User).filter(User.id == student_uuid).first()
        if not student_user:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Get all progress records
        all_progress = progress_service.get_student_progress(student_id, limit=100, db=db)
        
        # Get all sessions with recordings
        sessions = db.query(UserSession).filter(
            UserSession.user_id == student_uuid
        ).order_by(desc(UserSession.created_at)).all()
        
        detailed_sessions = []
        for session in sessions:
            # Get analysis result
            analysis = db.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == session.id
            ).first()
            
            # Get reference info
            reference = None
            if session.reference_id:
                ref = db.query(Reference).filter(Reference.id == session.reference_id).first()
                if ref:
                    reference = {
                        "id": ref.id,
                        "title": ref.title,
                        "maqam": ref.maqam,
                        "filename": ref.filename
                    }
            
            # Get progress record for this session
            progress_record = None
            if session.id:
                progress = db.query(StudentProgress).filter(
                    StudentProgress.session_id == session.id
                ).first()
                if progress:
                    progress_record = {
                        "overall_score": progress.overall_score,
                        "improvement": progress.improvement,
                        "verse_scores": progress.verse_scores,
                        "weakest_verses": progress.weakest_verses
                    }
            
            detailed_sessions.append({
                "session_id": str(session.id),
                "reference": reference,
                "file_path": session.file_path,
                "duration": session.duration,
                "file_size": session.file_size,
                "created_at": session.created_at.isoformat() if session.created_at else None,
                "score": analysis.score if analysis else None,
                "analysis": {
                    "score": analysis.score if analysis else None,
                    "segments": analysis.segments if analysis else None,
                    "pitch_data": analysis.pitch_data if analysis else None,
                    "regions": analysis.regions if analysis else None,
                    "ayat_timing": analysis.ayat_timing if analysis else None,
                    "feedback": analysis.feedback if analysis else None,
                    "score_breakdown": analysis.score_breakdown if analysis else None,
                    "pronunciation_alerts": analysis.pronunciation_alerts if analysis else None
                } if analysis else None,
                "progress": progress_record
            })
        
        # Get comprehensive statistics
        stats = progress_service.get_student_statistics(student_id, db=db)
        
        return {
            "student": {
                "id": str(student_user.id),
                "email": student_user.email,
                "full_name": student_user.full_name,
                "joined_at": relationship.joined_at.isoformat() if relationship.joined_at else None,
                "last_active": relationship.last_active.isoformat() if relationship.last_active else None
            },
            "statistics": stats,
            "progress": all_progress,
            "recordings": detailed_sessions,
            "total_recordings": len(detailed_sessions),
            "total_progress_records": len(all_progress)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting student details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/students/{student_id}/selected-recordings")
async def get_qari_student_selected_recordings(
    student_id: str,
    reference_id: Optional[str] = None,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get curated lowest/median/highest recordings for one assigned student."""
    try:
        from database import StudentQariRelationship
        from uuid import UUID

        student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
        relationship = db.query(StudentQariRelationship).filter(
            and_(
                StudentQariRelationship.student_id == student_uuid,
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).first()

        if not relationship:
            raise HTTPException(status_code=403, detail="Student not found or not assigned to this Qari")

        return selected_recording_service.get_student_selected_recordings(
            student_id=student_id,
            reference_id=reference_id,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Qari selected recordings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qari/students/{student_id}/selected-recordings/rebuild")
async def rebuild_qari_student_selected_recordings(
    student_id: str,
    reference_id: Optional[str] = None,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Rebuild selected recording slots for one assigned student from existing scoring history."""
    try:
        from database import StudentQariRelationship
        from uuid import UUID

        student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
        relationship = db.query(StudentQariRelationship).filter(
            and_(
                StudentQariRelationship.student_id == student_uuid,
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).first()

        if not relationship:
            raise HTTPException(status_code=403, detail="Student not found or not assigned to this Qari")

        return selected_recording_service.rebuild_student_selected_recordings(
            student_id=student_id,
            reference_id=reference_id,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rebuilding Qari selected recordings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/students/{student_id}/activity-summary")
async def get_qari_student_activity_summary(
    student_id: str,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get tracked learning activity for one student assigned to the current Qari."""
    try:
        from database import StudentQariRelationship
        from student_activity_analytics_service import student_activity_analytics_service
        from uuid import UUID

        student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
        relationship = db.query(StudentQariRelationship).filter(
            and_(
                StudentQariRelationship.student_id == student_uuid,
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).first()

        if not relationship:
            raise HTTPException(status_code=403, detail="Student not found or not assigned to this Qari")

        student_user = db.query(User).filter(User.id == student_uuid).first()
        if not student_user:
            raise HTTPException(status_code=404, detail="Student not found")

        return student_activity_analytics_service.get_qari_student_activity_summary(
            student_user,
            current_user,
            db
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Qari student activity summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Student Endpoints
@router.get("/student/selected-recordings")
async def get_my_selected_recordings(
    reference_id: Optional[str] = None,
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Get the current student's curated lowest/median/highest recordings."""
    try:
        return selected_recording_service.get_student_selected_recordings(
            student_id=str(current_user.id),
            reference_id=reference_id,
            db=db,
        )
    except Exception as e:
        logger.error(f"Error getting student selected recordings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/student/selected-recordings/rebuild")
async def rebuild_my_selected_recordings(
    reference_id: Optional[str] = None,
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Rebuild the current student's selected recordings from existing scoring history."""
    try:
        return selected_recording_service.rebuild_student_selected_recordings(
            student_id=str(current_user.id),
            reference_id=reference_id,
            db=db,
        )
    except Exception as e:
        logger.error(f"Error rebuilding student selected recordings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/student/assign-qari")
async def assign_student_to_qari(
    request: AssignQariRequest,
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Assign student to a Qari."""
    try:
        relationship = qari_service.assign_student_to_qari(
            student_id=str(current_user.id),
            qari_id=request.qari_id,
            referral_code=request.referral_code,
            db=db
        )
        return {"success": True, "relationship_id": str(relationship.id)}
    except Exception as e:
        logger.error(f"Error assigning student to Qari: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student/my-qari")
async def get_my_qari(
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Get student's active Qari."""
    try:
        qari = qari_service.get_student_qari(str(current_user.id), db=db)
        if not qari:
            return {"qari": None, "message": "No Qari assigned"}
        return {"qari": qari}
    except Exception as e:
        logger.error(f"Error getting student Qari: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student/progress")
async def get_student_progress(
    limit: int = 50,
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Get student's progress history."""
    try:
        progress = progress_service.get_student_progress(
            str(current_user.id),
            limit=limit,
            db=db
        )
        return {"progress": progress, "count": len(progress)}
    except Exception as e:
        logger.error(f"Error getting student progress: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student/statistics")
async def get_student_statistics(
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive statistics for student."""
    try:
        stats = progress_service.get_student_statistics(str(current_user.id), db=db)
        return stats
    except Exception as e:
        logger.error(f"Error getting student statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student/activity-summary")
async def get_student_activity_summary(
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db)
):
    """Get activity analytics summary for the authenticated student."""
    try:
        from student_activity_analytics_service import student_activity_analytics_service

        return student_activity_analytics_service.get_activity_summary(current_user, db)
    except Exception as e:
        logger.error(f"Error getting student activity summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/student/activity-events")
async def create_student_activity_event(
    activity: StudentActivityEventRequest,
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Append-only student activity event tracking."""
    try:
        if not current_user:
            return {"success": True, "tracked": False, "reason": "unauthenticated"}

        if current_user.role != UserRole.STUDENT:
            return {"success": True, "tracked": False, "reason": "not_student"}

        if activity.duration_seconds is not None and activity.duration_seconds < 0:
            raise HTTPException(status_code=400, detail="duration_seconds must be positive")

        if activity.playback_position is not None and activity.playback_position < 0:
            raise HTTPException(status_code=400, detail="playback_position must be positive")

        from student_activity_service import student_activity_service

        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", None)
        event = student_activity_service.record_event(
            user=current_user,
            event_type=activity.event_type,
            reference_id=activity.reference_id,
            session_id=activity.session_id,
            duration_seconds=activity.duration_seconds,
            playback_position=activity.playback_position,
            metadata=activity.metadata,
            occurred_at=activity.occurred_at,
            db=db,
            ip_address=client_ip,
            user_agent=user_agent,
        )

        return {
            "success": True,
            "tracked": event is not None,
            "event_id": str(event.id) if event else None,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating student activity event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Public/Student Content Access
@router.get("/qaris/available")
async def get_available_qaris(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """List all approved and active Qaris (accessible to students and public)."""
    try:
        from database import User, UserRole
        qaris = db.query(User).filter(
            User.role == UserRole.QARI,
            User.is_approved == True,
            User.is_active == True
        ).all()
        return {
            "qaris": [
                {
                    "id": str(q.id),
                    "email": q.email,
                    "full_name": q.full_name,
                    "is_approved": q.is_approved,
                    "is_active": q.is_active,
                    "created_at": q.created_at.isoformat() if q.created_at else None
                }
                for q in qaris
            ]
        }
    except Exception as e:
        logger.error(f"Error listing available Qaris: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/content/available")
async def get_available_content(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Get available content based on user role."""
    try:
        if not current_user:
            # Public user - only demo/public content (latest first)
            public_refs = db_reference_library.list_references(
                user_role=UserRole.PUBLIC,
                db=db
            )
            # Return references in the same format as /api/references endpoint
            return {
                "content": public_refs,
                "references": public_refs,  # Also include as 'references' for compatibility
                "count": len(public_refs),
                "message": "Demo content only. Register to access full features."
            }
        
        if current_user.role == UserRole.STUDENT:
            # Student - get their Qari's content
            qari = qari_service.get_student_qari(str(current_user.id), db=db)
            if qari:
                content = qari_service.get_qari_content(qari["qari_id"], db=db)
                return {"content": content, "qari": qari["qari_name"]}
            else:
                return {"content": [], "message": "No Qari assigned. Please select a Qari."}
        
        elif current_user.role == UserRole.QARI:
            # Qari - get their own content
            content = qari_service.get_qari_content(str(current_user.id), db=db)
            return {"content": content}
        
        elif current_user.role == UserRole.ADMIN:
            # Admin - get all content, but filter text segments by Admin's user_id
            admin_user_id = str(current_user.id)
            all_refs = db_reference_library.list_references(
                user_role=UserRole.ADMIN,
                admin_user_id=admin_user_id,
                db=db
            )
            return {"content": all_refs}
        
        return {"content": []}
        
    except Exception as e:
        logger.error(f"Error getting available content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Qari Endpoints - Referral Code Management
@router.get("/qari/referral-code")
async def get_qari_referral_code(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get or generate Qari's referral code."""
    try:
        if not current_user.referral_code:
            _ensure_qari_referral_code(current_user, db)
        
        return {
            "referral_code": current_user.referral_code,
            "commission_rate": current_user.commission_rate or 0.0
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error getting referral code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/commission-stats")
async def get_qari_commission_stats(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get Qari's commission statistics."""
    try:
        from database import StudentQariRelationship
        from sqlalchemy import func

        _ensure_qari_referral_code(current_user, db)
        
        # Count active students
        active_students = db.query(StudentQariRelationship).filter(
            and_(
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).count()
        
        # Count students by referral code
        referral_stats = db.query(
            StudentQariRelationship.referral_code,
            func.count(StudentQariRelationship.id).label('count')
        ).filter(
            and_(
                StudentQariRelationship.qari_id == current_user.id,
                StudentQariRelationship.is_active == True
            )
        ).group_by(StudentQariRelationship.referral_code).all()
        
        return {
            "active_students": active_students,
            "referral_code": current_user.referral_code,
            "commission_rate": current_user.commission_rate or 0.0,
            "referral_breakdown": [
                {"code": code or "direct", "count": count}
                for code, count in referral_stats
            ]
        }
    except Exception as e:
        logger.error(f"Error getting commission stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/qari/referral-info")
async def get_qari_referral_info(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db)
):
    """Get Qari referral info for QR registration."""
    try:
        referral_code = _ensure_qari_referral_code(current_user, db)
        return {
            "referralCode": referral_code,
            "qariName": current_user.full_name or current_user.email,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error getting Qari referral info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Admin Endpoints
@router.post("/admin/selected-recordings/backfill")
async def admin_backfill_selected_recordings(
    limit_students: Optional[int] = None,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin maintenance endpoint to rebuild selected recording slots for existing data."""
    try:
        return selected_recording_service.rebuild_all_selected_recordings(
            db=db,
            limit_students=limit_students,
        )
    except Exception as e:
        logger.error(f"Error backfilling selected recordings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/approve-qari/{qari_id}")
async def approve_qari(
    qari_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Approve a Qari account."""
    try:
        from database import User
        qari = db.query(User).filter(User.id == qari_id).first()
        if not qari:
            raise HTTPException(status_code=404, detail="Qari not found")
        if qari.role != UserRole.QARI:
            raise HTTPException(status_code=400, detail="User is not a Qari")
        
        qari.is_approved = True
        
        # Generate referral code if not exists
        if not qari.referral_code:
            import secrets
            import string
            code_length = 8
            while True:
                code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(code_length))
                existing = db.query(User).filter(User.referral_code == code).first()
                if not existing:
                    qari.referral_code = code
                    break
        
        db.commit()
        
        return {"success": True, "message": f"Qari {qari.email} approved", "referral_code": qari.referral_code}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving Qari: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/qaris")
async def list_all_qaris(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all Qaris (for admin)."""
    try:
        from database import User
        qaris = db.query(User).filter(User.role == UserRole.QARI).all()
        return {
            "qaris": [
                {
                    "id": str(q.id),
                    "email": q.email,
                    "full_name": q.full_name,
                    "is_approved": q.is_approved,
                    "is_active": q.is_active,
                    "created_at": q.created_at.isoformat() if q.created_at else None
                }
                for q in qaris
            ]
        }
    except Exception as e:
        logger.error(f"Error listing Qaris: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/users")
async def list_all_users(
    role: Optional[str] = None,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all users (for admin)."""
    try:
        query = db.query(User)
        if role:
            query = query.filter(User.role == role)
        
        users = query.order_by(User.created_at.desc()).all()
        return {
            "users": [
                {
                    "id": str(u.id),
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role,
                    "is_approved": u.is_approved,
                    "is_active": u.is_active,
                    "referral_code": u.referral_code,
                    "commission_rate": u.commission_rate or 0.0,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                    "last_login": u.last_login.isoformat() if u.last_login else None
                }
                for u in users
            ],
            "count": len(users)
        }
    except Exception as e:
        logger.error(f"Error listing users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/users/detailed")
async def get_detailed_users(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get detailed user information with activity stats."""
    try:
        from database import UserSession, AnalysisResult, StudentProgress, StudentQariRelationship, QariContent
        from sqlalchemy import func
        
        # Order by created_at if it exists, otherwise by id
        try:
            users = db.query(User).order_by(User.created_at.desc()).all()
        except Exception as order_error:
            logger.warning(f"Could not order by created_at: {order_error}, ordering by id instead")
            users = db.query(User).order_by(User.id.desc()).all()
        
        detailed_users = []
        for user in users:
            # Get user-specific statistics
            # Handle potential type mismatch (user_id might be stored as VARCHAR)
            try:
                session_count = db.query(UserSession).filter(UserSession.user_id == user.id).count()
            except Exception:
                # Fallback: try with cast if user_id is VARCHAR
                from sqlalchemy import text
                try:
                    result = db.execute(
                        text("SELECT COUNT(*) FROM user_sessions WHERE user_id::uuid = :user_id"),
                        {"user_id": str(user.id)}
                    ).scalar()
                    session_count = result or 0
                except Exception:
                    session_count = 0
            
            try:
                analysis_count = db.query(AnalysisResult).join(
                    UserSession, AnalysisResult.user_session_id == UserSession.id
                ).filter(UserSession.user_id == user.id).count()
            except Exception:
                # Fallback: try with raw SQL
                from sqlalchemy import text
                try:
                    result = db.execute(
                        text("""
                            SELECT COUNT(*) 
                            FROM analysis_results ar
                            JOIN user_sessions us ON ar.user_session_id = us.id
                            WHERE us.user_id::uuid = :user_id
                        """),
                        {"user_id": str(user.id)}
                    ).scalar()
                    analysis_count = result or 0
                except Exception:
                    analysis_count = 0
            
            if user.role == UserRole.QARI:
                # Qari-specific stats
                student_count = db.query(StudentQariRelationship).filter(
                    and_(
                        StudentQariRelationship.qari_id == user.id,
                        StudentQariRelationship.is_active == True
                    )
                ).count()
                content_count = db.query(QariContent).filter(QariContent.qari_id == user.id).count()
                
                # Safely get created_at and last_login
                created_at_str = None
                last_login_str = None
                try:
                    if hasattr(user, 'created_at') and user.created_at:
                        created_at_str = user.created_at.isoformat()
                except Exception:
                    pass
                try:
                    if hasattr(user, 'last_login') and user.last_login:
                        last_login_str = user.last_login.isoformat()
                except Exception:
                    pass
                
                detailed_users.append({
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "is_active": user.is_active,
                    "is_approved": user.is_approved,
                    "created_at": created_at_str,
                    "last_login": last_login_str,
                    "referral_code": user.referral_code,
                    "commission_rate": user.commission_rate or 0.0,
                    "session_count": session_count,
                    "analysis_count": analysis_count,
                    "student_count": student_count,
                    "content_count": content_count
                })
            elif user.role == UserRole.STUDENT:
                # Student-specific stats
                progress_count = db.query(StudentProgress).filter(
                    StudentProgress.student_id == user.id
                ).count()
                
                # Get assigned Qari
                relationship = db.query(StudentQariRelationship).filter(
                    and_(
                        StudentQariRelationship.student_id == user.id,
                        StudentQariRelationship.is_active == True
                    )
                ).first()
                
                qari_name = None
                if relationship:
                    qari = db.query(User).filter(User.id == relationship.qari_id).first()
                    qari_name = qari.full_name if qari and qari.full_name else qari.email if qari else None
                
                # Get average score
                avg_score = db.query(func.avg(StudentProgress.overall_score)).filter(
                    StudentProgress.student_id == user.id
                ).scalar() or 0.0
                
                # Safely get created_at and last_login
                created_at_str = None
                last_login_str = None
                try:
                    if hasattr(user, 'created_at') and user.created_at:
                        created_at_str = user.created_at.isoformat()
                except Exception:
                    pass
                try:
                    if hasattr(user, 'last_login') and user.last_login:
                        last_login_str = user.last_login.isoformat()
                except Exception:
                    pass
                
                detailed_users.append({
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "is_active": user.is_active,
                    "is_approved": user.is_approved,
                    "created_at": created_at_str,
                    "last_login": last_login_str,
                    "session_count": session_count,
                    "analysis_count": analysis_count,
                    "progress_count": progress_count,
                    "assigned_qari": qari_name,
                    "average_score": round(float(avg_score), 2)
                })
            else:
                # Admin or other roles
                # Safely get created_at and last_login
                created_at_str = None
                last_login_str = None
                try:
                    if hasattr(user, 'created_at') and user.created_at:
                        created_at_str = user.created_at.isoformat()
                except Exception:
                    pass
                try:
                    if hasattr(user, 'last_login') and user.last_login:
                        last_login_str = user.last_login.isoformat()
                except Exception:
                    pass
                
                detailed_users.append({
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "is_active": user.is_active,
                    "is_approved": user.is_approved,
                    "created_at": created_at_str,
                    "last_login": last_login_str,
                    "session_count": session_count,
                    "analysis_count": analysis_count
                })
        
        return {"users": detailed_users, "count": len(detailed_users)}
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error getting detailed users: {e}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Error getting detailed users: {str(e)}")


@router.get("/admin/users/{user_id}")
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get user details by ID."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_approved": user.is_approved,
            "is_active": user.is_active,
            "referral_code": user.referral_code,
            "commission_rate": user.commission_rate or 0.0,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_approved: Optional[bool] = None
    is_active: Optional[bool] = None
    commission_rate: Optional[float] = None


@router.put("/admin/users/{user_id}")
async def update_user(
    user_id: str,
    user_data: UpdateUserRequest,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Update user details."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent admin from changing their own role or deactivating themselves
        if user.id == current_user.id:
            if user_data.role and user_data.role != "admin":
                raise HTTPException(status_code=400, detail="Cannot change your own role")
            if user_data.is_active is False:
                raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        
        # Update fields
        if user_data.full_name is not None:
            user.full_name = user_data.full_name
        if user_data.role is not None:
            # Validate role
            if user_data.role not in ["admin", "qari", "student", "public"]:
                raise HTTPException(status_code=400, detail="Invalid role")
            user.role = user_data.role
        if user_data.is_approved is not None:
            user.is_approved = user_data.is_approved
            # Generate referral code when approving Qari
            if user_data.is_approved and user.role == UserRole.QARI and not user.referral_code:
                import secrets
                import string
                code_length = 8
                while True:
                    code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(code_length))
                    existing = db.query(User).filter(User.referral_code == code).first()
                    if not existing:
                        user.referral_code = code
                        break
        if user_data.is_active is not None:
            user.is_active = user_data.is_active
        if user_data.commission_rate is not None:
            user.commission_rate = user_data.commission_rate
        
        db.commit()
        db.refresh(user)
        
        return {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_approved": user.is_approved,
            "is_active": user.is_active,
            "referral_code": user.referral_code,
            "commission_rate": user.commission_rate or 0.0,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: str = "student"
    is_approved: Optional[bool] = None
    is_active: bool = True
    commission_rate: Optional[float] = None


@router.post("/admin/users")
async def create_user(
    user_data: CreateUserRequest,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)."""
    try:
        from auth import get_password_hash
        
        # Check if user already exists
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Validate role
        if user_data.role not in ["admin", "qari", "student"]:
            raise HTTPException(status_code=400, detail="Invalid role. Must be admin, qari, or student")
        
        # Hash password
        hashed_password = get_password_hash(user_data.password)
        
        # Set approval status
        is_approved = user_data.is_approved if user_data.is_approved is not None else (user_data.role != "qari")
        
        # Create user
        new_user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            role=user_data.role,
            is_active=user_data.is_active,
            is_approved=is_approved,
            commission_rate=user_data.commission_rate or 0.0
        )
        
        # Generate referral code for Qari if approved
        if new_user.role == UserRole.QARI and is_approved and not new_user.referral_code:
            import secrets
            import string
            code_length = 8
            while True:
                code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(code_length))
                existing = db.query(User).filter(User.referral_code == code).first()
                if not existing:
                    new_user.referral_code = code
                    break
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"Admin {current_user.email} created user: {new_user.email} (role: {new_user.role})")
        
        return {
            "id": str(new_user.id),
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "is_approved": new_user.is_approved,
            "is_active": new_user.is_active,
            "referral_code": new_user.referral_code,
            "commission_rate": new_user.commission_rate or 0.0,
            "created_at": new_user.created_at.isoformat() if new_user.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent admin from deleting themselves
        if user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
        # Prevent deleting the last admin
        if user.role == UserRole.ADMIN:
            admin_count = db.query(User).filter(User.role == UserRole.ADMIN).count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot delete the last admin")
        
        db.delete(user)
        db.commit()
        
        logger.info(f"Admin {current_user.email} deleted user: {user.email}")
        
        return {"success": True, "message": f"User {user.email} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/statistics")
async def get_platform_statistics(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive platform statistics for admin dashboard."""
    try:
        from database import UserSession, AnalysisResult, StudentProgress, StudentQariRelationship, Reference, QariContent
        from datetime import datetime, timedelta
        
        # User Statistics
        total_users = db.query(User).count()
        users_by_role = db.query(
            User.role,
            func.count(User.id).label('count')
        ).group_by(User.role).all()
        
        active_users = db.query(User).filter(User.is_active == True).count()
        approved_qaris = db.query(User).filter(
            and_(User.role == UserRole.QARI, User.is_approved == True)
        ).count()
        pending_qaris = db.query(User).filter(
            and_(User.role == UserRole.QARI, User.is_approved == False)
        ).count()
        
        # New users in last 7, 30 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        # Check if created_at column exists, if not use a default value
        try:
            new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
            new_users_30d = db.query(User).filter(User.created_at >= thirty_days_ago).count()
        except Exception:
            # If created_at doesn't exist, return 0
            new_users_7d = 0
            new_users_30d = 0
        
        # Session Statistics
        total_sessions = db.query(UserSession).count()
        authenticated_sessions = db.query(UserSession).filter(UserSession.user_id.isnot(None)).count()
        public_sessions = db.query(UserSession).filter(
            or_(UserSession.user_id.is_(None), UserSession.is_public_demo == True)
        ).count()
        
        # Sessions by role
        try:
            sessions_by_role = db.query(
                User.role,
                func.count(UserSession.id).label('count')
            ).join(UserSession, UserSession.user_id == User.id, isouter=False).group_by(User.role).all()
        except Exception as e:
            logger.warning(f"Error getting sessions by role: {e}")
            # Fallback: try with raw SQL if type mismatch
            try:
                from sqlalchemy import text
                sessions_by_role = db.execute(
                    text("""
                        SELECT users.role, COUNT(user_sessions.id) as count
                        FROM users
                        INNER JOIN user_sessions ON user_sessions.user_id::uuid = users.id
                        GROUP BY users.role
                    """)
                ).fetchall()
                sessions_by_role = [(row[0], row[1]) for row in sessions_by_role]
            except Exception as e2:
                logger.warning(f"Fallback query also failed: {e2}")
                sessions_by_role = []
        
        # Recent sessions (last 7 days)
        recent_sessions_7d = db.query(UserSession).filter(
            UserSession.created_at >= seven_days_ago
        ).count()
        
        # Analysis/Scoring Statistics
        total_analyses = db.query(AnalysisResult).count()
        avg_score = db.query(func.avg(AnalysisResult.score)).scalar() or 0.0
        
        # Student Progress Statistics
        total_progress_records = db.query(StudentProgress).count()
        students_with_progress = db.query(func.count(func.distinct(StudentProgress.student_id))).scalar() or 0
        
        # Qari-Student Relationships
        total_relationships = db.query(StudentQariRelationship).count()
        active_relationships = db.query(StudentQariRelationship).filter(
            StudentQariRelationship.is_active == True
        ).count()
        
        # Content Statistics
        total_references = db.query(Reference).count()
        public_references = db.query(Reference).filter(Reference.is_public == True).count()
        total_qari_content = db.query(QariContent).count()
        
        # Most used references
        try:
            top_references = db.query(
                Reference.id,
                Reference.title,
                func.count(UserSession.id).label('usage_count')
            ).outerjoin(UserSession, UserSession.reference_id == Reference.id).group_by(
                Reference.id, Reference.title
            ).order_by(func.count(UserSession.id).desc()).limit(10).all()
        except Exception as e:
            logger.warning(f"Error getting top references: {e}")
            top_references = []
        
        # Recent activity (last 20 sessions)
        recent_sessions = db.query(UserSession).order_by(
            UserSession.created_at.desc()
        ).limit(20).all()
        
        recent_activity = []
        for session in recent_sessions:
            user_email = None
            if session.user_id:
                user = db.query(User).filter(User.id == session.user_id).first()
                user_email = user.email if user else None
            
            analysis = db.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == session.id
            ).first()
            
            recent_activity.append({
                "session_id": str(session.id),
                "user_email": user_email,
                "is_public": session.is_public_demo or session.user_id is None,
                "reference_id": session.reference_id,
                "score": analysis.score if analysis else None,
                "duration": session.duration,
                "created_at": session.created_at.isoformat() if session.created_at else None
            })
        
        # User growth over time (last 30 days)
        user_growth = []
        try:
            for i in range(30, -1, -1):
                date = datetime.utcnow() - timedelta(days=i)
                count = db.query(User).filter(User.created_at <= date).count()
                user_growth.append({
                    "date": date.date().isoformat(),
                    "count": count
                })
        except Exception:
            # If created_at doesn't exist, return empty growth data
            user_growth = []
        
        # Session activity over time (last 30 days)
        session_activity = []
        for i in range(30, -1, -1):
            date = datetime.utcnow() - timedelta(days=i)
            next_date = date + timedelta(days=1)
            count = db.query(UserSession).filter(
                and_(
                    UserSession.created_at >= date,
                    UserSession.created_at < next_date
                )
            ).count()
            session_activity.append({
                "date": date.date().isoformat(),
                "count": count
            })
        
        # Format users_by_role - handle both tuple and RowProxy formats
        users_by_role_dict = {}
        for item in users_by_role:
            if hasattr(item, 'role') and hasattr(item, 'count'):
                users_by_role_dict[item.role] = item.count
            elif isinstance(item, tuple) and len(item) == 2:
                users_by_role_dict[item[0]] = item[1]
            else:
                # Fallback: try to access as dict-like
                try:
                    users_by_role_dict[item['role']] = item['count']
                except (KeyError, TypeError):
                    logger.warning(f"Could not parse user role item: {item}")
        
        # Format sessions_by_role - handle both tuple and RowProxy formats
        sessions_by_role_dict = {}
        for item in sessions_by_role:
            if hasattr(item, 'role') and hasattr(item, 'count'):
                sessions_by_role_dict[item.role] = item.count
            elif isinstance(item, tuple) and len(item) == 2:
                sessions_by_role_dict[item[0]] = item[1]
            else:
                # Fallback: try to access as dict-like
                try:
                    sessions_by_role_dict[item['role']] = item['count']
                except (KeyError, TypeError):
                    logger.warning(f"Could not parse session role item: {item}")
        
        # Format top_references - handle tuple unpacking
        top_refs_list = []
        for item in top_references:
            if isinstance(item, tuple) and len(item) == 3:
                ref_id, ref_title, usage_count = item
                top_refs_list.append({
                    "id": str(ref_id),
                    "title": ref_title,
                    "usage_count": usage_count
                })
            elif hasattr(item, 'id') and hasattr(item, 'title'):
                # It's a Reference object with usage_count as a separate value
                # This shouldn't happen with the current query, but handle it
                top_refs_list.append({
                    "id": str(item.id),
                    "title": item.title,
                    "usage_count": getattr(item, 'usage_count', 0)
                })
            else:
                logger.warning(f"Could not parse top reference item: {item}")
        
        return {
            "users": {
                "total": total_users,
                "by_role": users_by_role_dict,
                "active": active_users,
                "approved_qaris": approved_qaris,
                "pending_qaris": pending_qaris,
                "new_users_7d": new_users_7d,
                "new_users_30d": new_users_30d,
                "growth": user_growth
            },
            "sessions": {
                "total": total_sessions,
                "authenticated": authenticated_sessions,
                "public": public_sessions,
                "by_role": sessions_by_role_dict,
                "recent_7d": recent_sessions_7d,
                "activity": session_activity
            },
            "analyses": {
                "total": total_analyses,
                "average_score": round(float(avg_score), 2)
            },
            "progress": {
                "total_records": total_progress_records,
                "students_with_progress": students_with_progress
            },
            "relationships": {
                "total": total_relationships,
                "active": active_relationships
            },
            "content": {
                "total_references": total_references,
                "public_references": public_references,
                "qari_content": total_qari_content,
                "top_references": top_refs_list
            },
            "recent_activity": recent_activity
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error getting platform statistics: {e}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Error getting platform statistics: {str(e)}")

@router.get("/admin/sessions")
async def get_all_sessions(
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get all sessions with detailed information."""
    try:
        from database import UserSession, AnalysisResult
        
        query = db.query(UserSession)
        if user_id:
            query = query.filter(UserSession.user_id == user_id)
        
        sessions = query.order_by(UserSession.created_at.desc()).offset(offset).limit(limit).all()
        
        detailed_sessions = []
        for session in sessions:
            # Get user info
            user_email = None
            user_name = None
            user_role = None
            if session.user_id:
                user = db.query(User).filter(User.id == session.user_id).first()
                if user:
                    user_email = user.email
                    user_name = user.full_name
                    user_role = user.role
            
            # Get analysis result
            analysis = db.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == session.id
            ).first()
            
            # Get Qari info if used
            qari_name = None
            if session.qari_id:
                qari = db.query(User).filter(User.id == session.qari_id).first()
                if qari:
                    qari_name = qari.full_name if qari.full_name else qari.email
            
            detailed_sessions.append({
                "session_id": str(session.id),
                "user_id": str(session.user_id) if session.user_id else None,
                "user_email": user_email,
                "user_name": user_name,
                "user_role": user_role,
                "reference_id": session.reference_id,
                "qari_id": str(session.qari_id) if session.qari_id else None,
                "qari_name": qari_name,
                "file_path": session.file_path,
                "duration": session.duration,
                "file_size": session.file_size,
                "is_public_demo": session.is_public_demo,
                "created_at": session.created_at.isoformat() if session.created_at else None,
                "score": analysis.score if analysis else None,
                "verse_scores": analysis.ayat_timing if analysis and analysis.ayat_timing else None,
                "weak_verses": None,  # Will be populated from StudentProgress if available
                "has_analysis": analysis is not None
            })
        
        total_count = query.count()
        
        return {
            "sessions": detailed_sessions,
            "total": total_count,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error getting sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/usage-metrics")
async def get_usage_metrics(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get platform usage metrics."""
    try:
        from database import UserSession, AnalysisResult, StudentProgress, Reference
        from datetime import datetime, timedelta
        from sqlalchemy import func
        import os
        from pathlib import Path
        
        today = datetime.utcnow().date()
        week_start = datetime.utcnow() - timedelta(days=7)
        
        # Active students today/this week
        active_students_today = db.query(func.count(func.distinct(UserSession.user_id))).filter(
            and_(
                UserSession.user_id.isnot(None),
                func.date(UserSession.created_at) == today
            )
        ).scalar() or 0
        
        active_students_week = db.query(func.count(func.distinct(UserSession.user_id))).filter(
            and_(
                UserSession.user_id.isnot(None),
                UserSession.created_at >= week_start
            )
        ).scalar() or 0
        
        # Recordings made
        recordings_today = db.query(UserSession).filter(
            func.date(UserSession.created_at) == today
        ).count()
        
        recordings_week = db.query(UserSession).filter(
            UserSession.created_at >= week_start
        ).count()
        
        # Assessments completed
        assessments_today = db.query(AnalysisResult).join(
            UserSession, AnalysisResult.user_session_id == UserSession.id
        ).filter(
            func.date(UserSession.created_at) == today
        ).count()
        
        assessments_week = db.query(AnalysisResult).join(
            UserSession, AnalysisResult.user_session_id == UserSession.id
        ).filter(
            UserSession.created_at >= week_start
        ).count()
        
        # Most active Qari
        most_active_qari = db.query(
            User.id,
            User.email,
            User.full_name,
            func.count(UserSession.id).label('session_count')
        ).join(
            UserSession, UserSession.qari_id == User.id
        ).filter(
            User.role == UserRole.QARI
        ).group_by(User.id, User.email, User.full_name).order_by(
            func.count(UserSession.id).desc()
        ).first()
        
        # Storage usage
        uploads_dir = Path(__file__).parent / "uploads"
        total_storage = 0
        if uploads_dir.exists():
            for file_path in uploads_dir.rglob("*"):
                if file_path.is_file():
                    total_storage += file_path.stat().st_size
        
        # Storage per Qari (approximate - count their content files)
        qari_storage = {}
        qaris = db.query(User).filter(User.role == UserRole.QARI).all()
        for qari in qaris:
            # Count references owned by this Qari
            ref_count = db.query(Reference).filter(Reference.owner_id == qari.id).count()
            # Approximate: assume average 5MB per reference
            qari_storage[str(qari.id)] = {
                "qari_name": qari.full_name or qari.email,
                "estimated_mb": ref_count * 5
            }
        
        return {
            "active_students": {
                "today": active_students_today,
                "this_week": active_students_week
            },
            "recordings": {
                "today": recordings_today,
                "this_week": recordings_week,
                "total": db.query(UserSession).count()
            },
            "assessments": {
                "today": assessments_today,
                "this_week": assessments_week,
                "total": db.query(AnalysisResult).count()
            },
            "most_active_qari": {
                "id": str(most_active_qari.id) if most_active_qari else None,
                "name": most_active_qari.full_name if most_active_qari else None,
                "email": most_active_qari.email if most_active_qari else None,
                "session_count": most_active_qari.session_count if most_active_qari else 0
            },
            "storage": {
                "total_mb": round(total_storage / (1024 * 1024), 2),
                "total_gb": round(total_storage / (1024 * 1024 * 1024), 2),
                "by_qari": qari_storage
            }
        }
    except Exception as e:
        logger.error(f"Error getting usage metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Milestone 4: Certification, Subscriptions, Monitoring
# ============================================================================

@router.post("/admin/sessions/{session_id}/mark-assessment")
async def mark_session_as_assessment(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as assessment (immutable for certification).
    Admin and Qari can mark their students' sessions.
    """
    try:
        from assessment_service import assessment_service
        
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", None)
        
        assessment_service.mark_as_assessment(
            session_id=session_id,
            marked_by_user_id=str(current_user.id),
            db=db,
            ip_address=client_ip,
            user_agent=user_agent
        )
        
        return {
            "success": True,
            "message": f"Session {session_id} marked as assessment (immutable)",
            "session_id": session_id
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error marking session as assessment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/sessions/assessments")
async def get_assessment_sessions(
    qari_id: Optional[str] = None,
    student_id: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get all assessment sessions (Admin only)."""
    try:
        from assessment_service import assessment_service
        
        sessions = assessment_service.get_assessment_sessions(
            qari_id=qari_id,
            student_id=student_id,
            limit=limit,
            db=db
        )
        
        return {
            "assessments": sessions,
            "count": len(sessions)
        }
    except Exception as e:
        logger.error(f"Error getting assessment sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/subscriptions/{user_id}/activate")
async def activate_subscription(
    user_id: str,
    tier: str = "basic",
    duration_days: int = 30,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Activate subscription for a user (Admin only)."""
    try:
        from subscription_service import subscription_service
        
        subscription_service.activate_subscription(
            user_id=user_id,
            tier=tier,
            duration_days=duration_days,
            db=db
        )
        
        return {
            "success": True,
            "message": f"Activated {tier} subscription for user {user_id}",
            "user_id": user_id,
            "tier": tier,
            "duration_days": duration_days
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error activating subscription: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's subscription status."""
    try:
        from subscription_service import subscription_service
        
        status = subscription_service.check_subscription_status(
            user_id=str(current_user.id),
            db=db
        )
        
        return status
    except Exception as e:
        logger.error(f"Error getting subscription status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/qari/{qari_id}/commission")
async def get_qari_commission(
    qari_id: str,
    month: int,
    year: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get Qari's commission for a specific month (Admin only)."""
    try:
        from subscription_service import subscription_service
        
        commission = subscription_service.calculate_monthly_commission(
            qari_id=qari_id,
            month=month,
            year=year,
            db=db
        )
        
        return commission
    except Exception as e:
        logger.error(f"Error calculating commission: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/system-health")
async def get_system_health(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive system health metrics (Admin only)."""
    try:
        from monitoring_service import monitoring_service
        
        health = monitoring_service.get_system_health(db=db)
        
        return health
    except Exception as e:
        logger.error(f"Error getting system health: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/processing-status")
async def get_processing_status(
    current_user: User = Depends(get_current_admin_user)
):
    """Get audio processing queue status (Admin only)."""
    try:
        from monitoring_service import monitoring_service
        
        status = monitoring_service.get_processing_status()
        
        return status
    except Exception as e:
        logger.error(f"Error getting processing status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/storage-metrics")
async def get_storage_metrics(
    current_user: User = Depends(get_current_admin_user)
):
    """Get detailed storage metrics (Admin only)."""
    try:
        from monitoring_service import monitoring_service
        
        metrics = monitoring_service.get_storage_metrics()
        
        return metrics
    except Exception as e:
        logger.error(f"Error getting storage metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/subscription-statistics")
async def get_subscription_statistics(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get subscription statistics (Admin only)."""
    try:
        from subscription_service import subscription_service
        
        stats = subscription_service.get_subscription_statistics(db=db)
        
        return stats
    except Exception as e:
        logger.error(f"Error getting subscription statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
