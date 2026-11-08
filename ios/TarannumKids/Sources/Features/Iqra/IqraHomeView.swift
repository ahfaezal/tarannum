import SwiftUI

struct IqraHomeView: View {
    private let samples = IqraFeature.samples
    private let api = KidsAPIClient()
    @State private var progressBySample: [String: IqraProgressItem] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                Text("PILIH LATIHAN")
                    .font(.headline)
                    .foregroundStyle(Color.iqraInk)

                levelSection(title: "IQRA 1 · Pengenalan Huruf", subtitle: "Kenal huruf dan bunyi asas.", level: .one)
                levelSection(title: "IQRA 3 · Latihan Perkataan", subtitle: "Selesaikan Perkataan 1 hingga 3 mengikut urutan.", level: .three)
                levelSection(title: "IQRA 6 · Surah Al-Fatihah", subtitle: "Baca ayat 1 hingga 7, satu ayat pada satu masa.", level: .six)

                Label(
                    "Lengkapkan IQRA 3, kemudian Al-Fatihah dalam IQRA 6 sebelum meneruskan latihan Tarannum.",
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
        .task { await loadProgress() }
        .onAppear { Task { await loadProgress() } }
    }

    private func levelSection(title: String, subtitle: String, level: IqraLevel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.title3.bold()).foregroundStyle(Color.iqraInk)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(samples.filter { $0.level == level }) { sample in
                NavigationLink { IqraSampleView(sample: sample) } label: {
                    IqraLevelCard(sample: sample, progress: progressBySample[sample.id])
                }
                    .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(.white.opacity(0.55), in: RoundedRectangle(cornerRadius: 20))
    }

    @MainActor
    private func loadProgress() async {
        guard let response = try? await api.fetchIqraProgress() else { return }
        progressBySample = Dictionary(uniqueKeysWithValues: response.items.map { ($0.sampleId, $0) })
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
    let progress: IqraProgressItem?

    var body: some View {
        HStack(spacing: 20) {
            Text(sample.level == .one ? "1" : "\(sample.sequence)")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(levelColor, in: Circle())

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(sample.title)
                    Spacer()
                    if progress?.passed == true {
                        Label("Lulus · \(Int((progress?.bestScore ?? 0).rounded()))", systemImage: "checkmark.seal.fill")
                            .font(.caption.bold()).foregroundStyle(.green)
                    } else {
                        Text(sample.level.title).font(.caption.bold()).foregroundStyle(levelColor)
                    }
                }
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
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer(minLength: 42)

                Text(sample.title)
                    .font(.title.bold())
                    .foregroundStyle(Color.iqraInk)

                Text(guidedArabicText)
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

                if sample.level == .three || sample.level == .six {
                    if let countdown = model.countdownValue {
                        VStack(spacing: 6) {
                            Text("Bersedia").font(.headline)
                            Text("\(countdown)").font(.system(size: 72, weight: .heavy, design: .rounded))
                                .foregroundStyle(Color.iqraEmerald)
                        }
                    } else if model.isRecording {
                        Label(
                            sample.level == .six
                                ? "Baca ayat secara bersambung mengikut frasa hijau."
                                : "Sebut satu perkataan setiap kali penanda hijau bergerak.",
                            systemImage: "lightbulb.fill"
                        )
                            .font(.headline).foregroundStyle(Color.iqraEmerald)
                    }
                    assessmentControls
                } else {
                    Label("Penilaian suara IQRA 1 akan ditambah pada fasa seterusnya", systemImage: "clock.fill")
                        .font(.headline)
                        .foregroundStyle(Color.iqraEmerald)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                        .background(Color.iqraEmerald.opacity(0.10), in: Capsule())
                }

                Spacer(minLength: 42)
            }
            .padding(30)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.95, green: 1.0, blue: 0.98).ignoresSafeArea())
        .navigationTitle(sample.level.title)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(
            isPresented: Binding(
                get: { model.completedAgentDecision != nil },
                set: { if !$0 { model.dismissAgentDecision() } }
            )
        ) {
            if let decision = model.completedAgentDecision {
                KidsAgentDecisionView(
                    decision: decision,
                    completedPackageTitle: sample.level == .three
                        ? "IQRA 3 · Latihan Perkataan"
                        : "IQRA 6 · Surah Al-Fatihah",
                    targetPackageTitle: model.agentTargetPackageTitle
                ) {
                    model.dismissAgentDecision()
                    dismiss()
                }
            }
        }
    }

    private var guidedArabicText: AttributedString {
        var output = AttributedString()
        for (index, word) in sample.words.enumerated() {
            var token = AttributedString(word)
            if model.activeWordRange?.contains(index) == true {
                token.backgroundColor = .green.opacity(0.28)
                token.foregroundColor = .iqraEmerald
            } else if model.isRecording {
                token.foregroundColor = .gray
            }
            output.append(token)
            if index < sample.words.count - 1 { output.append(AttributedString("  ")) }
        }
        return output
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
            .disabled(model.isSubmitting || model.isPreparing)

            if model.isSubmitting {
                ProgressView(model.message)
            } else {
                Text(model.message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let result = model.result {
                IqraScoreGrid(result: result, level: sample.level)
                if sample.level == .six {
                    if result.areAllWordsClear,
                       let next = IqraFeature.nextSample(after: sample),
                       next.level == .six {
                        NavigationLink {
                            IqraSampleView(sample: next)
                        } label: {
                            Label("Baca Ayat Seterusnya", systemImage: "arrow.right.circle.fill")
                                .font(.title3.bold())
                                .frame(maxWidth: 420)
                                .padding(.vertical, 15)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.iqraEmerald)
                    } else if !result.areAllWordsClear {
                        Button {
                            Task { await model.toggleRecording(for: sample) }
                        } label: {
                            Label("Baca Semula Ayat", systemImage: "arrow.clockwise.circle.fill")
                                .font(.title3.bold())
                                .frame(maxWidth: 420)
                                .padding(.vertical, 15)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.iqraEmerald)
                    }
                } else if result.passed == true, let next = IqraFeature.nextSample(after: sample) {
                    NavigationLink {
                        IqraSampleView(sample: next)
                    } label: {
                        Label("Teruskan ke \(next.title)", systemImage: "arrow.right.circle.fill")
                            .font(.title3.bold())
                            .frame(maxWidth: 420)
                            .padding(.vertical, 15)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.iqraEmerald)
                }
            }
        }
    }
}

