# htDash — CLAUDE.md

HOMER Therapy Dashboard (htDash) is a Flask-based clinical dashboard for managing the HOMER RCT therapy intervention.

---

## Project Overview

**htDash** manages stroke patients across three hospital sites (Manipal, Ranipet, Ludhiana). Core features:
- **Patient Management:** Enrollment, group assignment (experimental/control), status tracking
- **Exercise Management:** VCG programs, ADL session recording, call logs
- **Analytics:** Usage charts per hospital site
- **Device Management:** Pluto & Mars device assignment, actigraph watch tracking
- **Data Sync:** AWS S3 sync for device config data and call records
- **Access Control:** Role-based: global admin, therapist, engineer

**Stack:** Flask (Python) · Tailwind CSS · Vanilla JS · Chart.js · JSON/CSV file storage · AWS S3

---

## Documentation

| Document | Contents |
|---|---|
| `docs/data_schemas.md` | All data file schemas: patient JSON, protocol events, device files, logs |
| `docs/pages.md` | URL structure, page specs, all actions and modals defined in one place |

---

## Active Refactoring: SPA → URL-Routed Website

**Branch:** `urlrouted`

The original `main` branch is a single-page app (`dashboard.html`, 39KB). Being replaced with a URL-routed multi-page Flask app.

**Reason:** Flask blueprints already define natural URL boundaries; browser back/forward and deep-linking are broken in the SPA; no shared state justifies the complexity.

**Approach:**
- All work on `urlrouted` branch
- `main` remains functional throughout
- Merge only when complete and tested

---

## Implementation Order

1. ✅ Define URL structure and data flow
2. ✅ Create `base.html` — sidebar, header, navigation as real links
3. ✅ Dashboard page — summary stats + events panels
4. ✅ Patients list page
5. ✅ Patient detail page — overview, key dates, events panels
6. ✅ Device setup modal (`exp_device_install`)
7. ✅ Activation modal (`activation`) — watch assignment removed; activation seeds open `watch_record` chain entry
8. ✅ Prescription modals (ADL + VCG d1 and d15)
9. ✅ Home visit + training completion modals
10. ✅ Follow-up call modal — including triggered events (adverse_event, robot_issue, watch_record)
11. ✅ Agwatch timing modal
12. ✅ Watch record modal — chain + triggered modes, lost watch handling
13. ⬜ Patient call modal
14. ⬜ Assessment modals (a1, a2)
15. ⬜ Patient detail tab content — Call Logs, Adverse Events, Watch Records, Robot Issues (exp only)
16. ⬜ Devices page
17. ⬜ SIMs page
18. ⬜ Cleanup — remove old `dashboard.html` and unused JS
19. ⬜ Test all routes and functionality
20. ⬜ Merge to `main`

---

## Key Files Reference

| File | Purpose |
|---|---|
| `main.py` | App entry point, blueprint registration |
| `config.py` | Credentials, hospital map, AWS settings |
| `models/user.py` | Session proxy for per-request user context |
| `routes/auth.py` | Login, logout, on-login checks |
| `routes/dashboard.py` | Dashboard stats and events API |
| `routes/user_management.py` | Patient CRUD, group assignment, patient events API |
| `routes/devices.py` | Device page (stub) |
| `routes/sim_cards.py` | SIM cards page (stub) |
| `utils/data_access.py` | Patient file I/O, hospital folder lookup, session logs |
| `utils/protocol_events.py` | Protocol event file creation and date population |
| `config/study_protocol.json` | Static protocol event definitions |
| `templates/base.html` | Shared layout — sidebar, header, nav |
| `templates/patient_detail.html` | Patient detail page |
| `static/js/app/` | Per-page JS modules |

---

## Conventions & Constraints

- Do not modify the `main` branch during this refactor
- Keep all existing API endpoint URLs intact
- Preserve exact visual appearance (Tailwind classes, layout)
- Do not add new features during this refactor — functionality parity only
- All datetimes stored in ISO 8601 format with `T` separator. User-entered dates: minute resolution (`YYYY-MM-DDTHH:MM`). System-generated timestamps (`filed_at`): seconds resolution (`YYYY-MM-DDTHH:MM:SS`). Event-level comparisons use date only (call `.date()` before comparing).
- `scheduled_date` in `protocol_events.json` is always a **two-element list** `[start, end]` (both `"YYYY-MM-DDTHH:MM"`). Point-in-time events have `start == end`. `null` for free/unscheduled events. Categorisation uses `start` for upcoming, `end` for overdue and broken-protocol detection.
- `window.start_day` / `window.end_day` in `study_protocol.json` use **1-based day numbers**: Day 1 = the reference date itself (a0 for `reference=assignment`, activation for `reference=activation`). Code converts to a 0-based offset with `start_day - 1`. All event IDs (`d1`, `d02`, `d15`, …) reflect this naming convention.
- Every protocol event has a **`date source`** that determines how `completion_date` is obtained. Three possible values:
  - `user` — therapist enters the date; editable datetime input with future-date guard
  - `= <event_id>` — copied from another completed event's `completion_date`; read-only in the modal
  - `prefill: <event_id>` — pre-filled from another completed event's `completion_date` but editable; future-date guard applies
  - The source for each event is documented in the event catalogue in `docs/data_schemas.md`. For `=` and `prefill` sources, the referenced event is always complete by the time the modal opens (enforced by `depends_on`).
