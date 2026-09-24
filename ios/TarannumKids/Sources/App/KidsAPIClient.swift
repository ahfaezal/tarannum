import Foundation
import Security

struct KidsAuthSession: Codable, Equatable {
    let accessToken: String
    let email: String
    let fullName: String?
}

enum KidsAPIError: LocalizedError {
    case invalidCredentials
    case accountNotReady(String)
    case studentAccountRequired
    case sessionExpired
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "E-mel atau kata laluan tidak tepat."
        case .accountNotReady(let message): return message
        case .studentAccountRequired: return "Tarannum Kids memerlukan akaun pelajar Tarannum.ai."
        case .sessionExpired: return "Sesi telah tamat. Sila log masuk semula."
        case .server(let message): return message
        }
    }
}

struct KidsAPIClient {
    private let baseURL = URL(string: "https://api.tarannum.ai")!
    var savedSession: KidsAuthSession? { KidsKeychain.loadSession() }

    func login(email: String, password: String) async throws -> KidsAuthSession {
        var request = URLRequest(url: baseURL.appending(path: "/api/auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20
        request.httpBody = try JSONEncoder().encode(LoginRequest(email: email, password: password))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard http.statusCode == 200 else { throw apiError(status: http.statusCode, data: data) }
        let result = try JSONDecoder().decode(LoginResponse.self, from: data)
        guard result.role.lowercased() == "student" else { throw KidsAPIError.studentAccountRequired }
        let session = KidsAuthSession(accessToken: result.accessToken, email: result.email, fullName: result.fullName)
        try KidsKeychain.save(session)
        return session
    }

    func logout() { KidsKeychain.deleteSession() }

    func fetchDailyAccess() async throws -> DailyAccessState {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/platform/kids/daily-access"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 401 {
            KidsKeychain.deleteSession()
            throw KidsAPIError.sessionExpired
        }
        guard http.statusCode == 200 else { throw apiError(status: http.statusCode, data: data) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DailyAccessState.self, from: data)
    }

    private func apiError(status: Int, data: Data) -> Error {
        let detail = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.detail
        switch status {
        case 401: return KidsAPIError.invalidCredentials
        case 403: return KidsAPIError.accountNotReady(detail ?? "Akaun belum dibenarkan menggunakan fungsi ini.")
        default: return KidsAPIError.server(detail ?? "Sistem Tarannum.ai tidak dapat dihubungi. Cuba sebentar lagi.")
        }
    }
}

private struct LoginRequest: Encodable { let email: String; let password: String }

private struct LoginResponse: Decodable {
    let accessToken: String
    let email: String
    let role: String
    let fullName: String?
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case email, role
        case fullName = "full_name"
    }
}

private struct ErrorResponse: Decodable { let detail: String }

private enum KidsKeychain {
    private static let service = "ai.tarannum.kids"
    private static let account = "tarannum-session"

    static func save(_ session: KidsAuthSession) throws {
        let data = try JSONEncoder().encode(session)
        deleteSession()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data,
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            throw KidsAPIError.server("Sesi tidak dapat disimpan dengan selamat.")
        }
    }

    static func loadSession() -> KidsAuthSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(KidsAuthSession.self, from: data)
    }

    static func deleteSession() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
