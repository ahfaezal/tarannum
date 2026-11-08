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
    let textSegments: [PracticeTextSegment]?

    enum CodingKeys: String, CodingKey {
        case id, title, maqam, duration
        case textSegments = "text_segments"
    }
}

struct PracticeTextSegment: Decodable, Hashable {
    let text: String
    let start: Double
    let end: Double
}

struct ScoringResultSummary: Equatable {
    let score: Double
    let label: String?
    let message: String?
    let focusAreas: [String]
    let referencePitch: [ScoringPitchPoint]
    let studentPitch: [ScoringPitchPoint]
}

struct ScoringPitchPoint: Equatable {
    let time: Double
    let value: Double
}

struct ScoringJobUpdate {
    let status: String
    let stage: String?
    let queuePosition: Int?
    let result: ScoringResultSummary?
    let error: String?
}

struct KidsLearningUnitResult: Decodable, Equatable {
    let status: String
    let passed: Bool
    let validAttemptCount: Int
    let creditedSeconds: Double
}

struct KidsLearningUnit: Decodable, Identifiable, Equatable {
    let id: String
    let unitKey: String
    let sequence: Int
    let title: String
    let instruction: String?
    let activityType: String
    let referenceId: String?
    let sampleId: String?
    let required: Bool
    let result: KidsLearningUnitResult?
}

struct KidsLearningRun: Decodable, Identifiable, Equatable {
    let id: String
    let assignmentId: String
    let packageId: String
    let packageKey: String
    let packageVersion: Int
    let packageTitle: String
    let status: String
    let validActivitySeconds: Double
    let units: [KidsLearningUnit]
    let agentDecision: KidsAgentDecision?
}

struct KidsAgentLearningPlan: Decodable, Equatable {
    let id: String
    let targetPackageId: String
    let action: String
    let status: String
    let rationale: String
}

struct KidsAgentUnitEvidence: Decodable, Equatable {
    let unitKey: String
    let score: Double?
    let passed: Bool
    let validAttemptCount: Int
}

struct KidsAgentEvidenceSummary: Decodable, Equatable {
    let averageScore: Double?
    let passRate: Double?
    let failedUnitCount: Int?
    let validActivitySeconds: Double?
    let units: [KidsAgentUnitEvidence]
}

struct KidsAgentPolicySummary: Decodable, Equatable {
    let minimumConfidence: Double?
    let advanceMinimumScore: Double?
    let remedialBelowScore: Double?
}

struct KidsAgentDecision: Decodable, Identifiable, Equatable {
    let id: String
    let runId: String
    let packageId: String
    let transitionId: String?
    let outcome: String
    let confidence: Double
    let strengths: [String]
    let weaknesses: [String]
    let explanation: String
    let requiresHumanReview: Bool
    let reviewStatus: String
    let provider: String
    let policyVersion: String
    let evidenceSummary: KidsAgentEvidenceSummary?
    let policySummary: KidsAgentPolicySummary?
    let plan: KidsAgentLearningPlan
}

struct KidsLearningPackage: Decodable, Identifiable, Equatable {
    let id: String
    let packageKey: String
    let version: Int
    let title: String
    let description: String?
    let packageType: String
    let level: String?
    let units: [KidsLearningUnit]
}

struct KidsLearningAssignment: Decodable, Identifiable, Equatable {
    let id: String
    let status: String
    let reason: String?
    let package: KidsLearningPackage
    let activeRun: KidsLearningRun?
}

struct KidsPackageEvidenceLink: Equatable {
    let assignmentID: String
    let runID: String
    let unitID: String
    let packageTitle: String
    let unitPassed: Bool
    let packageCompleted: Bool
    let agentDecision: KidsAgentDecision?
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
    private let baseURL = KidsEnvironment.apiBaseURL
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

