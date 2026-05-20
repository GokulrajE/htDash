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
- **Device Management:** Pluto & Mars device assignment, actigraph watch tracking, SIM card recharging
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
| `docs/ae_ri_logic.md` | Full AE/RI logic: stub lifecycle, follow-up chain, pause mechanics, broken protocol detection, auto-shift |

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
14. ✅ Fix `create_protocol_events()` — add missing `free` keys: `watch_record`, `activation_attempt`, `d15_attempt` (both groups); `other_device_issue_call`, `other_device_issue_visit` (experimental only). `cancelled: []` already present.
14b. ⬜ Post-Day 28 rules (see `docs/ae_ri_logic.md` Sections 12, 14, 15):
    - Day 28 pause auto-termination: `_auto_terminate_pause_if_expired()` in `api_patient_events` — closes open pause epoch at Day 28 end, updates `cumulativePauseDays`, clears `trainingPausedDate`
    - `post_training` derived status in `derive_status()`: `today > activationDate + 28` AND no `trainingCompletionDate`/`brokenProtocolDate`/`discontinuationDate`
    - Dashboard stat bubble + patient list filter tab + status badge for `post_training`
    - Add `training_completion_d29` to `_PAUSE_VISIBLE` in both `routes/user_management.py` and `routes/dashboard.py`
    - Client-side `_trainingPermanentlyEnded(patient)` — includes Day 28 expiry check
    - Amber informational banner when Day 28 passed and D29 not yet filed
15. ⬜ Update File Adverse Event modal — add scheduling toggles for follow-up visit / clinical visit
16. ⬜ Update Adverse Event Follow-up Call modal — `patient_initiated`, `ae_discussions`, scheduling toggles
17. ⬜ Adverse Event Follow-up Visit modal (new)
18. ⬜ Adverse Event Clinical Visit modal (new)
19. ✅ Assessment modals (a1, a2) + scheduling calls (schedule_a1_call, schedule_a2_call) — implemented; see CLAUDE.md Enhancements section for details
19b. ⬜ `device_return` event — engineer modal for device collection at end of training (any path):
    - Lazy seeding in `api_patient_events`: seed when `trainingCompletionDate` OR `brokenProtocolDate` OR `discontinuationDate` is set, no existing stub, no completed entry in `free.device_return`
    - Modal: per-device cards built from patient's open assignments at load time
      - AG Watch (both groups): status = Returned / Lost / Battery dead; if Lost or Battery dead → issue date (required)
      - Pluto / Mars / Laptop / Modem (experimental only): condition = Working / Faulty; if Faulty → has_issue set
      - SIM (experimental only): status = Returned / Lost; if Lost → issue date (required)
    - On save: close all open assignments; lost watches get `lost_date` + `lost: true`; faulty devices get `has_issue: true` + `faulty` device event; append to `free.device_return`
    - Remove inline device-assignment closure from `api_complete_discontinuation`; update banner text
    - Add `device_return` to `_BROKEN_PROTOCOL_INTERACTIVE` and `_DISCONTINUED_VISIBLE`; also visible for `training_completed`, `post_training`, `a1_completed`, `all_completed`
    - Add `device_return` to `EVENT_OPENERS` in `patient_detail.js`
    - See full spec in `docs/pages.md` → Device Return
20. ⬜ Patient detail tab content — Call Logs, ✅ Adverse Events, Watch Records, Robot Issues (exp only)
21. ✅ Devices page — inventory, assignments, SIM management (integrated)
22. ✅ SIM management — integrated into Devices page (no separate page)
23. ✅ **D01–D03 broken protocol detection + auto-shift on resume** (see design spec in `docs/pages.md`)
24. ⬜ Cleanup — remove old `dashboard.html` and unused JS
25. ⬜ Test all routes and functionality
26. ⬜ Merge to `main`

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
  - **D02 and D03 date lock (training completed path):** the date portion of `session_start`/`session_end` is pre-filled and read-only, locked to `activationDate + 1` (D02) or `activationDate + 2` (D03). Therapist selects time only. Server validates and rejects mismatched dates. D15 is not locked.
- **AG Watch timing session bounds (hard validation):** the `adl_agwatch_timing_d03` / `vcg_agwatch_timing_d03` modals enforce that every non-null exercise `start`/`end` falls within the `session_start`/`session_end` from `home_visit_d03`. The `adl_agwatch_timing_d15` / `vcg_agwatch_timing_d15` modals apply the same hard constraint using `home_visit_d15`. The form cannot be saved if any timing falls outside the session window.
- **Event display ordering** — two mechanisms control the order in which events appear in the overdue/upcoming lists (both patient detail and dashboard):
  - **`depends_on` (hard blocking):** enforces a prerequisite gate. Events with unmet dependencies appear with a lock icon and amber "Needs: X" badge, and are non-clickable. Also used by `_topo_sort` to order events within the same date group — parents always appear before dependents.
  - **`comes_after` (soft ordering hint):** defined in `study_protocol.json` alongside `depends_on`. Used by `_topo_sort` for display order only — no badge, no blocking, no clickability change. When event B lists event A in `comes_after`, A is placed before B in the list even if A's scheduled date would normally come later. Currently set on `adl_agwatch_timing_d01` and `vcg_agwatch_timing_d01` (both list `watch_record`) so the watch record task appears first on activation day.
  - **Code-level ordering rules (not in protocol JSON):** `schedule_a1_call` is always placed before `a1_assessment`, and `schedule_a2_call` before `a2_assessment`, when both appear in the same list. Hard-coded in `_topo_sort` because scheduling calls are free events with no protocol definition entry.
  - `_topo_sort` is defined in both `routes/dashboard.py` and `routes/user_management.py` and must be kept in sync.
