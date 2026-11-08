"""Admin API for versioned Tarannum Kids learning packages."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_admin_user
from database import (
    KidsLearningPackage,
    KidsPackageTransition,
    KidsPackageUnit,
    User,
    get_db,
)


router = APIRouter(prefix="/api/admin/kids/packages", tags=["kids-packages-admin"])

PACKAGE_TYPES = {"page", "surah"}
PACKAGE_STATUSES = {"draft", "published", "archived"}
ACTIVITY_TYPES = {"iqra_reading", "tarannum_listen", "tarannum_practice", "tarannum_record"}
ASSESSMENT_ENGINES = {"azure_speech", "fastconformer", "tarannum"}
AGENT_ACTIONS = {
    "advance",
    "retain",
    "remedial",
    "foundation",
    "human_review",
    "notify_parent",
    "notify_teacher",
}
TRANSITION_OUTCOMES = {"advance", "remedial", "foundation"}


class PackageUnitInput(BaseModel):
    unit_key: str = Field(min_length=1, max_length=120)
    sequence: int = Field(ge=1, le=1000)
    title: str = Field(min_length=1, max_length=240)
    instruction: Optional[str] = Field(default=None, max_length=2000)
    activity_type: str
    reference_text: Optional[str] = None
    reference_id: Optional[str] = Field(default=None, max_length=255)
    sample_id: Optional[str] = Field(default=None, max_length=255)
    required: bool = True
    assessment_config: Dict[str, Any] = Field(default_factory=dict)


class PackageCreate(BaseModel):
    package_key: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=2, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    package_type: str
    level: Optional[str] = Field(default=None, max_length=80)
    source_metadata: Dict[str, Any] = Field(default_factory=dict)
    assessment_engines: List[str] = Field(default_factory=list)
    completion_rules: Dict[str, Any] = Field(default_factory=dict)
    allowed_agent_actions: List[str] = Field(default_factory=list)
    units: List[PackageUnitInput] = Field(default_factory=list)


class PackageUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    package_type: Optional[str] = None
    level: Optional[str] = Field(default=None, max_length=80)
    source_metadata: Optional[Dict[str, Any]] = None
    assessment_engines: Optional[List[str]] = None
    completion_rules: Optional[Dict[str, Any]] = None
    allowed_agent_actions: Optional[List[str]] = None
    units: Optional[List[PackageUnitInput]] = None


class TransitionInput(BaseModel):
    to_package_id: UUID
    outcome: str
    priority: int = Field(default=100, ge=1, le=1000)
    conditions: Dict[str, Any] = Field(default_factory=dict)
    requires_human_approval: bool = False
    is_active: bool = True


def _validate_package_values(
    package_type: str,
    engines: List[str],
    actions: List[str],
    units: List[PackageUnitInput],
) -> None:
    if package_type not in PACKAGE_TYPES:
        raise HTTPException(400, "package_type must be page or surah")
    unknown_engines = sorted(set(engines) - ASSESSMENT_ENGINES)
    if unknown_engines:
        raise HTTPException(400, f"Unknown assessment engines: {', '.join(unknown_engines)}")
    unknown_actions = sorted(set(actions) - AGENT_ACTIONS)
    if unknown_actions:
        raise HTTPException(400, f"Unknown agent actions: {', '.join(unknown_actions)}")
    keys = [unit.unit_key.strip() for unit in units]
    sequences = [unit.sequence for unit in units]
    if len(keys) != len(set(keys)):
        raise HTTPException(400, "unit_key must be unique within a package")
    if len(sequences) != len(set(sequences)):
        raise HTTPException(400, "unit sequence must be unique within a package")
    unknown_activities = sorted({unit.activity_type for unit in units} - ACTIVITY_TYPES)
    if unknown_activities:
        raise HTTPException(400, f"Unknown activity types: {', '.join(unknown_activities)}")


def _validate_source_metadata(package_type: str, metadata: Dict[str, Any]) -> None:
    if package_type == "page":
        if not str(metadata.get("book_title") or "").strip():
            raise HTTPException(400, "Page packages require source_metadata.book_title")
        page_number = metadata.get("page_number")
        if not isinstance(page_number, int) or page_number < 1:
            raise HTTPException(400, "Page packages require a positive source_metadata.page_number")
    elif package_type == "surah":
        if not str(metadata.get("surah_name") or "").strip():
            raise HTTPException(400, "Surah packages require source_metadata.surah_name")


def _default_completion_rules(rules: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {
        "required_unit_pass_rate": 1.0,
        "minimum_valid_attempts_per_unit": 1,
        "require_in_sequence": True,
    }
    normalized.update(rules or {})
    pass_rate = normalized.get("required_unit_pass_rate")
    attempts = normalized.get("minimum_valid_attempts_per_unit")
    if not isinstance(pass_rate, (int, float)) or not 0 < float(pass_rate) <= 1:
        raise HTTPException(400, "required_unit_pass_rate must be greater than 0 and at most 1")
    if not isinstance(attempts, int) or attempts < 1:
        raise HTTPException(400, "minimum_valid_attempts_per_unit must be at least 1")
    return normalized


def _unit_payload(unit: KidsPackageUnit) -> dict:
    return {
        "id": str(unit.id),
        "unit_key": unit.unit_key,
        "sequence": unit.sequence,
        "title": unit.title,
        "instruction": unit.instruction,
        "activity_type": unit.activity_type,
        "reference_text": unit.reference_text,
        "reference_id": unit.reference_id,
        "sample_id": unit.sample_id,
        "required": bool(unit.required),
        "assessment_config": unit.assessment_config or {},
    }


def _unit_input(unit: KidsPackageUnit) -> PackageUnitInput:
    return PackageUnitInput(
        unit_key=unit.unit_key,
        sequence=unit.sequence,
        title=unit.title,
        instruction=unit.instruction,
        activity_type=unit.activity_type,
        reference_text=unit.reference_text,
        reference_id=unit.reference_id,
        sample_id=unit.sample_id,
        required=bool(unit.required),
        assessment_config=unit.assessment_config or {},
    )


def _transition_payload(transition: KidsPackageTransition) -> dict:
    return {
        "id": str(transition.id),
        "to_package_id": str(transition.to_package_id),
        "outcome": transition.outcome,
        "priority": transition.priority,
        "conditions": transition.conditions or {},
        "requires_human_approval": bool(transition.requires_human_approval),
        "is_active": bool(transition.is_active),
    }


def _package_payload(package: KidsLearningPackage, db: Session) -> dict:
    transitions = db.query(KidsPackageTransition).filter(
        KidsPackageTransition.from_package_id == package.id,
    ).order_by(KidsPackageTransition.priority, KidsPackageTransition.created_at).all()
    return {
        "id": str(package.id),
        "package_key": package.package_key,
        "version": package.version,
        "title": package.title,
        "description": package.description,
        "package_type": package.package_type,
        "level": package.level,
        "source_metadata": package.source_metadata or {},
        "assessment_engines": package.assessment_engines or [],
        "completion_rules": package.completion_rules or {},
        "allowed_agent_actions": package.allowed_agent_actions or [],
        "status": package.status,
        "created_by": str(package.created_by),
        "published_at": package.published_at.isoformat() if package.published_at else None,
        "archived_at": package.archived_at.isoformat() if package.archived_at else None,
        "created_at": package.created_at.isoformat() if package.created_at else None,
        "updated_at": package.updated_at.isoformat() if package.updated_at else None,
        "units": [_unit_payload(unit) for unit in package.units],
        "transitions": [_transition_payload(item) for item in transitions],
    }


def _get_package(db: Session, package_id: UUID) -> KidsLearningPackage:
    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == package_id).first()
    if package is None:
        raise HTTPException(404, "Learning package not found")
    return package


def _require_draft(package: KidsLearningPackage) -> None:
    if package.status != "draft":
        raise HTTPException(409, "Published or archived packages are immutable; create a new version")


def _replace_units(db: Session, package: KidsLearningPackage, units: List[PackageUnitInput]) -> None:
    db.query(KidsPackageUnit).filter(KidsPackageUnit.package_id == package.id).delete(synchronize_session=False)
    for item in sorted(units, key=lambda unit: unit.sequence):
        db.add(KidsPackageUnit(
            package_id=package.id,
            unit_key=item.unit_key.strip(),
            sequence=item.sequence,
            title=item.title.strip(),
            instruction=item.instruction.strip() if item.instruction else None,
            activity_type=item.activity_type,
            reference_text=item.reference_text.strip() if item.reference_text else None,
            reference_id=item.reference_id.strip() if item.reference_id else None,
            sample_id=item.sample_id.strip() if item.sample_id else None,
            required=item.required,
            assessment_config=item.assessment_config,
        ))


@router.get("")
def list_packages(
    status: Optional[str] = Query(default=None),
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    if status and status not in PACKAGE_STATUSES:
        raise HTTPException(400, "Invalid package status")
    query = db.query(KidsLearningPackage)
    if status:
        query = query.filter(KidsLearningPackage.status == status)
    packages = query.order_by(KidsLearningPackage.package_key, KidsLearningPackage.version.desc()).all()
    return [_package_payload(package, db) for package in packages]


@router.get("/{package_id}")
def get_package(
    package_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    return _package_payload(_get_package(db, package_id), db)


@router.post("")
def create_package(
    payload: PackageCreate,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _validate_package_values(payload.package_type, payload.assessment_engines, payload.allowed_agent_actions, payload.units)
    _validate_source_metadata(payload.package_type, payload.source_metadata)
    rules = _default_completion_rules(payload.completion_rules)
    existing = db.query(KidsLearningPackage.id).filter(
        KidsLearningPackage.package_key == payload.package_key,
    ).first()
    if existing:
        raise HTTPException(409, "package_key already exists; create a new version instead")
    package = KidsLearningPackage(
        package_key=payload.package_key,
        version=1,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        package_type=payload.package_type,
        level=payload.level.strip() if payload.level else None,
        source_metadata=payload.source_metadata,
        assessment_engines=sorted(set(payload.assessment_engines)),
        completion_rules=rules,
        allowed_agent_actions=sorted(set(payload.allowed_agent_actions)),
        status="draft",
        created_by=admin.id,
    )
    db.add(package)
    db.flush()
    _replace_units(db, package, payload.units)
    db.commit()
    db.refresh(package)
    return _package_payload(package, db)


@router.put("/{package_id}")
def update_package(
    package_id: UUID,
    payload: PackageUpdate,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    package = _get_package(db, package_id)
    _require_draft(package)
    package_type = payload.package_type if payload.package_type is not None else package.package_type
    engines = payload.assessment_engines if payload.assessment_engines is not None else list(package.assessment_engines or [])
    actions = payload.allowed_agent_actions if payload.allowed_agent_actions is not None else list(package.allowed_agent_actions or [])
    units = payload.units if payload.units is not None else [_unit_input(unit) for unit in package.units]
    _validate_package_values(package_type, engines, actions, units)
    source_metadata = payload.source_metadata if payload.source_metadata is not None else package.source_metadata or {}
    _validate_source_metadata(package_type, source_metadata)
    package.title = payload.title.strip() if payload.title is not None else package.title
    if payload.description is not None:
        package.description = payload.description.strip() or None
    package.package_type = package_type
    if payload.level is not None:
        package.level = payload.level.strip() or None
    package.source_metadata = source_metadata
    package.assessment_engines = sorted(set(engines))
    package.completion_rules = _default_completion_rules(
        payload.completion_rules if payload.completion_rules is not None else package.completion_rules or {}
    )
    package.allowed_agent_actions = sorted(set(actions))
    package.updated_at = datetime.utcnow()
    if payload.units is not None:
        _replace_units(db, package, payload.units)
    db.commit()
    db.refresh(package)
    return _package_payload(package, db)


@router.post("/{package_id}/versions")
def create_package_version(
    package_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    source = _get_package(db, package_id)
    draft = db.query(KidsLearningPackage).filter(
        KidsLearningPackage.package_key == source.package_key,
        KidsLearningPackage.status == "draft",
    ).first()
    if draft:
        raise HTTPException(409, "A draft version already exists for this package")
    latest_version = db.query(func.max(KidsLearningPackage.version)).filter(
        KidsLearningPackage.package_key == source.package_key,
    ).scalar() or source.version
    package = KidsLearningPackage(
        package_key=source.package_key,
        version=int(latest_version) + 1,
        title=source.title,
        description=source.description,
        package_type=source.package_type,
        level=source.level,
        source_metadata=source.source_metadata or {},
        assessment_engines=source.assessment_engines or [],
        completion_rules=source.completion_rules or {},
        allowed_agent_actions=source.allowed_agent_actions or [],
        status="draft",
        created_by=admin.id,
    )
    db.add(package)
    db.flush()
    for unit in source.units:
        db.add(KidsPackageUnit(
            package_id=package.id,
            unit_key=unit.unit_key,
            sequence=unit.sequence,
            title=unit.title,
            instruction=unit.instruction,
            activity_type=unit.activity_type,
            reference_text=unit.reference_text,
            reference_id=unit.reference_id,
            sample_id=unit.sample_id,
            required=unit.required,
            assessment_config=unit.assessment_config or {},
        ))
    source_transitions = db.query(KidsPackageTransition).filter(
        KidsPackageTransition.from_package_id == source.id,
    ).all()
    for transition in source_transitions:
        db.add(KidsPackageTransition(
            from_package_id=package.id,
            to_package_id=transition.to_package_id,
            outcome=transition.outcome,
            priority=transition.priority,
            conditions=transition.conditions or {},
            requires_human_approval=transition.requires_human_approval,
            is_active=transition.is_active,
        ))
    db.commit()
    db.refresh(package)
    return _package_payload(package, db)


@router.put("/{package_id}/transitions")
def replace_transitions(
    package_id: UUID,
    payload: List[TransitionInput],
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    package = _get_package(db, package_id)
    _require_draft(package)
    seen = set()
    for item in payload:
        if item.outcome not in TRANSITION_OUTCOMES:
            raise HTTPException(400, f"Invalid transition outcome: {item.outcome}")
        if item.to_package_id == package.id:
            raise HTTPException(400, "A package cannot transition to itself")
        target = _get_package(db, item.to_package_id)
        key = (target.id, item.outcome)
        if key in seen:
            raise HTTPException(400, "Duplicate package transition")
        seen.add(key)
    db.query(KidsPackageTransition).filter(
        KidsPackageTransition.from_package_id == package.id,
    ).delete(synchronize_session=False)
    for item in payload:
        db.add(KidsPackageTransition(
            from_package_id=package.id,
            to_package_id=item.to_package_id,
            outcome=item.outcome,
            priority=item.priority,
            conditions=item.conditions,
            requires_human_approval=item.requires_human_approval,
            is_active=item.is_active,
        ))
    db.commit()
    return _package_payload(package, db)


@router.post("/{package_id}/publish")
def publish_package(
    package_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    package = _get_package(db, package_id)
    _require_draft(package)
    if not package.units or not any(unit.required for unit in package.units):
        raise HTTPException(409, "A package requires at least one required unit before publication")
    _validate_package_values(
        package.package_type,
        list(package.assessment_engines or []),
        list(package.allowed_agent_actions or []),
        [_unit_input(unit) for unit in package.units],
    )
    _validate_source_metadata(package.package_type, package.source_metadata or {})
    now = datetime.utcnow()
    db.query(KidsLearningPackage).filter(
        KidsLearningPackage.package_key == package.package_key,
        KidsLearningPackage.status == "published",
        KidsLearningPackage.id != package.id,
    ).update({
        KidsLearningPackage.status: "archived",
        KidsLearningPackage.archived_at: now,
        KidsLearningPackage.updated_at: now,
    }, synchronize_session=False)
    package.status = "published"
    package.published_at = now
    package.archived_at = None
    package.updated_at = now
    db.commit()
    db.refresh(package)
    return _package_payload(package, db)


@router.post("/{package_id}/archive")
def archive_package(
    package_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    del admin
    package = _get_package(db, package_id)
    if package.status == "archived":
        return _package_payload(package, db)
    package.status = "archived"
    package.archived_at = datetime.utcnow()
    package.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(package)
    return _package_payload(package, db)
