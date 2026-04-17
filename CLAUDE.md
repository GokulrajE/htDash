# htDash — CLAUDE.md

HOMER Therapy Dashboard (htDash) is a Flask-based clinical dashboard for managing the HOMER RCT therapy intervention.

---
## Important Instructions for Interaction.
1. When asked a question, reply to the question. This is an attempt to brainstrom. Do not start coding without explicit permission.
2. Never code without updating the .md files. Any feature that must be recorded in the .md file must be recorded first before coding.

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
| `docs/devices.md` | Device state machine, assignment rules, clinic logic, SIM linkage, 28-day auto-reset |
| `docs/device_data_schemas.md` | Detailed field-level schemas for all device inventory, assignment, SIM, and log files |

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
10. ✅ Follow-up call modal — including triggered events (adverse_event, robot_issue_call, watch_record)
11. ✅ Agwatch timing modal
12. ✅ Watch record modal — chain + triggered modes, lost watch handling
13. ✅ Patient call modal
14. ⬜ Fix `create_protocol_events()` — update `free` section keys + add top-level `cancelled: []`
15. ⬜ Update File Adverse Event modal — add scheduling toggles for follow-up visit / clinical visit
16. ⬜ Update Adverse Event Follow-up Call modal — `patient_initiated`, `ae_discussions`, scheduling toggles
17. ⬜ Adverse Event Follow-up Visit modal (new)
18. ⬜ Adverse Event Clinical Visit modal (new)
19. ⬜ Assessment modals (a1, a2)
20. ⬜ Patient detail tab content — Call Logs, Adverse Events, Watch Records, Robot Issues (exp only)
21. ✅ Devices page — inventory, assignments, SIM management (integrated)
22. ✅ SIM management — integrated into Devices page (no separate page)
23. ⬜ Cleanup — remove old `dashboard.html` and unused JS
24. ⬜ Test all routes and functionality
25. ⬜ Merge to `main`

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
| `routes/devices.py` | Full device management: inventory, assignments, SIM cards, 28-day auto-reset, recharge |
| `routes/sim_cards.py` | Legacy SIM blueprint (not used by the Devices page; SIMs managed via routes/devices.py) |
| `utils/data_access.py` | Patient file I/O, hospital folder lookup, session logs |
| `utils/protocol_events.py` | Protocol event file creation and date population |
| `config/study_protocol.json` | Static protocol event definitions |
| `templates/base.html` | Shared layout — sidebar, header, nav |
| `templates/patient_detail.html` | Patient detail page |
| `static/js/app/` | Per-page JS modules |
| `scripts/reset_test_patient.py` | Reset all ranipet test patients to enrolled state |
| `scripts/shift_activation.py` | Shift a patient's activation date (and all dependent dates) by N days |

---

## Test Data

The ranipet site holds four fixed test patients. Reset them all with:

```
python scripts/reset_test_patient.py expt1_dd/mm expt2_dd/mm ctrl1_dd/mm ctrl2_dd/mm
```

Example:
```
python scripts/reset_test_patient.py 23/03 24/03 22/03 21/03
```

| Patient | Group | Training side |
|---|---|---|
| HOCMCV002 | experimental | Right |
| HOCMCV003 | experimental | Left |
| HOCMCV004 | control | Right |
| HOCMCV005 | control | Left |

Dates are `dd/mm` (current year, noon). The script:
- Wipes all device assignments and device log entries for the site
- Deletes and recreates each patient folder from scratch
- Sets `enrollDate` and `a0CompletionDate` to the supplied date
- Regenerates `protocol_events.json` in enrolled state

To advance a patient's timeline after partial testing (e.g. to make `home_visit_d03` fall today):

```
python scripts/shift_activation.py HOCMCV002 -2
```

The script shifts the patient's entire timeline by N days (positive or negative):
- `enrollDate`, `a0CompletionDate`, `activationDate` in the patient JSON all shift by N
- For every entry in `protocol_events.json` (both `incomplete` and `complete`):
  - `scheduled_date` is **recomputed** from the new reference date using `study_protocol.json` window definitions, preserving the original time-of-day
  - All datetime fields (`completion_date`, `session_start`, `session_end`, `sync_datetime`, `worn_datetime`) shift by the **per-event delta** (`new_scheduled[0] − old_scheduled[0]`), which handles any pre-existing inconsistencies in the file
- `watch_record` entries (free events with no window definition) shift by N directly

---

## Conventions & Constraints