private struct IqraScoreGrid: View {
    let result: IqraAssessmentResult
    let level: IqraLevel

    var body: some View {
        Group {
            if level == .six {
                IqraSixResultView(result: result)
            } else {
                legacyScoreGrid
            }
        }
    }

    private var legacyScoreGrid: some View {
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

            if let unitScore = result.unitScore {
                HStack {
                    Label(
                        (result.passed ?? false) ? "Lulus" : "Perlu ulang",
                        systemImage: (result.passed ?? false) ? "checkmark.seal.fill" : "arrow.clockwise.circle.fill"
                    )
                    .font(.headline)
                    Spacer()
                    Text("Markah unit: \(Int(unitScore.rounded()))")
                        .font(.headline)
                }
                .foregroundStyle((result.passed ?? false) ? .green : .orange)
                if let reason = result.decisionReason {
                    Text(reason).font(.subheadline).foregroundStyle(.secondary)
                }
            }

            coachCard

            if result.hasDetectedSpeech {
                Text("Dikesan: \(result.recognizedText)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .rightToLeft)
            } else {
                Label(
                    "Bacaan tidak dapat dikesan. Dekatkan mikrofon dan cuba semula.",
                    systemImage: "waveform.slash"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.red)
                .padding(.vertical, 8)
            }

            if !result.words.isEmpty {
                Divider()

                Text("Semakan setiap perkataan")
                    .font(.headline)
                    .foregroundStyle(Color.iqraInk)

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 120), spacing: 10)],
                    alignment: .leading,
                    spacing: 10
                ) {
                    ForEach(Array(result.words.enumerated()), id: \.offset) { _, word in
                        wordCard(word)
                    }
                }
                .environment(\.layoutDirection, .rightToLeft)

                HStack(spacing: 14) {
                    legendItem("80–100", color: .green)
                    legendItem("60–79", color: .yellow)
                    legendItem("40–59", color: .orange)
                    legendItem("0–39", color: .red)
                    legendItem("Disahkan ayat", color: .blue)
                    legendItem("Tidak dikesan", color: .gray)
                }
                .font(.caption)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.iqraEmerald.opacity(0.22)))
    }

    private var coachCard: some View {
        let omitted = result.words.filter { $0.errorType.caseInsensitiveCompare("Omission") == .orderedSame }
        let weak = result.words.filter { ($0.accuracyScore ?? 0) < 60 && $0.errorType.caseInsensitiveCompare("Omission") != .orderedSame }
        let focus = (omitted + weak).compactMap(\.word)
        let message: String
        if result.passed ?? false {
            message = result.nextStage == "tarannum" ? "Tahniah. Anda bersedia meneruskan latihan Tarannum." : "Bacaan ini lulus. Teruskan latihan seterusnya."
        } else if !focus.isEmpty {
            message = level == .six
                ? "Fokus semula pada: \(focus.joined(separator: "، ")). Baca semula ayat secara bersambung mengikut frasa hijau."
                : "Fokus semula pada: \(focus.joined(separator: "، ")). Sebut satu demi satu mengikut penanda hijau."
        } else {
            message = level == .six
                ? "Cuba lagi dengan tempo ayat yang sederhana, bersambung dan jelas."
                : "Cuba lagi dengan tempo sederhana dan pastikan setiap perkataan disebut lengkap."
        }
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles").font(.title2).foregroundStyle(Color.iqraEmerald)
            VStack(alignment: .leading, spacing: 4) {
                Text("Pembimbing IQRA").font(.headline).foregroundStyle(Color.iqraInk)
                Text(message).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(Color.iqraEmerald.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
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

    private func wordCard(_ word: IqraWordAssessment) -> some View {
        let omitted = word.errorType.caseInsensitiveCompare("Omission") == .orderedSame
        let confirmed = word.contentConfirmed == true || word.errorType.caseInsensitiveCompare("ConfirmedByFastConformer") == .orderedSame
        let color = omitted ? Color.gray : (confirmed ? Color.blue : scoreColor(word.accuracyScore))
        let isYellow = !omitted && !confirmed && (60..<80).contains(word.accuracyScore ?? -1)
        return VStack(spacing: 5) {
            Text((word.word?.isEmpty == false ? word.word : nil) ?? "—")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Color.iqraInk)
            Text(
                omitted
                    ? "Tidak dikesan"
                    : (confirmed ? "Disahkan dalam ayat" : word.accuracyScore.map { "\(Int($0.rounded()))" } ?? "Tiada markah")
            )
                .font(.caption.weight(.bold))
                .foregroundStyle(isYellow ? Color.iqraInk : .white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(color.opacity(isYellow ? 0.55 : 0.86), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.9)))
    }

    private func scoreColor(_ score: Double?) -> Color {
        guard let score else { return .gray }
        switch score {
        case 80...: return .green
        case 60..<80: return .yellow
        case 40..<60: return .orange
        default: return .red
        }
    }

    private func legendItem(_ text: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 9, height: 9)
            Text(text).foregroundStyle(.secondary)
        }
    }
}

