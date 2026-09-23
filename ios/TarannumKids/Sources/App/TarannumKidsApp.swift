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
    private let api = KidsAPIClient()

    func start() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .child)
            try scheduleDailyBoundary()
            await refreshAccess()
        } catch {
            message = "Kebenaran Screen Time diperlukan oleh ibu bapa."
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
                ProgressView(value: Double(model.access?.creditedSeconds ?? 0),
                             total: Double(model.access?.requiredSeconds ?? KidsConstants.requiredPracticeSeconds))
                Button("Semak kemajuan") { Task { await model.refreshAccess() } }.buttonStyle(.borderedProminent)
                Button("Pilih aplikasi untuk dilindungi") { model.isPickerPresented = true }.buttonStyle(.bordered)
            }
            .padding(32)
            .familyActivityPicker(isPresented: $model.isPickerPresented, selection: $model.selection)
            .onChange(of: model.selection) { _, value in model.saveSelection(value) }
        }
    }
}
