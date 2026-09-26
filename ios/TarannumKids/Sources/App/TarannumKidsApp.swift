import DeviceActivity
import FamilyControls
import AVFoundation
import AudioToolbox
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
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
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
        var mean: Float = 0
        for index in 0..<count { mean += channel[index] }
        mean /= Float(count)
        var energy: Float = 0
        for index in 0..<count {
            let sample = channel[index] - mean
            energy += sample * sample
        }
        // Keep the guide responsive to softer children's voices. Downstream
        // confidence, octave correction and smoothing still reject noise.
        guard sqrt(energy / Float(count)) > 0.001 else { return nil }
        let minLag = max(2, Int(sampleRate / 500))
        let maxLag = min(count / 2, Int(sampleRate / 60))
        guard minLag < maxLag else { return nil }
        var bestLag = 0
        var bestCorrelation: Float = -1
        for lag in minLag...maxLag {
            var correlation: Float = 0
            var firstEnergy: Float = 0
            var secondEnergy: Float = 0
            for index in 0..<(count - lag) {
                let first = channel[index] - mean
                let second = channel[index + lag] - mean
                correlation += first * second
                firstEnergy += first * first
                secondEnergy += second * second
            }
            let denominator = sqrt(firstEnergy * secondEnergy)
            let normalized = denominator > 0 ? correlation / denominator : 0
            if normalized > bestCorrelation { bestCorrelation = normalized; bestLag = lag }
        }
        guard bestLag > 0, bestCorrelation > 0.18 else { return nil }
        // Normalising both windows removes the short-lag bias that commonly
        // reports a child's fundamental frequency one octave too high.
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
    private static let practiceStudentGraphWarmup: TimeInterval = 1.5
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
    @Published var liveStudentPitchPoints: [ScoringPitchPoint] = []
    @Published var practiceMessage = "Pilih tugasan dan mulakan rakaman."
    @Published var countdownValue: Int?
    @Published var countdownTitle = ""
    @Published var microphoneStatus = "Mikrofon belum diperiksa"
    @Published var isMicrophoneReady = false
    private let api = KidsAPIClient()
    private var audioRecorder: AVAudioRecorder?
    private var referencePlayer: AVPlayer?
    private var countdownAudioPlayer: AVAudioPlayer?
    private var recordingTimer: Timer?
    private var playbackTimer: Timer?
    private var referenceAudioURL: URL?
    private var practiceSessionID: String?
    private var isFinishingRecording = false
    private let livePitchMonitor = LivePitchMonitor()

    var isSignedIn: Bool { session != nil }

    func auditMicrophone() async {
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permitted else {
            isMicrophoneReady = false
            microphoneStatus = "Akses mikrofon belum dibenarkan"
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement,
                                    options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
            if let preferred = preferredMicrophone(from: session.availableInputs ?? []),
               session.currentRoute.inputs.first?.uid != preferred.uid {
                try session.setPreferredInput(preferred)
            }
            refreshMicrophoneStatus()
        } catch {
            isMicrophoneReady = false
            microphoneStatus = "Mikrofon tidak tersedia: \(error.localizedDescription)"
        }
    }

    func refreshMicrophoneStatus() {
        let session = AVAudioSession.sharedInstance()
        guard let input = session.currentRoute.inputs.first else {
            isMicrophoneReady = false
            microphoneStatus = "Tiada mikrofon dikesan"
            return
        }
        isMicrophoneReady = true
        let externalTypes: Set<AVAudioSession.Port> = [.usbAudio, .headsetMic, .bluetoothHFP]
        microphoneStatus = externalTypes.contains(input.portType)
            ? "Mikrofon luaran sedia: \(input.portName)"
            : "Mikrofon iPad sedia: \(input.portName)"
    }

    private func preferredMicrophone(from inputs: [AVAudioSessionPortDescription]) -> AVAudioSessionPortDescription? {
        for type in [AVAudioSession.Port.usbAudio, .headsetMic, .bluetoothHFP] {
            if let input = inputs.first(where: { $0.portType == type }) { return input }
        }
        return inputs.first(where: { $0.portType == .builtInMic }) ?? inputs.first
    }

    override init() {
        super.init()
        livePitchMonitor.onPitch = { [weak self] pitch in
            guard let self else { return }
            self.liveStudentPitch = pitch
            guard let pitch else { return }
            let time: TimeInterval?
            if self.isRecording { time = self.recordingDuration }
            else if self.isPracticingWithQari {
                time = self.referencePlaybackTime
                // Ignore the short start-up transient from the audio route,
                // breath and speaker bleed. The microphone remains active;
                // only the initial unstable guide points are withheld.
                guard self.referencePlaybackTime >= Self.practiceStudentGraphWarmup else { return }
            }
            else { time = nil }
            guard let time else { return }
            if let previous = self.liveStudentPitchPoints.last,
               time - previous.time < 0.06 { return }
            self.liveStudentPitchPoints.append(ScoringPitchPoint(time: time, value: pitch))
            if self.liveStudentPitchPoints.count > 1_200 {
                self.liveStudentPitchPoints.removeFirst(self.liveStudentPitchPoints.count - 1_200)
            }
        }
    }

    var graphTimelineTime: TimeInterval? {
        if isRecording { return recordingDuration }
        if isPlayingReference || isPracticingWithQari { return referencePlaybackTime }
        return nil
    }

    var referenceMarkerPitch: Double? {
        guard let time = graphTimelineTime else { return nil }
        guard !referencePitch.isEmpty else { return nil }

        // Binary-search the two surrounding samples and interpolate the
        // marker between them. This avoids scanning the full contour on every
        // frame and removes the visible vertical stepping of the qari ball.
        var low = 0
        var high = referencePitch.count
        while low < high {
            let middle = (low + high) / 2
            if referencePitch[middle].time < time { low = middle + 1 }
            else { high = middle }
        }
        if low == 0 { return referencePitch[0].value }
        if low >= referencePitch.count { return referencePitch.last?.value }
        let before = referencePitch[low - 1]
        let after = referencePitch[low]
        let span = after.time - before.time
        guard span > 0, span <= 0.30 else {
            return abs(time - before.time) <= abs(after.time - time) ? before.value : after.value
        }
        let fraction = min(1, max(0, (time - before.time) / span))
        return before.value + (after.value - before.value) * fraction
    }

    var graphDuration: TimeInterval {
        max(
            max(references.first(where: { $0.id == selectedReferenceID })?.duration ?? 0,
                referencePitch.map(\.time).max() ?? 0),
            recordingTargetDuration
        )
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

    func toggleRecordingWithCountdown() async {
        if isRecording { await finishRecording(); return }
        guard await runCountdown(title: "Rakaman bermula dalam") else { return }
        await startRecording()
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
            liveStudentPitchPoints = []
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try audioSession.setActive(true)
            if let preferred = preferredMicrophone(from: audioSession.availableInputs ?? []),
               audioSession.currentRoute.inputs.first?.uid != preferred.uid {
                try audioSession.setPreferredInput(preferred)
            }
            refreshMicrophoneStatus()
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
            let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
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
            timer.tolerance = 0.005
            RunLoop.main.add(timer, forMode: .common)
            recordingTimer = timer
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
        guard !isLoadingReferenceAudio else { return }
        guard !selectedReferenceID.isEmpty else { practiceMessage = "Pilih tugasan latihan dahulu."; return }
        isLoadingReferenceAudio = true
        practiceMessage = "Memuatkan audio contoh…"
        defer { isLoadingReferenceAudio = false }
        do {
            // Stop and remove an earlier cached player before writing the new
            // deterministic reference URL. Doing this after the download can
            // delete the newly downloaded file during a rapid second tap.
            stopReferencePlayback()
            let fileURL = try await api.downloadReferenceAudio(referenceID: selectedReferenceID)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
            let player = AVPlayer(url: fileURL)
            player.volume = 1
            player.automaticallyWaitsToMinimizeStalling = true
            referencePlayer = player
            referenceAudioURL = fileURL
            referencePlaybackTime = 0
            isPlayingReference = true
            player.play()
            practiceMessage = "Dengar audio contoh, kemudian tekan Henti apabila bersedia untuk merakam."
            let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] timer in
                guard let self, let player = self.referencePlayer else { timer.invalidate(); return }
                let current = player.currentTime().seconds
                if current.isFinite { self.referencePlaybackTime = current }
                if player.currentItem?.status == .failed {
                    self.practiceMessage = "Audio contoh gagal dimainkan: \(player.currentItem?.error?.localizedDescription ?? "format audio tidak disokong")"
                    self.stopReferencePlayback()
                } else if let duration = player.currentItem?.duration.seconds,
                          duration.isFinite, duration > 0, current >= duration - 0.12 {
                    self.stopReferencePlayback()
                    self.practiceMessage = "Audio contoh selesai. Anda boleh mula merakam."
                }
            }
            timer.tolerance = 0.005
            RunLoop.main.add(timer, forMode: .common)
            playbackTimer = timer
        } catch {
            stopReferencePlayback()
            practiceMessage = "Audio contoh tidak dapat dimainkan: \(error.localizedDescription)"
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
        await startPracticeWithQari(useCountdown: false)
    }

    private func startPracticeWithQari(useCountdown: Bool) async {
        guard !isLoadingReferenceAudio else { return }
        guard !selectedReferenceID.isEmpty else { return }
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permitted else {
            isMicrophoneReady = false
            microphoneStatus = "Akses mikrofon belum dibenarkan"
            practiceMessage = "Benarkan akses mikrofon dalam Settings sebelum memulakan latihan."
            return
        }
        isLoadingReferenceAudio = true
        practiceMessage = "Menyediakan latihan bersama qari…"
        defer { isLoadingReferenceAudio = false }
        do {
            liveStudentPitchPoints = []
            stopReferencePlayback()
            let fileURL = try await api.downloadReferenceAudio(referenceID: selectedReferenceID)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try audioSession.setActive(true)
            if let preferred = preferredMicrophone(from: audioSession.availableInputs ?? []),
               audioSession.currentRoute.inputs.first?.uid != preferred.uid {
                try audioSession.setPreferredInput(preferred)
            }
            refreshMicrophoneStatus()
            try livePitchMonitor.start()
            let player = AVPlayer(url: fileURL)
            // Keep the qari audible as a guide without overpowering the
            // student's voice at the selected microphone.
            player.volume = 0.45
            player.automaticallyWaitsToMinimizeStalling = true
            referencePlayer = player
            referenceAudioURL = fileURL
            referencePlaybackTime = 0
            if useCountdown {
                guard await runCountdown(title: "Latihan bermula dalam") else {
                    stopReferencePlayback()
                    livePitchMonitor.stop()
                    return
                }
            }
            player.play()
            isPlayingReference = true
            isPracticingWithQari = true
            practiceMessage = "Ikuti bacaan qari. Bola jingga menunjukkan nada suara anda."
            let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] timer in
                guard let self, let player = self.referencePlayer else { timer.invalidate(); return }
                let current = player.currentTime().seconds
                if current.isFinite { self.referencePlaybackTime = current }
                if player.currentItem?.status == .failed {
                    self.practiceMessage = "Audio latihan gagal dimainkan: \(player.currentItem?.error?.localizedDescription ?? "format audio tidak disokong")"
                    self.stopReferencePlayback()
                    self.livePitchMonitor.stop()
                    self.isPracticingWithQari = false
                } else if let duration = player.currentItem?.duration.seconds,
                          duration.isFinite, duration > 0, current >= duration - 0.12 {
                    self.stopReferencePlayback()
                    self.livePitchMonitor.stop()
                    self.isPracticingWithQari = false
                    self.practiceMessage = "Latihan bersama qari selesai. Anda boleh ulang atau pergi ke sesi rakaman."
                }
            }
            timer.tolerance = 0.005
            RunLoop.main.add(timer, forMode: .common)
            playbackTimer = timer
        } catch {
            stopReferencePlayback()
            livePitchMonitor.stop()
            isPracticingWithQari = false
            practiceMessage = "Latihan bersama qari tidak dapat dimulakan. Cuba gunakan headset dan cuba semula."
        }
    }

    func togglePracticeWithCountdown() async {
        if isPracticingWithQari { await togglePracticeWithQari(); return }
        await startPracticeWithQari(useCountdown: true)
    }

    private func runCountdown(title: String) async -> Bool {
        let expectedMode = trainingMode
        countdownTitle = title
        for value in stride(from: 5, through: 1, by: -1) {
            guard !Task.isCancelled, trainingMode == expectedMode else {
                countdownValue = nil
                return false
            }
            countdownValue = value
            playCountdownTone(frequency: value == 1 ? 1_050 : 820, duration: 0.24)
            do { try await Task.sleep(nanoseconds: 1_000_000_000) }
            catch { countdownValue = nil; return false }
        }
        countdownValue = nil
        playCountdownTone(frequency: 1_320, duration: 0.42)
        return true
    }

    private func playCountdownTone(frequency: Double, duration: Double) {
        let sampleRate = 44_100
        let sampleCount = max(1, Int(Double(sampleRate) * duration))
        var pcm = Data(capacity: sampleCount * 2)
        for index in 0..<sampleCount {
            let progress = Double(index) / Double(sampleCount)
            let envelope = min(1, progress * 18) * min(1, (1 - progress) * 14)
            let wave = sin(2 * .pi * frequency * Double(index) / Double(sampleRate))
            var sample = Int16(max(-1, min(1, wave * envelope * 0.72)) * Double(Int16.max)).littleEndian
            Swift.withUnsafeBytes(of: &sample) { pcm.append(contentsOf: $0) }
        }
        var wav = Data()
        func appendASCII(_ text: String) { wav.append(text.data(using: .ascii)!) }
        func append16(_ value: UInt16) { var value = value.littleEndian; Swift.withUnsafeBytes(of: &value) { wav.append(contentsOf: $0) } }
        func append32(_ value: UInt32) { var value = value.littleEndian; Swift.withUnsafeBytes(of: &value) { wav.append(contentsOf: $0) } }
        appendASCII("RIFF"); append32(UInt32(36 + pcm.count)); appendASCII("WAVE")
        appendASCII("fmt "); append32(16); append16(1); append16(1); append32(UInt32(sampleRate))
        append32(UInt32(sampleRate * 2)); append16(2); append16(16)
        appendASCII("data"); append32(UInt32(pcm.count)); wav.append(pcm)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(true)
            countdownAudioPlayer = try AVAudioPlayer(data: wav)
            countdownAudioPlayer?.volume = 1
            countdownAudioPlayer?.prepareToPlay()
            countdownAudioPlayer?.play()
        } catch {
            AudioServicesPlaySystemSound(1104)
        }
    }

    func changeTrainingMode(_ mode: KidsTrainingMode) {
        countdownValue = nil
        stopReferencePlayback()
        livePitchMonitor.stop()
        isPracticingWithQari = false
        liveStudentPitchPoints = []
        trainingMode = mode
        practiceMessage = mode == .record
            ? "Tekan Mula Rakaman untuk mendapatkan markah."
            : (mode == .practice ? "Gunakan headset, kemudian latih bacaan bersama qari." : "Dengar audio contoh sebelum berlatih.")
    }

    func retakeRecording() async {
        latestScore = nil
        scoringMessage = ""
        trainingMode = .record
        guard await runCountdown(title: "Rakaman bermula dalam") else { return }
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
        liveStudentPitchPoints = []
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
        referencePlayer?.pause()
        referencePlayer = nil
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
    @State private var graphZoom = 1.0
    @State private var graphAutoFollow = true
    @State private var isGraphFullScreen = false
    var body: some View {
        NavigationStack {
            ScrollView {
                Group {
                    if !model.isAuthorized {
                        onboardingHeader
                        authorizationView
                    } else if !model.isSignedIn {
                        onboardingHeader
                        loginView
                    } else {
                        progressView
                    }
                }
                .padding(.horizontal, 32).padding(.vertical, 20)
                .frame(maxWidth: model.isSignedIn ? 1180 : 620)
                .frame(maxWidth: .infinity)
            }
            .background(
                LinearGradient(colors: [Color(red: 0.95, green: 1.0, blue: 0.985), .white],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
            )
            .familyActivityPicker(isPresented: $model.isPickerPresented, selection: $model.selection)
            .onChange(of: model.selection) { _, value in model.saveSelection(value) }
            .fullScreenCover(isPresented: $isGraphFullScreen) {
                PitchFullScreenView(
                    zoom: $graphZoom,
                    autoFollow: $graphAutoFollow,
                    isPresented: $isGraphFullScreen
                )
                .environmentObject(model)
            }
            .overlay {
                if let value = model.countdownValue {
                    CountdownOverlay(value: value, title: model.countdownTitle)
                }
            }
        }
    }

    private var onboardingHeader: some View {
        VStack(spacing: 10) {
            Image("TarannumKidsLogo")
                .resizable().scaledToFit().frame(width: 104, height: 104)
                .clipShape(Circle())
            Text("Tarannum Kids").font(.largeTitle.bold()).foregroundStyle(kidsTeal)
            Text(model.message).multilineTextAlignment(.center)
        }
        .padding(.bottom, 22)
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
        VStack(spacing: 18) {
            dashboardHeader
            studentProgressCard
            taskCard
            activitySelection
            guidanceBanner
            primaryActivityButton
            scoringDashboardCard
        }
    }

    private var kidsTeal: Color { Color(red: 0.0, green: 0.48, blue: 0.40) }
    private var kidsEmerald: Color { Color(red: 0.0, green: 0.67, blue: 0.43) }

    private var dashboardHeader: some View {
        HStack(spacing: 14) {
            Image("TarannumKidsLogo")
                .resizable().scaledToFit().frame(width: 70, height: 70).clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Tarannum Kids").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(kidsTeal)
                Text("Mencintai Al-Quran, Melahirkan Generasi Mulia")
                    .font(.subheadline).foregroundStyle(kidsTeal.opacity(0.8))
            }
            Spacer()
            Menu {
                Button("Pilih aplikasi untuk dilindungi", systemImage: "shield.lefthalf.filled") {
                    model.isPickerPresented = true
                }
                Button("Log keluar", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    model.signOut()
                }
            } label: {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 42)).foregroundStyle(kidsTeal)
            }
        }
    }

    private var studentProgressCard: some View {
        HStack(spacing: 18) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 62)).foregroundStyle(kidsTeal)
                .frame(width: 82, height: 82)
                .background(Color.green.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 8) {
                Text("Assalamualaikum, \(studentFirstName)").font(.title2.bold())
                    .foregroundStyle(Color(red: 0.04, green: 0.10, blue: 0.28))
                Text("Baki latihan: \(remainingMinutes) minit").font(.headline).foregroundStyle(.secondary)
                ProgressView(value: Double(model.access?.creditedSeconds ?? 0),
                             total: Double(model.access?.requiredSeconds ?? KidsConstants.requiredPracticeSeconds))
                    .tint(kidsEmerald)
                if let access = model.access {
                    Text(progressText(access)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(model.isRefreshing ? "Sedang menyemak…" : "Semak Kemajuan") {
                Task { await model.refreshAccess() }
            }
            .buttonStyle(.bordered).tint(kidsTeal).controlSize(.large).disabled(model.isRefreshing)
        }
        .dashboardCard()
    }

    private var taskCard: some View {
        HStack(spacing: 18) {
            Image(systemName: "book.closed.fill")
                .font(.system(size: 38)).foregroundStyle(kidsEmerald)
                .frame(width: 72, height: 72).background(Color.green.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text("TUGASAN HARI INI").font(.caption.bold()).foregroundStyle(.secondary)
                Text(selectedReferenceTitle).font(.title2.bold())
                    .foregroundStyle(Color(red: 0.04, green: 0.10, blue: 0.28))
                Text("Qari: Custom Upload").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Menu {
                ForEach(model.references) { reference in
                    Button(reference.maqam?.isEmpty == false ? "\(reference.title) · \(reference.maqam!)" : reference.title) {
                        model.selectedReferenceID = reference.id
                        model.selectedReferenceChanged()
                    }
                }
            } label: {
                Label("Tukar", systemImage: "arrow.triangle.2.circlepath")
            }
            .buttonStyle(.bordered).tint(kidsTeal).controlSize(.large)
        }
        .dashboardCard()
    }

    private var activitySelection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PILIH AKTIVITI").font(.title3.bold())
                .foregroundStyle(Color(red: 0.04, green: 0.10, blue: 0.28))
            HStack(spacing: 14) {
                activityCard(mode: .listen, artwork: "KidsListen", title: "Dengar",
                             subtitle: "Dengar dan perhatikan alunan qari", color: .blue)
                activityCard(mode: .practice, artwork: "KidsPractice", title: "Latih",
                             subtitle: "Ikuti bacaan qari sambil melihat nada", color: kidsTeal)
                activityCard(mode: .record, artwork: "KidsRecord", title: "Rakam & Nilai",
                             subtitle: "Rakam bacaan untuk mendapatkan markah", color: .orange)
            }
        }
    }

    private func activityCard(mode: KidsTrainingMode, artwork: String, title: String,
                              subtitle: String, color: Color) -> some View {
        let selected = model.trainingMode == mode
        return Button {
            model.changeTrainingMode(mode)
        } label: {
            HStack(spacing: 14) {
                Image(artwork).resizable().scaledToFit()
                    .frame(width: 76, height: 76)
                    .background(color.opacity(0.09), in: Circle())
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.title3.bold()).foregroundStyle(color)
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "chevron.right.circle.fill")
                    .font(.title2).foregroundStyle(color)
            }
            .padding(18).frame(maxWidth: .infinity, minHeight: 118)
            .background(selected ? color.opacity(0.10) : Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(color.opacity(selected ? 1 : 0.22), lineWidth: selected ? 2.5 : 1))
        }
        .buttonStyle(.plain)
    }

    private var guidanceBanner: some View {
        Label(activityGuidance, systemImage: guidanceIcon)
            .font(.headline).foregroundStyle(kidsTeal)
            .frame(maxWidth: .infinity).padding(.vertical, 13)
            .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
    }

    private var primaryActivityButton: some View {
        Button {
            graphZoom = 1
            graphAutoFollow = true
            isGraphFullScreen = true
        } label: {
            Label(primaryActivityTitle, systemImage: "play.fill")
                .font(.title3.bold()).frame(maxWidth: .infinity).padding(.vertical, 15)
        }
        .buttonStyle(.plain).foregroundStyle(.white)
        .background(LinearGradient(colors: [kidsEmerald, kidsTeal], startPoint: .leading, endPoint: .trailing),
                    in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: kidsTeal.opacity(0.20), radius: 10, y: 5)
        .disabled(model.references.isEmpty || model.isLoadingReferencePitch)
    }

    @ViewBuilder private var scoringDashboardCard: some View {
        if model.isSubmittingRecording || model.isWaitingForScore {
            HStack(spacing: 14) {
                ProgressView()
                VStack(alignment: .leading) {
                    Text("Menganalisis bacaan…").font(.headline)
                    Text(model.scoringMessage).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
            }.dashboardCard()
        } else if let score = model.latestScore {
            HStack(spacing: 18) {
                Image(systemName: "trophy.fill").font(.system(size: 32)).foregroundStyle(.green)
                    .frame(width: 64, height: 64).background(Color.green.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("KEPUTUSAN TERAKHIR").font(.caption.bold()).foregroundStyle(.secondary)
                    Text("\(Int(score.score.rounded()))%").font(.system(size: 36, weight: .bold, design: .rounded)).foregroundStyle(scoreColor(score.score))
                }
                Divider().frame(height: 42)
                Text(localizedScoreLabel(score.score)).font(.headline)
                Spacer()
                Button("Rakam Semula") { Task { await model.retakeRecording(); isGraphFullScreen = true } }
                    .buttonStyle(.borderedProminent).tint(kidsEmerald)
                Button("Latih Semula") { model.practiceAgain(); isGraphFullScreen = true }
                    .buttonStyle(.bordered).tint(kidsTeal)
            }.dashboardCard()
        }
    }

    private var studentFirstName: String {
        let name = model.session?.fullName ?? model.session?.email ?? "Pelajar"
        return name.split(separator: " ").first.map(String.init) ?? name
    }

    private var remainingMinutes: Int {
        Int(ceil(Double(model.access?.remainingSeconds ?? KidsConstants.requiredPracticeSeconds) / 60))
    }

    private var selectedReferenceTitle: String {
        guard let reference = selectedReference else { return "Memuatkan tugasan…" }
        if let maqam = reference.maqam, !maqam.isEmpty { return "\(reference.title) • \(maqam)" }
        return reference.title
    }

    private var activityGuidance: String {
        switch model.trainingMode {
        case .listen: return "Dengar dan perhatikan pergerakan nada qari."
        case .practice: return "Gunakan fon kepala dan ikuti bacaan qari."
        case .record: return "Rakam bacaan penuh untuk mendapatkan markah."
        }
    }

    private var guidanceIcon: String {
        switch model.trainingMode {
        case .listen: return "headphones"
        case .practice: return "mic.fill"
        case .record: return "record.circle"
        }
    }

    private var primaryActivityTitle: String {
        switch model.trainingMode {
        case .listen: return "Buka Studio Dengar"
        case .practice: return "Buka Studio Latihan"
        case .record: return "Buka Studio Rakaman"
        }
    }

    private var selectedReference: PracticeReference? {
        model.references.first(where: { $0.id == model.selectedReferenceID })
    }

    private var graphStatusHeader: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("LIVE PITCH · NADA LANGSUNG").font(.caption2.bold()).foregroundStyle(.white.opacity(0.65))
                if let pitch = model.liveStudentPitch, model.trainingMode != .listen {
                    Text("\(Int(midiToHz(pitch).rounded())) Hz")
                        .font(.title2.monospacedDigit().bold()).foregroundStyle(.blue)
                } else if let pitch = model.referenceMarkerPitch {
                    Text("\(Int(midiToHz(pitch).rounded())) Hz")
                        .font(.title2.monospacedDigit().bold()).foregroundStyle(.blue)
                } else {
                    Text("— Hz").font(.title2.monospacedDigit().bold()).foregroundStyle(.white.opacity(0.65))
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                Text("\(formattedDuration(model.graphTimelineTime ?? 0)) / \(formattedDuration(model.graphDuration))")
                    .font(.subheadline.monospacedDigit()).foregroundStyle(.white)
                ProgressView(value: model.graphTimelineTime ?? 0, total: max(1, model.graphDuration))
                    .frame(width: 150)
                    .tint(.blue)
                Label(model.graphTimelineTime == nil ? "Menunggu sesi" : "Nada dikesan",
                      systemImage: model.graphTimelineTime == nil ? "circle" : "circle.fill")
                    .font(.caption2)
                    .foregroundStyle(model.graphTimelineTime == nil ? Color.white.opacity(0.55) : Color.green)
            }
        }
        .padding(12)
        .background(
            LinearGradient(colors: [Color(red: 0.08, green: 0.18, blue: 0.38),
                                    Color(red: 0.16, green: 0.08, blue: 0.30)],
                           startPoint: .leading, endPoint: .trailing),
            in: RoundedRectangle(cornerRadius: 12)
        )
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.blue.opacity(0.65), lineWidth: 1))
    }

    private func midiToHz(_ midi: Double) -> Double {
        440 * pow(2, (midi - 69) / 12)
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

private extension View {
    func dashboardCard() -> some View {
        self
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(Color.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.green.opacity(0.10)))
            .shadow(color: Color.black.opacity(0.055), radius: 12, y: 5)
    }
}

