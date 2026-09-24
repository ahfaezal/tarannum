import DeviceActivity
import FamilyControls
import AVFoundation
import SwiftUI

@main
struct TarannumKidsApp: App {
    @StateObject private var model = KidsViewModel()
    var body: some Scene {
        WindowGroup { KidsHomeView().environmentObject(model).task { await model.start() } }
    }
}

@MainActor
final class KidsViewModel: NSObject, ObservableObject {
    @Published var access: DailyAccessState?
    @Published var selection = SharedState.familySelection
    @Published var isPickerPresented = false
    @Published var message = "Menyemak latihan hari ini…"
    @Published var isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
    @Published var isAuthorizing = false
    @Published var session: KidsAuthSession?
    @Published var email = ""
    @Published var password = ""
    @Published var isSigningIn = false
    @Published var isRefreshing = false
    @Published var lastCheckedAt: Date?
    @Published var references: [PracticeReference] = []
    @Published var selectedReferenceID = ""
    @Published var isRecording = false
    @Published var isSubmittingRecording = false
    @Published var practiceMessage = "Pilih tugasan dan mulakan rakaman."
    private let api = KidsAPIClient()
    private var audioRecorder: AVAudioRecorder?
    private var practiceSessionID: String?

    var isSignedIn: Bool { session != nil }

    func start() async {
        session = api.savedSession
        guard isAuthorized else { message = "Pilih cara menyediakan peranti ini."; return }
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

    func signIn() async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty, !password.isEmpty else { message = "Masukkan e-mel dan kata laluan."; return }
        isSigningIn = true
        message = "Sedang log masuk…"
        do {
            session = try await api.login(email: normalizedEmail, password: password)
            password = ""
            await refreshAccess()
            await loadReferences()
        } catch {
            message = error.localizedDescription
            ShieldManager.apply()
        }
        isSigningIn = false
    }

    func signOut() {
        api.logout()
        session = nil
        access = nil
        SharedState.dailyAccess = nil
        password = ""
        message = "Anda telah log keluar. Aplikasi kekal dilindungi."
        ShieldManager.apply()
    }

