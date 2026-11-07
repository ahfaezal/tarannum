import Foundation

enum IqraLevel: Int, CaseIterable, Codable, Identifiable {
    case one = 1
    case three = 3
    case six = 6

    var id: Int { rawValue }

    var title: String {
        "IQRA \(rawValue)"
    }
}

struct IqraSample: Identifiable, Equatable, Hashable {
    let id: String
    let level: IqraLevel
    let arabicText: String
    let instruction: String
    let title: String
    let sequence: Int

    var words: [String] {
        arabicText.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }

    var guideRanges: [Range<Int>] {
        let counts: [Int]
        if level == .three {
            counts = Array(repeating: 1, count: words.count)
        } else if level == .six {
            switch sequence {
            case 1, 2, 5: counts = [2, 2]
            case 3: counts = [2]
            case 4: counts = [2, 1]
            case 6: counts = [1, 2]
            case 7: counts = [3, 3, 3]
            default: counts = [words.count]
            }
        } else {
            counts = [words.count]
        }
        var start = 0
        return counts.compactMap { count in
            guard start < words.count else { return nil }
            let end = min(start + count, words.count)
            defer { start = end }
            return start..<end
        }
    }
}

struct IqraPhonemeAssessment: Decodable, Equatable {
    let phoneme: String?
    let accuracyScore: Double?
}

struct IqraWordAssessment: Decodable, Equatable, Identifiable {
    let word: String?
    let accuracyScore: Double?
    let errorType: String
    let phonemes: [IqraPhonemeAssessment]
    let contentConfirmed: Bool?

    var id: String {
        "\(word ?? "word")-\(accuracyScore ?? -1)-\(errorType)"
    }
}

struct IqraAssessmentResult: Decodable, Equatable {
    let sampleId: String
    let level: Int
    let referenceText: String
    let recognizedText: String
    let accuracyScore: Double?
    let fluencyScore: Double?
    let completenessScore: Double?
    let pronunciationScore: Double?
    let words: [IqraWordAssessment]
    let provider: String
    let locale: String
    let attemptId: String?
    let unitScore: Double?
    let passed: Bool?
    let decisionReason: String?
    let creditedSeconds: Double?
    let nextStage: String?

    var hasDetectedSpeech: Bool {
        let cleaned = recognizedText
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        return !cleaned.isEmpty && (pronunciationScore ?? 0) > 0
    }
}

struct IqraProgressItem: Decodable, Equatable, Identifiable {
    let sampleId: String
    let level: Int
    let sequence: Int
    let bestScore: Double
    let passed: Bool
    let attemptCount: Int

    var id: String { sampleId }
}

struct IqraProgressResponse: Decodable, Equatable {
    let nextStage: String
    let iqra3Completed: Bool
    let iqra6Completed: Bool
    let tarannumRecommended: Bool
    let items: [IqraProgressItem]
}

enum IqraFeature {
    static var isEnabled: Bool { KidsFeatureFlags.iqraEnabled }

    static let sampleLevels = IqraLevel.allCases

    static let samples: [IqraSample] = [
        IqraSample(
            id: "iqra-1-demo",
            level: .one,
            arabicText: "بَ  تَ  ثَ",
            instruction: "Kenal dan sebut bunyi huruf bersama baris atas.",
            title: "Pengenalan huruf",
            sequence: 1
        ),
        IqraSample(
            id: "iqra-3-unit-1",
            level: .three,
            arabicText: "شَهِدَ  لَعِبَ  عَلِمَ  رَضِيَ",
            instruction: "Baca rangkaian huruf dan perkataan dengan jelas.",
            title: "Perkataan 1",
            sequence: 1
        ),
        IqraSample(
            id: "iqra-3-unit-2",
            level: .three,
            arabicText: "فَعَلَا  فَاعِلٌ  كِتَابٌ  كَاتِبٌ",
            instruction: "Baca setiap perkataan dengan baris yang tepat.",
            title: "Perkataan 2",
            sequence: 2
        ),
        IqraSample(
            id: "iqra-3-unit-3",
            level: .three,
            arabicText: "جِهَادٌ  جَامِدٌ  غَفَّارٌ  غَافِرٌ",
            instruction: "Baca setiap perkataan dengan jelas dan lancar.",
            title: "Perkataan 3",
            sequence: 3
        ),
        IqraSample(
            id: "iqra-6-ayah-1",
            level: .six,
            arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
            instruction: "Baca ayat pertama dengan lancar.",
            title: "Al-Fatihah · Ayat 1",
            sequence: 1
        ),
        IqraSample(id: "iqra-6-ayah-2", level: .six, arabicText: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", instruction: "Baca ayat kedua dengan lengkap.", title: "Al-Fatihah · Ayat 2", sequence: 2),
        IqraSample(id: "iqra-6-ayah-3", level: .six, arabicText: "الرَّحْمَٰنِ الرَّحِيمِ", instruction: "Baca ayat ketiga dengan jelas.", title: "Al-Fatihah · Ayat 3", sequence: 3),
        IqraSample(id: "iqra-6-ayah-4", level: .six, arabicText: "مَالِكِ يَوْمِ الدِّينِ", instruction: "Baca ayat keempat dengan jelas.", title: "Al-Fatihah · Ayat 4", sequence: 4),
        IqraSample(id: "iqra-6-ayah-5", level: .six, arabicText: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", instruction: "Baca ayat kelima dengan lengkap.", title: "Al-Fatihah · Ayat 5", sequence: 5),
        IqraSample(id: "iqra-6-ayah-6", level: .six, arabicText: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", instruction: "Baca ayat keenam dengan jelas.", title: "Al-Fatihah · Ayat 6", sequence: 6),
        IqraSample(id: "iqra-6-ayah-7", level: .six, arabicText: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", instruction: "Lengkapkan surah dengan ayat ketujuh.", title: "Al-Fatihah · Ayat 7", sequence: 7),
    ]

    static func nextSample(after sample: IqraSample) -> IqraSample? {
        guard let index = samples.firstIndex(where: { $0.id == sample.id }) else { return nil }
        let nextIndex = samples.index(after: index)
        return nextIndex < samples.endIndex ? samples[nextIndex] : nil
    }
}