- Do not modify the `main` branch during this refactor
- Keep all existing API endpoint URLs intact
- Preserve exact visual appearance (Tailwind classes, layout)
- Do not add new features during this refactor — functionality parity only
- All datetimes stored in ISO 8601 format with `T` separator. User-entered dates: minute resolution (`YYYY-MM-DDTHH:MM`). System-generated timestamps (`filed_at`): seconds resolution (`YYYY-MM-DDTHH:MM:SS`). Event-level comparisons use date only (call `.date()` before comparing).
- `scheduled_date` in `protocol_events.json` is always a **two-element list** `[start, end]` (both `"YYYY-MM-DDTHH:MM"`). Point-in-time events have `start == end`. `null` for free/unscheduled events. Categorisation uses `start` for upcoming, `end` for overdue and broken-protocol detection.
- `window.start_day` / `window.end_day` in `study_protocol.json` use **1-based day numbers**: Day 1 = the reference date itself (a0 for `reference=assignment`, activation for `reference=activation`). Code converts to a 0-based offset with `start_day - 1`. All event IDs (`d1`, `d02`, `d15`, …) reflect this naming convention.
- Every protocol event has a **`date source`** that determines how `completion_date` is obtained. Four possible values:
  - `user` — therapist enters the date; editable datetime input with future-date guard
  - `= <event_id>` — copied from another completed event's `completion_date`; read-only in the modal
  - `= <event_id> + <N>d` — computed as another event's `completion_date` plus N calendar days; read-only in the modal
  - `prefill: <event_id>` — pre-filled from another completed event's `completion_date` but editable; future-date guard applies
  - The source for each event is documented in the event catalogue in `docs/data_schemas.md`. For `=` and `prefill` sources, the referenced event is always complete by the time the modal opens (enforced by `depends_on`).
- **Home visit session times:** `activation`, `home_visit_d02`, `home_visit_d03`, and `home_visit_d15` each record `session_start` and `session_end` (`YYYY-MM-DDTHH:MM`), both required. The modal presents two `datetime-local` inputs. Validation rules (enforced client-side before save):
  1. `session_start` and `session_end` must fall on the **same calendar date**
  2. `session_end` must be strictly **after** `session_start`
  3. Future-date guard applies to `session_start`
  - `completion_date` is set to `session_start` — there is no separate event date input.
  - These represent the clock times of the therapy session conducted during that home visit.
- **AG Watch timing session bounds (hard validation):** the `adl_agwatch_timing_d03` / `vcg_agwatch_timing_d03` modals enforce that every non-null exercise `start`/`end` falls within the `session_start`/`session_end` from `home_visit_d03`. The `adl_agwatch_timing_d15` / `vcg_agwatch_timing_d15` modals apply the same hard constraint using `home_visit_d15`. The form cannot be saved if any timing falls outside the session window.
- Status is never stored — always derived by `derive_status()` in `utils/data_access.py`
- **Timeline transition badges** are also never stored — derived client-side by `_deriveTransitions(patient, events)` in `patient_detail.js`. Returns a `Map<event_id, badge>`. Four badge types: `"paused"` (amber), `"resumed"` (green), `"broken_protocol"` (red), `"discontinued"` (slate). Detection rules: paused = event id in `pauseHistory[*].reasons[*].event_id`; resumed = event id matches `pauseHistory[*].end_event_id` (set by the route that closes the epoch); broken_protocol = event `completion_date[:10]` matches `brokenProtocolDate`; discontinued = event `completion_date[:10]` matches `discontinuationDate`.
- Free event types: `patient_call`, `adverse_event`, `adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`, `robot_issue_call` (experimental only), `robot_issue_visit` (experimental only), `resolve_robot_issue_visit` (experimental only), `watch_record`, `discontinuation`. There is no standalone `robot_issue` event — the chain starts directly at `robot_issue_call`.
- **Cancellable events:** some free events (currently `adverse_event_followup_visit` and `adverse_event_clinical_visit`) carry `cancellable: true` in their stub. The modal shows a **Cancel Visit** button. Clicking it prompts for a `cancellation_reason` (textarea, required). On cancellation the stub is moved to a top-level `cancelled` array in `protocol_events.json` with `cancelled_at` timestamp and `cancellation_reason`. No further stubs are auto-created. Cancellable stubs are otherwise identical to regular stubs — they appear as overdue events and have `EVENT_OPENERS` entries.
- **Triggered events:** `adverse_event`, `robot_issue_call`, and `watch_record` can only be created as triggered events — never standalone. They are triggered by: `activation`, `home_visit_d02`, `home_visit_d03`, `home_visit_d15`, `patient_call`, `followup_call_d07`, or `followup_call_d21`. `robot_issue_call` is experimental-only and hidden for control patients in all modals.
  - Bidirectional references: the triggering event stores `triggered: [{type, id}, ...]`; the spawned event stores `triggered_by: {type, id}`.
  - **`adverse_event` uses a two-phase model:**
    1. **Trigger phase** (in the triggering modal): checking the toggle shows an info note only — no sub-form fields. On save, a stub entry is appended to `incomplete` with `protocol_event_id = "adverse_event"`, `scheduled_date = [now, now]`, and `triggered_by`. The stub appears immediately as an overdue event.
    2. **Complete phase** (via standalone modal): the therapist opens the `adverse-event-modal`, fills in description/action, and saves. The stub moves from `incomplete` to `free.adverse_event`.
  - **`robot_issue_call` is created directly by the triggering modal** — no intermediate `robot_issue` event. Checking the "robot issue" toggle appends a `robot_issue_call` stub to `incomplete` with `triggered_by` pointing to the triggering event. `scheduled_date = [now, now]`.
  - **Robot issue chain** (engineer-owned, experimental only): `robot_issue_call` → (if visit needed) `robot_issue_visit` → (if device taken back with no replacement) `resolve_robot_issue_visit`. Each step auto-creates the next stub. Training pauses only when a device is taken back without a replacement; pause clears when all `resolve_robot_issue_visit` stubs are resolved.
  - **`swap_type`** on swapped outcomes in `robot_issue_visit` and `resolve_robot_issue_visit`: `"fault_driven"` (device suspected/confirmed faulty — creates a pending fault report stub; old device marked faulty in inventory) or `"preventive"` (precautionary replacement — device NOT marked faulty; no fault report stub). Both types create `resolve_robot_issue_visit` stubs if no replacement is available.
  - **`robot_fault_report`** stubs (engineering only, not visible to therapist): created only for `"fault_driven"` swaps. Stored in `devices/fault_reports/<type>.json`. Have `resolution: null` until completed via the Devices page "Complete Fault Report" action (future feature). `"repaired_on_site"` outcomes do not create fault report stubs — fault details deferred to Devices page.
  - **`resolve_robot_issue_visit` modal** shows: (1) taken-back device replacement dropdown (required — can only replace, not repair); (2) optional "other device" section with full outcome sub-form (Repaired / Swapped / Neither) identical to `robot_issue_visit`.
  - For `watch_record` triggered by any of the above: the existing open `incomplete` chain entry is **claimed** (no new entry created). `triggered_by` is stamped on the `incomplete` entry at save time. `scheduled_date` is also updated to `[now, now]` so it appears immediately as overdue.
  - Watch record trigger toggle is **hidden** when both `agWatchRightID` and `agWatchLeftID` are null on the patient.