private struct CountdownOverlay: View {
    let value: Int
    let title: String

    var body: some View {
        ZStack {
            Color.black.opacity(0.72).ignoresSafeArea()
            VStack(spacing: 18) {
                Text(title)
                    .font(.title.bold())
                    .foregroundStyle(.white.opacity(0.9))
                Text(value > 0 ? "\(value)" : "MULA!")
                    .font(.system(size: 112, weight: .heavy, design: .rounded))
                    .foregroundStyle(value > 0 ? .white : .green)
                    .contentTransition(.numericText())
                Text("Bersedia dan mula membaca apabila kiraan tamat.")
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(40)
        }
        .transition(.opacity)
        .zIndex(100)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(value > 0 ? "\(title) \(value)" : "Mula")
    }
}

private struct AyahWindow: View {
    let segments: [PracticeTextSegment]
    let currentTime: TimeInterval
    var darkStyle = false

    private var visibleIndices: [Int] {
        guard !segments.isEmpty else { return [] }
        let activeIndex = segments.lastIndex(where: { currentTime >= $0.start }) ?? 0
        let end = min(segments.count, activeIndex + 2)
        return Array(activeIndex..<end)
    }

    var body: some View {
        VStack(spacing: 6) {
            ForEach(visibleIndices, id: \.self) { index in
                let segment = segments[index]
                let isActive = currentTime >= segment.start && currentTime < segment.end
                    || (index == segments.count - 1 && currentTime >= segment.start)
                AyahWindowRow(
                    number: index + 1,
                    text: segment.text,
                    isActive: isActive,
                    darkStyle: darkStyle
                )
            }
        }
    }
}

private struct AyahWindowRow: View {
    let number: Int
    let text: String
    let isActive: Bool
    let darkStyle: Bool