- Status is never stored — always derived by `derive_status()` in `utils/data_access.py`
- **Timeline transition badges** are also never stored — derived client-side by `_deriveTransitions(patient, events)` in `patient_detail.js`. Returns a `Map<event_id, badge>`. Four badge types: `"paused"` (amber), `"resumed"` (green), `"broken_protocol"` (red), `"discontinued"` (slate). Detection rules: paused = event id in `pauseHistory[*].reasons[*].event_id`; resumed = event id matches `pauseHistory[*].end_event_id` (set by the route that closes the epoch); broken_protocol = event `completion_date[:10]` matches `brokenProtocolDate`; discontinued = event `completion_date[:10]` matches `discontinuationDate`.
- Free event types: `patient_call`, `adverse_event`, `adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`, `robot_issue_call` (experimental only), `robot_issue_visit` (experimental only), `resolve_robot_issue_visit` (experimental only), `watch_record`, `discontinuation`, `schedule_a1_call`, `schedule_a2_call`. There is no standalone `robot_issue` event — the chain starts directly at `robot_issue_call`.
- **State changes are user-input-driven only.** `brokenProtocolDate`, `trainingPausedDate`, `discontinuationDate`, and `cumulativePauseDays` are written exclusively when a user submits a form. The system clock is used for display only (overdue/upcoming labels, day counters). The single exception: `derive_status()` checks today's date to detect activation window expiry (`inactive` → `broken_protocol` when today > enrollment + 5 days and activation is still incomplete). No background jobs or automatic state transitions exist.
- **AE / Robot Issue logic** — full detail in `docs/ae_ri_logic.md`. Summary:
  - Triggered events (`adverse_event`, `robot_issue_call`, `watch_record`) are always created via trigger toggles in other modals, never standalone. Bidirectional references: triggering event stores `triggered: [{type, id}]`; spawned event stores `triggered_by: {type, id}`.
  - `adverse_event_followup_visit` and `adverse_event_clinical_visit` are cancellable — stub moves to top-level `cancelled` array with `cancellation_reason`.
  - Pause clears when: all pausing AEs resolved (with `can_resume_from`) AND no `resolve_robot_issue_visit` stubs remain. D21 cancellation check and D02/D03 Path 3 broken protocol check run at that moment.
  - D02/D03 broken protocol — three paths: (1) `training_not_done: true` at the home visit → immediate, double confirmation; (2) training completed → session date locked to Day 2/3, no broken protocol possible; (3) pause follow-up filed, `max(can_resume_from)` falls after D02/D03 window end and visit still unfiled → broken protocol at follow-up filing, double confirmation.
  - `derive_status()` checks `brokenProtocolDate` first — D02/D03-missed events and cumulative pause > 10 days both set `brokenProtocolDate`.
  - **AE trigger cutoff** — AE trigger toggle hidden in primary training modals (`activation`, home visits, calls, `patient_call`) once training permanently ends: `trainingCompletionDate` filed, `brokenProtocolDate` set, or `discontinuationDate` set. Within an active AE follow-up chain (`adverse_event_followup`, `_followup_visit`, `_clinical_visit`), the AE trigger toggle remains visible until all AEs are resolved. Once all AEs resolved, trigger disappears from all modals including follow-up modals. Robot issue triggers follow the same cutoff rule for primary modals and are never present in follow-up modals. Client-side helper: `_trainingPermanentlyEnded(patient)`.
  - **Broken_protocol event visibility** — only these events are interactive: `adverse_event` stubs (unfiled), `adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`, `robot_issue_call`, `robot_issue_visit`, `resolve_robot_issue_visit`, `other_device_issue_call`, `other_device_issue_visit`, `discontinuation_reminder` (synthetic), `a1_assessment`, `a2_assessment`, `schedule_a1_call`, `schedule_a2_call`. All other incomplete events are not shown. `api_patient_events` must return the full `complete` list (no early-return with `[]`); server constant `_BROKEN_PROTOCOL_INTERACTIVE` drives the overdue filter. AE follow-up routes must NOT enforce the `discontinuationDate` guard — AE chains must remain completable after discontinuation until all AEs are resolved.
  - **Discontinued patient event visibility** — when `discontinuationDate` is set, only the AE follow-up chain, assessment events, and device return are shown in the overdue/upcoming panels. Server constant `_DISCONTINUED_VISIBLE` drives this filter in both `api_patient_events` and the dashboard events API: `frozenset({'adverse_event', 'adverse_event_followup', 'adverse_event_followup_visit', 'adverse_event_clinical_visit', 'a1_assessment', 'a2_assessment', 'schedule_a1_call', 'schedule_a2_call', 'device_return'})`. RI/ODI chains are not included. This filter applies in addition to the read-only banner and 403 guards on complete-event routes.
  - **RI / ODI visit modals in broken_protocol** — when patient status is `broken_protocol`, the `robot_issue_visit`, `resolve_robot_issue_visit`, and `other_device_issue_visit` modals switch to a simplified **fault-documentation-only mode**: outcome options (Repaired / Swapped / Neither) are removed; the engineer records which devices are faulty and a fault description; `has_issue: true` is set and a `faulty` device event is logged; device assignments are NOT closed (they stay open until the `device_return` event is completed).
  - **Device assignment removal** — device assignments are closed exclusively when the `device_return` event is completed (server writes `returned_date` to all open assignments). No other event or route closes assignments — including discontinuation, which previously did this inline. This applies to all device types: Pluto, Mars, AGWatch, modem, laptop, SIM. Lost watches additionally get `lost_date` set and `lost: true` on their assignment.
  - **"Discontinue Patient" button visibility** — button is hidden when: (a) patient is `broken_protocol` (those patients use the `discontinuation_reminder` synthetic event), (b) a real `discontinuation` stub already exists in `incomplete`, (c) patient is already `discontinued`, `all_completed`, or `pre_discontinued`, OR (d) patient is `training_completed`, `a1_completed`, or `post_training` — once D29 is filed (or Day 28 has passed) training is over and discontinuation is no longer applicable; missed assessments are recorded as missed, not as discontinuations. Button is visible for: `inactive`, `active`, `paused` only. Clicking the button triggers a double confirmation popup; on confirm the server creates a `discontinuation` stub in `incomplete` and the button disappears.
  - **On-hold exclusions** — when training is paused, `robot_issue_call` and `robot_issue_visit` must NOT go on hold; they must remain active (same as `resolve_robot_issue_visit`, `other_device_issue_call`, `other_device_issue_visit`). Server constant `_PAUSE_VISIBLE` in both `user_management.py` and `dashboard.py` must include the full RI and ODI chains.
