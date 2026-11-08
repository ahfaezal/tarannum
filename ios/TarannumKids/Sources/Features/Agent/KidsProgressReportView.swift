import SwiftUI

struct KidsProgressReportView: View {
    let studentName: String
    let creditedSeconds: Int
    let requiredSeconds: Int
    let assignments: [KidsLearningAssignment]
    let latestDecision: KidsAgentDecision?

    private let emerald = Color(red: 0.0, green: 0.62, blue: 0.40)
    private let teal = Color(red: 0.0, green: 0.48, blue: 0.40)
    private let ink = Color(red: 0.04, green: 0.10, blue: 0.28)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                HStack(spacing: 15) {
                    metric(icon: "clock.fill", value: durationText, label: "Aktiviti sah")
                    metric(icon: "books.vertical.fill", value: "\(completedPackages)/\(assignments.count)", label: "Pakej selesai")
                    metric(icon: "checkmark.seal.fill", value: "\(completedUnits)/\(totalUnits)", label: "Unit dikuasai")
                }
                packageProgress
                if let latestDecision { agentSummary(latestDecision) }
                transparencyNotice
            }
            .padding(34).frame(maxWidth: 1050).frame(maxWidth: .infinity)
        }
        .navigationTitle("Laporan Kemajuan")
        .background(LinearGradient(colors: [Color(red: 0.93, green: 1.0, blue: 0.97), .white], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
    }

    private var header: some View {
        HStack(spacing: 18) {
            Image(systemName: "person.crop.circle.fill").font(.system(size: 58)).foregroundStyle(teal)
            VStack(alignment: .leading, spacing: 4) {
                Text("Laporan Pembelajaran").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(ink)
                Text(studentName).font(.title2.bold()).foregroundStyle(teal)
                Text("Ringkasan untuk ibu bapa dan guru").font(.headline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(24).background(.white, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(emerald.opacity(0.20)))
    }

    private func metric(icon: String, value: String, label: String) -> some View {
        VStack(spacing: 9) {
            Image(systemName: icon).font(.title2).foregroundStyle(emerald)
            Text(value).font(.title2.bold()).foregroundStyle(ink)
            Text(label).font(.caption.bold()).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 125).padding(12)
        .background(.white, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(emerald.opacity(0.18)))
    }

    private var packageProgress: some View {
        VStack(alignment: .leading, spacing: 15) {
            Label("Kemajuan pakej", systemImage: "list.bullet.clipboard.fill").font(.title2.bold()).foregroundStyle(ink)
            if assignments.isEmpty {
                Text("Belum ada pakej aktif.").foregroundStyle(.secondary)
            } else {
                ForEach(assignments) { assignment in
                    let units = assignment.activeRun?.units ?? assignment.package.units
                    let passed = units.filter { $0.result?.passed == true }.count
                    HStack(spacing: 14) {
                        Image(systemName: passed == units.count && !units.isEmpty ? "checkmark.circle.fill" : "circle.dotted")
                            .font(.title2).foregroundStyle(passed == units.count && !units.isEmpty ? emerald : .orange)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(assignment.package.title).font(.headline).foregroundStyle(ink)
                            Text("\(passed) daripada \(units.count) unit selesai").font(.subheadline).foregroundStyle(.secondary)
                            ProgressView(value: Double(passed), total: Double(max(1, units.count))).tint(emerald)
                        }
                    }
                    .padding(15).background(Color.green.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        .padding(22).background(.white, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(emerald.opacity(0.18)))
    }

    private func agentSummary(_ decision: KidsAgentDecision) -> some View {
        NavigationLink {
            KidsAgentDecisionView(decision: decision, completedPackageTitle: "Pakej latihan selesai", targetPackageTitle: targetTitle(decision))
        } label: {
            HStack(alignment: .top, spacing: 16) {
                Image(systemName: "sparkles").font(.title.bold()).foregroundStyle(emerald)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Keputusan terkini Pembimbing AI").font(.title3.bold()).foregroundStyle(ink)
                    Text(decision.explanation).font(.subheadline).foregroundStyle(.secondary)
                    Text("Keyakinan bukti \(Int((decision.confidence * 100).rounded()))% · Lihat sebab dan jejak audit")
                        .font(.caption.bold()).foregroundStyle(teal)
                }
                Spacer(); Image(systemName: "chevron.right.circle.fill").font(.title2).foregroundStyle(emerald)
            }
            .padding(22).background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(emerald.opacity(0.22)))
        }.buttonStyle(.plain)
    }

    private var transparencyNotice: some View {
        Label("Agen tidak mengubah markah asal. Ibu bapa atau guru boleh menyemak sebab, bukti dan status semakan setiap keputusan.", systemImage: "checkmark.shield.fill")
            .font(.subheadline).foregroundStyle(ink).padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
    }

    private var totalUnits: Int { assignments.reduce(0) { $0 + ($1.activeRun?.units ?? $1.package.units).count } }
    private var completedUnits: Int { assignments.reduce(0) { $0 + ($1.activeRun?.units ?? $1.package.units).filter { $0.result?.passed == true }.count } }
    private var completedPackages: Int { assignments.filter { assignment in
        let units = assignment.activeRun?.units ?? assignment.package.units
        return !units.isEmpty && units.allSatisfy { $0.result?.passed == true }
    }.count }
    private var durationText: String { "\(creditedSeconds / 60) / \(max(1, requiredSeconds / 60)) min" }
    private func targetTitle(_ decision: KidsAgentDecision) -> String? { assignments.first { $0.package.id == decision.plan.targetPackageId }?.package.title }
}