private struct IqraSixResultView: View {
    let result: IqraAssessmentResult

    var body: some View {
        VStack(spacing: 18) {
            Text("Keputusan Bacaan")
                .font(.title.bold())
                .foregroundStyle(Color.iqraInk)

            completenessCard
            clarityCard
            coachCard
        }
    }

    private var completenessCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("1. Kesempurnaan Bacaan")
                .font(.title2.bold())
                .foregroundStyle(Color.iqraInk)

            HStack(spacing: 14) {
                Image(systemName: result.isAyahComplete ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .font(.system(size: 42))
                VStack(alignment: .leading, spacing: 4) {
                    Text(result.isAyahComplete ? "Ayat lengkap" : "Ayat tidak lengkap")
                        .font(.title2.bold())
                    Text(result.isAyahComplete ? "Semua perkataan telah disebut." : "Ada perkataan yang tidak disebut.")
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundStyle(result.isAyahComplete ? .green : .orange)

            Text(completenessText)
                .font(.system(size: 38, weight: .semibold))
                .multilineTextAlignment(.center)
                .environment(\.layoutDirection, .rightToLeft)
                .frame(maxWidth: .infinity)
                .padding(18)
                .background(Color.iqraEmerald.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))

            Text("Sistem menyemak sama ada setiap perkataan disebut.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.iqraEmerald.opacity(0.22)))
    }

    private var completenessText: AttributedString {
        var output = AttributedString()
        for (index, word) in result.words.enumerated() {
            let omitted = word.errorType.caseInsensitiveCompare("Omission") == .orderedSame
            var token = AttributedString((word.word?.isEmpty == false ? word.word : nil) ?? "—")
            if omitted {
                token.backgroundColor = .gray.opacity(0.30)
                token.foregroundColor = .gray
            } else {
                token.foregroundColor = .iqraInk
            }
            output.append(token)
            if index < result.words.count - 1 { output.append(AttributedString("  ")) }
        }
        return output
    }

    private var clarityCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("2. Kejelasan Sebutan")
                .font(.title2.bold())
                .foregroundStyle(Color.iqraInk)
            Text("Warna menunjukkan kejelasan sebutan setiap perkataan.")
                .foregroundStyle(.secondary)

            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 145), spacing: 12)],
                spacing: 12
            ) {
                ForEach(Array(result.words.enumerated()), id: \.offset) { _, word in
                    clarityWordCard(word)
                }
            }
            .environment(\.layoutDirection, .rightToLeft)

            HStack(spacing: 18) {
                legendItem("Baik", color: .green)
                legendItem("Amaran", color: .yellow)
                legendItem("Perlu ulang", color: .red)
                legendItem("Tidak disebut", color: .gray)
            }
            .font(.caption)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.iqraEmerald.opacity(0.22)))
    }

    private var coachCard: some View {
        let omitted = result.words.filter { $0.errorType.caseInsensitiveCompare("Omission") == .orderedSame }
        let unclear = result.words.filter {
            $0.errorType.caseInsensitiveCompare("Omission") != .orderedSame
                && ($0.accuracyScore ?? -1) < 80
        }
        let message: String
        if !omitted.isEmpty {
            let names = omitted.compactMap(\.word).joined(separator: "، ")
            message = "Perkataan \(names) tidak disebut. Baca semula keseluruhan ayat dengan lengkap."
        } else if !unclear.isEmpty {
            let names = unclear.compactMap(\.word).joined(separator: "، ")
            message = "Ayat anda lengkap. Perkemas sebutan \(names), kemudian baca semula keseluruhan ayat."
        } else {
            message = "Ayat lengkap dan semua sebutan jelas. Anda boleh membaca ayat seterusnya."
        }

        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundStyle(Color.iqraEmerald)
            VStack(alignment: .leading, spacing: 4) {
                Text("Pembimbing IQRA")
                    .font(.headline)
                    .foregroundStyle(Color.iqraInk)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(16)
        .background(Color.iqraEmerald.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
    }

    private func clarityWordCard(_ word: IqraWordAssessment) -> some View {
        let omitted = word.errorType.caseInsensitiveCompare("Omission") == .orderedSame
        let score = word.accuracyScore
        let color: Color
        let label: String
        let isWarning: Bool
        if omitted || score == nil {
            color = .gray
            label = omitted ? "Tidak disebut" : "Tidak dapat dinilai"
            isWarning = false
        } else if let score, score >= 80 {
            color = .green
            label = "Jelas"
            isWarning = false
        } else if let score, score >= 60 {
            color = .yellow
            label = "Amaran"
            isWarning = true
        } else {
            color = .red
            label = "Tidak jelas — ulang"
            isWarning = false
        }
        return VStack(spacing: 6) {
            Text((word.word?.isEmpty == false ? word.word : nil) ?? "—")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Color.iqraInk)
            Text(label)
                .font(.caption.bold())
                .foregroundStyle(isWarning ? Color.iqraInk : .white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .background(color.opacity(isWarning ? 0.55 : 0.78), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.9)))
    }

    private func legendItem(_ text: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 9, height: 9)
            Text(text).foregroundStyle(.secondary)
        }
    }
}

private extension Color {
    static let iqraEmerald = Color(red: 0.0, green: 0.57, blue: 0.39)
    static let iqraInk = Color(red: 0.04, green: 0.10, blue: 0.28)
}