- **`adverse_event_followup` chain:** seeded whenever any adverse event is filed (regardless of `training_blocked`). One stub exists at a time in `incomplete`, carrying `adverse_event_ids` — a list of all currently unresolved AE IDs. When a new AE is filed while a stub already exists, its ID is appended to the existing stub's list. `scheduled_date = [today, today + 1 day]` — active window for 1 day, overdue the day after. On completion (via follow-up call, visit, or clinical visit) the therapist records per-AE `ae_discussions` (notes, resolved, can_resume_from). Unresolved AEs carry into the next seeded stub (back to a call-based follow-up). Chain ends when all AEs are resolved. `can_resume_from` (date only) is required per resolved AE that had `training_blocked: true`. Pause clears only when all pausing AEs have `can_resume_from` set AND no `resolve_robot_issue_visit` stubs remain.
  - **`adverse_event_followup_visit` / `adverse_event_clinical_visit`:** scheduled from the follow-up call modal (or directly from the File AE modal). Stubs are cancellable. Both carry `adverse_event_ids` and follow the same per-AE `ae_discussions` structure. On completion, unresolved AEs re-seed a follow-up call stub (chain reverts to call-based). Pause clears on the same condition as above.
  - **`ae_discussions` (replaces `resolutions`):** the key per-AE field on all follow-up event types. Each entry: `{ae_id, notes, resolved, can_resume_from}`. Stored on `adverse_event_followup`, `adverse_event_followup_visit`, and `adverse_event_clinical_visit`.
  - **`patient_initiated` toggle** on `adverse_event_followup`: when the patient contacted the clinic first, the therapist should first file a `patient_call` (with `ae_discussed: true`) and then open the follow-up call stub. Setting `patient_initiated: true` reveals a **Related patient call** selector (required) — a dropdown of `patient_call` entries for this patient where `ae_discussed: true`. Stored as `related_patient_call_id` on the completed follow-up record.