    func downloadReferenceAudio(referenceID: String) async throws -> URL {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/references/\(referenceID)/audio"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw KidsAPIError.server("Audio contoh tidak dapat dimuatkan.")
        }
        let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? ""
        let fileExtension: String
        if contentType.contains("wav") { fileExtension = "wav" }
        else if contentType.contains("mp4") || contentType.contains("m4a") { fileExtension = "m4a" }
        else if contentType.contains("ogg") { fileExtension = "ogg" }
        else { fileExtension = "mp3" }
        let fileURL = FileManager.default.temporaryDirectory
            .appending(path: "tarannum-reference-\(referenceID).\(fileExtension)")
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    func fetchReferencePitch(referenceID: String) async throws -> [ScoringPitchPoint] {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/references/\(referenceID)/pitch"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw KidsAPIError.server("Graf nada qari tidak dapat dimuatkan.")
        }
        if http.statusCode == 404 {
            return try await extractReferencePitch(referenceID: referenceID, session: session)
        }
        guard http.statusCode == 200,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw apiError(status: http.statusCode, data: data)
        }
        return Self.scoringPitchPoints(from: payload["reference"])
    }

    private func extractReferencePitch(referenceID: String, session: KidsAuthSession) async throws -> [ScoringPitchPoint] {
        let boundary = "TarannumKids-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appending(path: "/api/extract-pitch"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120
        request.httpBody = "--\(boundary)\r\nContent-Disposition: form-data; name=\"reference_id\"\r\n\r\n\(referenceID)\r\n--\(boundary)--\r\n".data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw KidsAPIError.server("Graf nada qari belum tersedia.")
        }
        return Self.scoringPitchPoints(from: payload["reference"])
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
    ) async throws -> String {
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
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let jobID = payload["job_id"] as? String else {
            throw KidsAPIError.server("Sistem pemarkahan tidak memulangkan ID kerja.")
        }
        return jobID
    }

    func fetchScoringJob(jobID: String) async throws -> ScoringJobUpdate {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/scoring/jobs/\(jobID)"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw KidsAPIError.server("Status pemarkahan tidak dapat disemak.")
        }
        return ScoringJobUpdate(
            status: payload["status"] as? String ?? "queued",
            stage: payload["stage"] as? String,
            queuePosition: payload["queue_position"] as? Int,
            result: Self.scoringSummary(from: payload["result"]),
            error: payload["error"] as? String
        )
    }

    func assessIqra(sampleID: String, fileURL: URL) async throws -> IqraAssessmentResult {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        let boundary = "TarannumKids-Iqra-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appending(path: "/api/kids/iqra/assess"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 90

        var body = Data()
        body.appendFormField("sample_id", value: sampleID, boundary: boundary)
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"iqra.m4a\"\r\n")
        body.append("Content-Type: audio/mp4\r\n\r\n")
        body.append(try Data(contentsOf: fileURL))
        body.append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if http.statusCode == 401 {
            KidsKeychain.deleteSession()
            throw KidsAPIError.sessionExpired
        }
        guard http.statusCode == 200 else {
            let detail = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.detail
            throw KidsAPIError.server(detail ?? "Penilaian IQRA tidak dapat diselesaikan.")
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(IqraAssessmentResult.self, from: data)
    }

    func fetchIqraProgress() async throws -> IqraProgressResponse {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: "/api/kids/iqra/progress"))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 401 {
            KidsKeychain.deleteSession()
            throw KidsAPIError.sessionExpired
        }
        guard http.statusCode == 200 else {
            throw KidsAPIError.server("Kemajuan IQRA tidak dapat dimuatkan.")
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(IqraProgressResponse.self, from: data)
    }

    func fetchActiveLearningAssignments() async throws -> [KidsLearningAssignment] {
        let (data, response) = try await authorizedRequest(path: "/api/kids/learning/assignments/active")
        guard response.statusCode == 200 else { throw apiError(status: response.statusCode, data: data) }
        return try learningDecoder.decode([KidsLearningAssignment].self, from: data)
    }

    func fetchLatestAgentDecision() async throws -> KidsAgentDecision? {
        let (data, response) = try await authorizedRequest(path: "/api/kids/learning/agent-decisions/latest")
        if response.statusCode == 404 { return nil }
        guard response.statusCode == 200 else { throw apiError(status: response.statusCode, data: data) }
        return try learningDecoder.decode(KidsAgentDecision.self, from: data)
    }

    func linkIqraAttemptToAssignedPackage(
        sampleID: String,
        attemptID: String,
        creditedSeconds: Double
    ) async throws -> KidsPackageEvidenceLink? {
        let assignments = try await fetchActiveLearningAssignments()
        guard let assignment = assignments.first(where: {
            $0.package.units.contains(where: { $0.sampleId == sampleID })
        }), let unit = assignment.package.units.first(where: { $0.sampleId == sampleID }) else {
            return nil
        }

        let run: KidsLearningRun
        if let activeRun = assignment.activeRun {
            run = activeRun
        } else {
            let (data, response) = try await authorizedRequest(
                path: "/api/kids/learning/assignments/\(assignment.id)/runs",
                method: "POST"
            )
            guard response.statusCode == 200 else { throw apiError(status: response.statusCode, data: data) }
            run = try learningDecoder.decode(KidsLearningRun.self, from: data)
        }

        let body = try JSONSerialization.data(withJSONObject: [
            "evidence": ["evidence_type": "iqra_attempt", "evidence_id": attemptID],
            "client_activity_seconds": max(0, creditedSeconds),
        ])
        let (unitData, unitResponse) = try await authorizedRequest(
            path: "/api/kids/learning/runs/\(run.id)/units/\(unit.id)",
            method: "PUT",
            body: body
        )
        guard unitResponse.statusCode == 200 else {
            throw apiError(status: unitResponse.statusCode, data: unitData)
        }
        let recorded = try learningDecoder.decode(KidsLearningUnit.self, from: unitData)

        var packageCompleted = false
        var agentDecision: KidsAgentDecision?
        if recorded.result?.passed == true {
            let (completionData, completionResponse) = try await authorizedRequest(
                path: "/api/kids/learning/runs/\(run.id)/complete",
                method: "POST"
            )
            guard completionResponse.statusCode == 200 else {
                throw apiError(status: completionResponse.statusCode, data: completionData)
            }
            let completedRun = try learningDecoder.decode(KidsLearningRun.self, from: completionData)
            packageCompleted = completedRun.status == "completed"
            agentDecision = completedRun.agentDecision
        }
        return KidsPackageEvidenceLink(
            assignmentID: assignment.id,
            runID: run.id,
            unitID: unit.id,
            packageTitle: assignment.package.title,
            unitPassed: recorded.result?.passed == true,
            packageCompleted: packageCompleted,
            agentDecision: agentDecision
        )
    }

    func linkScoringJobToAssignedPackage(
        referenceID: String,
        jobID: String,
        creditedSeconds: Double
    ) async throws -> KidsPackageEvidenceLink? {
        let assignments = try await fetchActiveLearningAssignments()
        guard let assignment = assignments.first(where: {
            $0.package.units.contains(where: {
                $0.activityType == "tarannum_record" && $0.referenceId == referenceID
            })
        }), let unit = assignment.package.units.first(where: {
            $0.activityType == "tarannum_record" && $0.referenceId == referenceID
        }) else {
            return nil
        }

        let run: KidsLearningRun
        if let activeRun = assignment.activeRun {
            run = activeRun
        } else {
            let (data, response) = try await authorizedRequest(
                path: "/api/kids/learning/assignments/\(assignment.id)/runs",
                method: "POST"
            )
            guard response.statusCode == 200 else { throw apiError(status: response.statusCode, data: data) }
            run = try learningDecoder.decode(KidsLearningRun.self, from: data)
        }

        let body = try JSONSerialization.data(withJSONObject: [
            "evidence": ["evidence_type": "scoring_job", "evidence_id": jobID],
            "client_activity_seconds": max(0, creditedSeconds),
        ])
        let (unitData, unitResponse) = try await authorizedRequest(
            path: "/api/kids/learning/runs/\(run.id)/units/\(unit.id)",
            method: "PUT",
            body: body
        )
        guard unitResponse.statusCode == 200 else {
            throw apiError(status: unitResponse.statusCode, data: unitData)
        }
        let recorded = try learningDecoder.decode(KidsLearningUnit.self, from: unitData)

        var packageCompleted = false
        var agentDecision: KidsAgentDecision?
        if recorded.result?.passed == true {
            let (completionData, completionResponse) = try await authorizedRequest(
                path: "/api/kids/learning/runs/\(run.id)/complete",
                method: "POST"
            )
            guard completionResponse.statusCode == 200 else {
                throw apiError(status: completionResponse.statusCode, data: completionData)
            }
            let completedRun = try learningDecoder.decode(KidsLearningRun.self, from: completionData)
            packageCompleted = completedRun.status == "completed"
            agentDecision = completedRun.agentDecision
        }
        return KidsPackageEvidenceLink(
            assignmentID: assignment.id,
            runID: run.id,
            unitID: unit.id,
            packageTitle: assignment.package.title,
            unitPassed: recorded.result?.passed == true,
            packageCompleted: packageCompleted,
            agentDecision: agentDecision
        )
    }

    private var learningDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private func authorizedRequest(
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        guard let session = savedSession else { throw KidsAPIError.sessionExpired }
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.httpBody = body
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 401 {
            KidsKeychain.deleteSession()
            throw KidsAPIError.sessionExpired
        }
        return (data, http)
    }

    private static func scoringSummary(from value: Any?) -> ScoringResultSummary? {
        guard let result = value as? [String: Any] else { return nil }
        let rawScore = result["normalizedScore"] ?? result["score"]
        guard let score = (rawScore as? NSNumber)?.doubleValue else { return nil }
        let feedback = result["feedback"]
        let feedbackObject = feedback as? [String: Any]
        let label = feedbackObject?["label"] as? String
        let message = feedbackObject?["message"] as? String ?? feedback as? String
        let focusAreas = feedbackObject?["focus_areas"] as? [String] ?? []
        let pitchData = result["pitchData"] as? [String: Any]
        return ScoringResultSummary(
            score: min(100, max(0, score)),
            label: label,
            message: message,
            focusAreas: focusAreas,
            referencePitch: scoringPitchPoints(from: pitchData?["reference"]),
            studentPitch: scoringPitchPoints(from: pitchData?["student"])
        )
    }

    private static func scoringPitchPoints(from value: Any?) -> [ScoringPitchPoint] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let time = (row["time"] as? NSNumber)?.doubleValue else { return nil }
            let pitch = (row["midi"] as? NSNumber)?.doubleValue
                ?? (row["f_hz"] as? NSNumber)?.doubleValue
                ?? (row["pitch"] as? NSNumber)?.doubleValue
            guard let pitch, pitch.isFinite, pitch > 0 else { return nil }
            return ScoringPitchPoint(time: time, value: pitch)
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
