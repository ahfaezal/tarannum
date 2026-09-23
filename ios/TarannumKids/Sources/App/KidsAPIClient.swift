import Foundation

struct KidsAPIClient {
    private let baseURL = URL(string: "https://api.tarannum.ai")!

    func fetchDailyAccess() async throws -> DailyAccessState {
        var request = URLRequest(url: baseURL.appending(path: "/api/platform/kids/daily-access"))
        request.setValue("Bearer \(try accessToken())", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DailyAccessState.self, from: data)
    }

    private func accessToken() throws -> String {
        // Replace with Keychain-backed Tarannum.ai authentication in the next milestone.
        throw URLError(.userAuthenticationRequired)
    }
}