    private func finishAuthorizedSetup() async {
        do {
            try scheduleDailyBoundary()
            if isSignedIn {
                await refreshAccess()
                await loadReferences()
            }
            else { message = "Log masuk menggunakan akaun pelajar Tarannum.ai."; ShieldManager.apply() }
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
        guard !isRefreshing else { return }
        isRefreshing = true
        message = "Sedang menyemak kemajuan…"
        defer {
            isRefreshing = false
            lastCheckedAt = Date()
        }
        do {
            let state = try await api.fetchDailyAccess()
            SharedState.dailyAccess = state
            access = state
            ShieldManager.reconcile()
            message = state.unlockGranted
                ? "Latihan lengkap. Aplikasi dibuka sehingga 11:30 malam."
                : "Baki latihan: \(Int(ceil(Double(state.remainingSeconds) / 60))) minit."
        } catch KidsAPIError.sessionExpired {
            session = nil
            access = nil
            SharedState.dailyAccess = nil
            message = KidsAPIError.sessionExpired.localizedDescription
            ShieldManager.apply()
        } catch {
            access = SharedState.dailyAccess
            message = "Tidak dapat mengesahkan latihan. Aplikasi kekal dilindungi."
            ShieldManager.apply()
        }
    }

    func loadReferences() async {
        guard references.isEmpty else { return }
        do {
            references = try await api.fetchPracticeReferences()
            if selectedReferenceID.isEmpty { selectedReferenceID = references.first?.id ?? "" }
            if references.isEmpty { practiceMessage = "Tiada tugasan latihan tersedia untuk akaun ini." }
        } catch {
            practiceMessage = "Tugasan tidak dapat dimuatkan. Cuba buka semula aplikasi."
        }
    }

    func toggleRecording() async {
        if isRecording { await finishRecording() }
        else { await startRecording() }
    }

    private func startRecording() async {
        guard !selectedReferenceID.isEmpty else { practiceMessage = "Pilih tugasan latihan dahulu."; return }
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permitted else { practiceMessage = "Benarkan akses mikrofon dalam Settings untuk membuat rakaman."; return }
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try audioSession.setActive(true)
            let fileURL = FileManager.default.temporaryDirectory.appending(path: "tarannum-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
            recorder.prepareToRecord()
            guard recorder.record() else { throw KidsAPIError.server("Rakaman tidak dapat dimulakan.") }
            let sessionID = UUID().uuidString
            try await api.sendPracticeEvent(type: "practice_started", referenceID: selectedReferenceID, sessionID: sessionID)
            audioRecorder = recorder
            practiceSessionID = sessionID
            isRecording = true
            practiceMessage = "Rakaman sedang berjalan. Baca tugasan dengan jelas, kemudian tekan Selesai Rakaman."
        } catch {
            audioRecorder?.stop()
            audioRecorder = nil
            practiceMessage = "Rakaman tidak dapat dimulakan. Semak mikrofon atau headset dan cuba semula. (\(error.localizedDescription))"
        }
    }

    private func finishRecording() async {
        guard let recorder = audioRecorder, let sessionID = practiceSessionID else { return }
        let duration = recorder.currentTime
        let fileURL = recorder.url
        recorder.stop()
        audioRecorder = nil
        isRecording = false
        isSubmittingRecording = true
        practiceMessage = "Menghantar rakaman untuk pengesahan…"
        defer {
            isSubmittingRecording = false
            try? FileManager.default.removeItem(at: fileURL)
        }
        guard duration >= 3 else {
            practiceMessage = "Rakaman terlalu pendek. Buat rakaman sekurang-kurangnya 3 saat."
            return
        }
        do {
            try await api.submitRecording(fileURL: fileURL, referenceID: selectedReferenceID, sessionID: sessionID)
            try await api.sendPracticeEvent(
                type: "practice_stopped",
                referenceID: selectedReferenceID,
                sessionID: sessionID,
                duration: duration
            )
            try await api.sendPracticeEvent(
                type: "recording_submitted",
                referenceID: selectedReferenceID,
                sessionID: sessionID,
                duration: duration
            )
            practiceMessage = "Rakaman diterima. Kemajuan telah dikemas kini."
            await refreshAccess()
        } catch {
            practiceMessage = "Rakaman tidak berjaya dihantar. Masa belum dikreditkan. Cuba semula."
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
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: model.access?.unlockGranted == true ? "lock.open.fill" : "lock.fill")
                        .font(.system(size: 64)).foregroundStyle(model.access?.unlockGranted == true ? .green : .indigo)
                    Text("Tarannum Kids").font(.largeTitle.bold())
                    Text(model.message).multilineTextAlignment(.center)
                    if !model.isAuthorized { authorizationView }
                    else if !model.isSignedIn { loginView }
                    else { progressView }
                }
                .frame(maxWidth: 620).padding(32).frame(maxWidth: .infinity)
            }
            .familyActivityPicker(isPresented: $model.isPickerPresented, selection: $model.selection)
            .onChange(of: model.selection) { _, value in model.saveSelection(value) }
        }
    }

    private var authorizationView: some View {
        VStack(spacing: 12) {
            Button("Sediakan sebagai Peranti Anak") { Task { await model.authorizeChildDevice() } }.buttonStyle(.borderedProminent)
            Button("Aktifkan Mod Ujian / Admin") { Task { await model.authorizeTestMode() } }.buttonStyle(.bordered)
            Text("Gunakan Mod Ujian / Admin pada peranti dewasa. Untuk penggunaan sebenar, pilih Peranti Anak pada iPad yang menggunakan Apple Account kanak-kanak dalam Family Sharing.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.disabled(model.isAuthorizing)
    }

    private var loginView: some View {
        VStack(spacing: 16) {
            TextField("E-mel pelajar", text: $model.email)
                .textContentType(.username).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                .autocorrectionDisabled().textFieldStyle(.roundedBorder)
            SecureField("Kata laluan", text: $model.password).textContentType(.password).textFieldStyle(.roundedBorder)
            Button(model.isSigningIn ? "Sedang log masuk…" : "Log masuk") { Task { await model.signIn() } }
                .buttonStyle(.borderedProminent).disabled(model.isSigningIn)
            if model.isSigningIn { ProgressView("Menghubungi Tarannum.ai") }
            Text("Gunakan akaun pelajar yang sama seperti di Tarannum.ai.").font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var progressView: some View {
        VStack(spacing: 16) {
            if let session = model.session { Text(session.fullName ?? session.email).font(.headline) }
            ProgressView(value: Double(model.access?.creditedSeconds ?? 0),
                         total: Double(model.access?.requiredSeconds ?? KidsConstants.requiredPracticeSeconds))
            if let access = model.access {
                Text("\(access.creditedSeconds / 60) daripada \(access.requiredSeconds / 60) minit selesai")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Button(model.isRefreshing ? "Sedang menyemak…" : "Semak kemajuan") {
                Task { await model.refreshAccess() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isRefreshing)
            if model.isRefreshing { ProgressView() }
            if let checkedAt = model.lastCheckedAt {
                Text("Semakan terakhir: \(checkedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Divider().padding(.vertical, 4)
            Text("Latihan Hari Ini").font(.title2.bold())
            if model.references.isEmpty {
                ProgressView("Memuatkan tugasan…")
            } else {
                Picker("Tugasan", selection: $model.selectedReferenceID) {
                    ForEach(model.references) { reference in
                        Text(reference.maqam?.isEmpty == false ? "\(reference.title) · \(reference.maqam!)" : reference.title)
                            .tag(reference.id)
                    }
                }
                .pickerStyle(.menu)
                Text(model.practiceMessage).font(.subheadline).multilineTextAlignment(.center)
                Button(model.isRecording ? "Selesai Rakaman" : "Mula Rakaman") {
                    Task { await model.toggleRecording() }
                }
                .buttonStyle(.borderedProminent)
                .tint(model.isRecording ? .red : .green)
                .disabled(model.isSubmittingRecording)
                if model.isSubmittingRecording { ProgressView("Menghantar rakaman…") }
            }
            Button("Pilih aplikasi untuk dilindungi") { model.isPickerPresented = true }.buttonStyle(.bordered)
            Button("Log keluar", role: .destructive) { model.signOut() }.buttonStyle(.borderless)
        }
    }
}