- **Assessment scheduling calls (`schedule_a1_call`, `schedule_a2_call`):**
  - Free events that record a phone call to schedule or reschedule an assessment appointment. Display names: "Schedule A1 Assessment" / "Schedule A2 Assessment". Each captures `call_date`, `duration_minutes`, `notes`, and `new_appointment_date`. On completion the corresponding `a1_assessment` / `a2_assessment` stub's `scheduled_date` is updated to `[new_appointment_date + "T09:00", new_appointment_date + "T09:00"]`.
  - **Only one stub may exist in `incomplete` at a time** — never create a second one if one already exists.
  - **Auto-seeding (both A1 and A2):** `api_patient_events` lazily seeds a stub when the corresponding assessment is in `incomplete` with `scheduled_date = null` AND no scheduling stub exists. For A2 only: also seeded 7 days before the A2 window opens regardless of `scheduled_date` state. No "Schedule Call" button on event rows — stubs are always server-seeded.
  - **A1 first scheduling:** done via the D29 modal (therapist picks `a1_appointment_date` inline; sets `a1_assessment.scheduled_date` directly). No `schedule_a1_call` is created at D29.
  - **Appointment cancellation:** in the A1/A2 assessment modal, a "Cancel Scheduled Assessment" section appears at the top when `scheduled_date` is not null. On confirm: appends `{ cancelled_at, appointment_date, reason }` to `appointment_cancellations` on the stub and resets `scheduled_date` to null. Auto-seeding then picks up on next load. Cancellation and completion are independent actions in the same modal.
  - **Visibility in `_BROKEN_PROTOCOL_INTERACTIVE` and `_DISCONTINUED_VISIBLE`:** both scheduling call types are included so they remain actionable after broken protocol or discontinuation.
  - **Window expiry:** if the A1 or A2 assessment window expires without completion, it is recorded as a missed assessment — no broken protocol, no discontinuation trigger.
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
| `schedule_a1_call` | ⬜ |
| `schedule_a2_call` | ⬜ |
| `patient_call` | ✅ |
| `adverse_event` | ✅ |
| `adverse_event_followup` | ✅ |
| `adverse_event_followup_visit` | ✅ |
| `adverse_event_clinical_visit` | ✅ |
| `robot_issue_call` | ✅ |
| `robot_issue_visit` | ✅ |
| `resolve_robot_issue_visit` | ✅ |
| `discontinuation` | ✅ |
| `device_return` | ✅ |

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

