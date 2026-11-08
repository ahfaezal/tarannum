"""Bounded, auditable package-level decision engine for Tarannum Kids.

Assessment engines remain authoritative for scores. This module only reads
completed package evidence and selects an Admin-approved next learning action.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from database import (
    KidsAgentDecision,
    KidsLearningPackage,
    KidsLearningPlan,
    KidsPackageAssignment,
    KidsPackageRun,
    KidsPackageTransition,
    KidsPackageUnit,
    KidsPackageUnitResult,
)


POLICY_VERSION = "kids-bounded-rules-v1"
PRIMARY_OUTCOMES = {"advance", "retain", "remedial", "foundation", "human_review"}


def _numeric_score(summary: dict[str, Any]) -> float | None:
    for key in ("unit_score", "score", "pronunciation_score", "accuracy_score"):
        value = summary.get(key)
        if isinstance(value, (int, float)):
            return max(0.0, min(100.0, float(value)))
    return None


def _transition_matches(transition: KidsPackageTransition, metrics: dict[str, Any]) -> bool:
    conditions = transition.conditions or {}
    comparisons = {
        "min_average_score": (metrics["average_score"], lambda actual, expected: actual >= expected),
        "max_average_score": (metrics["average_score"], lambda actual, expected: actual <= expected),
        "min_pass_rate": (metrics["pass_rate"], lambda actual, expected: actual >= expected),
        "max_pass_rate": (metrics["pass_rate"], lambda actual, expected: actual <= expected),
        "min_confidence": (metrics["confidence"], lambda actual, expected: actual >= expected),
        "max_confidence": (metrics["confidence"], lambda actual, expected: actual <= expected),
        "min_failed_units": (metrics["failed_unit_count"], lambda actual, expected: actual >= expected),
        "max_failed_units": (metrics["failed_unit_count"], lambda actual, expected: actual <= expected),
    }
    for key, expected in conditions.items():
        if key not in comparisons:
            return False
        actual, comparator = comparisons[key]
        try:
            if not comparator(actual, float(expected)):
                return False
        except (TypeError, ValueError):
            return False
    return True


def evaluate_agent_policy(
    *,
    allowed_actions: list[str],
    unit_rows: list[dict[str, Any]],
    transitions: list[KidsPackageTransition],
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure bounded policy used by runtime and focused unit tests."""
    policy = policy or {}
    scores = [row["score"] for row in unit_rows if row.get("score") is not None]
    unit_count = len(unit_rows)
    passed_count = sum(1 for row in unit_rows if row.get("passed"))
    failed = [row["unit_key"] for row in unit_rows if not row.get("passed")]
    weak = [row["unit_key"] for row in unit_rows if row.get("score") is not None and row["score"] < 80]
    strong = [row["unit_key"] for row in unit_rows if row.get("score") is not None and row["score"] >= 80]
    average_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    pass_rate = passed_count / unit_count if unit_count else 0.0
    evidence_coverage = len(scores) / unit_count if unit_count else 0.0
    attempts_ok = all(int(row.get("valid_attempt_count") or 0) >= 1 for row in unit_rows)
    confidence = round(min(1.0, 0.55 + (0.30 * evidence_coverage) + (0.15 if attempts_ok else 0)), 4)
    metrics = {
        "average_score": average_score,
        "pass_rate": round(pass_rate, 4),
        "confidence": confidence,
        "failed_unit_count": len(failed),
    }

    allowed = PRIMARY_OUTCOMES.intersection(allowed_actions)
    minimum_confidence = float(policy.get("agent_minimum_confidence", 0.75))
    advance_score = float(policy.get("agent_advance_minimum_score", 80))
    remedial_score = float(policy.get("agent_remedial_below_score", 70))
    matching = [item for item in transitions if item.is_active and _transition_matches(item, metrics)]
    matching.sort(key=lambda item: (item.priority, item.created_at or datetime.min))

    desired = "retain"
    reason = "Penguasaan perlu dikukuhkan dalam pakej semasa."
    if confidence < minimum_confidence:
        desired = "human_review" if "human_review" in allowed else "retain"
        reason = "Keyakinan bukti belum mencukupi; keputusan memerlukan semakan manusia."
    elif average_score >= advance_score and not failed:
        desired = "advance"
        reason = "Semua unit wajib lulus dengan tahap penguasaan yang kukuh."
    elif average_score < remedial_score or failed:
        desired = "remedial"
        reason = "Bukti menunjukkan unit lemah yang memerlukan latihan pemulihan berfokus."

    if desired not in allowed:
        if "retain" in allowed:
            desired = "retain"
        elif "human_review" in allowed:
            desired = "human_review"
        else:
            raise ValueError("Package has no Admin-approved safe fallback action")
        reason = "Tindakan pilihan tidak dibenarkan oleh Admin; laluan selamat digunakan."

    transition = next((item for item in matching if item.outcome == desired), None)
    if desired in {"advance", "remedial", "foundation"} and transition is None:
        if "retain" in allowed:
            desired = "retain"
        elif "human_review" in allowed:
            desired = "human_review"
        else:
            raise ValueError("Package has no Admin-approved safe fallback action")
        reason = "Tiada laluan pakej yang diluluskan Admin untuk tindakan tersebut."

    requires_review = desired == "human_review" or bool(transition and transition.requires_human_approval)
    return {
        "outcome": desired,
        "confidence": confidence,
        "strengths": strong,
        "weaknesses": sorted(set(failed + weak)),
        "explanation": reason,
        "transition": transition,
        "requires_human_review": requires_review,
        "metrics": metrics,
        "policy": {
            "agent_minimum_confidence": minimum_confidence,
            "agent_advance_minimum_score": advance_score,
            "agent_remedial_below_score": remedial_score,
        },
    }


