import SwiftUI

struct IqraHomeView: View {
    private let samples = IqraFeature.samples

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                Text("PILIH TAHAP CONTOH")
                    .font(.headline)
                    .foregroundStyle(Color.iqraInk)

                ForEach(samples) { sample in
                    NavigationLink {
                        IqraSampleView(sample: sample)
                    } label: {
                        IqraLevelCard(sample: sample)
                    }
                    .buttonStyle(.plain)
                }

                Label(
                    "Kandungan ini ialah sampel demonstrasi dan akan disemak sebelum menjadi silibus akhir.",
                    systemImage: "info.circle.fill"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(28)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .background(
            LinearGradient(
                colors: [Color(red: 0.94, green: 1.0, blue: 0.97), .white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .navigationTitle("IQRA")
    }

    private var header: some View {
        HStack(spacing: 18) {
            Image(systemName: "text.book.closed.fill")
                .font(.system(size: 42))
                .foregroundStyle(.white)
                .frame(width: 82, height: 82)
                .background(Color.iqraEmerald, in: Circle())

            VStack(alignment: .leading, spacing: 5) {
                Text("Belajar IQRA")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.iqraInk)
                Text("Dengar, baca dan semak kemajuan langkah demi langkah.")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.bottom, 4)
    }
}

private struct IqraLevelCard: View {
    let sample: IqraSample

    var body: some View {
        HStack(spacing: 20) {
            Text("\(sample.level.rawValue)")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(levelColor, in: Circle())

            VStack(alignment: .leading, spacing: 7) {
                Text(sample.level.title)
                    .font(.title2.bold())
                    .foregroundStyle(Color.iqraInk)
                Text(sample.instruction)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(sample.arabicText)
                    .font(.system(size: 28, weight: .medium))
                    .environment(\.layoutDirection, .rightToLeft)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .foregroundStyle(Color.iqraEmerald)
            }

            Image(systemName: "chevron.right.circle.fill")
                .font(.title)
                .foregroundStyle(levelColor)
        }
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(levelColor.opacity(0.28)))
        .shadow(color: Color.black.opacity(0.05), radius: 12, y: 5)
    }

    private var levelColor: Color {
        switch sample.level {
        case .one: return .blue
        case .three: return Color.iqraEmerald
        case .six: return .orange
        }
    }
}

private struct IqraSampleView: View {
    let sample: IqraSample
    @StateObject private var model = IqraPracticeViewModel()

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text(sample.level.title)
                .font(.title.bold())
                .foregroundStyle(Color.iqraInk)

            Text(sample.arabicText)
                .font(.system(size: sample.level == .six ? 46 : 60, weight: .medium))
                .multilineTextAlignment(.center)
                .environment(\.layoutDirection, .rightToLeft)
                .padding(34)
                .frame(maxWidth: 900, minHeight: 220)
                .background(.white, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.iqraEmerald, lineWidth: 2))

            Text(sample.instruction)
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if sample.level == .three {
                assessmentControls
            } else {
                Label("Penilaian suara akan ditambah pada fasa seterusnya", systemImage: "clock.fill")
                    .font(.headline)
                    .foregroundStyle(Color.iqraEmerald)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 14)
                    .background(Color.iqraEmerald.opacity(0.10), in: Capsule())
            }

            Spacer()
        }
        .padding(30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.95, green: 1.0, blue: 0.98).ignoresSafeArea())
        .navigationTitle(sample.level.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var assessmentControls: some View {
        VStack(spacing: 16) {
            Button {
                Task { await model.toggleRecording(for: sample) }
            } label: {
                Label(
                    model.isRecording ? "Selesai & Semak" : "Mula Baca",
                    systemImage: model.isRecording ? "stop.circle.fill" : "mic.circle.fill"
                )
                .font(.title3.bold())
                .frame(maxWidth: 420)
                .padding(.vertical, 15)
            }
            .buttonStyle(.borderedProminent)
            .tint(model.isRecording ? .red : Color.iqraEmerald)
            .disabled(model.isSubmitting)

            if model.isSubmitting {
                ProgressView(model.message)
            } else {
                Text(model.message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let result = model.result {
                IqraScoreGrid(result: result)
            }
        }
    }
}

private struct IqraScoreGrid: View {
    let result: IqraAssessmentResult

    var body: some View {
        VStack(spacing: 12) {
            Text("Keputusan latihan")
                .font(.title3.bold())
                .foregroundStyle(Color.iqraInk)

            HStack(spacing: 12) {
                scoreCard("Sebutan", result.accuracyScore)
                scoreCard("Lengkap", result.completenessScore)
                scoreCard("Lancar", result.fluencyScore)
                scoreCard("Keseluruhan", result.pronunciationScore)
            }

            if !result.recognizedText.isEmpty {
                Text("Dikesan: \(result.recognizedText)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .rightToLeft)
            }
        }
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.iqraEmerald.opacity(0.22)))
    }

    private func scoreCard(_ title: String, _ score: Double?) -> some View {
        VStack(spacing: 4) {
            Text(score.map { "\(Int($0.rounded()))" } ?? "—")
                .font(.title2.bold())
                .foregroundStyle(Color.iqraEmerald)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.iqraEmerald.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}

private extension Color {
    static let iqraEmerald = Color(red: 0.0, green: 0.57, blue: 0.39)
    static let iqraInk = Color(red: 0.04, green: 0.10, blue: 0.28)
}