**On-hold events** (patient is paused AND event is not an AE/RI follow-up AND `scheduled_date[0]` ≤ today): rendered in the upcoming section even though their window has opened or passed. Gray/muted styling, slate "On hold" badge on the right, non-clickable `<div>`. Flagged by `on_hold: true` on the server response. Events whose window genuinely has not opened yet (`scheduled_date[0]` > today) are unaffected and show normally as "Available from". Both event APIs set the `on_hold` flag; both row renderers must handle it. On-hold events never appear in the overdue section while the patient is paused.

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
Every protocol event that has a modal must be listed in `EVENT_OPENERS` in `patient_detail.js`. When a new modal is implemented, add the entry. Currently registered: `exp_device_install`, `activation`, `discontinuation_reminder`, `adl_prescription_d01/d15`, `vcg_prescription_d01/d15`, `prescription_printout_d01/d15`, `home_visit_d02/d03/d15`, `followup_call_d07/d21`, `training_completion_d29`, `adl_agwatch_timing_d03/d15`, `vcg_agwatch_timing_d03/d15`, `watch_record`, `adverse_event`, `robot_issue_call`, `robot_issue_visit`, `adverse_event_followup`, `adverse_event_followup_visit`, `adverse_event_clinical_visit`, `resolve_robot_issue_visit`. Pending registration (item 19): `a1_assessment`, `a2_assessment`, `schedule_a1_call`, `schedule_a2_call`.

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

## Known Gaps (Require Dedicated Design Before Implementation)

**Editing entered events:**
- Some entered events may need correction after the fact (e.g. `training_blocked` flag set incorrectly in a home visit modal).
- Editing is a cross-cutting concern: almost every event type could need it, an audit trail (who changed what, when, why) is required, and many edits have cascading implications for downstream events.
- Current policy: only a global admin can correct errors, via direct data fix. No UI support.
- This requires a dedicated design session before any implementation — do not add ad-hoc edit endpoints without that design.

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

### UI Update Fixes ✅ Complete

1. **Call Log History** — updates immediately after save (direct cache + re-render via `_callLogsCache`)
2. **Pause/Resume History** — `loadPatientEvents()` now calls `renderPauseBanner` and `renderPauseHistoryTable` after every event action
3. **Prescription Modal** — Print & Save disabled until language selected; Print auto-saves first (abort if save fails); `_prescPrintoutLanguage` starts `null`

### Other Device Issue Chain ✅ Complete

Engineer call + visit chain for laptop, modem, and SIM issues — analogous to the robot issue chain for Pluto/Mars.

**Events (experimental patients only):**
- `other_device_issue_call` — triggered from patient events (activation, home visits, patient call, followup calls). Records `issue_occur_date` (when the issue first started, distinct from call date) and per-device outcome (`visit_required` / `resolved_over_call`). Marks affected devices `has_issue = true` and logs a "faulty" device event carrying `issue_occur_date`. If any device needs a visit, auto-creates an `other_device_issue_visit` stub.
- `other_device_issue_visit` — engineer physical visit. Per-device outcomes: `repaired` (clears `has_issue`) / `replaced` (swap + clear issue) / `neither`. Does NOT pause training.

**Device inventory:** `has_issue: boolean` added to modem, laptop, and SIM inventory records. Clears on resolution.

**Devices page:**
- Modem and laptop rows show "Issue" badge when `has_issue = true`
- Resolve Issue modal for modem/laptop displays `issue_occur_date` from the device's "faulty" event log

**Trigger toggles** exist in: activation, home_visit_d02/d03/d15, patient_call, followup_call_d07/d21. Hidden for control patients.

**Files Modified:**
- `config/study_protocol.json` — added 2 events to `experimental[]`
- `routes/user_management.py` — `api_complete_other_device_issue_call`, `api_complete_other_device_issue_visit`, + trigger injection in 7 routes
- `routes/devices.py` — `has_issue` support for modem/laptop/SIM; `issue_occur_date` in resolve; `GET /devices/api/device-issue-date`
- `templates/patient_detail.html` — engineer call modal (updated) + new engineer visit modal
- `static/js/app/patient_detail.js` — EVENT_OPENERS + all modal functions
- `static/js/app/devices.js` — issue badge for modem/laptop, `issue_occur_date` in resolve modal

### Device Issue Resolution & UI Improvements ✅ (April 2026 - Continued)

#### 1. Fixed Device Issue Resolution Bug
**Status:** ✅ Complete

**Problem:** Device issues raised from patient page and resolved via Devices page were not moving from "Open Issues" to "Resolved Issues". Recent Activity also displayed "00:00" instead of actual timestamps.

**Root Cause:** `append_device_event()` in `utils/device_events.py` stored date-only strings (from datepickers) as `YYYY-MM-DDT00:00:00` (midnight). When sorting events chronologically:
- Faulty event: `2026-04-21T14:30:00` (actual time when reported)
- Repair event: `2026-04-21T00:00:00` (hardcoded midnight)
- Sort result: repair < faulty → pair never detected → stayed in Open Issues

**Solution:** When `event_date` is a date-only string, combine with current time of day instead of midnight:
```python
# Before (broken):
ts = datetime.strptime(event_date, '%Y-%m-%d').strftime('%Y-%m-%dT00:00:00')

# After (fixed):
d = datetime.strptime(event_date, '%Y-%m-%d')
now = datetime.now()
ts = d.replace(hour=now.hour, minute=now.minute, second=now.second).strftime('%Y-%m-%dT%H:%M:%S')
```

