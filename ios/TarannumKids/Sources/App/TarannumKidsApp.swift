import DeviceActivity
import FamilyControls
import SwiftUI

@main
struct TarannumKidsApp: App {
    @StateObject private var model = KidsViewModel()
    var body: some Scene {
        WindowGroup { KidsHomeView().environmentObject(model).task { await model.start() } }
    }
}

@MainActor
final class KidsViewModel: ObservableObject {
    @Published var access: DailyAccessState?
    @Published var selection = SharedState.familySelection
    @Published var isPickerPresented = false
    @Published var message = "Menyemak latihan hari ini…"
    @Published var isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
    @Published var isAuthorizing = false
    private let api = KidsAPIClient()

    func start() async {
        guard isAuthorized else {
            message = "Pilih cara menyediakan peranti ini."
            return
        }

        await finishAuthorizedSetup()
    }

    func authorizeChildDevice() async {
        isAuthorizing = true
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .child)
            isAuthorized = true
            await finishAuthorizedSetup()
        } catch {
            message = "Peranti Anak memerlukan Apple Account kanak-kanak dalam Family Sharing dan kelulusan ibu bapa."
            ShieldManager.apply()
        }
        isAuthorizing = false
    }

    func authorizeTestMode() async {
        isAuthorizing = true
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            isAuthorized = true
            await finishAuthorizedSetup()
        } catch {
            message = "Kebenaran Screen Time tidak diberikan. Cuba semula dan pilih Allow."
            ShieldManager.apply()
        }
        isAuthorizing = false
    }

    private func finishAuthorizedSetup() async {
        do {
            try scheduleDailyBoundary()
            await refreshAccess()
        } catch {
            message = "Kebenaran diterima, tetapi jadual kawalan tidak dapat dimulakan."
            ShieldManager.apply()
        }
    }

    func saveSelection(_ value: FamilyActivitySelection) {
        selection = value
        SharedState.familySelection = value
        ShieldManager.reconcile()
    }

    func refreshAccess() async {
        do {
            let state = try await api.fetchDailyAccess()
            SharedState.dailyAccess = state
            access = state
            ShieldManager.reconcile()
            message = state.unlockGranted
                ? "Latihan lengkap. Aplikasi dibuka sehingga 11:30 malam."
                : "Baki latihan: \(Int(ceil(Double(state.remainingSeconds) / 60))) minit."
        } catch {
            access = SharedState.dailyAccess
            message = "Tidak dapat mengesahkan latihan. Aplikasi kekal dilindungi."
            ShieldManager.apply()
        }
    }

    private func scheduleDailyBoundary() throws {
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: KidsConstants.accessStartHour),
            intervalEnd: DateComponents(hour: KidsConstants.bedtimeHour, minute: KidsConstants.bedtimeMinute),
            repeats: true,
            warningTime: DateComponents(minute: 5)
        )
        let center = DeviceActivityCenter()
        center.stopMonitoring([KidsConstants.dailyScheduleName])
        try center.startMonitoring(KidsConstants.dailyScheduleName, during: schedule)
    }
}

struct KidsHomeView: View {
    @EnvironmentObject private var model: KidsViewModel
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: model.access?.unlockGranted == true ? "lock.open.fill" : "lock.fill")
                    .font(.system(size: 64)).foregroundStyle(model.access?.unlockGranted == true ? .green : .indigo)
                Text("Tarannum Kids").font(.largeTitle.bold())
                Text(model.message).multilineTextAlignment(.center)
                if model.isAuthorized {
                    ProgressView(value: Double(model.access?.creditedSeconds ?? 0),
                                 total: Double(model.access?.requiredSeconds ?? KidsConstants.requiredPracticeSeconds))
                    Button("Semak kemajuan") { Task { await model.refreshAccess() } }.buttonStyle(.borderedProminent)
                    Button("Pilih aplikasi untuk dilindungi") { model.isPickerPresented = true }.buttonStyle(.bordered)
                } else {
                    VStack(spacing: 12) {
                        Button("Sediakan sebagai Peranti Anak") {
                            Task { await model.authorizeChildDevice() }
                        }
                        .buttonStyle(.borderedProminent)

                        Button("Aktifkan Mod Ujian / Admin") {
                            Task { await model.authorizeTestMode() }
                        }
                        .buttonStyle(.bordered)

                        Text("Gunakan Mod Ujian / Admin pada peranti dewasa. Untuk penggunaan sebenar, pilih Peranti Anak pada iPad yang menggunakan Apple Account kanak-kanak dalam Family Sharing.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .disabled(model.isAuthorizing)
                }
            }
            .padding(32)
            .familyActivityPicker(isPresented: $model.isPickerPresented, selection: $model.selection)
            .onChange(of: model.selection) { _, value in model.saveSelection(value) }
        }
    }
}
