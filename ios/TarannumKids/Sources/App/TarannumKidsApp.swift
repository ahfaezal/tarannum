import DeviceActivity
import FamilyControls
import AVFoundation
import SwiftUI

enum KidsTrainingMode: String, CaseIterable, Identifiable {
    case listen = "Dengar"
    case practice = "Latih Bersama Qari"
    case record = "Rakaman"
    var id: String { rawValue }
}

final class LivePitchMonitor: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private var lastUpdate = Date.distantPast
    private var hasInputTap = false
    var onPitch: (@MainActor @Sendable (Double?) -> Void)?

    func start() throws {
        stop()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return }
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self, Date().timeIntervalSince(self.lastUpdate) >= 0.08 else { return }
            self.lastUpdate = Date()
            let midi = Self.detectMIDI(buffer: buffer, sampleRate: format.sampleRate)
            let handler = self.onPitch
            Task { @MainActor in handler?(midi) }
        }
        hasInputTap = true
        engine.prepare()
        try engine.start()
    }

    func stop() {
        if hasInputTap {
            engine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        engine.stop()
        let handler = onPitch
        Task { @MainActor in handler?(nil) }
    }

    private static func detectMIDI(buffer: AVAudioPCMBuffer, sampleRate: Double) -> Double? {
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        let count = Int(buffer.frameLength)
        guard count >= 512 else { return nil }
        var energy: Float = 0
        for index in 0..<count { energy += channel[index] * channel[index] }
        guard sqrt(energy / Float(count)) > 0.012 else { return nil }
        let minLag = max(2, Int(sampleRate / 500))
        let maxLag = min(count / 2, Int(sampleRate / 60))
        guard minLag < maxLag else { return nil }
        var bestLag = 0
        var bestCorrelation: Float = 0
        for lag in minLag...maxLag {
            var correlation: Float = 0
            for index in 0..<(count - lag) { correlation += channel[index] * channel[index + lag] }
            if correlation > bestCorrelation { bestCorrelation = correlation; bestLag = lag }
        }
        guard bestLag > 0 else { return nil }
        let frequency = sampleRate / Double(bestLag)
        guard frequency >= 60, frequency <= 500 else { return nil }
        return 69 + 12 * log2(frequency / 440)
    }
}

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
    @Published var recordingDuration: TimeInterval = 0
    @Published var recordingTargetDuration: TimeInterval = 0
    @Published var isPlayingReference = false
    @Published var isLoadingReferenceAudio = false
    @Published var referencePlaybackTime: TimeInterval = 0
    @Published var isSubmittingRecording = false
    @Published var isWaitingForScore = false
    @Published var scoringMessage = ""
    @Published var latestScore: ScoringResultSummary?
    @Published var referencePitch: [ScoringPitchPoint] = []
    @Published var isLoadingReferencePitch = false
    @Published var trainingMode: KidsTrainingMode = .listen
    @Published var isPracticingWithQari = false
    @Published var liveStudentPitch: Double?
    @Published var practiceMessage = "Pilih tugasan dan mulakan rakaman."
    private let api = KidsAPIClient()
    private var audioRecorder: AVAudioRecorder?
    private var audioPlayer: AVAudioPlayer?
    private var recordingTimer: Timer?
    private var playbackTimer: Timer?
    private var referenceAudioURL: URL?
    private var practiceSessionID: String?
    private var isFinishingRecording = false
    private let livePitchMonitor = LivePitchMonitor()

    var isSignedIn: Bool { session != nil }

    override init() {
        super.init()
        livePitchMonitor.onPitch = { [weak self] pitch in self?.liveStudentPitch = pitch }
    }

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
            else { await loadReferencePitch() }
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
        stopReferencePlayback()
        let targetDuration = references
            .first(where: { $0.id == selectedReferenceID })?
            .duration
            .flatMap { $0 > 0 ? $0 : nil }
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
            try livePitchMonitor.start()
            let fileURL = FileManager.default.temporaryDirectory.appending(path: "tarannum-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
            recorder.prepareToRecord()
            let didStart: Bool
            if let targetDuration {
                didStart = recorder.record(forDuration: max(3, targetDuration))
            } else {
                didStart = recorder.record()
            }
            guard didStart else { throw KidsAPIError.server("Rakaman tidak dapat dimulakan.") }
            let sessionID = UUID().uuidString
            try await api.sendPracticeEvent(type: "practice_started", referenceID: selectedReferenceID)
            audioRecorder = recorder
            practiceSessionID = sessionID
            recordingDuration = 0
            recordingTargetDuration = targetDuration ?? 0
            isRecording = true
            recordingTimer?.invalidate()
            recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                guard let self, let recorder = self.audioRecorder else { return }
                // AVAudioRecorder resets currentTime when a timed recording
                // stops. Preserve the highest observed value so auto-submit
                // does not mistake a complete recording for a zero-second one.
                self.recordingDuration = max(self.recordingDuration, recorder.currentTime)
                if !recorder.isRecording {
                    self.recordingTimer?.invalidate()
                    self.recordingTimer = nil
                    Task { await self.finishRecording() }
                }
            }
            practiceMessage = targetDuration == nil
                ? "Rakaman sedang berjalan. Baca tugasan dengan jelas, kemudian tekan Selesai Rakaman."
                : "Rakaman akan berhenti dan dihantar secara automatik apabila tempoh tugasan tamat."
        } catch {
            livePitchMonitor.stop()
            audioRecorder?.stop()
            audioRecorder = nil
            practiceMessage = "Rakaman tidak dapat dimulakan. Semak mikrofon atau headset dan cuba semula. (\(error.localizedDescription))"
        }
    }

    func toggleReferencePlayback() async {
        if isPlayingReference {
            stopReferencePlayback()
            practiceMessage = "Audio contoh dihentikan."
            return
        }
        guard !selectedReferenceID.isEmpty else { practiceMessage = "Pilih tugasan latihan dahulu."; return }
        isLoadingReferenceAudio = true
        practiceMessage = "Memuatkan audio contoh…"
        defer { isLoadingReferenceAudio = false }
        do {
            stopReferencePlayback()
            let fileURL = try await api.downloadReferenceAudio(referenceID: selectedReferenceID)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
            let player = try AVAudioPlayer(contentsOf: fileURL)
            guard player.prepareToPlay(), player.play() else {
                throw KidsAPIError.server("Audio contoh tidak dapat dimainkan.")
            }
            audioPlayer = player
            referenceAudioURL = fileURL
            referencePlaybackTime = 0
            isPlayingReference = true
            practiceMessage = "Dengar audio contoh, kemudian tekan Henti apabila bersedia untuk merakam."
            playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] timer in
                guard let self, let player = self.audioPlayer else { timer.invalidate(); return }
                self.referencePlaybackTime = player.currentTime
                if !player.isPlaying {
                    self.stopReferencePlayback()
                    self.practiceMessage = "Audio contoh selesai. Anda boleh mula merakam."
                }
            }
        } catch {
            stopReferencePlayback()
            practiceMessage = "Audio contoh tidak dapat dimainkan. Cuba semula."
        }
    }

    func togglePracticeWithQari() async {
        if isPracticingWithQari {
            stopReferencePlayback()
            livePitchMonitor.stop()
            isPracticingWithQari = false
            practiceMessage = "Latihan bersama qari dihentikan."
            return
        }
        guard !selectedReferenceID.isEmpty else { return }
        isLoadingReferenceAudio = true
        practiceMessage = "Menyediakan latihan bersama qari…"
        defer { isLoadingReferenceAudio = false }
        do {
            stopReferencePlayback()
            let fileURL = try await api.downloadReferenceAudio(referenceID: selectedReferenceID)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try audioSession.setActive(true)
            try livePitchMonitor.start()
            let player = try AVAudioPlayer(contentsOf: fileURL)
            guard player.prepareToPlay(), player.play() else { throw KidsAPIError.server("Audio tidak dapat dimainkan.") }
            audioPlayer = player
            referenceAudioURL = fileURL
            referencePlaybackTime = 0
            isPlayingReference = true
            isPracticingWithQari = true
            practiceMessage = "Ikuti bacaan qari. Bola jingga menunjukkan nada suara anda."
            playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
                guard let self, let player = self.audioPlayer else { timer.invalidate(); return }
                self.referencePlaybackTime = player.currentTime
                if !player.isPlaying {
                    self.stopReferencePlayback()
                    self.livePitchMonitor.stop()
                    self.isPracticingWithQari = false
                    self.practiceMessage = "Latihan bersama qari selesai. Anda boleh ulang atau pergi ke sesi rakaman."
                }
            }
        } catch {
            stopReferencePlayback()
            livePitchMonitor.stop()
            isPracticingWithQari = false
            practiceMessage = "Latihan bersama qari tidak dapat dimulakan. Cuba gunakan headset dan cuba semula."
        }
    }

    func changeTrainingMode(_ mode: KidsTrainingMode) {
        stopReferencePlayback()
        livePitchMonitor.stop()
        isPracticingWithQari = false
        trainingMode = mode
        practiceMessage = mode == .record
            ? "Tekan Mula Rakaman untuk mendapatkan markah."
            : (mode == .practice ? "Gunakan headset, kemudian latih bacaan bersama qari." : "Dengar audio contoh sebelum berlatih.")
    }

    func retakeRecording() async {
        latestScore = nil
        scoringMessage = ""
        trainingMode = .record
        await startRecording()
    }

    func practiceAgain() {
        latestScore = nil
        scoringMessage = ""
        changeTrainingMode(.practice)
    }

    func selectedReferenceChanged() {
        stopReferencePlayback()
        referencePitch = []
        latestScore = nil
        practiceMessage = "Dengar audio contoh atau mulakan rakaman."
        Task { await loadReferencePitch() }
    }

    func loadReferencePitch() async {
        guard !selectedReferenceID.isEmpty else { return }
        let requestedReferenceID = selectedReferenceID
        isLoadingReferencePitch = true
        defer {
            if selectedReferenceID == requestedReferenceID { isLoadingReferencePitch = false }
        }
        do {
            let points = try await api.fetchReferencePitch(referenceID: requestedReferenceID)
            guard selectedReferenceID == requestedReferenceID else { return }
            referencePitch = points
        } catch {
            guard selectedReferenceID == requestedReferenceID else { return }
            referencePitch = []
        }
    }

    private func stopReferencePlayback() {
        playbackTimer?.invalidate()
        playbackTimer = nil
        audioPlayer?.stop()
        audioPlayer = nil
        isPlayingReference = false
        referencePlaybackTime = 0
        if let referenceAudioURL {
            try? FileManager.default.removeItem(at: referenceAudioURL)
            self.referenceAudioURL = nil
        }
    }

    private func finishRecording() async {
        guard !isFinishingRecording else { return }
        guard let recorder = audioRecorder, let sessionID = practiceSessionID else { return }
        isFinishingRecording = true
        defer { isFinishingRecording = false }
        let duration = max(recorder.currentTime, recordingDuration)
        let fileURL = recorder.url
        recorder.stop()
        livePitchMonitor.stop()
        recordingTimer?.invalidate()
        recordingTimer = nil
        audioRecorder = nil
        isRecording = false
        recordingTargetDuration = 0
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
            let jobID = try await api.submitRecording(
                fileURL: fileURL,
                referenceID: selectedReferenceID,
                sessionID: sessionID
            )
            try await api.sendPracticeEvent(
                type: "practice_stopped",
                referenceID: selectedReferenceID,
                duration: duration
            )
            try await api.sendPracticeEvent(
                type: "recording_submitted",
                referenceID: selectedReferenceID,
                duration: duration
            )
            practiceMessage = "Rakaman diterima. Kemajuan telah dikemas kini."
            await refreshAccess()
            Task { await waitForScoringResult(jobID: jobID) }
        } catch {
            practiceMessage = "Rakaman tidak berjaya dihantar. Masa belum dikreditkan. Cuba semula."
        }
    }

    private func waitForScoringResult(jobID: String) async {
        isWaitingForScore = true
        latestScore = nil
        scoringMessage = "Rakaman sedang menunggu penilaian AI…"
        defer { isWaitingForScore = false }
        var transientFailures = 0
        for _ in 0..<75 {
            do {
                let update = try await api.fetchScoringJob(jobID: jobID)
                transientFailures = 0
                if update.status == "completed", let result = update.result {
                    latestScore = result
                    scoringMessage = "Penilaian selesai."
                    return
                }
                if update.status == "failed" {
                    if let error = update.error, !error.isEmpty {
                        scoringMessage = "Penilaian tidak dapat diselesaikan: \(error)"
                    } else {
                        scoringMessage = "Penilaian tidak dapat diselesaikan. Rakaman latihan tetap dikreditkan."
                    }
                    return
                }
                if update.status == "processing" {
                    scoringMessage = "AI sedang menganalisis bacaan…"
                } else if let position = update.queuePosition {
                    scoringMessage = "Menunggu giliran penilaian AI (nombor \(position))…"
                } else {
                    scoringMessage = "Rakaman sedang menunggu penilaian AI…"
                }
            } catch {
                transientFailures += 1
                scoringMessage = transientFailures >= 3
                    ? "Sambungan penilaian terganggu. Sedang mencuba semula…"
                    : "Menyemak status penilaian…"
            }
            try? await Task.sleep(nanoseconds: 8_000_000_000)
        }
        scoringMessage = "Penilaian masih diproses. Keputusan boleh disemak semula kemudian."
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
                Text(progressText(access))
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
                .onChange(of: model.selectedReferenceID) { _, _ in model.selectedReferenceChanged() }
                Picker("Sesi", selection: $model.trainingMode) {
                    ForEach(KidsTrainingMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
                }
                .pickerStyle(.segmented)
                .onChange(of: model.trainingMode) { _, mode in model.changeTrainingMode(mode) }
                if let reference = model.references.first(where: { $0.id == model.selectedReferenceID }),
                   let text = reference.textSegments?
                    .map(\.text)
                    .filter({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                    .joined(separator: " "),
                   !text.isEmpty {
                    Text(text)
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                if model.isLoadingReferencePitch {
                    ProgressView("Memuatkan graf nada qari…")
                } else if !model.referencePitch.isEmpty {
                    VStack(spacing: 8) {
                        Text("Panduan Nada Qari")
                            .font(.headline)
                        PitchComparisonGraph(
                            reference: model.referencePitch,
                            student: [],
                            progressTime: model.isRecording
                                ? model.recordingDuration
                                : (model.isPlayingReference ? model.referencePlaybackTime : nil),
                            livePitch: model.liveStudentPitch
                        )
                        .frame(height: 180)
                        Label("Ikuti bentuk alunan ungu semasa berlatih", systemImage: "waveform.path")
                            .font(.caption)
                            .foregroundStyle(.indigo)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.indigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                }
                if model.trainingMode == .listen {
                    Button(model.isPlayingReference ? "Henti Audio Contoh" : "Dengar Audio Contoh") {
                        Task { await model.toggleReferencePlayback() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isLoadingReferenceAudio || model.isRecording || model.isSubmittingRecording)
                } else if model.trainingMode == .practice {
                    Button(model.isPracticingWithQari ? "Henti Latihan" : "Mula Latih Bersama Qari") {
                        Task { await model.togglePracticeWithQari() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(model.isPracticingWithQari ? .red : .indigo)
                    .disabled(model.isLoadingReferenceAudio)
                }
                if model.isLoadingReferenceAudio {
                    ProgressView("Memuatkan audio contoh…")
                } else if model.isPlayingReference {
                    Text("Audio contoh: \(formattedDuration(model.referencePlaybackTime))")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.indigo)
                }
                Text(model.practiceMessage).font(.subheadline).multilineTextAlignment(.center)
                if model.trainingMode == .record, model.isRecording {
                    Text("Masa rakaman: \(formattedDuration(model.recordingDuration))")
                        .font(.title3.monospacedDigit().bold())
                        .foregroundStyle(.red)
                    if model.recordingTargetDuration > 0 {
                        Text("Berhenti automatik pada \(formattedDuration(model.recordingTargetDuration))")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                if model.trainingMode == .record, model.latestScore == nil {
                    Button(model.isRecording ? "Selesai Rakaman" : "Mula Rakaman") {
                        Task { await model.toggleRecording() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(model.isRecording ? .red : .green)
                    .disabled(model.isSubmittingRecording)
                }
                if model.isSubmittingRecording { ProgressView("Menghantar rakaman…") }
                if model.isWaitingForScore {
                    VStack(spacing: 8) {
                        ProgressView()
                        Text(model.scoringMessage)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                } else if let score = model.latestScore {
                    VStack(spacing: 10) {
                        Text("Markah Penilaian")
                            .font(.headline)
                        Text("\(Int(score.score.rounded()))%")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .foregroundStyle(scoreColor(score.score))
                        Text(localizedScoreLabel(score.score))
                            .font(.title3.bold())
                        Text(localizedScoreMessage(score.score))
                            .multilineTextAlignment(.center)
                        if !score.focusAreas.isEmpty {
                            Divider()
                            Text("Fokus latihan: \(score.focusAreas.prefix(3).map(localizedFocusArea).joined(separator: " • "))")
                                .font(.subheadline)
                                .multilineTextAlignment(.center)
                        }
                        Divider()
                        HStack(spacing: 12) {
                            Button("Rakam Semula") { Task { await model.retakeRecording() } }
                                .buttonStyle(.borderedProminent)
                                .tint(.green)
                            Button("Latih Semula") { model.practiceAgain() }
                                .buttonStyle(.bordered)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(scoreColor(score.score).opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
                } else if !model.scoringMessage.isEmpty {
                    Text(model.scoringMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            Button("Pilih aplikasi untuk dilindungi") { model.isPickerPresented = true }.buttonStyle(.bordered)
            Button("Log keluar", role: .destructive) { model.signOut() }.buttonStyle(.borderless)
        }
    }

    private func progressText(_ access: DailyAccessState) -> String {
        if access.creditedSeconds < 60 {
            return "\(access.creditedSeconds) saat daripada \(access.requiredSeconds / 60) minit selesai"
        }
        let minutes = access.creditedSeconds / 60
        let seconds = access.creditedSeconds % 60
        return seconds == 0
            ? "\(minutes) daripada \(access.requiredSeconds / 60) minit selesai"
            : "\(minutes) minit \(seconds) saat daripada \(access.requiredSeconds / 60) minit selesai"
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        let totalSeconds = max(0, Int(duration))
        return String(format: "%02d:%02d", totalSeconds / 60, totalSeconds % 60)
    }

    private func scoreColor(_ score: Double) -> Color {
        if score >= 80 { return .green }
        if score >= 60 { return .orange }
        return .indigo
    }

    private func localizedScoreLabel(_ score: Double) -> String {
        if score >= 85 { return "Sangat Baik" }
        if score >= 70 { return "Kemajuan Baik" }
        if score >= 50 { return "Teruskan Latihan" }
        return "Sedang Membina Asas"
    }

    private func localizedScoreMessage(_ score: Double) -> String {
        if score >= 85 { return "Bacaan sangat baik. Kekalkan sebutan, tempo dan alunan ini." }
        if score >= 70 { return "Kemajuan yang baik. Teruskan latihan untuk memperhalusi bacaan." }
        if score >= 50 { return "Asas bacaan semakin baik. Ulang latihan dengan memberi perhatian pada sebutan dan masa." }
        return "Dengar audio contoh sekali lagi, kemudian ulang bacaan secara perlahan dan jelas."
    }

    private func localizedFocusArea(_ value: String) -> String {
        switch value.lowercased() {
        case let text where text.contains("pronunciation") && text.contains("timing"):
            return "Fokus pada sebutan dan tempo"
        case let text where text.contains("pronunciation"):
            return "Perkemas sebutan"
        case let text where text.contains("timing"):
            return "Perkemas tempo bacaan"
        case let text where text.contains("pitch") || text.contains("melody"):
            return "Perkemas alunan dan nada"
        case let text where text.contains("listen") || text.contains("reference"):
            return "Dengar dan ikuti audio contoh"
        case let text where text.contains("continue practicing"):
            return "Teruskan latihan secara konsisten"
        default:
            return value
        }
    }
}

private struct PitchComparisonGraph: View {
    let reference: [ScoringPitchPoint]
    let student: [ScoringPitchPoint]
    var progressTime: TimeInterval? = nil
    var livePitch: Double? = nil

    var body: some View {
        Canvas { context, size in
            let all = reference + student
            guard let minTime = all.map(\.time).min(),
                  let maxTime = all.map(\.time).max(),
                  let minPitch = all.map(\.value).min(),
                  let maxPitch = all.map(\.value).max() else { return }
            let timeRange = max(0.001, maxTime - minTime)
            let pitchRange = max(0.001, maxPitch - minPitch)

            for fraction in [0.25, 0.5, 0.75] {
                var grid = Path()
                let y = size.height * fraction
                grid.move(to: CGPoint(x: 0, y: y))
                grid.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(grid, with: .color(.secondary.opacity(0.16)), lineWidth: 1)
            }

            func draw(_ points: [ScoringPitchPoint], color: Color) {
                let sampled = downsample(points, maximumCount: 700)
                guard let first = sampled.first else { return }
                func position(_ point: ScoringPitchPoint) -> CGPoint {
                    CGPoint(
                        x: (point.time - minTime) / timeRange * size.width,
                        y: size.height - ((point.value - minPitch) / pitchRange * size.height)
                    )
                }
                var path = Path()
                path.move(to: position(first))
                for point in sampled.dropFirst() { path.addLine(to: position(point)) }
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }

            draw(reference, color: .indigo)
            draw(student, color: .orange)
            if let progressTime {
                let x = min(size.width, max(0, (progressTime - minTime) / timeRange * size.width))
                var playhead = Path()
                playhead.move(to: CGPoint(x: x, y: 0))
                playhead.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(playhead, with: .color(.red.opacity(0.85)), lineWidth: 2)
                if let livePitch {
                    let y = min(size.height, max(0, size.height - ((livePitch - minPitch) / pitchRange * size.height)))
                    let ball = CGRect(x: x - 7, y: y - 7, width: 14, height: 14)
                    context.fill(Path(ellipseIn: ball), with: .color(.orange))
                    context.stroke(Path(ellipseIn: ball), with: .color(.white), lineWidth: 2)
                }
            }
        }
        .padding(10)
        .background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel("Graf perbandingan nada audio contoh dan bacaan pelajar")
    }

    private func downsample(_ points: [ScoringPitchPoint], maximumCount: Int) -> [ScoringPitchPoint] {
        guard points.count > maximumCount else { return points }
        let stride = max(1, points.count / maximumCount)
        return Swift.stride(from: 0, to: points.count, by: stride).map { points[$0] }
    }
}