**Files Modified:**
- `utils/device_events.py` — `append_device_event()` lines 75–81: replaced midnight logic with current-time-on-date logic

**Verification:**
- Issues raised from patient page now move to Resolved Issues when resolved via Devices page
- Recent Activity displays correct timestamps (e.g., "14:32") instead of "00:00"
- Works for both robot issues (pluto/mars) and other device issues (modem/laptop/SIM)

---

#### 2. Report Issue Button UI Update
**Status:** ✅ Complete

**Change:** Added "Report Issue" buttons to modem and laptop card headers (top-right corner), matching pluto/mars layout.

**Details:**
- Buttons appear in card header next to "Manage" dropdown
- Only visible for users with manage permissions (admin/engineer)
- Removed inline action buttons from table rows (cleaner interface)
- Hidden for retired devices

**Files Modified:**
- `templates/devices.html` — Added `issue-modems-btn` and `issue-laptops-btn` elements to card headers
- `static/js/app/devices.js` — Added button IDs to visibility toggle list (line 72)

---

#### 3. Robot Issue `issue_occur_date` Tracking
**Status:** ✅ Complete

**Feature:** Added optional `issue_occur_date` field to robot issue call modal. Tracks when the robot issue first started (distinct from call date).

**Details:**
- `issue_occur_date` is date-only input (optional)
- Passed through `api_complete_robot_issue_call` to robot_issue_call free event
- Traced through robot_issue_visit → resolve_robot_issue_visit chain
- Appended to device faulty event with `issue_occur_date` parameter
- Displayed in Devices page resolve modal under "Issue First Occurred"

**Files Modified:**
- `templates/patient_detail.html` — Added date input field to `#robot-issue-call-modal` (line 1167)
- `static/js/app/patient_detail.js` — Updated `openRobotIssueCallModal()` to clear field, `saveRobotIssueCall()` to read and pass value
- `routes/user_management.py` — Updated `api_complete_robot_issue_call()` to read and store `issue_occur_date` (lines 1958–1962), passes to device events on visit completion (lines 2379–2398, 2424–2427)

---

#### 4. Other Device Issue `issue_occur_date` Required Field
**Status:** ✅ Complete

**Change:** Made `issue_occur_date` a required field in other device issue call modal. Removed automatic today-date population.

**Details:**
- Added `required` attribute to HTML input
- Removed auto-fill logic that set value to today's date
- Field must be manually filled by user before saving
- Max constraint still prevents selecting future dates
- Backend validation (line 5027) blocks empty values

**User Flow:**
1. Open other device issue call modal
2. "Issue First Occurred" field is empty (no auto-fill)
3. User MUST select a date/time
4. Browser and server validate before saving

**Files Modified:**
- `templates/patient_detail.html` — Added `required` attribute to `#odi-issue-occur-date` input (line 1397)
- `static/js/app/patient_detail.js` — Changed auto-fill from `nowStr` to empty string `''` in `openOtherDeviceIssueModal()` (line 4923)

**Verification:**
- Field is empty on modal open
- Cannot submit modal without selecting date
- Date picker prevents future dates
- Value is passed correctly to backend

---

### Device Data Structure Refactor ✅ (April 2026)

#### 1. Per-Type Folder Layout
**Status:** ✅ Complete

**Change:** Device data reorganised from flat type-grouped subdirectories to per-type folders. Every file for a device type now lives inside its own subfolder.

**Old layout:**
```
devices/inventory/pluto.json
devices/assignments/pluto.json
devices/fault_reports/pluto.json
devices/events/pluto/<device_id>.json
devices/logs/pluto/<device_id>.log
devices/attachments/pluto/<event_id>.ext
```

**New layout:**
```
devices/pluto/inventory.json
devices/pluto/assignments.json
devices/pluto/faultReport.json
devices/pluto/events/<device_id>.json
devices/pluto/logs/<device_id>.log
devices/pluto/attachments/<event_id>.ext
```

Type → folder mapping: `pluto→pluto`, `mars→mars`, `agwatch→agwatch`, `modem/modems→modems`, `laptop/laptops→laptops`, `sims→sims`

**Key implementation:**
- `_TYPE_FOLDER` dict and `_type_folder()` helper added to `utils/data_access.py` as the single source of truth for all path construction
- Replaces the old `_LOG_TYPE_FOLDER` dict (removed)
- All 11 read/write functions in `utils/data_access.py` updated
- `utils/device_events.py` updated — all `_events_path()` and S3 key strings
- `routes/devices.py` — attachment upload/download paths updated
- S3 keys follow the same new pattern

**Files Modified:**
- `utils/data_access.py` — `_TYPE_FOLDER`, `_type_folder()`, all inventory/assignment/fault_report/log functions
- `utils/device_events.py` — `_events_path()`, `read_all_device_events()`, `get_open_issues()`, `get_resolved_issues()`
- `routes/devices.py` — attachment paths in `api_upload_event_attachment()`
- `scripts/migrate_device_data.py` — NEW idempotent migration script
- `docs/device_data_schemas.md` — updated folder structure diagram and all file path references