    private var numberColor: Color {
        isActive ? .white : .secondary
    }

    private var numberBackground: Color {
        isActive ? .green : Color.secondary.opacity(0.12)
    }

    private var textColor: Color {
        guard darkStyle else { return .primary }
        return isActive ? .white : Color.white.opacity(0.58)
    }

    private var rowBackground: Color {
        if isActive {
            return darkStyle ? Color.teal.opacity(0.22) : Color.green.opacity(0.10)
        }
        return darkStyle ? Color.white.opacity(0.035) : Color.secondary.opacity(0.05)
    }

    private var borderColor: Color {
        isActive ? .green : (darkStyle ? Color.white.opacity(0.10) : .clear)
    }

    var body: some View {
        ZStack {
            Text(text)
                .font(.title3)
                .foregroundStyle(textColor)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 40)
            HStack {
            Text("\(number)")
                .font(.caption.bold())
                .foregroundStyle(numberColor)
                .frame(width: 24, height: 24)
                .background(numberBackground, in: Circle())
                Spacer()
            }
        }
        .padding(10)
        .background(rowBackground, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(borderColor, lineWidth: 1.5)
        }
    }
}

private struct PitchFullScreenView: View {
    @EnvironmentObject private var model: KidsViewModel
    @Binding var zoom: Double
    @Binding var autoFollow: Bool
    @Binding var isPresented: Bool
    @State private var manualStartTime: Double = 0
    @State private var dragStartTime: Double?

