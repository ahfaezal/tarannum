import Foundation
import Security

struct KidsAuthSession: Codable, Equatable {
    let accessToken: String
    let email: String
    let fullName: String?
}

struct PracticeReference: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let maqam: String?
    let duration: Double?
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
    private let baseURL = URL(string: "https://tarannum-production.up.railway.app")!
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

    func fetchPracticeReferences() async throws -> [PracticeReference] {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/references"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(ReferenceListResponse.self, from: data).references
    }

    func sendPracticeEvent(
        type: String,
        referenceID: String,
        duration: Double? = nil
    ) async throws {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/platform/student/activity-events"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        request.httpBody = try JSONEncoder().encode(ActivityEvent(
            eventType: type,
            referenceID: referenceID,
            sessionID: nil,
            durationSeconds: duration,
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }

    func submitRecording(
        fileURL: URL,
        referenceID: String,
        sessionID: String
    ) async throws {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        let boundary = "TarannumKids-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appending(path: "/api/scoring/jobs"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 90

        var body = Data()
        body.appendFormField("reference_id", value: referenceID, boundary: boundary)
        body.appendFormField("client_session_id", value: sessionID, boundary: boundary)
        body.appendFormField("recording_mode", value: "R1", boundary: boundary)
        body.appendFormField("scoring_version", value: "V2.3", boundary: boundary)
        body.appendFormField("recording_attempt", value: "1", boundary: boundary)
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"user_audio\"; filename=\"practice.m4a\"\r\n")
        body.append("Content-Type: audio/mp4\r\n\r\n")
        body.append(try Data(contentsOf: fileURL))
        body.append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 202 else {
            let detail = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.detail
            throw KidsAPIError.server(detail ?? "Rakaman tidak dapat dihantar. Cuba semula.")
        }
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

private struct ReferenceListResponse: Decodable { let references: [PracticeReference] }

private struct ActivityEvent: Encodable {
    let eventType: String
    let referenceID: String
    let sessionID: String?
    let durationSeconds: Double?
    let occurredAt: String

    enum CodingKeys: String, CodingKey {
        case eventType = "event_type"
        case referenceID = "reference_id"
        case sessionID = "session_id"
        case durationSeconds = "duration_seconds"
        case occurredAt = "occurred_at"
    }
}

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

private extension Data {
    mutating func append(_ string: String) {
        append(string.data(using: .utf8)!)
    }

    mutating func appendFormField(_ name: String, value: String, boundary: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        append("\(value)\r\n")
    }
}