**Migration:** Run `python scripts/migrate_device_data.py` once per environment to move existing data files. Script is idempotent (skips files already moved). Also updates stored `attachment` field references inside event JSON files.

---

#### 2. SIM ID = Phone Number
**Status:** ✅ Complete

**Change:** SIM `id` field is now the phone number instead of a UUID. Prevents the same phone number from being added twice or linked to two different modems.

**Details:**
- `api_add_device` for `dtype='sim'` sets `id = phone` (was `uuid4()`)
- Duplicate check: if phone number already exists in inventory, returns 409
- `phoneNumber` field kept alongside `id` for display compatibility
- `sim_id` on modem inventory now references the phone number string (not a UUID)

**Files Modified:**
- `routes/devices.py` — `api_add_device()` SIM branch: duplicate check + `id = phone`

---

#### 3. SIM Availability Fix
**Status:** ✅ Complete

**Problem:** Assigned SIMs still appeared in the device setup dropdown for new patients. The filter `s.get('assigned_date')` checked a field that doesn't exist on SIM records.

**Fix:** Derive availability from modem inventory — a SIM is unavailable if its `id` appears as `sim_id` on any modem record.

```python
# Old (broken — field doesn't exist):
available_sims = [s for s in all_sims if not s.get('assigned_date')]

# Fixed:
modem_inv = read_device_inventory(folder, 'modems')
used_sim_ids = {d.get('sim_id') for d in modem_inv if d.get('sim_id')}
available_sims = [s for s in all_sims if s['id'] not in used_sim_ids]
```

**Files Modified:**
- `routes/user_management.py` — `api_available_devices()` SIM filtering logic

---

#### 4. Device Swap — Missing Assign Events for New Device
**Status:** ✅ Complete

**Problem:** When a device is swapped via the Devices page or during a robot issue visit, the new (replacement) device never got an `assign` event record. So it never appeared in Recent Activity, unlike modem/laptop replacements which did.

**Root cause:** Three swap paths were missing `append_device_event('assign', ...)` for the new device:
1. `api_swap_device` in `routes/devices.py` — Devices page "Report Issue + swap" flow
2. `api_complete_robot_issue_visit` in `routes/user_management.py` — robot issue visit swapped outcome
3. `api_complete_resolve_robot_issue_visit` in `routes/user_management.py` — resolve robot issue visit new device delivery + other-device swap

All three already called `write_device_log()` for the new device but not `append_device_event()`.

**Fix:** Added `append_device_event(..., event_type='assign')` for the new device immediately after `write_device_assignments()` in each of the three paths. Also added `append_device_event(..., event_type='faulty')` for the old device in `api_swap_device` (was also missing).

**Files Modified:**
- `routes/devices.py` — `api_swap_device()`: added faulty event for old device + assign event for new device
- `routes/user_management.py` — `api_complete_robot_issue_visit()` swapped branch: assign event for new device
- `routes/user_management.py` — `api_complete_resolve_robot_issue_visit()` main replacement loop + other-device swap: assign event for new device

**Verification:**
- After a pluto/mars swap from Devices page → Overview tab Recent Activity shows "Faulty" (old) and "Assigned" (new)
- After robot issue visit with device swap → Recent Activity shows "Assigned" for replacement device
- Matches existing behaviour for modem/laptop replacements

#### 5. Device Issue Date Validation ✅ Complete

**Feature:** Add comprehensive date validation to device issue modals across Devices page and patient detail page.

**Constraints Applied:**

**A. Issue Occurred Date** (when issue was first noticed):
- **Robot Issues:** Required field, Min = Patient's activation date (`activationDate`), Max = today
- **Other Device Issues:** Optional, Min = Patient's activation date, Max = today
- **Device Report Issue (Devices page):** Optional, Min = Patient's activation date, Max = today

**B. Call/Visit Date** (when engineer was called or visited):
- Minimum: Issue Occurred Date (from the issue that triggered this)
- Maximum: Current date (today)
- Applies to: robot_issue_visit, resolve_robot_issue_visit, other_device_issue_visit, device resolve modal

**C. Resolution Date** (when issue was resolved):
- Minimum: Issue Occurred Date
- Maximum: Current date (today)
- Applies to: Device resolve modal (Devices page only)

**Implementation Details:**

**Devices Page (devices.js & routes/devices.py):**
- When device is selected, fetch patient's `enrollDate` + most recent issue's `issue_occur_date` via API
- Set `min`/`max` on issue-occurred-date input: `[enrollDate, today]`
- Set `min`/`max` on resolve-date input: `[issue_occur_date, today]`
- Client-side validation in `saveIssueAction()` before submit
- Server-side validation in `/devices/api/toggle-issue` and `/devices/api/swap-device`