- Status is never stored — always derived by `derive_status()` in `utils/data_access.py`
- Free event types: `patient_call`, `adverse_event`, `robot_issue` (experimental only), `watch_record`, `discontinuation`. `technical_fault` was renamed to `robot_issue` — do not use the old name anywhere.
- **Triggered events:** `adverse_event` and `robot_issue` can **only** be created via a `patient_call` or follow-up call modal — never standalone. `watch_record` can be standalone (open chain entry) or triggered by a call.
  - Bidirectional references: calling event stores `triggered: [{type, id}, ...]`; spawned event stores `triggered_by: {type, id}`.
  - For `watch_record` triggered by a call: the existing open `incomplete` chain entry is **claimed** (no new entry created). `triggered_by` is stamped on the `incomplete` entry at call-save time. `scheduled_date` is also updated to `[now, now]` so it appears immediately as overdue.
  - Watch record trigger toggle in call modals is **hidden** when both `agWatchRightID` and `agWatchLeftID` are null on the patient.
- **Watch record chain:** seeded at activation with `scheduled_date = [activationDate, activationDate]` and `triggered_by = {type: "activation", id: <activation_entry_id>}`. On each completion, a new open chain entry is seeded with `scheduled_date = [completion_date + next_followup_days, completion_date + next_followup_days]`.
- **Lost watch:** when a watch is marked lost in the watch record modal, htDash sets `lost_date` on the inventory record and closes the assignment with `lost: true`. `get_available_devices` filters out devices where `lost_date is not None`. Lost watches are permanently retired — no further assignments or records.
- **Watch record modal notes:** required if any new watch is "No Watch Available" (null). Sync/worn datetimes are optional only when **both** new watches are null.

---

## Patient Detail Tab Order

Tabs appear left-to-right in this order. Visibility is per group.

| Tab | Experimental | Control |
|---|---|---|
| Overview | ✅ | ✅ |
| Devices | ✅ | ✅ |
| ADL | ✅ | ✅ |
| Call Logs | ✅ | ✅ |
| Adverse Events | ✅ | ✅ |
| Watch Records | ✅ | ✅ |
| Robot Issues | ✅ | ⬜ hidden |
| Timeline | ✅ | ✅ |

---

## What Stays as JS

- Patient detail sub-tabs (contextual UI within one page)
- Chart.js rendering
- Modal interactions
- In-page dynamic updates (fetch calls within a page)

---

## Consistency Checklist

When adding or modifying any feature that touches event rows or protocol events, verify ALL of the following locations are updated consistently:

### Event row rendering (blocked and upcoming events)
Both pages that show event rows must render blocked and upcoming events identically.

**Blocked events:** lock icon next to event name, amber badge "Needs: \<event name\>" on the right, non-clickable `<div>`.

**Upcoming events** (window start > today, `!active_window && days > 0`): non-clickable `<div>`, slate "Available from \<date\>" label on the right. No lock icon.

| Location | Function | Notes |
|---|---|---|
| `static/js/app/patient_detail.js` | `patientEventRow()` | Calls `EVENT_OPENERS` to determine clickability |
| `static/js/app/dashboard.js` | `eventRow()` | Non-clickable for blocked or upcoming; links otherwise |

### blocked_by computation (server-side)
Both event APIs must compute `blocked_by` using the same logic (depends_on entries that are applicable and not yet complete).

| Location | Route | Notes |
|---|---|---|
| `routes/user_management.py` | `GET /api/patients/<homer_id>/events` | Per-patient events |
| `routes/dashboard.py` | `GET /api/dashboard/events` | Cross-patient events |

### Protocol event openers (patient detail page)
Every protocol event that has a modal must be listed in `EVENT_OPENERS` in `patient_detail.js`. When a new modal is implemented, add the entry. Currently registered: `exp_device_install`, `activation`, `discontinuation_reminder`, `adl_prescription_d01/d15`, `vcg_prescription_d01/d15`, `prescription_printout_d01/d15`, `home_visit_d02/d03/d15`, `followup_call_d07/d21`, `training_completion_d29`, `adl_agwatch_timing_d03/d15`, `vcg_agwatch_timing_d03/d15`, `watch_record`.

### Synthetic events
Some events are not stored in `protocol_events.json` but injected at query time by both event APIs. These require matching `EVENT_OPENERS` entries in `patient_detail.js`.

| Synthetic event ID | Condition | Purpose |
|---|---|---|
| `discontinuation_reminder` | `broken_protocol` status + no `free.discontinuation` | Prompt user to discontinue patient |

When adding a new synthetic event, update BOTH event APIs and `EVENT_OPENERS`.

### New protocol events
When adding events to `config/study_protocol.json`, check:
1. `create_protocol_events()` in `utils/protocol_events.py` handles the event type correctly
2. Test data (`protocol_events.json` files) are updated with the new events
3. `EVENT_OPENERS` in `patient_detail.js` has an entry if the event has a modal

### Patient JSON schema
When adding fields to `homer_id.json`, update in all three places:
1. Patient creation dict in `routes/user_management.py` (`api_create_patient`)
2. `docs/data_schemas.md` — `homer_id.json` schema table
3. Test data file(s) in `data/<site>/patients/<homer_id>/<homer_id>.json`
