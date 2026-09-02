from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from auth import get_current_user_optional, require_registered_user
from database import LearningAnnotation, Reference, SessionLocal, User, UserRole, get_db


router = APIRouter(prefix="/api/references", tags=["learning-annotations"])

AnnotationType = Literal[
    "letter", "mad", "makhraj", "ghunnah", "stop", "breath", "repeat", "pitch", "note"
]


class AnnotationPayload(BaseModel):
    id: Optional[UUID] = None
    annotation_type: AnnotationType
    label: str = Field(min_length=1, max_length=80)
    arabic_text: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = Field(default=None, max_length=300)
    start_time: float = Field(ge=0)
    end_time: Optional[float] = Field(default=None, ge=0)
    vertical_position: Optional[float] = Field(default=None, ge=0, le=1)

    @field_validator("end_time")
    @classmethod
    def validate_end_time(cls, value, info):
        start = info.data.get("start_time", 0)
        if value is not None and value < start:
            raise ValueError("end_time must be at or after start_time")
        return value


class AnnotationBatchPayload(BaseModel):
    status: Literal["draft", "published"]
    annotations: List[AnnotationPayload]
    inactive_ids: List[UUID] = Field(default_factory=list)


def require_reference_editor(reference: Reference, current_user: User):
    if current_user.role == UserRole.ADMIN.value:
        return
    if current_user.role != UserRole.QARI.value or reference.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit annotations for your own reference")


def serialize(item: LearningAnnotation):
    return {
        "id": str(item.id),
        "reference_id": item.reference_id,
        "qari_id": str(item.qari_id),
        "annotation_type": item.annotation_type,
        "label": item.label,
        "arabic_text": item.arabic_text,
        "note": item.note,
        "start_time": item.start_time,
        "end_time": item.end_time,
        "vertical_position": item.vertical_position,
        "status": item.status,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("/{reference_id}/learning-annotations")
def list_learning_annotations(
    reference_id: str,
    include_drafts: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    if not reference.is_public and current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    query = db.query(LearningAnnotation).filter(
        LearningAnnotation.reference_id == reference_id,
        LearningAnnotation.is_active.is_(True),
    )
    can_view_drafts = current_user is not None and current_user.role in (UserRole.QARI.value, UserRole.ADMIN.value)
    if include_drafts and can_view_drafts:
        if current_user.role == UserRole.QARI.value:
            query = query.filter(LearningAnnotation.qari_id == current_user.id)
    else:
        query = query.filter(LearningAnnotation.status == "published")
    items = (
        query
        .order_by(LearningAnnotation.start_time, LearningAnnotation.created_at)
        .all()
    )
    return [serialize(item) for item in items]


@router.post("/{reference_id}/learning-annotations", status_code=201)
def create_learning_annotation(
    reference_id: str,
    payload: AnnotationPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_registered_user),
):
    if current_user.role not in (UserRole.QARI.value, UserRole.ADMIN.value):
        raise HTTPException(status_code=403, detail="Only a Qari or admin may add learning annotations")
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    require_reference_editor(reference, current_user)
    values = payload.model_dump(exclude={"id"})
    item = LearningAnnotation(reference_id=reference_id, qari_id=current_user.id, status="draft", **values)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize(item)


@router.put("/{reference_id}/learning-annotations")
def save_learning_annotations(
    reference_id: str,
    payload: AnnotationBatchPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_registered_user),
):
    if current_user.role not in (UserRole.QARI.value, UserRole.ADMIN.value):
        raise HTTPException(status_code=403, detail="Only a Qari or admin may save learning annotations")
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    require_reference_editor(reference, current_user)

    saved = []
    for annotation in payload.annotations:
        item = None
        if annotation.id:
            item = db.query(LearningAnnotation).filter(
                LearningAnnotation.id == annotation.id,
                LearningAnnotation.reference_id == reference_id,
                LearningAnnotation.qari_id == current_user.id,
            ).first()
        values = annotation.model_dump(exclude={"id"})
        if item:
            for key, value in values.items():
                setattr(item, key, value)
            item.status = payload.status
            item.is_active = True
        else:
            item = LearningAnnotation(reference_id=reference_id, qari_id=current_user.id, status=payload.status, **values)
            db.add(item)
        saved.append(item)

    if payload.inactive_ids:
        db.query(LearningAnnotation).filter(
            LearningAnnotation.id.in_(payload.inactive_ids),
            LearningAnnotation.reference_id == reference_id,
            LearningAnnotation.qari_id == current_user.id,
        ).update({LearningAnnotation.is_active: False}, synchronize_session=False)
    db.commit()
    return {"status": payload.status, "annotations": [serialize(item) for item in saved]}


@router.delete("/{reference_id}/learning-annotations/{annotation_id}", status_code=204)
def delete_learning_annotation(
    reference_id: str,
    annotation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_registered_user),
):
    item = db.query(LearningAnnotation).filter(
        LearningAnnotation.id == annotation_id,
        LearningAnnotation.reference_id == reference_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if current_user.role != UserRole.ADMIN.value and item.qari_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own annotations")
    item.is_active = False
    db.commit()