**Patient Detail Page (patient_detail.js & routes/user_management.py):**
- API endpoint: fetch patient's enrollDate + all relevant issue's issue_occur_date
- Applied to 5 event modals:
  1. `robot_issue_call` — issue_occur_date: `[enrollDate, today]`; call_date: `[issue_occur_date, today]`
  2. `robot_issue_visit` — visit_date: `[issue_occur_date, today]` (from triggered call)
  3. `resolve_robot_issue_visit` — visit_date: `[issue_occur_date, today]`
  4. `other_device_issue_call` — issue_occur_date: `[enrollDate, today]`; call_date: `[issue_occur_date, today]`
  5. `other_device_issue_visit` — visit_date: `[issue_occur_date, today]`
- Client-side validation before submit
- Server-side validation in all complete-event routes

**Files Modified:**
- `static/js/app/devices.js` — Enhanced `onIssueDeviceChange()` + `saveIssueAction()`
- `routes/devices.py` — New API endpoint + validation in toggle-issue & swap-device
- `static/js/app/patient_detail.js` — New API call + modal setup + validation in 5 save functions
- `routes/user_management.py` — New API endpoint + validation in 5 complete-event routes

**Error Messages:**
- "Issue occurred date must be between enrollment date (YYYY-MM-DD) and today"
- "Resolution date must be between issue occurred date (YYYY-MM-DD) and today"
- "Dates cannot be in the future"

**Verification Checklist:**
- ✅ Syntax: Python and JavaScript code compiles without errors
- ✅ API Endpoint: `/devices/api/device-validation-dates` created and returns enroll_date + issue_occur_date
- ✅ Backend Validation: Both `api_toggle_issue` and `api_swap_device` validate date ranges
- ✅ Frontend Bounds: Date inputs show visual bounds (min/max attributes set from API response)
- ✅ Frontend Validation: `saveIssueAction()` validates dates before submission with error messages
- ✅ User Flow: 
  1. Select device → fetch bounds → set min/max on inputs
  2. Pick date outside range → browser prevents selection OR user enters via calendar
  3. Try to save with invalid date → JS validation shows error message
  4. If JS bypassed → backend validation catches and returns 400 error
- ✅ Backward Compatibility: Existing device issue functionality unchanged; validation is additive only

---

## Date Keyboard Validation ✅ (April 30, 2026)

**Status:** ✅ Complete

**Problem:** Date fields in all modals have datepicker constraints (min/max bounds), but when users type dates directly via keyboard, no validation was enforced until form submission.

**Solution:** Added real-time JavaScript validation that checks keyboard input against the same min/max constraints as the datepicker.

**Implementation:**

**patient_detail.js:**
- `_validateDateInput(input, errorId)` — Validates keyboard-entered dates against input.min and input.max
- `_formatDateForDisplay(dateStr)` — Formats YYYY-MM-DD → "DD Mon YYYY" for error messages
- `_validateSessionEndInput(startInput, endInput, errorId)` — Validates session start/end pairs (same date + end > start)
- Enhanced `_attachDateGuard()` — Now listens to both 'change' and 'input' events
- Enhanced `_attachSessionEndGuard()` — Now validates both start and end inputs on every keystroke

**devices.js:**
- `_attachDateKeyboardValidation(inputId, errorId)` — Real-time validation for issue/SIM date modals
- `_formatDateForKeyboardValidation(dateStr)` — Date formatter for error messages
- Updated `openIssueModal()`, `openAddSimModal()`, `openRechargeSimModal()` — Attach validation on open
- Updated `onIssueDeviceChange()` — Attach validation after bounds are set

**Validation Rules:**
1. Date cannot be before input.min (e.g., "Date cannot be before 01 Apr 2026.")
2. Date cannot be after input.max (e.g., "Date cannot be after 30 Apr 2026.")
3. Session start and end must be on the same calendar date
4. Session end must be strictly after session start
5. Errors appear immediately on both 'input' (as typing) and 'change' (on blur) events
6. Errors clear when field is valid

**Coverage:**
- ✅ All 25+ date fields in patient_detail modals (A1/A2, device setup, activation, home visits, calls, adverse events, watch records, etc.)
- ✅ All date fields in devices.js modals (issue report/resolve, SIM recharge/expiry)
- ✅ Both datetime-local (with time) and date-only inputs
- ✅ Session start/end pairs validation

**Error Messages (Examples):**
- "Date cannot be before 01 Apr 2026."
- "Date cannot be after 30 Apr 2026."
- "Session start and end must be on the same date."
- "Session end must be after session start."

**Files Modified:**
- `static/js/app/patient_detail.js` — 5 new functions, 2 function enhancements
- `static/js/app/devices.js` — 2 new functions, 3 function enhancements

**Testing:**
- ✅ JavaScript syntax validation passed (node -c)
- ✅ Manual testing: typing invalid dates shows error immediately
- ✅ Validation persists until user clears field or enters valid date
- ✅ Backward compatible: datepicker still works, server-side validation still in place

---

## Submit Guard for Date Validation Errors ✅ (April 30, 2026)

**Status:** ✅ Complete

**Enhancement:** Added **submit guards** to prevent form submission when date validation errors are present.

**How It Works:**

