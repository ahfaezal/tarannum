import Foundation

enum KidsFeatureFlags {
    static let iqraEnabled = booleanValue(forInfoDictionaryKey: "KidsIqraEnabled")

    private static func booleanValue(forInfoDictionaryKey key: String) -> Bool {
        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? Bool {
            return value
        }

        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? NSNumber {
            return value.boolValue
        }

        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String {
            return ["1", "true", "yes", "on"].contains(value.lowercased())
        }

        return false
    }
}
