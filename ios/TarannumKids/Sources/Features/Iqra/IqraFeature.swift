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

    var id: String {
        "\(word ?? "word")-\(accuracyScore ?? -1)-\(errorType)"
    }
}

struct IqraAssessmentResult: Decodable, Equatable {
    let sampleID: String
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
}

enum IqraFeature {
    static var isEnabled: Bool { KidsFeatureFlags.iqraEnabled }

    static let sampleLevels = IqraLevel.allCases

    static let samples: [IqraSample] = [
        IqraSample(
            id: "iqra-1-demo",
            level: .one,
            arabicText: "بَ  تَ  ثَ",
            instruction: "Kenal dan sebut bunyi huruf bersama baris atas."
        ),
        IqraSample(
            id: "iqra-3-demo",
            level: .three,
            arabicText: "كَتَبَ  ذَهَبَ  فَتَحَ",
            instruction: "Baca rangkaian huruf dan perkataan dengan jelas."
        ),
        IqraSample(
            id: "iqra-6-demo",
            level: .six,
            arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
            instruction: "Baca frasa dengan lancar serta perhatikan mad dan waqaf."
        ),
    ]
}
