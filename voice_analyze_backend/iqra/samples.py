from dataclasses import dataclass


@dataclass(frozen=True)
class IqraAssessmentSample:
    id: str
    level: int
    reference_text: str


SAMPLES: dict[str, IqraAssessmentSample] = {
    "iqra-1-demo": IqraAssessmentSample(
        id="iqra-1-demo",
        level=1,
        reference_text="بَ تَ ثَ",
    ),
    "iqra-3-demo": IqraAssessmentSample(
        id="iqra-3-demo",
        level=3,
        reference_text="كَتَبَ ذَهَبَ فَتَحَ",
    ),
    "iqra-6-demo": IqraAssessmentSample(
        id="iqra-6-demo",
        level=6,
        reference_text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    ),
}


def get_sample(sample_id: str) -> IqraAssessmentSample | None:
    return SAMPLES.get(sample_id)
