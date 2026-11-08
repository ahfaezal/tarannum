import SwiftUI

struct KidsActivePackageView: View {
    let assignment: KidsLearningAssignment

    private let emerald = Color(red: 0.0, green: 0.62, blue: 0.40)
    private let teal = Color(red: 0.0, green: 0.48, blue: 0.40)
    private let ink = Color(red: 0.04, green: 0.10, blue: 0.28)

    private var units: [KidsLearningUnit] {
        (assignment.activeRun?.units ?? assignment.package.units).sorted { $0.sequence < $1.sequence }
    }

    private var completedCount: Int {
        units.filter { $0.result?.passed == true }.count
    }

    private var currentUnitID: String? {
        units.first { $0.result?.passed != true }?.id
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                packageHeader

                HStack(spacing: 14) {
                    ForEach(units) { unit in
                        unitCard(unit)
                    }
                }

                NavigationLink {
                    IqraHomeView()
                } label: {
                    Label(completedCount == units.count ? "Semak Latihan" : "Mulakan Latihan", systemImage: "play.fill")
                        .font(.title3.bold()).frame(maxWidth: .infinity).padding(.vertical, 16)
                }
                .buttonStyle(.plain).foregroundStyle(.white)
                .background(
                    LinearGradient(colors: [emerald, teal], startPoint: .leading, endPoint: .trailing),
                    in: RoundedRectangle(cornerRadius: 20)
                )

                Label(
                    "Pembimbing AI akan menilai selepas semua unit wajib dalam pakej ini selesai.",
                    systemImage: "sparkles"
                )
                .font(.headline).foregroundStyle(teal)
                .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                .background(emerald.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(32).frame(maxWidth: 1080).frame(maxWidth: .infinity)
        }
        .background(
            LinearGradient(colors: [Color(red: 0.94, green: 1.0, blue: 0.97), .white], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle("Pakej Aktif")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var packageHeader: some View {
        HStack(spacing: 20) {
            Image(systemName: "text.book.closed.fill")
                .font(.system(size: 42)).foregroundStyle(.white)
                .frame(width: 82, height: 82).background(emerald, in: Circle())
            VStack(alignment: .leading, spacing: 6) {
                Text("PAKEJ AKTIF").font(.caption.bold()).foregroundStyle(.secondary)
                Text(assignment.package.title)
                    .font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(ink)
                Text(assignment.package.description ?? "Lengkapkan semua latihan mengikut urutan.")
                    .font(.headline).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                Text("Kemajuan Pakej").font(.headline).foregroundStyle(ink)
                Text("\(completedCount) / \(units.count)").font(.title.bold()).foregroundStyle(emerald)
                ProgressView(value: Double(completedCount), total: Double(max(1, units.count)))
                    .frame(width: 190).tint(emerald)
            }
            .padding(18).background(.white, in: RoundedRectangle(cornerRadius: 18))
        }
        .padding(24).background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(emerald.opacity(0.18)))
    }

    private func unitCard(_ unit: KidsLearningUnit) -> some View {
        let isComplete = unit.result?.passed == true
        let isCurrent = unit.id == currentUnitID
        return VStack(spacing: 14) {
            Text("\(unit.sequence)")
                .font(.title2.bold()).foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(isComplete ? emerald : (isCurrent ? teal : Color.gray), in: Circle())
            Image(systemName: isComplete ? "checkmark.seal.fill" : (isCurrent ? "book.fill" : "lock.fill"))
                .font(.title).foregroundStyle(isComplete ? emerald : (isCurrent ? teal : .gray))
            Text(unit.title).font(.title3.bold()).foregroundStyle(ink).multilineTextAlignment(.center)
            Text(unit.instruction ?? "Selesaikan unit ini mengikut arahan.")
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Text(isComplete ? "Selesai" : (isCurrent ? "Sedang berjalan" : "Terkunci"))
                .font(.caption.bold()).foregroundStyle(isComplete ? emerald : (isCurrent ? teal : .gray))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background((isComplete ? emerald : (isCurrent ? teal : Color.gray)).opacity(0.10), in: Capsule())
        }
        .frame(maxWidth: .infinity, minHeight: 230).padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke((isCurrent ? teal : emerald).opacity(isCurrent || isComplete ? 0.55 : 0.12), lineWidth: isCurrent ? 2 : 1))
    }
}
