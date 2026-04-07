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
21. ⬜ Devices page
22. ⬜ SIMs page
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
| `routes/devices.py` | Device page (stub) |
| `routes/sim_cards.py` | SIM cards page (stub) |
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
- **`adverse_event_followup` chain:** seeded whenever any adverse event is filed (regardless of `training_blocked`). One stub exists at a time in `incomplete`, carrying `adverse_event_ids` — a list of all currently unresolved AE IDs. When a new AE is filed while a stub already exists, its ID is appended to the existing stub's list. `scheduled_date = [today, today + 1 day]` — active window for 1 day, overdue the day after. Can also be logged freely by the therapist at any time (no stub required). On call completion, the therapist records per-AE `ae_discussions` (notes, resolved, can_resume_from); `resolved` and `can_resume_from` are written through to the AE record in `free.adverse_event`. If any AEs remain unresolved, a new follow-up call stub is seeded. Chain ends when all AEs are resolved. When all resolved: all pending AE follow-up stubs (`adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`) are moved from `incomplete` to the top-level `cancelled` array with `cancellation_reason: "Adverse event resolved"` and `cancelled_at` timestamp. `can_resume_from` (date only) is required per resolved AE that had `training_blocked: true`. Pause clears only when all `training_blocked: true` AEs have `resolved: true` on their AE record AND no `resolve_robot_issue_visit` stubs remain.
  - **`adverse_event_followup_visit` / `adverse_event_clinical_visit`:** scheduled from the File AE modal, Follow-up Call modal, Follow-up Visit modal, or Clinical Visit modal. Stubs are cancellable. Both carry `adverse_event_ids` and use `ae_discussions` for per-AE notes and resolution inputs. On completion, `resolved`/`can_resume_from` are written through to AE records. **Do NOT seed a follow-up call.** If visit stubs were scheduled, unresolved AE IDs carry into those stubs. If all AEs resolved, same cleanup and pause-clear logic applies (move all pending AE follow-up stubs to `cancelled[]` with reason `"Adverse event resolved"`).
  - **`ae_discussions`:** per-AE field on all follow-up event types. Each entry: `{ae_id, notes, resolved, can_resume_from}`. The `resolved`/`can_resume_from` values are inputs that get written through to `free.adverse_event[<ae_id>]` on save — the authoritative resolution state lives on the AE record itself, not on follow-up events.
  - **`patient_initiated` toggle** on `adverse_event_followup`: when the patient contacted the clinic first, the therapist should first file a `patient_call` (with `ae_discussed: true`) and then open the follow-up call stub. Setting `patient_initiated: true` reveals a **Related patient call** selector (required) — a dropdown of `patient_call` entries for this patient where `ae_discussed: true`. Stored as `related_patient_call_id` on the completed follow-up record.
- **`resolve_robot_issue_visit` stub:** created when a `robot_issue_visit` (or a subsequent `resolve_robot_issue_visit`) assigns no replacement for a taken-back device (`new_device_id: null`). Patient has no device; training paused. Resolved by engineer/admin: delivers replacement(s); may also optionally attend to the other device. Records `can_resume_from`. If null selected again, another stub is created. Pause clears only when no `resolve_robot_issue_visit` stubs remain AND all `training_blocked: true` AEs have `resolved: true` on their AE records.
- **Training completion stub cancellation:** when `training_completion_d29` is recorded, the server moves all of the following stubs from `incomplete` to `cancelled[]` with `cancellation_reason: "Training completed"` and `cancelled_at` timestamp:
  - All remaining standard protocol events (home visits, prescriptions, agwatch timings, follow-up calls, `training_completion_d29` itself if somehow duplicated)
  - `watch_record`
  - `robot_issue_call`, `robot_issue_visit`, `resolve_robot_issue_visit`
  - `adverse_event_followup` — follow-up calls are no longer needed once training ends; the free-form call mechanism remains if the therapist needs to record a call about an AE
  The following are **not** cancelled and remain in `incomplete`:
  - `a1_assessment`, `a2_assessment` — post-training assessments, still required
  - `adverse_event_followup_visit`, `adverse_event_clinical_visit` — already-booked appointments remain valid
- **Device and watch return at training completion:** all devices and watches are physically collected on day 29 and automatically unassigned in htDash when `training_completion_d29` is recorded.
  - **Robot devices (experimental only):** close the open Pluto and Mars assignment records (`returned_date = completion_date`); append `Returned from <homer_id>` to each device log.
  - **Watches (both groups):** close the open agwatch assignment records for any watch currently assigned (`agWatchRightID`, `agWatchLeftID`); append `Returned from <homer_id> (<limb>)` to each watch log; clear `agWatchRightID` and `agWatchLeftID` to `null` on the patient JSON.
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
| `routes/user_management.py` — `api_complete_adverse_event_followup` | Writes `resolved`/`can_resume_from` to AE records; closes the open entry (fills `end`, `days`) when pause clears; removes all pending AE follow-up stubs when all resolved |
| `routes/user_management.py` — `api_complete_adverse_event_followup_visit` | Same as above (does NOT seed a follow-up call) |
| `routes/user_management.py` — `api_complete_adverse_event_clinical_visit` | Same as above (does NOT seed a follow-up call) |
| `routes/user_management.py` — `api_complete_resolve_robot_issue_visit` | Closes the open entry when pause clears; pause condition: no `resolve_robot_issue_visit` stubs remain AND all `training_blocked: true` AEs have `resolved: true` |
| `routes/user_management.py` — `api_create_patient` | Initialises `pauseHistory: []` |
| `scripts/reset_test_patient.py` | Initialises `pauseHistory: []` |
| `scripts/shift_activation.py` | Shifts `pauseHistory[*].start` and `pauseHistory[*].end` by N days; also shifts `cancelled[*].scheduled_date` and `cancelled_at` |
| `templates/patient_detail.html` | Pause history table section present in Overview tab |
| `static/js/app/patient_detail.js` — `renderPauseBanner` | Segmented progress bar driven by `pauseHistory` closed entries + current open epoch |
| `static/js/app/patient_detail.js` — `renderPauseHistoryTable` | Renders pause history table from `p.pauseHistory` |
| `static/js/app/patient_detail.js` — `_deriveTransitions` | Builds `Map<event_id, badge>` for timeline transition badges; must be updated if new state-changing events are added |
