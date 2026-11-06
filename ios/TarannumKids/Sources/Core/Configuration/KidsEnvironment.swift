import Foundation

enum KidsEnvironment {
    static let apiBaseURL: URL = {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "KidsAPIBaseURL") as? String,
            let url = URL(string: rawValue),
            let scheme = url.scheme,
            ["http", "https"].contains(scheme.lowercased()),
            url.host != nil
        else {
            preconditionFailure("KidsAPIBaseURL is missing or invalid in the app configuration.")
        }

        return url
    }()
}
