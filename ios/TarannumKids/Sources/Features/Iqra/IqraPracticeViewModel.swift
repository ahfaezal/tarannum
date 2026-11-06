import AVFoundation
import AudioToolbox
import SwiftUI

@MainActor
final class IqraPracticeViewModel: NSObject, ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var isSubmitting = false
    @Published private(set) var result: IqraAssessmentResult?
    @Published private(set) var message = "Tekan Mula Baca apabila bersedia."
    @Published private(set) var countdownValue: Int?
    @Published private(set) var activeWordRange: Range<Int>?
    @Published private(set) var isPreparing = false

    private let api = KidsAPIClient()
    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var guideTask: Task<Void, Never>?

    func toggleRecording(for sample: IqraSample) async {
        if isRecording {
            await stopAndAssess(sample: sample)
        } else if !isPreparing {
            await startRecording(for: sample)
        }
    }

    private func startRecording(for sample: IqraSample) async {
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permitted else {
            message = "Benarkan akses mikrofon dalam Settings untuk membuat latihan IQRA."
            return
        }

        do {
            result = nil
            isPreparing = true
            message = "Bersedia. Bacakan satu perkataan apabila ia berwarna hijau."
            for value in stride(from: 3, through: 1, by: -1) {
                countdownValue = value
                AudioServicesPlaySystemSound(1104)
                try await Task.sleep(for: .seconds(1))
            }
            countdownValue = nil
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try session.setActive(true)

            let url = FileManager.default.temporaryDirectory
                .appending(path: "iqra-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.prepareToRecord()
            guard recorder.record() else {
                throw KidsAPIError.server("Rakaman IQRA tidak dapat dimulakan.")
            }

            self.recorder = recorder
            recordingURL = url
            isRecording = true
            isPreparing = false
            message = sample.level == .six
                ? "Baca ayat secara bersambung mengikut frasa yang ditandakan."
                : "Ikut penanda hijau dan sebut satu perkataan pada satu masa."
            startReadingGuide(for: sample)
        } catch {
            countdownValue = nil
            isPreparing = false
            message = error.localizedDescription
        }
    }

    private func startReadingGuide(for sample: IqraSample) {
        guideTask?.cancel()
        guideTask = Task { @MainActor [weak self] in
            // Keep the recorder open briefly before the first cue so the
            // beginning of a connected ayah is not clipped by audio-session
            // activation or by the child's first breath.
            self?.activeWordRange = nil
            try? await Task.sleep(for: .milliseconds(700))
            for range in sample.guideRanges {
                guard !Task.isCancelled, self?.isRecording == true else { return }
                self?.activeWordRange = range
                if sample.level == .three { AudioServicesPlaySystemSound(1104) }
                let milliseconds = sample.level == .six ? 3400 : 2200
                try? await Task.sleep(for: .milliseconds(milliseconds))
            }
            guard !Task.isCancelled else { return }
            self?.activeWordRange = nil
            self?.message = "Selesai membaca? Tekan Selesai & Semak."
        }
    }

    private func stopAndAssess(sample: IqraSample) async {
        recorder?.stop()
        guideTask?.cancel()
        guideTask = nil
        activeWordRange = nil
        recorder = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )

        guard let recordingURL else {
            message = "Rakaman IQRA tidak ditemui. Cuba semula."
            return
        }

        isSubmitting = true
        message = "Azure sedang menilai bacaan…"
        defer {
            isSubmitting = false
            self.recordingURL = nil
            try? FileManager.default.removeItem(at: recordingURL)
        }

        do {
            result = try await api.assessIqra(sampleID: sample.id, fileURL: recordingURL)
            message = "Penilaian selesai."
        } catch {
            message = error.localizedDescription
        }
    }
}
