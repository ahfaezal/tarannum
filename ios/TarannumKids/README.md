# Tarannum Kids iOS

Native iPad companion app for a parent-managed daily Tarannum practice routine.

## Product rule

- Selected entertainment apps begin each day shielded; Tarannum Kids remains available.
- The Tarannum.ai backend is authoritative for credited practice time.
- At 3,600 credited seconds for the Kuala Lumpur calendar day, shields are removed until 23:30.
- At 23:30 shields return. A new entitlement window begins at 06:00 and requires another 3,600 seconds.
- A parent authorizes Family Controls and chooses the restricted apps.

## Apple identifiers

| Target | Bundle identifier |
| --- | --- |
| Main app | `ai.tarannum.kids` |
| Device Activity Monitor | `ai.tarannum.kids.deviceactivity` |
| Shield Configuration | `ai.tarannum.kids.shieldconfiguration` |
| Shield Action | `ai.tarannum.kids.shieldaction` |

The project uses the shared App Group `group.ai.tarannum.kids`, which must be registered before signing.

## Opening on a cloud Mac

1. Install the current Xcode and XcodeGen.
2. Run `xcodegen generate` in this directory.
3. Open `TarannumKids.xcodeproj` and select the Apple Developer team for all targets.
4. Confirm automatic signing, Family Controls and the shared App Group.
5. Build on an iPad running iPadOS 17 or later.

Windows can edit these sources, but compilation, signing, simulator testing and device installation require Xcode on macOS.

## Security boundary

The native app never awards practice time from a local timer. It displays the server result from `GET /api/platform/kids/daily-access`. This prevents a changed device clock, force quit, replayed local event, or an idle audio screen from unlocking entertainment apps.
