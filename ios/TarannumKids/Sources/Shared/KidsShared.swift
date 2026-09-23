import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

enum KidsConstants {
    static let appGroup = "group.ai.tarannum.kids"
    static let requiredPracticeSeconds = 3_600
    static let accessStartHour = 6
    static let bedtimeHour = 23
    static let bedtimeMinute = 30
    static let managedStoreName = ManagedSettingsStore.Name("tarannum-kids")
    static let dailyScheduleName = DeviceActivityName("tarannum-kids-daily")
}

struct DailyAccessState: Codable, Equatable {
    let localDate: String
    let creditedSeconds: Int
    let requiredSeconds: Int
    let unlockGranted: Bool
    let unlockExpiresAt: Date?
    var remainingSeconds: Int { max(0, requiredSeconds - creditedSeconds) }
}

enum SharedState {
    private static let defaults = UserDefaults(suiteName: KidsConstants.appGroup)!
    private static let accessKey = "daily-access-state"
    private static let selectionKey = "family-activity-selection"

    static var dailyAccess: DailyAccessState? {
        get {
            guard let data = defaults.data(forKey: accessKey) else { return nil }
            return try? JSONDecoder().decode(DailyAccessState.self, from: data)
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: accessKey) }
    }

    static var familySelection: FamilyActivitySelection {
        get {
            guard let data = defaults.data(forKey: selectionKey),
                  let value = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
            else { return FamilyActivitySelection() }
            return value
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: selectionKey) }
    }
}

enum ShieldManager {
    private static let store = ManagedSettingsStore(named: KidsConstants.managedStoreName)

    static func apply() {
        let selection = SharedState.familySelection
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    }

    static func remove() { store.clearAllSettings() }

    static func reconcile(now: Date = Date()) {
        guard let state = SharedState.dailyAccess,
              state.unlockGranted,
              state.unlockExpiresAt.map({ $0 > now }) == true
        else { apply(); return }
        remove()
    }
}
