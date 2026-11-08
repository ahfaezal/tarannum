import SwiftUI

struct KidsPackageCompletionView: View {
    let packageTitle: String
    let decision: KidsAgentDecision?
    let targetPackageTitle: String?
    let onFinish: () -> Void

    @State private var showsAgentDecision = false

    private let emerald = Color(red: 0.0, green: 0.62, blue: 0.40)
    private let teal = Color(red: 0.0, green: 0.48, blue: 0.40)
    private let ink = Color(red: 0.04, green: 0.10, blue: 0.28)

    var body: some View {
        Group {
            if showsAgentDecision, let decision {
                KidsAgentDecisionView(
                    decision: decision,
                    completedPackageTitle: packageTitle,
                    targetPackageTitle: targetPackageTitle,
                    onContinue: onFinish
                )
            } else {
                summary
            }
        }
    }

    private var summary: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 52)).foregroundStyle(.white)
                    .frame(width: 104, height: 104).background(emerald, in: Circle())
                    .shadow(color: emerald.opacity(0.24), radius: 16, y: 8)

                VStack(spacing: 8) {
                    Text("Pakej Selesai")
                        .font(.system(size: 38, weight: .bold, design: .rounded)).foregroundStyle(ink)
                    Text(packageTitle).font(.title2.bold()).foregroundStyle(teal)
                    Text("Semua unit wajib telah diselesaikan dan bukti latihan telah direkodkan.")
                        .font(.headline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }

                HStack(spacing: 16) {
                    evidenceCard(icon: "checkmark.circle.fill", title: "Unit latihan", value: "Semua selesai")
                    evidenceCard(icon: "clock.badge.checkmark.fill", title: "Masa latihan", value: "Aktiviti sah direkod")
                    evidenceCard(icon: "chart.line.uptrend.xyaxis", title: "Kemajuan", value: "Bukti sedia dinilai")
                }

                VStack(spacing: 16) {
                    Image(systemName: "brain.head.profile.fill")
                        .font(.system(size: 46)).foregroundStyle(emerald)
                    Text("Pembimbing AI sedia menilai")
                        .font(.title.bold()).foregroundStyle(ink)
                    Text("Pembimbing AI akan membaca keputusan semua unit, mengenal pasti kekuatan dan kelemahan, kemudian mencadangkan laluan latihan seterusnya.")
                        .font(.title3).foregroundStyle(.secondary).multilineTextAlignment(.center)

                    if decision != nil {
                        Button {
                            showsAgentDecision = true
                        } label: {
                            Label("Lihat Keputusan Pembimbing AI", systemImage: "sparkles")
                                .font(.title3.bold()).frame(maxWidth: 560).padding(.vertical, 17)
                        }
                        .buttonStyle(.plain).foregroundStyle(.white)
                        .background(
                            LinearGradient(colors: [emerald, teal], startPoint: .leading, endPoint: .trailing),
                            in: RoundedRectangle(cornerRadius: 20)
                        )
                    } else {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Sedang menyediakan keputusan agen…").font(.headline).foregroundStyle(teal)
                        }
                        .padding(.vertical, 14)
                    }
                }
                .padding(26).frame(maxWidth: .infinity)
                .background(.white, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(emerald.opacity(0.22)))

                Text("Markah asal tidak diubah oleh agen. Semua sebab keputusan boleh disemak oleh ibu bapa atau guru.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(36).frame(maxWidth: 1000).frame(maxWidth: .infinity)
        }
        .background(
            LinearGradient(colors: [Color(red: 0.93, green: 1.0, blue: 0.97), .white], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
    }

    private func evidenceCard(icon: String, title: String, value: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.title).foregroundStyle(emerald)
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.headline).foregroundStyle(ink).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 126).padding(14)
        .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(emerald.opacity(0.18)))
    }
}