    private var reference: PracticeReference? {
        model.references.first(where: { $0.id == model.selectedReferenceID })
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 14) {
                HStack {
                    Text(modeTitle).font(.title2.bold()).foregroundStyle(.white)
                    if model.trainingMode != .listen {
                        Label(model.microphoneStatus,
                              systemImage: model.isMicrophoneReady ? "mic.circle.fill" : "mic.slash.circle.fill")
                            .font(.caption.bold())
                            .foregroundStyle(model.isMicrophoneReady ? Color.green : Color.orange)
                            .padding(.horizontal, 10).padding(.vertical, 7)
                            .background(Color.white.opacity(0.07), in: Capsule())
                        Button { Task { await model.auditMicrophone() } } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered).tint(.white)
                        .accessibilityLabel("Periksa semula mikrofon")
                    }
                    Spacer()
                    Text("Zoom: \(Int(zoom * 100))%")
                        .font(.subheadline.bold().monospacedDigit())
                        .foregroundStyle(.white.opacity(0.78))
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.18)))
                }

                livePitchBanner

                PitchComparisonGraph(
                    reference: model.referencePitch,
                    student: model.liveStudentPitchPoints,
                    progressTime: model.graphTimelineTime,
                    duration: model.graphDuration,
                    zoom: zoom,
                    autoFollow: autoFollow,
                    manualStartTime: manualStartTime,
                    segments: reference?.textSegments ?? [],
                    referenceMarkerPitch: model.referenceMarkerPitch,
                    studentMarkerPitch: model.trainingMode == .listen ? nil : model.liveStudentPitch
                )
                .frame(height: max(280, proxy.size.height * 0.49))
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 8)
                        .onChanged { value in
                            let fullDuration = max(1, model.graphDuration)
                            let visibleDuration = fullDuration / max(0.5, zoom)
                            if dragStartTime == nil {
                                dragStartTime = autoFollow
                                    ? max(0, (model.graphTimelineTime ?? 0) - visibleDuration * 0.5)
                                    : manualStartTime
                                autoFollow = false
                            }
                            let width = max(1, proxy.size.width - 36)
                            let delta = Double(value.translation.width / width) * visibleDuration
                            let maximumStart = max(0, fullDuration - visibleDuration)
                            manualStartTime = min(maximumStart, max(0, (dragStartTime ?? 0) - delta))
                        }
                        .onEnded { _ in dragStartTime = nil }
                )
                .overlay(alignment: .topTrailing) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Rujukan (Hijau)").foregroundStyle(.green)
                        Text("Pelajar (Merah)").foregroundStyle(.red)
                    }
                    .font(.caption.bold()).padding(12)
                }

                HStack(spacing: 22) {
                    Label("Qari", systemImage: "minus").foregroundStyle(.green)
                    Label("Pelajar", systemImage: "minus").foregroundStyle(.red)
                    Label("Kedudukan", systemImage: "line.diagonal").foregroundStyle(.blue)
                    Spacer()
                    Text("\(format(model.graphTimelineTime ?? 0)) / \(format(model.graphDuration))")
                        .monospacedDigit().foregroundStyle(.white)
                }
                AyahWindow(segments: reference?.textSegments ?? [],
                           currentTime: model.graphTimelineTime ?? 0,
                           darkStyle: true)
                Spacer(minLength: 0)
                bottomControlBar
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 8)
            .background(Color(red: 0.055, green: 0.080, blue: 0.145).ignoresSafeArea())
            .overlay {
                if let value = model.countdownValue {
                    CountdownOverlay(value: value, title: model.countdownTitle)
                }
            }
            .onChange(of: model.isRecording) { wasRecording, isRecording in
                if wasRecording && !isRecording && model.trainingMode == .record {
                    isPresented = false
                }
            }
            .task {
                if model.trainingMode != .listen { await model.auditMicrophone() }
            }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { _ in
                guard model.trainingMode != .listen else { return }
                Task { await model.auditMicrophone() }
            }
        }
    }

    private var modeTitle: String {
        switch model.trainingMode {
        case .listen: return "Studio Dengar Qari"
        case .practice: return "Studio Latih Bersama Qari"
        case .record: return "Studio Rakaman"
        }
    }

    private var livePitchBanner: some View {
        HStack(spacing: 24) {
            VStack(alignment: .leading, spacing: 5) {
                Text("LIVE PITCH").font(.caption.bold()).foregroundStyle(.white.opacity(0.62))
                let pitch = model.trainingMode == .listen ? model.referenceMarkerPitch : model.liveStudentPitch
                Text(pitch.map { "\(Int((440 * pow(2, ($0 - 69) / 12)).rounded())) Hz" } ?? "--- Hz")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.blue)
            }
            Spacer()
            Text("\(format(model.graphTimelineTime ?? 0)) / \(format(model.graphDuration))")
                .font(.headline.monospacedDigit()).foregroundStyle(.white)
            ProgressView(value: model.graphTimelineTime ?? 0, total: max(1, model.graphDuration))
                .tint(.blue).frame(width: 180)
        }
        .padding(.horizontal, 24).padding(.vertical, 14)
        .background(
            LinearGradient(colors: [Color(red: 0.06, green: 0.18, blue: 0.38),
                                    Color(red: 0.17, green: 0.07, blue: 0.29)],
                           startPoint: .leading, endPoint: .trailing),
            in: RoundedRectangle(cornerRadius: 9)
        )
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.blue.opacity(0.7)))
    }

    private var bottomControlBar: some View {
        HStack(spacing: 12) {
            primarySessionButton
            Divider().frame(height: 38).overlay(Color.white.opacity(0.15))
            Button("Rujukan") { Task { await model.toggleReferencePlayback() } }
                .buttonStyle(.borderedProminent).tint(.blue.opacity(0.48))
                .disabled(model.isLoadingReferenceAudio)
            Button { Task { await model.toggleReferencePlayback() } } label: {
                Image(systemName: model.isPlayingReference ? "pause.fill" : "play.fill")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.blue)
            .disabled(model.isLoadingReferenceAudio)
            Button { Task { await stopCurrentSession() } } label: {
                Image(systemName: "stop.fill").frame(width: 24, height: 24)
            }
            .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.gray)
            Button { zoom = 1; manualStartTime = 0; autoFollow = true } label: {
                Image(systemName: "arrow.clockwise").frame(width: 24, height: 24)
            }
            .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.gray)
            Button { Task { await restartCurrentSession() } } label: {
                Label("Ulang", systemImage: "repeat")
            }
            .buttonStyle(.bordered).tint(.white)
            Spacer()
            Button { zoom = max(0.5, zoom - 0.25) } label: { Image(systemName: "minus.magnifyingglass") }
                .disabled(zoom <= 0.5)
            Button { zoom = min(4, zoom + 0.25) } label: { Image(systemName: "plus.magnifyingglass") }
                .disabled(zoom >= 4)
            Button { autoFollow.toggle() } label: {
                Image(systemName: autoFollow ? "location.fill" : "location")
            }
            .foregroundStyle(autoFollow ? Color.green : Color.white)
            Button { isPresented = false } label: {
                Image(systemName: "xmark").frame(width: 28, height: 28)
            }
            .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.red)
        }
        .buttonStyle(.bordered)
        .tint(.white)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color(red: 0.075, green: 0.12, blue: 0.21), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.12)))
    }

    @ViewBuilder private var primarySessionButton: some View {
        switch model.trainingMode {
        case .listen:
            Button { Task { await model.toggleReferencePlayback() } } label: {
                Label(model.isLoadingReferenceAudio ? "Menyediakan…" : (model.isPlayingReference ? "Henti Dengar" : "Dengar Qari"),
                      systemImage: model.isLoadingReferenceAudio ? "hourglass" : "headphones")
            }
            .buttonStyle(.borderedProminent).tint(.green)
            .disabled(model.isLoadingReferenceAudio)
        case .practice:
            Button { Task { await model.togglePracticeWithCountdown() } } label: {
                Label(model.isLoadingReferenceAudio ? "Menyediakan…" : (model.isPracticingWithQari ? "Henti Latihan" : "Mula Latihan"),
                      systemImage: model.isLoadingReferenceAudio ? "hourglass" : "mic.fill")
            }
            .buttonStyle(.borderedProminent).tint(model.isPracticingWithQari ? .red : .green)
            .disabled(model.isLoadingReferenceAudio)
        case .record:
            Button { Task { await model.toggleRecordingWithCountdown() } } label: {
                Label(model.isRecording ? "Selesai Rakaman" : "Mula Rakaman", systemImage: "record.circle")
            }
            .buttonStyle(.borderedProminent).tint(model.isRecording ? .red : .green)
        }
    }

    private func stopCurrentSession() async {
        if model.isRecording { await model.toggleRecordingWithCountdown() }
        else if model.isPracticingWithQari { await model.togglePracticeWithCountdown() }
        else if model.isPlayingReference { await model.toggleReferencePlayback() }
    }

    private func restartCurrentSession() async {
        zoom = 1
        autoFollow = true
        switch model.trainingMode {
        case .listen:
            if model.isPlayingReference { await model.toggleReferencePlayback() }
            await model.toggleReferencePlayback()
        case .practice:
            if model.isPracticingWithQari { await model.togglePracticeWithQari() }
            await model.togglePracticeWithCountdown()
        case .record:
            if !model.isRecording { await model.toggleRecordingWithCountdown() }
        }
    }

    private func format(_ duration: TimeInterval) -> String {
        let total = max(0, Int(duration))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

private struct PitchComparisonGraph: View {
    let reference: [ScoringPitchPoint]
    let student: [ScoringPitchPoint]
    var progressTime: TimeInterval? = nil
    let duration: TimeInterval
    let zoom: Double
    let autoFollow: Bool
    var manualStartTime: Double = 0
    let segments: [PracticeTextSegment]
    var referenceMarkerPitch: Double? = nil
    var studentMarkerPitch: Double? = nil

    var body: some View {
        Canvas { context, size in
            let left: CGFloat = 46, right: CGFloat = 10, top: CGFloat = 10, bottom: CGFloat = 27
            let plot = CGRect(x: left, y: top, width: max(1, size.width - left - right), height: max(1, size.height - top - bottom))
            let fullDuration = max(1, max(duration, reference.map(\.time).max() ?? 0))
            let followScale = autoFollow && progressTime != nil ? max(2, zoom) : max(0.5, zoom)
            let visibleDuration = fullDuration / followScale
            let desiredStart = autoFollow ? (progressTime ?? 0) - visibleDuration * 0.5 : manualStartTime
            // Keep the playhead centred after it reaches the middle. Near the
            // end, allow empty future space so the graph continues travelling
            // towards the fixed playhead instead of pushing it to the edge.
            let maximumStart = max(0, fullDuration - visibleDuration)
            let startTime = autoFollow ? max(0, desiredStart) : min(maximumStart, max(0, desiredStart))
            let endTime = startTime + visibleDuration
            let minPitch = midi(forHz: 60), maxPitch = midi(forHz: 600)
            let pitchRange = maxPitch - minPitch

            func x(_ time: Double) -> CGFloat {
                plot.minX + CGFloat((time - startTime) / visibleDuration) * plot.width
            }
            func y(_ pitch: Double) -> CGFloat {
                plot.maxY - CGFloat((pitch - minPitch) / pitchRange) * plot.height
            }

            for hz in [60.0, 168, 276, 384, 492, 600] {
                let gridY = y(midi(forHz: hz))
                var grid = Path()
                grid.move(to: CGPoint(x: plot.minX, y: gridY))
                grid.addLine(to: CGPoint(x: plot.maxX, y: gridY))
                context.stroke(grid, with: .color(.secondary.opacity(0.16)), lineWidth: 1)
                context.draw(Text("\(Int(hz)) Hz").font(.system(size: 9)).foregroundStyle(.secondary),
                             at: CGPoint(x: 2, y: gridY), anchor: .leading)
            }
            for tick in 0...5 {
                let tickTime = startTime + visibleDuration * Double(tick) / 5
                let tickX = x(tickTime)
                var grid = Path()
                grid.move(to: CGPoint(x: tickX, y: plot.minY))
                grid.addLine(to: CGPoint(x: tickX, y: plot.maxY))
                context.stroke(grid, with: .color(.secondary.opacity(0.10)), lineWidth: 1)
                context.draw(Text(formatSeconds(tickTime)).font(.system(size: 9)).foregroundStyle(.secondary),
                             at: CGPoint(x: tickX, y: plot.maxY + 13), anchor: .center)
            }
            for segment in segments where segment.start >= startTime && segment.start <= endTime {
                let markerX = x(segment.start)
                var marker = Path()
                marker.move(to: CGPoint(x: markerX, y: plot.minY))
                marker.addLine(to: CGPoint(x: markerX, y: plot.maxY))
                let time = progressTime ?? -1
                let active = time >= segment.start && time < segment.end
                let markerColor: Color = active ? .green : (segment.start > time ? .orange : .teal)
                context.stroke(marker, with: .color(markerColor.opacity(active ? 0.9 : 0.65)),
                               style: StrokeStyle(lineWidth: active ? 2 : 1.5, dash: [5, 4]))
            }

            func draw(_ points: [ScoringPitchPoint], color: Color, breakAtVoiceGaps: Bool = false) {
                let sampled = downsample(points.filter { $0.time >= startTime && $0.time <= endTime }, maximumCount: 700)
                guard let first = sampled.first else { return }
                func position(_ point: ScoringPitchPoint) -> CGPoint {
                    CGPoint(x: x(point.time), y: y(point.value))
                }
                var path = Path()
                path.move(to: position(first))
                var previous = first
                for point in sampled.dropFirst() {
                    // Do not draw a diagonal bridge through pauses or
                    // unvoiced consonants. The web graph also leaves these
                    // short silence regions open.
                    // The live detector can miss a few frames on soft vowels.
                    // Preserve real pauses, but bridge short detection dropouts
                    // so a sustained recitation does not look fragmented.
                    if breakAtVoiceGaps && point.time - previous.time > 0.70 {
                        path.move(to: position(point))
                    } else {
                        path.addLine(to: position(point))
                    }
                    previous = point
                }
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }

            let stableStudent = smoothedStudentPoints(student, reference: reference)
            // Both contours stay visually continuous across short detector
            // gaps so the guide remains easy for children to follow.
            draw(reference, color: .green)
            // Keep the student's guide visually continuous across breathing
            // pauses and transitions between ayat. Missing detector frames are
            // still excluded from the data; the graph only joins both sides.
            draw(stableStudent, color: .red)
            if let progressTime {
                let cursorX = min(plot.maxX, max(plot.minX, x(progressTime)))
                var playhead = Path()
                playhead.move(to: CGPoint(x: cursorX, y: plot.minY))
                playhead.addLine(to: CGPoint(x: cursorX, y: plot.maxY))
                context.stroke(playhead, with: .color(.blue.opacity(0.85)), lineWidth: 2)
                func ball(_ pitch: Double?, color: Color, radius: CGFloat) {
                    guard let pitch else { return }
                    let markerY = min(plot.maxY, max(plot.minY, y(pitch)))
                    let ball = CGRect(x: cursorX - radius, y: markerY - radius, width: radius * 2, height: radius * 2)
                    context.fill(Path(ellipseIn: ball), with: .color(color))
                    context.stroke(Path(ellipseIn: ball), with: .color(.white), lineWidth: 2)
                }
                ball(referenceMarkerPitch, color: .cyan, radius: 7)
                let stableStudentMarker = studentMarkerPitch == nil ? nil : stableStudent.last?.value
                ball(stableStudentMarker, color: .red, radius: 6)
            }
        }
        .background(.white, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel("Graf perbandingan nada audio contoh dan bacaan pelajar")
    }

    private func midi(forHz hz: Double) -> Double { 69 + 12 * log2(hz / 440) }

    private func formatSeconds(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func smoothedStudentPoints(_ points: [ScoringPitchPoint], reference: [ScoringPitchPoint]) -> [ScoringPitchPoint] {
        guard let first = points.first else { return [] }
        func nearestReferenceValue(at time: Double) -> Double? {
            guard !reference.isEmpty else { return nil }
            var low = 0
            var high = reference.count
            while low < high {
                let middle = (low + high) / 2
                if reference[middle].time < time { low = middle + 1 }
                else { high = middle }
            }
            if low == 0 { return reference[0].value }
            if low >= reference.count { return reference.last?.value }
            let before = reference[low - 1]
            let after = reference[low]
            return abs(time - before.time) <= abs(after.time - time) ? before.value : after.value
        }
        func octaveCorrected(_ value: Double, at time: Double) -> Double {
            guard let target = nearestReferenceValue(at: time) else { return value }
            // Live autocorrelation may lock onto a harmonic above or below
            // the sung note. Select the octave-equivalent candidate nearest
            // the reference contour used by the authoritative backend score.
            return (-3...3)
                .map { value + Double($0 * 12) }
                .min(by: { abs($0 - target) < abs($1 - target) }) ?? value
        }
        let correctedFirst = ScoringPitchPoint(time: first.time, value: octaveCorrected(first.value, at: first.time))
        var output = [correctedFirst]
        var previous = correctedFirst.value
        var recent = [correctedFirst.value]

        for point in points.dropFirst() {
            var corrected = octaveCorrected(point.value, at: point.time)

            // A breath or ayat boundary starts a new phrase. Reset the
            // smoothing history so the previous phrase cannot pull the next
            // detected note towards an obsolete pitch.
            if let lastPoint = output.last, point.time - lastPoint.time > 0.70 {
                previous = corrected
                recent = [corrected]
                output.append(ScoringPitchPoint(time: point.time, value: corrected))
                continue
            }

            // Pitch trackers commonly report the same note one or more
            // octaves too high/low. Fold those jumps back near the preceding
            // note before applying a light exponential smoothing pass.
            while corrected - previous > 7 { corrected -= 12 }
            while previous - corrected > 7 { corrected += 12 }

            // Allow genuine melodic movement to appear promptly. Five
            // semitones per sample still rejects implausible tracker spikes,
            // while being noticeably more responsive than the old 3-semitone
            // cap for children's voices.
            let limitedDelta = min(5.0, max(-5.0, corrected - previous))
            recent.append(previous + limitedDelta)
            if recent.count > 5 { recent.removeFirst() }

            // Use a short robust window to reject isolated octave errors
            // without flattening valid changes in the student's melody.
            let sorted = recent.sorted()
            let lower = Int(floor(Double(sorted.count) * 0.25))
            let upper = max(lower + 1, Int(ceil(Double(sorted.count) * 0.75)))
            let middle = sorted[lower..<min(sorted.count, upper)]
            let trimmedMean = middle.reduce(0, +) / Double(middle.count)
            let smoothed = previous + (trimmedMean - previous) * 0.58
            output.append(ScoringPitchPoint(time: point.time, value: smoothed))
            previous = smoothed
        }
        return output
    }

    private func downsample(_ points: [ScoringPitchPoint], maximumCount: Int) -> [ScoringPitchPoint] {
        guard points.count > maximumCount else { return points }
        let stride = max(1, points.count / maximumCount)
        return Swift.stride(from: 0, to: points.count, by: stride).map { points[$0] }
    }
}
