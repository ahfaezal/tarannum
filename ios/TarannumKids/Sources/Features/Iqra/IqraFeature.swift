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

struct IqraSample: Identifiable, Equatable {
    let id: String
    let level: IqraLevel
    let arabicText: String
    let instruction: String
}

enum IqraFeature {
    static var isEnabled: Bool { KidsFeatureFlags.iqraEnabled }

    static let sampleLevels = IqraLevel.allCases
}
