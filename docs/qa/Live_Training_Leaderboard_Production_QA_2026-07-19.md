# Live Training Leaderboard Production QA

Version: 1.0  
Date: 2026-07-19  
Last Updated: 2026-07-19  
Status: Passed in production.

## Purpose

This document records the first production acceptance test for the Qari-facing Live Training Leaderboard on `tarannum.ai`.

## Production Baseline

- Frontend deployment: Vercel production;
- Backend deployment: Railway production;
- Source branch: `main`;
- Verified commit: `9ae4a53 Add live training leaderboard`;
- Score source: ordinary completed Experimental Score V2.3 results;
- Refresh interval: 20 seconds;
- Display: Qari fullscreen Top 3 board.

## Test Procedure

1. A Qari created a live training session.
2. One reference and the participating students were selected.
3. Students continued using the normal Training and Recording & Assessment workflow.
4. A selected student completed a new recording and scoring result during the live-session window.
5. The leaderboard was observed after its automatic refresh.

## Observed Result

The production board displayed the following ordered result:

| Position | Participant | Highest score |
| --- | --- | ---: |
| Gold | MAZLAN OMAR | 68% |
| Silver | Tarannum_Student12 | 66% |
| Bronze | Tarannum_Student11 | 59% |

The newly completed normal scoring result entered the board without a special student link, separate recording flow or additional scoring request.

## Acceptance Results

| Requirement | Result |
| --- | --- |
| Qari can create and open a live board | Passed |
| Qari can select participating students | Passed |
| Board uses normal completed scoring results | Passed |
| Results are restricted to the selected reference and session window | Passed |
| Each participant is represented by the highest eligible score | Passed |
| Top 3 are ordered from highest to lowest | Passed |
| Gold, Silver and Bronze presentation is clear | Passed |
| LIVE indicator is visible | Passed |
| Remaining session time is visible | Passed |
| Last refresh time is visible | Passed |
| Automatic refresh updates the board | Passed |
| Score remains labelled Experimental Score V2.3 | Passed |

## Protected Regression Rules

Future changes must preserve these behaviours:

- the leaderboard must not start recording or scoring;
- it must read only completed, eligible results;
- attempts remain unlimited during the session period;
- only the best eligible score per participant is ranked;
- the fullscreen display remains limited to Top 3;
- refresh failures must not erase the last valid result;
- leaderboard polling must remain lightweight and must not interfere with scoring workers;
- the board must not be represented as an official tajwid result or certification ranking.

## Follow-up Validation

The next classroom QA should confirm:

- stable refresh behaviour throughout a four-hour session;
- correct ordering when two students obtain the same score;
- scheduled, active, completed and cancelled session states;
- acceptable response time with 20 selected students;
- recovery after a temporary network interruption;
- correct isolation when more than one Qari runs a live session.

## Conclusion

Live Training Leaderboard passed its initial production acceptance test and is approved for controlled classroom use. The validated production behaviour in this document is the regression baseline for future dashboard work.
