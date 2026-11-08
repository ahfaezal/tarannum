import SwiftUI

struct KidsLearningHistoryDetailView: View {
    let item: KidsLearningHistoryItem

    private let teal = Color(red: 0.0, green: 0.48, blue: 0.40)
    private let emerald = Color(red: 0.0, green: 0.67, blue: 0.43)
    private let navy = Color(red: 0.04, green: 0.10, blue: 0.28)

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                scoreJourney
                unitHistory
                if let decision = item.agentDecision {
                    NavigationLink {
                        KidsAgentDecisionView(
                            decision: decision,
                            completedPackageTitle: item.packageTitle,
                            targetPackageTitle: nil
                        )
                    } label: {
                        Label("Lihat keputusan Pembimbing AI", systemImage: "sparkles")
                            .font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).tint(teal).controlSize(.large)
                }
                NavigationLink {
                    IqraHomeView()
                } label: {
                    Label("Latih Semula untuk Naikkan Markah", systemImage: "arrow.clockwise")
                        .font(.headline).frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).tint(emerald).controlSize(.large)
                Text("Latihan semula tidak menurunkan tahap aktif dan tidak mengubah keputusan agen asal. Markah terbaik akan kekal sebagai pencapaian.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(28)
        }
        .background(Color(red: 0.95, green: 1.0, blue: 0.98).ignoresSafeArea())
        .navigationTitle("Sejarah Pembelajaran")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 44)).foregroundStyle(emerald)
                .frame(width: 84, height: 84).background(Color.green.opacity(0.11), in: Circle())
            Text(item.packageTitle).font(.largeTitle.bold()).foregroundStyle(navy)
            Label("Pakej selesai", systemImage: "checkmark.seal.fill")
                .font(.headline).foregroundStyle(emerald)
        }
    }

    private var scoreJourney: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Perjalanan markah", systemImage: "chart.line.uptrend.xyaxis")
                .font(.title3.bold()).foregroundStyle(navy)
            HStack(spacing: 10) {
                scoreTile("PERTAMA", item.firstScore, .blue)
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                scoreTile("TERKINI", item.latestScore, .orange)
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                scoreTile("TERBAIK", item.bestScore, emerald)
            }
            Text("Jumlah \(item.attemptCount) percubaan sah direkodkan")
                .font(.caption).foregroundStyle(.secondary)
        }
        .historyPanel()
    }

    private func scoreTile(_ label: String, _ value: Double?, _ color: Color) -> some View {
        VStack(spacing: 5) {
            Text(label).font(.caption2.bold()).foregroundStyle(.secondary)
            Text(value.map { String(Int($0.rounded())) } ?? "—")
                .font(.title.bold()).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }

    private var unitHistory: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Keputusan setiap latihan", systemImage: "list.bullet.clipboard.fill")
                .font(.title3.bold()).foregroundStyle(navy)
            ForEach(item.units) { unit in
                HStack(spacing: 12) {
                    Text("\(unit.sequence)").font(.headline).foregroundStyle(.white)
                        .frame(width: 34, height: 34).background(emerald, in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text(unit.title).font(.headline).foregroundStyle(navy)
                        Text("\(unit.attemptCount) percubaan · terkini \(scoreText(unit.latestScore))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Terbaik").font(.caption2).foregroundStyle(.secondary)
                        Text(scoreText(unit.bestScore)).font(.headline).foregroundStyle(teal)
                    }
                }
                .padding(12).background(Color.green.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .historyPanel()
    }

    private func scoreText(_ value: Double?) -> String {
        value.map { String(Int($0.rounded())) } ?? "—"
    }
}

private extension View {
    func historyPanel() -> some View {
        padding(18)
            .background(.white, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.green.opacity(0.16)))
    }
}
