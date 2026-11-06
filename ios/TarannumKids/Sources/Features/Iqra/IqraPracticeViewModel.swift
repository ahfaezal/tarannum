import AVFoundation
import SwiftUI

@MainActor
final class IqraPracticeViewModel: NSObject, ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var isSubmitting = false
    @Published private(set) var result: IqraAssessmentResult?
    @Published private(set) var message = "Tekan Mula Baca apabila bersedia."

    private let api = KidsAPIClient()
    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?

    func toggleRecording(for sample: IqraSample) async {
        if isRecording {
            await stopAndAssess(sample: sample)
        } else {
            await startRecording()
        }
    }

    private func startRecording() async {
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard permitted else {
            message = "Benarkan akses mikrofon dalam Settings untuk membuat latihan IQRA."
            return
        }

        do {
            result = nil
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
            message = "Sedang merakam… Baca teks yang dipaparkan."
        } catch {
            message = error.localizedDescription
        }
    }

    private func stopAndAssess(sample: IqraSample) async {
        recorder?.stop()
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
