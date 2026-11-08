import SwiftUI

struct KidsAgentDecisionView: View {
    let decision: KidsAgentDecision
    let completedPackageTitle: String
    let targetPackageTitle: String?
    var onContinue: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    private let emerald = Color(red: 0.0, green: 0.62, blue: 0.40)
    private let teal = Color(red: 0.0, green: 0.48, blue: 0.40)
    private let ink = Color(red: 0.04, green: 0.10, blue: 0.28)

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "sparkles")
                    .font(.system(size: 42, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 88, height: 88)
                    .background(emerald, in: Circle())
                    .shadow(color: emerald.opacity(0.24), radius: 16, y: 8)

                VStack(spacing: 8) {
                    Text("Pembimbing AI selesai menilai")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(ink)
                    Text(completedPackageTitle).font(.title3.bold()).foregroundStyle(teal)
                    Text("Keputusan dibuat selepas semua latihan dalam pakej disemak.")
                        .font(.headline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }

                HStack(spacing: 16) {
                    summaryCard(icon: "checkmark.seal.fill", title: "Pakej lengkap", value: "Semua unit selesai")
                    summaryCard(icon: "brain.head.profile", title: "Keyakinan bukti", value: "\(Int((decision.confidence * 100).rounded()))%")
                    summaryCard(icon: "arrow.up.right.circle.fill", title: "Keputusan agen", value: outcomeTitle)
                }

                VStack(alignment: .leading, spacing: 16) {
                    Label("Cadangan Pembimbing AI", systemImage: "lightbulb.max.fill")
                        .font(.title2.bold()).foregroundStyle(ink)
                    Text(decision.explanation).font(.title3).foregroundStyle(.secondary)
                    Divider()
                    HStack(alignment: .top, spacing: 14) {
                        Image(systemName: "flag.checkered").font(.title2).foregroundStyle(emerald)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Latihan seterusnya").font(.caption.bold()).foregroundStyle(.secondary)
                            Text(targetPackageTitle ?? fallbackTargetTitle).font(.title2.bold()).foregroundStyle(ink)
                        }
                    }
                    if decision.requiresHumanReview {
                        Label("Cadangan ini perlu disahkan oleh ibu bapa atau guru.", systemImage: "person.badge.shield.checkmark")
                            .font(.headline).foregroundStyle(.orange)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(emerald.opacity(0.25)))

                HStack(alignment: .top, spacing: 18) {
                    evidenceList(
                        title: "Kekuatan dikenal pasti",
                        icon: "hand.thumbsup.fill",
                        color: emerald,
                        items: decision.strengths,
                        emptyText: "Semua unit wajib telah diselesaikan."
                    )
                    evidenceList(
                        title: "Perlu dikukuhkan",
                        icon: "scope",
                        color: .orange,
                        items: decision.weaknesses,
                        emptyText: "Tiada kelemahan utama dikesan."
                    )
                }

                VStack(alignment: .leading, spacing: 15) {
                    Label("Jejak keputusan agen", systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.title2.bold()).foregroundStyle(ink)
                    decisionStep(number: "1", title: "Bukti dikumpulkan", detail: "Markah, unit gagal/lulus, percubaan dan masa aktiviti sah.")
                    decisionStep(number: "2", title: "Polisi dinilai", detail: decision.provider + " · Polisi " + decision.policyVersion)
                    decisionStep(number: "3", title: "Pelan latihan dicipta", detail: decision.plan.rationale)
                    Divider()
                    Label(reviewLabel, systemImage: decision.requiresHumanReview ? "person.badge.shield.checkmark.fill" : "checkmark.shield.fill")
                        .font(.headline).foregroundStyle(decision.requiresHumanReview ? .orange : teal)
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(teal.opacity(0.20)))

                Button {
                    if let onContinue { onContinue() } else { dismiss() }
                } label: {
                    Label(continueTitle, systemImage: "arrow.right.circle.fill")
                        .font(.title3.bold()).frame(maxWidth: 520).padding(.vertical, 17)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(LinearGradient(colors: [emerald, teal], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 20))

                Text("Markah asal tidak diubah oleh agen. Ibu bapa dan guru boleh menyemak sebab keputusan ini.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(36).frame(maxWidth: 1000).frame(maxWidth: .infinity)
        }
        .background(LinearGradient(colors: [Color(red: 0.93, green: 1.0, blue: 0.97), .white], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
    }

    private func evidenceList(title: String, icon: String, color: Color, items: [String], emptyText: String) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Label(title, systemImage: icon).font(.headline).foregroundStyle(color)
            ForEach(items.isEmpty ? [emptyText] : items, id: \.self) { item in
                Label(item, systemImage: items.isEmpty ? "checkmark" : "circle.fill")
                    .font(.subheadline).foregroundStyle(ink)
            }
        }
        .padding(20).frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .background(color.opacity(0.07), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(color.opacity(0.20)))
    }

    private func decisionStep(number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 13) {
            Text(number).font(.caption.bold()).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(teal, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(ink)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private var reviewLabel: String {
        if decision.requiresHumanReview { return "Menunggu pengesahan ibu bapa atau guru" }
        return decision.reviewStatus == "approved" ? "Pelan telah disahkan" : "Autonomi terkawal · Semakan manusia tersedia"
    }

    private func summaryCard(icon: String, title: String, value: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.title).foregroundStyle(emerald)
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.headline).foregroundStyle(ink).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 132).padding(14)
        .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(emerald.opacity(0.18)))
    }

    private var outcomeTitle: String {
        ["advance": "Naik tahap", "retain": "Kekal & kukuhkan", "remedial": "Pakej pemulihan", "foundation": "Kembali ke asas", "human_review": "Semakan diperlukan"][decision.outcome] ?? "Pelan baharu"
    }

    private var fallbackTargetTitle: String {
        decision.outcome == "advance" ? "Tahap pembelajaran seterusnya" : "Pakej latihan yang dicadangkan"
    }

    private var continueTitle: String {
        targetPackageTitle.map { "Teruskan ke \($0)" } ?? "Lihat latihan seterusnya"
    }
}
