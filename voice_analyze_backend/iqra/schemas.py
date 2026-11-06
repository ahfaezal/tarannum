from typing import Optional

from pydantic import BaseModel


class IqraStatusResponse(BaseModel):
    enabled: bool
    assessment_provider: Optional[str] = None
    sample_levels: list[int]