def execute_agent_for_run(db: Session, run: KidsPackageRun) -> tuple[KidsAgentDecision, KidsLearningPlan]:
    """Create one idempotent decision and plan for an eligible completed run."""
    existing = db.query(KidsAgentDecision).filter(KidsAgentDecision.run_id == run.id).order_by(
        KidsAgentDecision.created_at.desc()
    ).first()
    if existing:
        plan = db.query(KidsLearningPlan).filter(KidsLearningPlan.decision_id == existing.id).first()
        if plan is None:
            raise RuntimeError("Agent decision exists without its learning plan")
        return existing, plan

    evaluation = run.completion_evaluation or {}
    if run.status != "completed" or not evaluation.get("eligible_for_agent"):
        raise ValueError("Run is not eligible for agent evaluation")

    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == run.package_id).first()
    if package is None:
        raise ValueError("Learning package is unavailable")
    units = db.query(KidsPackageUnit).filter(KidsPackageUnit.package_id == package.id).order_by(
        KidsPackageUnit.sequence
    ).all()
    result_map = {
        row.unit_id: row for row in db.query(KidsPackageUnitResult).filter(
            KidsPackageUnitResult.run_id == run.id
        ).all()
    }
    rows = []
    for unit in units:
        result = result_map.get(unit.id)
        if not unit.required or result is None:
            continue
        rows.append({
            "unit_id": str(unit.id),
            "unit_key": unit.unit_key,
            "passed": bool(result.passed),
            "score": _numeric_score(result.score_summary or {}),
            "valid_attempt_count": int(result.valid_attempt_count or 0),
            "evidence_refs": result.evidence_refs or [],
            "score_summary": result.score_summary or {},
            "provider": (result.engine_results or {}).get("provider"),
        })
    transitions = db.query(KidsPackageTransition).filter(
        KidsPackageTransition.from_package_id == package.id,
        KidsPackageTransition.is_active.is_(True),
    ).all()
    policy_result = evaluate_agent_policy(
        allowed_actions=list(package.allowed_agent_actions or []),
        unit_rows=rows,
        transitions=transitions,
        policy=package.completion_rules or {},
    )
    transition = policy_result.pop("transition")
    target_package_id = transition.to_package_id if transition else package.id
    decision = KidsAgentDecision(
        run_id=run.id,
        student_id=run.student_id,
        package_id=package.id,
        transition_id=transition.id if transition else None,
        outcome=policy_result["outcome"],
        confidence=policy_result["confidence"],
        strengths=policy_result["strengths"],
        weaknesses=policy_result["weaknesses"],
        evidence_snapshot={
            "run_completion": evaluation,
            "valid_activity_seconds": run.valid_activity_seconds,
            "units": rows,
            "metrics": policy_result["metrics"],
        },
        rules_snapshot={
            "allowed_agent_actions": list(package.allowed_agent_actions or []),
            "completion_rules": package.completion_rules or {},
            "matched_transition_id": str(transition.id) if transition else None,
            "policy": policy_result["policy"],
        },
        explanation=policy_result["explanation"],
        requires_human_review=policy_result["requires_human_review"],
        review_status="pending" if policy_result["requires_human_review"] else "not_required",
        provider="bounded_rules",
        model=None,
        policy_version=POLICY_VERSION,
    )
    db.add(decision)
    db.flush()
    plan = KidsLearningPlan(
        student_id=run.student_id,
        decision_id=decision.id,
        target_package_id=target_package_id,
        action=decision.outcome,
        status="proposed" if decision.requires_human_review else "active",
        rationale=decision.explanation,
        plan_metadata={
            "transition_id": str(transition.id) if transition else None,
            "source_run_id": str(run.id),
            "policy_version": POLICY_VERSION,
        },
        activated_at=None if decision.requires_human_review else datetime.utcnow(),
    )
    db.add(plan)
    db.flush()

    if not decision.requires_human_review:
        assignment = KidsPackageAssignment(
            student_id=run.student_id,
            package_id=target_package_id,
            assigned_by=None,
            source="agent",
            status="assigned",
            reason=decision.explanation,
            assignment_metadata={
                "decision_id": str(decision.id),
                "source_run_id": str(run.id),
                "outcome": decision.outcome,
            },
        )
        db.add(assignment)
        db.flush()
        plan.plan_metadata = {**(plan.plan_metadata or {}), "assignment_id": str(assignment.id)}

    return decision, plan


def agent_decision_payload(decision: KidsAgentDecision, plan: KidsLearningPlan) -> dict[str, Any]:
    return {
        "id": str(decision.id),
        "run_id": str(decision.run_id),
        "package_id": str(decision.package_id),
        "transition_id": str(decision.transition_id) if decision.transition_id else None,
        "outcome": decision.outcome,
        "confidence": decision.confidence,
        "strengths": decision.strengths or [],
        "weaknesses": decision.weaknesses or [],
        "explanation": decision.explanation,
        "requires_human_review": bool(decision.requires_human_review),
        "review_status": decision.review_status,
        "provider": decision.provider,
        "policy_version": decision.policy_version,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
        "plan": {
            "id": str(plan.id),
            "target_package_id": str(plan.target_package_id),
            "action": plan.action,
            "status": plan.status,
            "rationale": plan.rationale,
            "metadata": plan.plan_metadata or {},
        },
    }
