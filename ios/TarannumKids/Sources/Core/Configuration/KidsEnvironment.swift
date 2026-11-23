import Foundation

enum KidsEnvironment {
    static let authBaseURL: URL = configuredURL(
        key: "KidsAuthBaseURL",
        fallbackKey: "KidsAPIBaseURL"
    )

    static let apiBaseURL: URL = {
        configuredURL(key: "KidsAPIBaseURL")
    }()

    private static func configuredURL(key: String, fallbackKey: String? = nil) -> URL {
        let rawValue = (Bundle.main.object(forInfoDictionaryKey: key) as? String)
            ?? fallbackKey.flatMap { Bundle.main.object(forInfoDictionaryKey: $0) as? String }
        guard
            let rawValue,
            let url = URL(string: rawValue),
            let scheme = url.scheme,
            ["http", "https"].contains(scheme.lowercased()),
            url.host != nil
        else {
            preconditionFailure("\(key) is missing or invalid in the app configuration.")
        }

        return url
    }
}