Before allowing a form to be submitted, the save functions now:
1. Check if any date validation error elements contain visible errors
2. Block submission with error message: "Please fix the date validation errors before submitting."
3. Only proceed if all date fields are valid

**Implementation:**

**patient_detail.js:**
- New `_hasDateValidationErrors(errorElementIds)` function — Checks if any error elements have visible errors
- Updated save functions: `submitDeviceSetup()`, `submitActivation()`, `saveHomeVisit()`

**devices.js:**
- New `_hasDateValidationErrors(errorElementId)` function — Checks for visible date errors
- Updated save function: `saveIssueAction()`

**User Experience:**

Before:
```
User types invalid date → Gets error message → Clicks Save → Form submits with invalid date
```

After:
```
User types invalid date → Gets error message → Clicks Save → Form BLOCKED → "Please fix the date validation errors"
```

**Coverage:**
- ✅ Device setup modal — checks device-setup-error
- ✅ Activation modal — checks activation-error
- ✅ Home visit modals (d02, d03, d15) — checks hv-error
- ✅ Issue report/resolve (Devices page) — checks issue-modal-error

**Additional Benefits:**
- Prevents double-submission with invalid dates
- Clear feedback that date validation must pass before submission
- Server-side validation still in place as backup
- All date fields protected by same mechanism

---

## Open Issues Document Downloads ✅ (May 4, 2026)

**Status:** ✅ Complete

**Issue:** Uploaded documents in "Report Issue" and "Resolve Issue" modals weren't displaying download links in the **Open Issues section**, even though they were being uploaded and stored.

**Root Cause:** The Open Issues section HTML template didn't include download link UI, while the Resolved Issues section did.

**Solution:** Updated the Open Issues section to display attachments with download links, matching the Resolved Issues layout.

**Implementation:**

**File Modified:** `static/js/app/devices.js`

**Changes:**
- Added `_attachLink()` helper function to Open Issues section (was only in Resolved Issues)
- Updated Open Issues HTML template to display:
  - Issue notes with red "Issue:" label
  - Issue date, reporter, and "Report doc" download link
  - Resolve button in a separate div for better layout
- Now mirrors the Resolved Issues layout for consistency

**Where Downloads Appear:**
- **Open Issues Section**: Shows "Report doc" link if attachment uploaded during "Report Issue"
- **Resolved Issues Section**: Shows both "Fault doc" and "Resolution doc" links

**User Flow:**
1. User opens Report Issue modal → Uploads document → Clicks "Report Issue"
2. Backend stores attachment in `devices/<type>/attachments/<event_id>.ext`
3. Open Issues section immediately shows "Report doc" download link
4. When issue resolved, Resolved Issues section shows both "Fault doc" and "Resolution doc"

**Attachment Storage:**
- Location: `data/<hospital>/devices/<type>/attachments/<event_id>.ext`
- Supported types: PDF, PNG, JPG, JPEG, GIF, WebP
- Endpoint: `GET /devices/api/download-event-attachment?type=...&device_id=...&event_id=...`

**Testing:**
- ✅ JavaScript syntax valid (node -c)
- ✅ Download links appear in Open Issues
- ✅ Download links appear in Resolved Issues
- ✅ Report doc link shows for reported issues
- ✅ Resolution doc link shows for resolved issues
- ✅ Fault doc link shows in resolved pairs

---

## Adverse Events Tab — Collapsible Cards with AE Aliases ✅ (May 2026)

**Status:** ✅ Complete

**Feature:** Adverse Events tab on the patient detail page redesigned as collapsible cards with stable aliases, color-coded by severity, and a built-in follow-up history.

**Card design:**

| Element | Details |
|---|---|
| Alias | `AE01`, `AE02`, … assigned **server-side** at Phase 2 filing (`api_complete_adverse_event`), stored as `alias` on the `free.adverse_event` entry. Chronological (oldest = AE01). Stable — never recomputed or reassigned. |
| Display order | Newest first |
| Header | Alias + status badge + chevron (click anywhere to expand/collapse) |
| Status badge | Red "Ongoing — Training blocked" / Amber "Ongoing" / Green "Resolved" |
| Meta row | `Reported: <date> \| Resolved: <date> \| Duration: N days \| Day X` (always visible) |
| Card color | Red border (blocked+ongoing), Amber border (ongoing), Green border (resolved) |

**Expanded body:**
- Description, action taken, triggered-by, attachment link
- **Follow-up history** section: all `adverse_event_followup`, `_visit`, `_clinical_visit` entries that reference this AE's ID, in chronological order. Each row shows type, date, event notes, per-AE discussion notes, resolved/unresolved status, `can_resume_from` if set, attachment link.

**Duration field:**
- Resolved: `resolve_date − report_date` in days
- Ongoing: elapsed days since report date ("N days ongoing")

**Files Modified:**
- `static/js/app/patient_detail.js` — replaced `renderAdverseEventsTab()` and `_adverseEventCard()`; added `_toggleAeCard()`, `_AEF_TYPE_LABELS`, `_AE_FOLLOWUP_TYPES` constants
- `docs/pages.md` — updated Adverse Events tab spec

logconvo-project: htDash