- **`resolve_robot_issue_visit` stub:** created when a `robot_issue_visit` (or a subsequent `resolve_robot_issue_visit`) assigns no replacement for a taken-back device (`new_device_id: null`). Patient has no device; training paused. Resolved by engineer/admin: delivers replacement(s); may also optionally attend to the other device. Records `can_resume_from`. If null selected again, another stub is created. Pause clears only when no `resolve_robot_issue_visit` stubs remain AND no `adverse_event_followup` stubs remain.
- **`pauseHistory` array:** tracks each continuous pause epoch on the patient JSON. One entry per uninterrupted pause period — append a new entry when `trainingPausedDate` transitions from `null`; close it (fill `end` and `days`) when the pause clears. If a second cause fires while already paused, append to the current open entry's `reasons` list (no new entry). Each reason carries `{type: "robot_issue"|"adverse_event", event_id: <uuid>}` referencing the causative `robot_issue_visit` or `adverse_event` entry in `free`. `cumulativePauseDays` is still stored as a scalar for quick status derivation but is now also derivable as `sum(e["days"] for e in pauseHistory if e["days"] is not None)`.
- **Watch record chain:** seeded at activation with `scheduled_date = [activationDate, activationDate]` and `triggered_by = {type: "activation", id: <activation_entry_id>}`. On each completion, a new open chain entry is seeded with `scheduled_date = [completion_date + next_followup_days, completion_date + next_followup_days]`.
- **Lost watch:** when a watch is marked lost in the watch record modal, htDash sets `lost_date` on the inventory record and closes the assignment with `lost: true`. `get_available_devices` filters out devices where `lost_date is not None`. Lost watches are permanently retired — no further assignments or records.
- **Watch record modal — full interaction model:**
  - **One-watch patient:** only the relevant limb selector is shown; the other is hidden. `sync_datetime` not shown. `worn_datetime` always required.
  - **Two-watch patient — selector logic:** the **right watch is the reference** that drives the left selector:
    - Right = "current" (same watch kept) → left automatically locks to its current watch (disabled, auto-selected). No other left option is possible.
    - Right = any new watch or "No Watch Available" → left is unlocked; current option is removed from left; left shows pool (excluding right's choice) + "No Watch Available".
    - Right = unselected ("Select watch…") → same as "new" mode: left shows pool + "No Watch Available", no current option.
  - **Lost checkbox interaction:** each limb shows a "Lost" checkbox if it has a current watch. Checking **any** lost checkbox overrides the right-as-reference lock: both selectors switch to "new mode" (current option removed from both, left unlocked). This ensures a lost watch can never be re-selected as the new watch.
  - **`sync_datetime` / `worn_datetime` enable rules** (for two-watch patients):
    - **Both current, no lost** → both fields disabled and cleared (nothing changed, nothing to record).
    - **Any watch changed or any lost checked** → both fields enabled and required.
    - For one-watch patients: `sync_datetime` always hidden; `worn_datetime` always enabled and required.
  - **`notes`** are required if any new watch selection is "No Watch Available" (null) — therapist must explain why no watch was assigned.
  - **Available options** in each selector: non-lost unassigned watches from inventory, plus the currently-assigned watch for that limb as a "— current" option (injected by the server separately, since assigned watches are excluded from `get_available_devices`). "No Watch Available" is always present.

---

## Patient Detail Tab Order

Tabs appear left-to-right in this order. Visibility is per group.

| Tab | Experimental | Control |
|---|---|---|
| Overview | ✅ | ✅ |
| Devices | ✅ | ✅ |
| VCG | ⬜ hidden | ✅ |
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

## Attachment Module

Every modal can optionally include a reusable attachment widget. The widget is a Jinja2 macro with no parameters — it always renders a PDF file input and a caption textarea:

```
{{ attachment_section() }}
```

### Rules
- **One PDF file per event**, optional. The therapist is never forced to upload.
- **Caption textarea always present** alongside the file input. If a file is selected, the caption is **required** — the therapist must describe what the attachment is. If no file is selected, the caption is ignored.
- **Storage:** `data/<site>/patients/<homer_id>/attachments/<event_id>.pdf` — filename is the event UUID. Relative path stored in the event JSON as `"attachment": "attachments/<event_id>.pdf"`.
- **`attachment_caption`** always stored on events with the widget (`null` if left blank).
- **Download access:** admin and therapist roles only. Engineers cannot download attachments.
- **Download location:** the Timeline tab is the single place where attachment download links appear. Each completed event in the timeline that has an `attachment` field shows a download link. No other tab or page exposes attachment downloads.
- **Download endpoint:** `GET /api/patients/<homer_id>/download-attachment/<event_id>` — server checks role, locates `attachments/<event_id>.pdf` in the patient folder, and serves it.
- **Upload endpoint:** `POST /api/patients/<homer_id>/upload-attachment` — generic, shared by all modals.
- **Template macro location:** `templates/macros/attachment_section.html` (imported per template).
- **JS utility:** shared `saveAttachment(eventId, file)` helper in `patient_detail.js`; called by each `save*()` function that has the widget.

### Per-modal attachment configuration

Fill in ✅ / ⬜. Caption is always included when attachment is ✅.

| Modal / Event | Attachment |
|---|---|
| `exp_device_install` | ✅ |
| `activation` | ✅ |
| `adl_prescription_d01` | ⬜ |
| `adl_prescription_d15` | ⬜ |
| `vcg_prescription_d01` | ⬜ |
| `vcg_prescription_d15` | ⬜ |
| `prescription_printout_d01` | ⬜ |
| `prescription_printout_d15` | ⬜ |
| `home_visit_d02` | ✅ |
| `home_visit_d03` | ✅ |
| `home_visit_d15` | ✅ |
| `followup_call_d07` | ✅ |
| `followup_call_d21` | ✅ |
| `training_completion_d29` | ✅ |
| `adl_agwatch_timing_d03` | ✅ |
| `adl_agwatch_timing_d15` | ✅ |
| `vcg_agwatch_timing_d03` | ✅ |
| `vcg_agwatch_timing_d15` | ✅ |
| `watch_record` | ✅ |
| `a1_assessment` | ⬜ |
| `a2_assessment` | ⬜ |
| `patient_call` | ✅ |
| `adverse_event` | ✅ |
| `adverse_event_followup` | ✅ |
| `adverse_event_followup_visit` | ✅ |
| `adverse_event_clinical_visit` | ✅ |
| `robot_issue_call` | ✅ |
| `robot_issue_visit` | ✅ |
| `resolve_robot_issue_visit` | ✅ |
| `discontinuation` | ✅ |

---

## JS Coding Conventions

- **One JS file per page** (`static/js/app/<page>.js`). All modals for a page live in that page's file — do not extract individual modals into separate files. If the file grows too large to manage, split *all* modals out together into a `static/js/app/<page>/` directory, not just one.
- **Each modal has a clearly-delimited section** opened by a comment banner (`// ── Modal name ───...`), containing: module-level state variables, an `open*Modal()` function, a `save*()` function, and any private helpers.
- **Dynamic UI state** (showing/hiding/disabling fields based on user input) is implemented with `onchange` handlers set up inside the `open*Modal()` function, not at page load. Handlers are re-attached each time the modal opens so they always close over fresh modal state.
- **Validation** is enforced in two places: client-side in `save*()` before the fetch (user-facing error message via `setError()`), and server-side in the route (returns `{error}` JSON). Both must apply the same rules.

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
Every protocol event that has a modal must be listed in `EVENT_OPENERS` in `patient_detail.js`. When a new modal is implemented, add the entry. Currently registered: `exp_device_install`, `activation`, `discontinuation_reminder`, `adl_prescription_d01/d15`, `vcg_prescription_d01/d15`, `prescription_printout_d01/d15`, `home_visit_d02/d03/d15`, `followup_call_d07/d21`, `training_completion_d29`, `adl_agwatch_timing_d03/d15`, `vcg_agwatch_timing_d03/d15`, `watch_record`, `adverse_event`, `robot_issue_call`, `robot_issue_visit`, `adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`, `resolve_robot_issue_visit`.

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

### Pause history (`pauseHistory`)
When modifying any pause-related logic, verify ALL of the following are kept in sync:

| Location | What to check |
|---|---|
| `routes/user_management.py` — `api_complete_adverse_event` | Appends new open entry to `pauseHistory` when `trainingPausedDate` transitions from `null`; appends to `reasons` if already paused |
| `routes/user_management.py` — `api_complete_robot_issue_visit` | Same as above |
| `routes/user_management.py` — `api_complete_adverse_event_followup` | Closes the open entry (fills `end`, `days`) when pause clears |
| `routes/user_management.py` — `api_complete_adverse_event_followup_visit` | Same as above |
| `routes/user_management.py` — `api_complete_adverse_event_clinical_visit` | Same as above |
| `routes/user_management.py` — `api_complete_resolve_robot_issue_visit` | Same as above |
| `routes/user_management.py` — `api_create_patient` | Initialises `pauseHistory: []` |
| `scripts/reset_test_patient.py` | Initialises `pauseHistory: []` |
| `scripts/shift_activation.py` | Shifts `pauseHistory[*].start` and `pauseHistory[*].end` by N days; also shifts `cancelled[*].scheduled_date` and `cancelled_at` |
| `templates/patient_detail.html` | Pause history table section present in Overview tab |
| `static/js/app/patient_detail.js` — `renderPauseBanner` | Segmented progress bar driven by `pauseHistory` closed entries + current open epoch |
| `static/js/app/patient_detail.js` — `renderPauseHistoryTable` | Renders pause history table from `p.pauseHistory` |
| `static/js/app/patient_detail.js` — `_deriveTransitions` | Builds `Map<event_id, badge>` for timeline transition badges; must be updated if new state-changing events are added |

### Exercise Prescription Printout

**Status:** ✅ Implemented

Therapists can generate multi-language exercise pamphlets after ADL and VCG prescriptions. Supports 6 languages across 3 sites (Ranipet: English/Tamil/Telugu, Manipal: English/Kannada/Hindi, Ludhiana: English/Punjabi/Hindi).

**User Flow:**
1. Complete ADL + VCG prescriptions
2. Click `prescription_printout_d01` or `prescription_printout_d15` event
3. Select language using pill buttons (தமிழ், తెలుగు, ಕನ್ನಡ, हिंदी, ਪੰਜਾਬੀ)
4. Preview renders automatically with all translations
5. **Print** — Opens print dialog for immediate printing
6. **Save PDF** — Generates and uploads as attachment

**Key Files:**
- `routes/user_management.py` — API endpoints: `api_prescription_pamphlet()`, `api_complete_prescription_printout()`
- `templates/prescription_pamphlet.html` — Exercise cards with translated labels
- `templates/patient_detail.html` — Modal with language buttons, preview pane, Print/Save PDF actions
- `static/js/app/patient_detail.js` — `openPrescriptionPrintoutModal()`, `selectPrescriptionLanguage()`, `printPrescriptionPamphlet()`, `savePrescriptionPrintout()`

**Pamphlet Layout:**
- Info bar: Patient ID and Prescribed Date
- Exercise cards: Name, description, dosage, items, QR code
- Page breaks: Each exercise on separate page (except first)
- Fonts: Google Noto Sans family (supports all 6 languages)

**Issues Resolved:**
| Issue | Fix |
|-------|-----|
| Prescribed date N/A | Use `completion_date` or `scheduled_date[0]` fallback |
| Items field dict error | Use bracket notation: `{{ labels['items'] }}` instead of `{{ labels.items }}` |
| Each exercise same page | CSS: `.exercise-card { page-break-before: always; }` + `.exercise-card.first-exercise { page-break-before: auto; }` |
| Non-Latin scripts breaking | Remove `text-transform: uppercase;` and `letter-spacing: 0.3px;` from labels |.

## Known Limitations

**PDF Multi-Page Output:** 
- **Print button** — Respects CSS `@page` and `page-break-before` rules; generates professional multi-page output with proper page breaks
- **Save PDF button** — Uses html2canvas to capture DOM as image, then splits into A4 pages; results in continuous image layout rather than optimized page breaks
- **Recommendation:** Use Print button for final multi-page PDFs; Save PDF for quick archival

---

## Enhancements Implemented ✅

### 1. YouTube URLs for All Exercises

**Status:** ✅ Complete

All 75 exercises now have YouTube URLs. Previously only `adl_1` had a URL; all others were empty.

**Implementation:**
- Filled `youtube_url` field in `config/homer_exercises.json` with `https://youtu.be/Ccaz3yJhaVA?si=I0Y1kbCluhiZBuAH`
- QR codes now generate for all 75 exercises in the pamphlet

### 2. Exercise Screenshots in Pamphlet

**Status:** ✅ Complete

Exercise screenshots display in each exercise card before the YouTube QR code. When `USE_S3=True`, images are fetched from S3 at `EXERCISE_SS/<subfolder>/<filename>`; when `USE_S3=False`, images are read from the local `EXERCISE_SS/` folder. Both `.png` and `.jpg` are supported — `.png` is tried first, falling back to `.jpg`.

**Files Modified:**
- `routes/user_management.py`:
  - Added `_EXERCISE_SS_PATH` constant pointing to `EXERCISE_SS/` folder
  - Added `_SCREENSHOT_MAP` dict: 75-entry mapping of exercise IDs → screenshot filenames
  - Added `_make_screenshot_b64(exercise_id)` function: tries `.png` then `.jpg`; reads from S3 (`EXERCISE_SS/<filename>`) when `USE_S3=True`, local path otherwise
  - Updated `api_prescription_pamphlet()` to add `screenshot` field to each exercise dict (both ADL and VCG)

- `templates/prescription_pamphlet.html`:
  - Added `.exercise-screenshot` CSS: max-width 220px, auto height, 4px border-radius (reduced, convenient viewing)
  - Added screenshot display block before QR code in both ADL and VCG exercise cards

**Screenshot Filename Mapping:**
- ADL (8): `ADL_1.png` – `ADL_8.png`
- VCG2 Unilateral (8): `VCG2_Unilateral_task_1.png` – `VCG2_Unilateral_task_8.png`
- VCG2 Bilateral (10): `VCG2_Bilateral_task_1.png` – `VCG2_Bilateral_task_10.png`
- VCG3 Unilateral (10): `VCG3-Uni-task_1.png` – `VCG3-Uni-task_10.png`
- VCG3 Bilateral (12): `VCG3-Bi-task_1.png` – `VCG3-Bi-task_12.png`
- VCG4-5 Unilateral (8): `VCG4-5-Uni-task_1.png` – `VCG4-5-Uni-task_8.png` (except task_4 is lowercase `uni`)
- VCG4-5 Bilateral (19): `VCG4-5-Bi-task_1.png` – `VCG4-5-Bi-task_19.png`

### 3. Complete Translations

**Status:** ✅ Fully Translated

All 75 exercises have complete translations for 5 languages (Tamil, Telugu, Kannada, Hindi, Punjabi). Each language block contains fully translated: `name`, `description`, `dosage`, `items`.

**Files Modified:**
- `config/homer_exercises.json`: 
  - Translated 105 dosage fields from English to native languages
  - All "reps" → "மறுநிகழ்வுகள்" (Tamil), "పూనుకోవటాలు" (Telugu), etc.
  - All "sets" → "தொகுப்புகள்" (Tamil), "సెట్లు" (Telugu), etc.
  - Translation mapping:
    - Tamil: reps → மறுநிகழ்வுகள், sets → தொகுப்புகள்
    - Telugu: reps → పూనుకోవటాలు, sets → సెట్లు
    - Kannada: reps → ಪುನರಾವರ್ತನೆಗಳು, sets → ಸೆಟ್‌ಗಳು
    - Hindi: reps → दोहराव, sets → सेट
    - Punjabi: reps → ਦੋਹਾਸ, sets → ਸੈਟ

---

## Pamphlet Card Layout (Updated)

Exercise cards now display in this order:
1. Exercise name (translated)
2. Description (translated)
3. Dosage (translated)
4. Items needed (translated)
5. **Screenshot image** (220px max width) ← NEW
6. YouTube QR code (if youtube_url exists)

**Example flow:** Click `prescription_printout_d01` → select language → preview renders with screenshots → Print or Save PDF

### 4. Server-Side PDF Generation with Puppeteer

**Status:** ✅ **Complete & Tested**

**Goal:** Generate multi-language exercise PDFs with proper text rendering for all 6 languages (English, Tamil, Telugu, Kannada, Hindi, Punjabi) using server-side Chromium rendering.

**Architecture:**

**Frontend Flow** (`static/js/app/patient_detail.js` — `savePrescriptionPrintout()`):
1. Retrieves the rendered HTML from the preview div
2. Sends HTML to new server endpoint: `POST /api/patients/<homer_id>/generate-prescription-pdf`
3. Server renders HTML → generates PDF → saves attachment → marks event complete
4. On success: closes modal and refreshes events
5. PDF appears immediately in Timeline tab with download link

**Backend Flow** (`routes/user_management.py` — `api_generate_prescription_pdf()`):
1. Receives HTML content + event metadata (event_id, protocol_event_id, language, caption)
2. Saves HTML to temporary file
3. Calls Node.js Puppeteer script via subprocess: `node scripts/render_pdf.js <html_file> <pdf_file>`
4. Puppeteer renders HTML with Chromium engine:
   - Sets A4 page size (794×1123px)
   - Honors CSS `page-break-before` rules (each exercise gets separate page)
   - Applies print styles (margins, background colors, fonts)
   - Respects all Google Fonts (Tamil, Telugu, Kannada, Hindi, Punjabi)
5. Reads generated PDF from disk
6. Saves PDF to patient folder (S3 or local, based on Config.USE_S3)
7. Moves event from `incomplete` to `complete` in protocol_events.json
8. Records attachment path + caption on event entry
9. Cleans up temporary files
10. Returns success response

**Puppeteer Script** (`scripts/render_pdf.js`):
- Node.js utility that wraps Puppeteer headless browser
- Takes HTML file path + output PDF path as CLI arguments
- Launches Chromium in sandbox mode (`--no-sandbox` for Docker/containers)
- Renders HTML with 500ms delay for async content
- Generates PDF with A4 format, 10mm margins, print background enabled
- Respects CSS `@media print` and `page-break-*` rules
- Returns exit code 0 on success, non-zero on failure

**Why Server-Side?**
- ✅ Professional multi-page PDF with correct CSS page breaks
- ✅ Works reliably across all browsers/users (no DOM/font rendering issues)
- ✅ Consistent output (Chromium engine, not browser canvas)
- ✅ Fonts render perfectly (Chromium has native support for all scripts)
- ✅ No client-side dependencies (removed jsPDF, html2canvas)
- ✅ Simple, clean UX (user clicks Save → PDF is ready, no dialogs)
- ✅ Solves all multi-language rendering edge cases

**Key Files:**
- `package.json` — Defines Puppeteer dependency (npm install required)
- `scripts/render_pdf.js` — Node.js CLI wrapper for Puppeteer
- `routes/user_management.py` — Flask endpoint that orchestrates rendering
- `static/js/app/patient_detail.js` — Simplified frontend (calls server endpoint)
- `templates/patient_detail.html` — Removed jsPDF + html2canvas CDN links

**Setup & Installation:**
```bash
npm install puppeteer  # Install in project root
```

**Testing Checklist:**
1. ✅ `npm install` completed successfully (Puppeteer 21.11.0 installed, 107 packages)
2. ✅ Puppeteer script at `scripts/render_pdf.js` accepts HTML file input and generates PDF
3. ✅ Server endpoint `POST /api/patients/<homer_id>/generate-prescription-pdf` created and working
4. ✅ Frontend calls new endpoint instead of using html2canvas
5. ✅ PDF generated with correct page breaks (each exercise on separate page)
6. ✅ Attachment uploaded and stored correctly (verified: prescription_d01.pdf created)
7. ✅ Event marked complete in protocol_events.json
8. ✅ "Save PDF" button flow works end-to-end (tested with HOCMCV003)
9. ✅ All 6 languages render correctly in PDFs (Tamil, Telugu, Kannada, Hindi, Punjabi, English)
10. ✅ Screenshots display in PDF pages (exercise images visible)
11. ✅ QR codes generate for all exercises (all 75 exercises have YouTube URLs)

---

## Implementation Summary

**What was changed:**

| Component | Change | Result |
|-----------|--------|--------|
| Backend | Added `api_generate_prescription_pdf()` endpoint in routes/user_management.py | Server-side PDF generation orchestration |
| Node.js | Created `scripts/render_pdf.js` (Puppeteer wrapper) | Headless Chromium rendering with proper CSS page breaks |
| Frontend | Simplified `savePrescriptionPrintout()` in patient_detail.js | Calls server endpoint, receives PDF directly |
| Dependencies | Removed jsPDF + html2canvas CDN links | Added `package.json` with Puppeteer |
| Templates | Updated `patient_detail.html` | Removed client-side PDF library imports |

**User Experience:**
- Therapist clicks "Save PDF" in prescription printout modal
- Server renders HTML with Puppeteer (Chromium engine)
- Respects CSS `page-break-before: always` (each exercise on separate page)
- Supports all 6 languages natively (Google Fonts)
- PDF saved to patient folder (S3 or local)
- Event marked complete automatically
- PDF appears in Timeline tab immediately

**Benefits Over Previous Approach:**
- ✅ Professional multi-page PDF output
- ✅ Consistent rendering (Chromium, not browser canvas)
- ✅ Perfect font support for all languages
- ✅ No client-side library bloat
- ✅ Faster user experience (one-click PDF)
- ✅ More reliable (server-side, not browser-dependent)

### Enhancements Implemented ✅ (April 2026)

#### 1. ADL AGWatch Timing Day 01 & 02
**Status:** ✅ Complete

Added Day 1 and Day 2 timing events alongside existing Day 3. Therapists can now record exercise start/end times for all 3 home visit days.
- `adl_agwatch_timing_d01`: Records timing from activation event
- `adl_agwatch_timing_d02`: Records timing from home_visit_d02 event
- ADL tab displays all 3 days of timing per exercise row: `exercise_name | blocks/reps | D01: HH:MM → HH:MM | D02: HH:MM → HH:MM | D03: HH:MM → HH:MM`

**Files Modified:**
- `config/study_protocol.json` — Added 2 events to `shared[]`
- `routes/user_management.py` — Added 2 entries to `_AGWATCH_TIMING_CONFIG`
- `static/js/app/patient_detail.js` — Updated EVENT_OPENERS, session source mapping, loadAdlTab(), _prescriptionCard()

#### 1b. VCG AGWatch Timing Day 01 & 02
**Status:** ✅ Complete

Added Day 1 and Day 2 timing events for VCG exercises alongside existing Day 3. Control patients can now record VCG exercise start/end times for all 4 days (Day 1, 2, 3, and 15).
- `vcg_agwatch_timing_d01`: Records timing from activation event
- `vcg_agwatch_timing_d02`: Records timing from home_visit_d02 event
- VCG tab displays all 4 days of timing per exercise row: `exercise_name | blocks/reps | D01: HH:MM → HH:MM | D02: HH:MM → HH:MM | D03: HH:MM → HH:MM | D15: HH:MM → HH:MM`

**Files Modified:**
- `config/study_protocol.json` — Added 2 events to `control[]` section (vcg_agwatch_timing_d01, vcg_agwatch_timing_d02)
- `routes/user_management.py` — Added 2 entries to `_AGWATCH_TIMING_CONFIG` for VCG d01 and d02
- `static/js/app/patient_detail.js` — Added EVENT_OPENERS entries, session source mapping for VCG d01/d02, updated loadVcgTab() to fetch all 4 timing days

#### 2. Discontinued Patient Read-Only Mode
**Status:** ✅ Complete

Once a patient is discontinued (`discontinuationDate` set), the entire record becomes read-only. No events can be opened, no changes are allowed, and a banner informs the user.
- Red banner displays: "Patient is discontinued — record is read-only. No further changes are allowed."
- All event rows non-clickable (no modal opens on click)
- All complete-event API routes return 403 if patient is discontinued

**Files Modified:**
- `templates/patient_detail.html` — Added discontinued-readonly-banner
- `static/js/app/patient_detail.js` — Added `_patientDiscontinued` flag, banner display logic, clickability guard
- `routes/user_management.py` — Added `discontinuationDate` guard to 15+ complete-event routes

#### 3. Device Setup Modal Extension
**Status:** ✅ Complete

Extended device setup (`exp_device_install`) to include modem, laptop, and SIM card assignments alongside Pluto and Mars.
- Modem (required) — device assignment
- Laptop (required) — device assignment
- SIM Card (required) — assigned to modem for connectivity
- All devices create assignment records

**Files Modified:**
- `routes/user_management.py` — Extended `api_available_devices`, updated `api_complete_device_install` with SIM assignment logic
- `templates/patient_detail.html` — Added modem, laptop, and SIM select fields
- `static/js/app/patient_detail.js` — Updated `openDeviceSetupModal()` to fetch available SIMs, `submitDeviceSetup()` with SIM validation, field labels
 ## Issues pd-ds
### Issues Fixed ✅

1. **Patient Call Button Hidden on Discontinue** — When a patient is discontinued, the "Patient Call" button is now hidden and inaccessible
   - Updated button visibility logic to check `discontinuationDate`
   - Button only shows for activated patients that are NOT discontinued

2. **SIM Card Assignment to Modem** — SIM is now properly assigned to the modem in device inventory
   - Updated `api_complete_device_install` to update modem's `sim_id` field
   - Creates device log entry for SIM assignment
   - SIM persists in modem inventory

### Daily Activity Graph Enhancements ✅ Complete

1. **Target Line Changed to Dotted** — Target line now uses dotted style (`borderDash: [2, 2]`)
   - Visual legend updated to show dotted line
   - Applies to all device activity graphs (Pluto, Mars)

2. **Hover to Show Device Details** — Device detail graph now shows on hover instead of click
   - Changed from `onClick` to `onHover` event handler
   - Only triggers on actual data points (not target line or empty dates)
   - Tooltip hidden when actual value is zero or null
   - Detail panel appears immediately on mouse hover over data points
   - Shows zero values correctly in breakdown chart (not old data)

3. **No Data Handling** — Graph is hidden and message is shown when device has no data
   - **No data at all:** Shows "No data available" card instead of empty graph; maintains device header and styling
   - **Hovering over empty date:** Detail panel displays "No data available for [date]" message with inbox icon
   - Only loads detail breakdown when hovering over dates with actual CSV data files
   - Detail panel hides when not hovering or when hovering over dates without data

4. **Tooltip Improvements**
   - Comment box info hidden (no "Hover to see breakdown" message)
   - Shows actual value and target cleanly
   - Improved interaction feedback without extra text
   - Fixed error when hovering with proper null/undefined checks

**Files Modified:**
- `static/js/app/patient_detail.js` — Updated `_renderDeviceGraphs()` and `_loadDeviceDetail()` functions

### Task need to implement : Fix UI update issues and improve prescription modal behavior
Fix 3 UI issues:

1. Call Log History:
- Not updating after save (needs refresh)
- Should update immediately after save

2. Resume/Pause History:
- Same issue
- Update UI instantly after action

3. Prescription Modal:
- Disable Print & Save initially
- Enable only after language selection
- On Print → auto Save first
- Add proper validation
