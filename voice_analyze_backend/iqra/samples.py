from dataclasses import dataclass


@dataclass(frozen=True)
class IqraAssessmentSample:
    id: str
    level: int
    reference_text: str
    title: str
    sequence: int
    unit_id: str


SAMPLES: dict[str, IqraAssessmentSample] = {
    "iqra-1-demo": IqraAssessmentSample(
        id="iqra-1-demo",
        level=1,
        reference_text="بَ تَ ثَ",
        title="Pengenalan huruf",
        sequence=1,
        unit_id="iqra-1-demo",
    ),
    "iqra-3-unit-1": IqraAssessmentSample(
        id="iqra-3-unit-1",
        level=3,
        reference_text="شَهِدَ لَعِبَ عَلِمَ رَضِيَ",
        title="Perkataan 1",
        sequence=1,
        unit_id="iqra-3-unit-1",
    ),
    "iqra-3-unit-2": IqraAssessmentSample(
        id="iqra-3-unit-2",
        level=3,
        reference_text="فَعَلَا فَاعِلٌ كِتَابٌ كَاتِبٌ",
        title="Perkataan 2",
        sequence=2,
        unit_id="iqra-3-unit-2",
    ),
    "iqra-3-unit-3": IqraAssessmentSample(
        id="iqra-3-unit-3",
        level=3,
        reference_text="جِهَادٌ جَامِدٌ غَفَّارٌ غَافِرٌ",
        title="Perkataan 3",
        sequence=3,
        unit_id="iqra-3-unit-3",
    ),
    "iqra-6-ayah-1": IqraAssessmentSample(
        id="iqra-6-ayah-1",
        level=6,
        reference_text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        title="Al-Fatihah · Ayat 1",
        sequence=1,
        unit_id="iqra-6-alfatihah",
    ),
    "iqra-6-ayah-2": IqraAssessmentSample(id="iqra-6-ayah-2", level=6, reference_text="الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", title="Al-Fatihah · Ayat 2", sequence=2, unit_id="iqra-6-alfatihah"),
    "iqra-6-ayah-3": IqraAssessmentSample(id="iqra-6-ayah-3", level=6, reference_text="الرَّحْمَٰنِ الرَّحِيمِ", title="Al-Fatihah · Ayat 3", sequence=3, unit_id="iqra-6-alfatihah"),
    "iqra-6-ayah-4": IqraAssessmentSample(id="iqra-6-ayah-4", level=6, reference_text="مَالِكِ يَوْمِ الدِّينِ", title="Al-Fatihah · Ayat 4", sequence=4, unit_id="iqra-6-alfatihah"),
    "iqra-6-ayah-5": IqraAssessmentSample(id="iqra-6-ayah-5", level=6, reference_text="إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", title="Al-Fatihah · Ayat 5", sequence=5, unit_id="iqra-6-alfatihah"),
    "iqra-6-ayah-6": IqraAssessmentSample(id="iqra-6-ayah-6", level=6, reference_text="اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", title="Al-Fatihah · Ayat 6", sequence=6, unit_id="iqra-6-alfatihah"),
    "iqra-6-ayah-7": IqraAssessmentSample(id="iqra-6-ayah-7", level=6, reference_text="صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", title="Al-Fatihah · Ayat 7", sequence=7, unit_id="iqra-6-alfatihah"),
}

# Compatibility for the first TestFlight build. New clients use the unit ID.
SAMPLES["iqra-3-demo"] = SAMPLES["iqra-3-unit-1"]
SAMPLES["iqra-6-demo"] = SAMPLES["iqra-6-ayah-1"]


def get_sample(sample_id: str) -> IqraAssessmentSample | None:
    return SAMPLES.get(sample_id)
