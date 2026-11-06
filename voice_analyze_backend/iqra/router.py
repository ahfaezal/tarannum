from fastapi import APIRouter, Depends

from auth import get_current_student_user
from database import User
from iqra.config import is_azure_speech_configured, is_iqra_enabled
from iqra.schemas import IqraStatusResponse


router = APIRouter(prefix="/api/kids/iqra", tags=["kids-iqra"])


@router.get("/status", response_model=IqraStatusResponse)
async def get_iqra_status(
    _current_user: User = Depends(get_current_student_user),
) -> IqraStatusResponse:
    enabled = is_iqra_enabled()
    provider = "azure-speech" if enabled and is_azure_speech_configured() else None
    return IqraStatusResponse(
        enabled=enabled,
        assessment_provider=provider,
        sample_levels=[1, 3, 6],
    )
