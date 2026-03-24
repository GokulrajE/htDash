# htDash — Pages & Actions

---

## URL Structure

| Page           | URL                      | Blueprint                   |
|----------------|--------------------------|-----------------------------|
| Login          | `/login`                 | `routes/auth.py`            |
| Dashboard      | `/`                      | `main.py`                   |
| Patient list   | `/patients`              | `routes/user_management.py` |
| Patient detail | `/patients/<homer_id>`   | `routes/user_management.py` |
| Devices        | `/devices/`              | `routes/devices.py`         |
| SIM cards      | `/sim_cards/`            | `routes/sim_cards.py`       |

---

## Template Architecture

`base.html` contains: sidebar (real `<a href>` links), header bar, flash messages, and block definitions (`title`, `content`, `scripts`). All page templates extend it.

---

## User Permissions

| User type   | Description |
|-------------|-------------|
| `admin`     | Global admin — sees all sites, all actions |
| `therapist` | Site user — sees own site patients, clinical actions |
| `engineer`  | Site user — device and technical actions |

Actions list which user types are permitted. UI controls for disallowed actions are visible but disabled.

---

## Pages

### `GET /login`

Login form.

**Actions:** [Successful login](#successful-login), [Failed login](#failed-login)

---

### `GET /`

Main dashboard. Stat bubbles in two rows (6 per row on large screens), in order:

1. Total enrolled
2. Experimental group
3. Control group
4. Unassigned
5. Inactive
6. Active
7. Paused
8. Training Complete
9. A1 Complete
10. Broken Protocol
11. Discontinued
12. All Complete

Numbers are derived from `homer_id.json` files across all visible patients. Site users see their site only; admin sees all. `pre_discontinued` status is returned by the stats API but intentionally not shown as a bubble.

Below the stats: **Overdue** and **Upcoming** event panels showing protocol events across all non-terminal patients. Fetched from `GET /api/dashboard/events`.

- **Overdue** — two sub-groups shown together: (1) active-window events (`start` ≤ today ≤ `end`) sorted ascending by end date, then (2) past-due events (`end` < today) sorted ascending by end date. Active-window and past-due events are clickable if `depends_on` is satisfied.
- **Upcoming** — incomplete events whose `scheduled_date[0]` (start) > today, within 7 days, sorted ascending by start date. Within the same date, events that appear in another event's `depends_on` are sorted before their dependents. **Upcoming events are never clickable** — rendered as a plain `<div>` with label "Available from \<date\>" in place of the urgency label. This applies regardless of `depends_on` state.
- The two lists are mutually exclusive.
- Each event row displays the **Homer ID** prominently alongside the event name (e.g. `HOCMCV003 · ADL Prescription Day 01`), since rows span multiple patients.

**Actions:** None

---

### `GET /patients`

Patient list for the user's visible site(s).

#### Page elements
- Search bar (filter by Homer ID)
- **Add Patient** button (admin only)
- Filter tabs (in order): All, Unassigned, Inactive, Active, Paused, Training Complete, A1 Complete, Pre-Discontinued, Broken Protocol, Discontinued, All Complete — each with count. "All" selected by default.
- Patient rows sorted by `enrollDate`. Row colour indicates group. Status badge colour-coded.
- Each row: Homer ID, Hospital ID, Group, Training Side, Status
- Clicking a row navigates to `/patients/<homer_id>`

#### Patient state transitions

| Current state      | Action                                         | Field set                                                 | Next state         |
|--------------------|------------------------------------------------|-----------------------------------------------------------|--------------------|
| unassigned         | Assign group + Record A0                       | `group`, `a0CompletionDate`                               | inactive           |
| unassigned         | Pre-Discontinue                                | `discontinuationDate`                                     | pre_discontinued   |
| inactive           | Activate                                       | `activationDate`                                          | active             |
| inactive           | Discontinue                                    | `discontinuationDate`                                     | discontinued       |
| inactive           | *(today > a0 + 5 days)*                        | *(none — derived)*                                        | broken_protocol    |
| broken_protocol    | Discontinue                                    | `discontinuationDate`                                     | discontinued       |
| active             | Complete training                              | `trainingCompletionDate`                                  | training_completed |
| active             | Discontinue                                    | `discontinuationDate`                                     | discontinued       |
| active             | Adverse event / robot issue — training paused  | `trainingPausedDate` set                                  | paused             |
| paused             | Resume training                                | `trainingPausedDate` cleared; `cumulativePauseDays` incremented | active       |
| paused             | Extend pause (cumulative ≤ 10 days)            | `cumulativePauseDays` incremented                         | paused             |
| paused             | Extend pause (cumulative > 10 days)            | `cumulativePauseDays` incremented                         | broken_protocol    |
| training_completed | Record A1                                      | `a1CompletionDate`                                        | a1_completed       |
| training_completed | Discontinue                                    | `discontinuationDate`                                     | discontinued       |
| a1_completed       | Record A2                                      | `a2CompletionDate`                                        | all_completed      |
| a1_completed       | Discontinue                                    | `discontinuationDate`                                     | discontinued       |

**Actions:** [Add Patient](#add-patient), [Assign Group](#assign-group), [Pre-Discontinue](#pre-discontinue)

---

### `GET /patients/<homer_id>`

Patient detail. Shown for patients `inactive` and beyond (including `broken_protocol`, `paused`). Not shown for `pre_discontinued` or `discontinued`.

#### Page elements

- Back button → `/patients`
- Page title: Homer ID + status badge

- **Tab bar** (JS-driven switching):

  | Tab            | Shown for           |
  |----------------|---------------------|
  | Overview       | All                 |
  | Devices        | Experimental only   |
  | VCG            | Control only        |
  | ADL            | All                 |
  | Call Logs      | All                 |
  | Adverse Events | All                 |
  | Watch Records  | All                 |
  | Robot Issues   | Experimental only   |
  | Timeline       | All                 |

- **Overview tab** (default):
  1. **Patient Info card** — Homer ID, Hospital ID, Group, Training Side, Status, Enrolment Date, Pluto ID *(experimental group)*, Mars ID *(experimental group)*, AG Watch Right ID *(both groups)*, AG Watch Left ID *(both groups)*,
  2. **Key Dates card** — A0, Activation, Training Completion, A1, A2, Discontinuation dates. A separate **Days card** sits alongside showing days elapsed since activation (Day 1 = activation date). Displays `—` until activated. Hidden for terminal states (discontinued, all_completed, pre_discontinued). Calculated client-side in `patient_detail.js`.
  3. **Events panels** — Three columns: Completed | Overdue | Upcoming. Fetched from `GET /api/patients/<homer_id>/events`.
     - **Completed** — compact vertical timeline, most recent first. Green circle markers on a vertical line. Shows event name + completion date. Read-only.
     - **Overdue column** — two sub-groups shown together: (1) active-window events (`start` ≤ today ≤ `end`), label `Due now · N days left`, sorted ascending by end date; then (2) past-due events (`end` < today), label `Nd overdue`, sorted ascending by end date. Active-window events appear above past-due events.
     - **Upcoming** — incomplete events whose `scheduled_date[0]` (start) > today, sorted ascending by start date. No cap (all future events shown). Within the same date, events that appear in another event's `depends_on` are sorted before their dependents. **Upcoming events are never clickable** — rendered as a plain `<div>` with label "Available from \<date\>" in place of the urgency label. This applies regardless of `depends_on` state.
     - The three states are mutually exclusive. Categorisation always uses `start` for upcoming and `end` for overdue/broken-protocol.
     - **Blocked events** (unmet `depends_on`): rendered as a non-clickable `<div>` with an amber badge on the right reading "Needs: \<event name\>". A muted lock icon appears next to the event name. Applies only to overdue events — upcoming events use the "Available from" label regardless.

- **Timeline tab** — full-width vertical timeline, most recent first. Combines completed protocol events with two synthetic patient milestones injected client-side:
  - **Patient Enrolled** — from `enrollDate` in `<homer_id>.json`
  - **A0 Assessment** — from `a0CompletionDate` in `<homer_id>.json`
  - Synthetic events use **blue circles**; protocol events use **green circles**.
  - All events sorted descending by `filed_at` / `completion_date`.
  - Alternating row backgrounds for readability.

  **Split layout** (3-column CSS grid: `1fr 20px 1fr`):
  - *Left column* (right-aligned): event name (bold), scheduled date (`start – end` for windowed, single date if `start == end`, `—` if `null`; omitted for synthetic events), **Day N** relative to `activationDate` (negative for events before activation; omitted if patient not yet activated).
  - *Centre column*: circle marker + connecting vertical line.
  - *Right column*: completion datetime, filed-at timestamp, then extra event-specific fields in order: Pluto Device, Mars Device, Demo Done, Right Watch, Left Watch, Prescription File, any additional fields, **Notes always last**. Empty/false fields are omitted.

  Data from the `complete` array in `GET /api/patients/<homer_id>/events` (all fields except `id` are returned).

- **ADL tab** — shows the ADL prescription history for the patient. Each prescription is a card with a coloured header (day 01 = blue-400, day 15 = blue-600). Each exercise row shows: numbered circle badge · exercise name · blocks × reps (right-aligned). If the corresponding AG watch timing event is complete, the recorded `HH:MM:SS → HH:MM:SS` window appears below blocks × reps in the same row. Data is fetched in parallel via:
  - `GET /api/patients/<homer_id>/prescription/adl_prescription_d01` (or `d15`)
  - `GET /api/patients/<homer_id>/agwatch-timing/adl_agwatch_timing_d03` (or `d15`)
  - If `prescription_printout_d01` (or `d15`) is complete, a **Download PDF** link appears in the card header.

- **VCG tab** *(control patients only)* — same layout as ADL tab, using teal headers (day 01 = teal-400, day 15 = teal-600). Data fetched via:
  - `GET /api/patients/<homer_id>/prescription/vcg_prescription_d01` (or `d15`)
  - `GET /api/patients/<homer_id>/agwatch-timing/vcg_agwatch_timing_d03` (or `d15`)

- **Stub tabs** — Devices, Call Logs, Adverse Events, Watch Records, Robot Issues show "Coming soon"


**Actions:** [Device Setup](#device-setup-exp_device_install), [Activate](#activate), [ADL Prescription](#adl-prescription-adl_prescription_d01), [VCG Prescription](#vcg-prescription-vcg_prescription_d01), [Prescription Printout](#prescription-printout-prescription_printout_d01), [ADL Prescription Revision](#adl-prescription-revision-adl_prescription_d15), [VCG Prescription Revision](#vcg-prescription-revision-vcg_prescription_d15), [Home Visit](#home-visit), [Follow-up Call](#follow-up-call-followup_call_d07-followup_call_d21), [Patient Call](#patient-call), [Watch Record](#watch-record-watch_record), [Training Completion](#training-completion-visit-training_completion_d29), [Complete Training](#complete-training), [Record A1](#record-a1-assessment), [Record A2](#record-a2-assessment), [Discontinue](#discontinue)

---

## Actions

Each action is defined once here. Pages above reference which actions apply to them.

---

### Successful login
- Trigger: User submits correct credentials
- Allowed users: all
- Modal fields: none (standard login form)
- Server actions:
  - Open session row in `dashboard/<user_id>.csv`
  - Run broken protocol check: stamp `brokenProtocolDate` + log entry for any newly-detected patients
- Log message: none

---

### Failed login
- Trigger: User submits incorrect credentials
- Server actions: none
- Log message: none

---

### Add Patient
- Trigger: "Add Patient" button on `/patients`
- Allowed users: `admin`
- Modal fields:
  - Hospital Patient ID (text, required)
  - Training Side (Left / Right toggle, required)
- Server actions:
  - Generate `homerID`
  - Create `<homer_id>.json`
  - Create `<homer_id>.log`
  - Create patient subfolders
- Log message: `Created new patient : <homer_id>.json`

---

### Assign Group
- Trigger: "Assign Group" button on patient card (unassigned patients)
- Allowed users: `admin`
- Modal fields:
  - Group (Experimental / Control toggle, required)
  - A0 Assessment Date (datetime, required; cannot be in the future)
- Server actions:
  - Update `<homer_id>.json` with `group` and `a0CompletionDate`
  - Create `protocol_events.json` — pre-populate `incomplete` with all timed events; compute `scheduled_date` for `reference: "assignment"` events; leave `reference: "activation"` events as `null` placeholders
- Log message: `Group assigned: <group>`

---

### Pre-Discontinue
- Trigger: "Pre-DC" button on patient card (unassigned patients)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Reason / Comments (textarea, required)
- Server actions:
  - Update `<homer_id>.json` with `discontinuationDate`
  - Append `pre_discontinuation` record to `protocol_events.json` free section
- Log message: `Patient pre-discontinued`

---

### Activate
- Trigger:
  - Clicking the `activation` event row on patient detail (inactive patients).
  - Takes the user to patients details page where the modal is implemented.
- Allowed users: `admin`, `therapist`
- Prerequisites: all events listed in `depends_on` for `activation` in `study_protocol.json` must be in `complete` (e.g. `exp_device_install` for experimental patients)
- Modal fields:
  - Event Date (datetime, required; cannot be in the future)
  - **VCG Group** (dropdown: VCG 2 / VCG 3 / VCG 4–5; required; **control patients only**) — therapist selects the patient's VCG level at the activation visit; fixed for the entire study duration
  - Notes (textarea, optional). The notes text area must be large enough for the user to write their notes comfortably.
- Server actions:
  - Verify `depends_on` prerequisites are met (server-side safety check — the UI already blocks the action, but the endpoint rejects the request if any prerequisite event is not in `complete`)
  - Update `<homer_id>.json` with `activationDate` and `vcgGroup` (control patients only)
  - Compute and fill `scheduled_date` for all `reference: "activation"` entries in `protocol_events.json`
  - Seed first `watch_record` entry in `incomplete` with `scheduled_date = [activationDate, activationDate]` and `triggered_by = {type: "activation", id: <activation_entry_id>}`
- Log message: `Patient activated`
- UI behaviour: if prerequisites are unmet, the event row is rendered as a non-clickable `<div>` (no `href`) with a muted lock icon next to the event name and an amber badge on the right reading "Needs: \<blocking event name\>" in place of the date/urgency label

---

### Complete Training
- Trigger: "Complete Training" button on patient detail (active patients)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Training Completion Date (datetime, required; cannot be in the future)
- Server actions:
  - Update `<homer_id>.json` with `trainingCompletionDate`
- Log message: `Training completed`

---

### Record A1 Assessment
- Trigger: "Record A1" button on patient detail (training_completed patients)
- Allowed users: `admin`
- Modal fields:
  - A1 Assessment Date (datetime, required; cannot be in the future)
- Server actions:
  - Update `<homer_id>.json` with `a1CompletionDate`
- Log message: `A1 assessment recorded`

---

### Record A2 Assessment
- Trigger: "Record A2" button on patient detail (a1_completed patients)
- Allowed users: `admin`
- Modal fields:
  - A2 Assessment Date (datetime, required; cannot be in the future)
- Server actions:
  - Update `<homer_id>.json` with `a2CompletionDate`
- Log message: `A2 assessment recorded`

---

### Discontinue
- Trigger: "Discontinue" button on patient detail
- Allowed users: `admin`
- Applicable states: `inactive`, `broken_protocol`, `active`, `paused`, `training_completed`, `a1_completed`
- Modal fields:
  - Reason / Comments (textarea, required)
- Server actions:
  - Update `<homer_id>.json` with `discontinuationDate`
  - Append `discontinuation` record to `protocol_events.json` free section
- Log message: `Patient discontinued`

---

### ADL Prescription (`adl_prescription_d01`)
- Trigger: `adl_prescription_d01` event row on patient detail (both groups, day 1 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Event Date (read-only — auto-populated from the `activation` event's `completion_date`)
  - **Exercise search bar** — live-filters the ADL exercise list fetched from `GET /api/exercises?type=adl`; clicking a result adds it to the selected list; already-selected exercises are excluded from search results
  - **Selected exercises list** (scrollable if long) — each exercise exists in one of two states:
    - *Editing state* (entered when first added, or when Edit is pressed): exercise name + × (remove) button; Blocks field (number, required); Repetitions field (number, required); Notes field (textarea, optional); **Save** button — commits values and collapses to compact view
    - *Compact state* (entered after Save is pressed): exercise name · `<blocks> blocks × <reps> reps`; **Edit** button (re-expands to editing state pre-filled with saved values); × button (removes exercise)
    - The modal's **Save Prescription** button is **disabled** while any exercise card is in editing state — the therapist must Save or remove all cards before submitting
  - General Notes (textarea, optional)
- Server actions:
  - Write prescription to `adl/adl_prescription_d01.json` in the patient folder
  - Move `adl_prescription_d01` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "adl/adl_prescription_d01.json"`
- Log message: `ADL prescription recorded`

---

### VCG Prescription (`vcg_prescription_d01`)
- Trigger: `vcg_prescription_d01` event row on patient detail (control patients only, day 1 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Event Date (read-only — auto-populated from the `activation` event's `completion_date`)
  - **VCG Group** (read-only display — pre-filled from `vcgGroup` in `<homer_id>.json`, set at activation)
  - **Exercise search bar** — live-filters the VCG exercise list fetched from `GET /api/exercises?type=vcg&group=<vcg_group>`; clicking a result adds it to the selected list; already-selected exercises are excluded
  - **Selected exercises list** (scrollable if long) — same two-state card behaviour as [ADL Prescription](#adl-prescription-adl_prescription_d01); **Save Prescription** button disabled while any card is in editing state
  - General Notes (textarea, optional)
- Server actions:
  - Write prescription to `vcg_exercise/vcg_prescription_d01.json` in the patient folder
  - Move `vcg_prescription_d01` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "vcg_exercise/vcg_prescription_d01.json"`
- Log message: `VCG prescription recorded`

---

### Prescription Printout (`prescription_printout_d01`)
- Trigger: `prescription_printout_d01` event row on patient detail (both groups, day 1 after activation)
- Allowed users: `admin`, `therapist`
- `depends_on`: `adl_prescription_d01` (both groups); `vcg_prescription_d01` (control only)
- Modal: `prescription-printout-modal`
  - Title: "Therapy Prescription Printout"
  - Patient ID display (read-only)
  - PDF preview area (TODO: generate and render prescription PDF)
  - **Save PDF** button — generates PDF, saves to `attachments/prescription_d01.pdf`, marks event complete, downloads file to browser
  - **Print** button — generates PDF, saves to `attachments/prescription_d01.pdf`, marks event complete, sends to printer
- Server actions:
  - Generate prescription PDF (TODO)
  - Save PDF to `attachments/prescription_d01.pdf` in the patient folder (overwrite if exists)
  - Move `prescription_printout_d01` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date` (current datetime), `filed_at` (current datetime), `attachment: "attachments/prescription_d01.pdf"`
- Log message: `Prescription printout generated`

---

### Revised Prescription Printout (`prescription_printout_d15`)
- Trigger: `prescription_printout_d15` event row on patient detail (both groups, day 15 after activation)
- Allowed users: `admin`, `therapist`
- `depends_on`: `adl_prescription_d15` (both groups); `vcg_prescription_d15` (control only)
- Modal: `prescription-printout-modal` (shared with d01)
  - Title: "Revised Therapy Prescription Printout"
  - Patient ID display (read-only)
  - PDF preview area (TODO: generate and render revised prescription PDF)
  - **Save PDF** button — generates PDF, saves to `attachments/prescription_d15.pdf`, marks event complete, downloads file to browser
  - **Print** button — generates PDF, saves to `attachments/prescription_d15.pdf`, marks event complete, sends to printer
- Server actions:
  - Generate revised prescription PDF (TODO)
  - Save PDF to `attachments/prescription_d15.pdf` in the patient folder (overwrite if exists)
  - Move `prescription_printout_d15` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date` (current datetime), `filed_at` (current datetime), `attachment: "attachments/prescription_d15.pdf"`
- Log message: `Revised prescription printout generated`

---

### ADL Prescription Revision (`adl_prescription_d15`)
- Trigger: `adl_prescription_d15` event row on patient detail (both groups, day 15 after activation)
- Allowed users: `admin`, `therapist`
- `depends_on`: `home_visit_d15` (both groups)
- Modal fields: same structure as [ADL Prescription](#adl-prescription-adl_prescription_d01), with:
  - Event Date (read-only — auto-populated from the `home_visit_d15` event's `completion_date`)
  - Exercise list and notes pre-populated from `adl/adl_prescription_d01.json` — all cards open in **compact state** (already saved); therapist edits individual cards as needed
- Server actions:
  - Write revised prescription to `adl/adl_prescription_d15.json` in the patient folder
  - Move `adl_prescription_d15` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "adl/adl_prescription_d15.json"`
- Log message: `ADL prescription revised`

---

### VCG Prescription Revision (`vcg_prescription_d15`)
- Trigger: `vcg_prescription_d15` event row on patient detail (control patients only, day 15 after activation)
- Allowed users: `admin`, `therapist`
- `depends_on`: `home_visit_d15`
- Modal fields: same structure as [VCG Prescription](#vcg-prescription-vcg_prescription_d01), with:
  - Event Date (read-only — auto-populated from the `home_visit_d15` event's `completion_date`)
  - VCG Group read-only (from `vcgGroup` in `<homer_id>.json` — fixed for entire study)
  - Exercise list and notes pre-populated from `vcg_exercise/vcg_prescription_d01.json` — all cards open in **compact state**; therapist edits individual cards as needed
- Server actions:
  - Write revised prescription to `vcg_exercise/vcg_prescription_d15.json` in the patient folder
  - Move `vcg_prescription_d15` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "vcg_exercise/vcg_prescription_d15.json"`
- Log message: `VCG prescription revised`

---

### Home Visit (`home_visit_d02`, `home_visit_d03`, `home_visit_d15`)
- Trigger: respective event row on patient detail
- Allowed users: `admin`, `therapist`
- Modal: `simple-event-modal` (shared)
  - Title: event name (e.g. "Home Visit Day 02")
  - Event Date (datetime, required; cannot be in the future)
  - Notes (textarea, optional)
- Server actions:
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `notes`
- Log message: `Home visit recorded — Day <N>`

---

### Follow-up Call (`followup_call_d07`, `followup_call_d21`)
- Trigger: respective event row on patient detail
- Allowed users: `admin`, `therapist`
- Modal: `followup-call-modal` (dedicated; not shared with home visits)
  - Title: event name (e.g. "Follow-up Phone Call Day 07")
  - Call Date/Time (datetime, required; cannot be in the future)
  - **Date Change Reason** (textarea, amber border, conditionally visible): shown only when the selected date differs from `scheduled_date[0]`; required when visible; label shows the scheduled date for reference
  - Duration (integer minutes, required; must be > 0)
  - Training log PDF (file upload, required; `.pdf` only) — photos of the patient's weekly training log, sent by the patient before the call
  - Notes (textarea, required)
  - **Triggered events section** — same mechanism as [Patient Call](#patient-call): user can optionally record an adverse event, robot issue (exp only), and/or watch record as a consequence of this call. Watch Record toggle only shown if at least one watch is currently assigned.
- Server actions:
  - Save uploaded PDF to `attachments/followup_call_d07.pdf` (or `d21`) in the patient folder, overwriting if exists
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `duration_minutes`, `attachment`, `notes`, `triggered: [...]`; if date differs from scheduled, also adds `date_change_reason`
  - For each triggered event: same logic as [Patient Call](#patient-call) server actions — append to `free.adverse_event` / `free.robot_issue`, or stamp `triggered_by` and update `scheduled_date = [now, now]` on the open `watch_record` chain entry
- Log message: `Follow-up call recorded — Day <N>`

---

### Patient Call
- Trigger: "Log Call" button on patient detail (active patients; available from the Call Logs tab)
- Allowed users: `admin`, `therapist`
- Modal: `patient-call-modal`
  - Title: "Log Patient Call"
  - Call Date/Time (datetime, required; cannot be in the future)
  - Duration (integer minutes, required; must be > 0)
  - Notes (textarea, required)
  - **Triggered events section** — optional; user selects which downstream events arose from this call:
    - **Adverse Event** (toggle, both groups): if enabled, reveals sub-form fields for the adverse event (description, action taken, paused toggle)
    - **Robot Issue** (toggle, experimental only — hidden for control patients): if enabled, reveals sub-form fields for the robot issue (description, per-device fault list, paused toggle)
    - **Watch Record** (toggle, both groups): only shown if at least one watch is currently assigned (`agWatchRightID` or `agWatchLeftID` is not null); if enabled, shows an info note — no sub-form fields required
  - Multiple toggles may be enabled simultaneously
- Server actions:
  - Append `patient_call` entry to `free.patient_call` in `protocol_events.json`, with `triggered: [...]`
  - For each enabled toggle:
    - **Adverse event**: append entry to `free.adverse_event` with `triggered_by: {type: "patient_call", id: <call_id>}`
    - **Robot issue** (exp only): append entry to `free.robot_issue` with `triggered_by: {type: "patient_call", id: <call_id>}`
    - **Watch record**: stamp `triggered_by: {type: "patient_call", id: <call_id>}` onto the existing open `watch_record` entry in `incomplete`, and update its `scheduled_date` to `[now, now]` — no new entry is created; the entry immediately becomes overdue; the therapist completes it via the Watch Record modal
- Log message: `Patient call recorded`; additional log entries for each triggered event (e.g. `Adverse event recorded`, `Robot issue recorded`, `Watch record triggered`)

---

### AG Watch Timings (`adl_agwatch_timing_d03`, `adl_agwatch_timing_d15`, `vcg_agwatch_timing_d03`, `vcg_agwatch_timing_d15`)
- Trigger: respective event row on patient detail
- `adl_agwatch_timing_d03` / `adl_agwatch_timing_d15` — both groups; `vcg_agwatch_timing_d03` / `vcg_agwatch_timing_d15` — control only
- Allowed users: `admin`, `therapist`
- `depends_on`:
  - `adl_agwatch_timing_d03`: `home_visit_d03`
  - `adl_agwatch_timing_d15`: `home_visit_d15`, `adl_prescription_d15`
  - `vcg_agwatch_timing_d03`: `home_visit_d03`, `vcg_prescription_d01`
  - `vcg_agwatch_timing_d15`: `home_visit_d15`, `vcg_prescription_d15`
- Modal: `agwatch-timing-modal`
  - Title: event name (e.g. "Add ADL AG Watch Timings Day 03")
  - **Session date** (read-only — auto-populated from the home visit event's `scheduled_date[0]`; fixed, not editable)
  - One row per prescribed exercise (exercise list loaded from the associated prescription file at modal open):
    - Exercise name + block/rep summary (read-only)
    - **Start time** (`HH:MM:SS`, optional) + **✕ clear button**
    - **End time** (`HH:MM:SS`, optional) + **✕ clear button**
    - **Notes** (text input, optional if both times are filled; **required if either time is missing**)
  - Global Notes (textarea, optional)
  - **Save** button — combines session date + each time to produce `YYYY-MM-DDTHH:MM:SS`; non-editable after submission
- Associated prescription files:
  - `adl_agwatch_timing_d03` → exercises from `adl/adl_prescription_d01.json`
  - `adl_agwatch_timing_d15` → exercises from `adl/adl_prescription_d15.json`
  - `vcg_agwatch_timing_d03` → exercises from `vcg_exercise/vcg_prescription_d01.json`
  - `vcg_agwatch_timing_d15` → exercises from `vcg_exercise/vcg_prescription_d15.json`
- Server actions:
  - On modal open — `GET /api/patients/<homer_id>/agwatch-timing-exercises/<protocol_event_id>` — returns exercise list from the associated prescription file
  - On save — `POST /api/patients/<homer_id>/complete-event/agwatch-timing` — validates per-entry notes, writes timing JSON file, moves event to `complete`
  - For tab display — `GET /api/patients/<homer_id>/agwatch-timing/<protocol_event_id>` — returns the saved timing file for rendering inline in the ADL/VCG tab
- Log message: `<ADL|VCG> AG watch timings recorded (d03|d15)`

---

### Training Completion Visit (`training_completion_d29`)
- Trigger: `training_completion_d29` event row on patient detail (active patients, day 29)
- Allowed users: `admin`, `therapist`
- Modal: `simple-event-modal` (shared)
  - Title: "Training Completion Day 29"
  - Event Date (datetime, required; cannot be in the future)
  - Notes (textarea, optional)
- Server actions:
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `notes`
- Log message: `Training completion visit recorded`

---

### Device Setup (`exp_device_install`)
- Trigger: 
  - Clicking the `exp_device_install` event row on patient detail (experimental, inactive patients).
  - Takes the user to patients details page where the modal is implemented.
- Allowed users: `admin`, `engineer`
- Modal fields:
  - Event Date (datetime, required; cannot be in the future)
  - Pluto device (dropdown — active, non-clinic, unassigned devices from inventory; required)
  - Mars device (dropdown — same criteria; required)
  - Demo done (toggle, required)
  - Notes (textarea, optional)
- Server actions:
  - Move `exp_device_install` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `pluto_id`, `mars_id`, `demo_done`, `notes`
  - Append assignment record to `devices/assignments/pluto.json` and `devices/assignments/mars.json`
  - Append to `devices/logs/<pluto_id>.log` and `devices/logs/<mars_id>.log`
- Log message: `Device setup completed — Pluto: <pluto_id>, Mars: <mars_id>`

---

### Watch Record (`watch_record`)
- Trigger:
  - `watch_record` event row on patient detail — covers three cases:
    1. **Activation-seeded**: first entry, seeded at activation with `triggered_by = {type: "activation", ...}` and `scheduled_date = [activationDate, activationDate]`; immediately overdue
    2. **Call-claimed**: existing open chain entry claimed by a patient call or follow-up call; `triggered_by` and `scheduled_date = [now, now]` stamped at call-save time; immediately overdue
    3. **Chain follow-up**: open entry seeded at completion of previous watch record; `scheduled_date` computed from `next_followup_days`
  - "Log Watch Record" button on the Watch Records tab (standalone, user-initiated — creates a new entry)
- Allowed users: `admin`, `engineer`
- Modal: `watch-record-modal` (shared across all trigger paths)
  - **Context banner** (read-only, top of modal):
    - If `triggered_by.type = "activation"`: "Triggered by: Patient Activation"
    - If `triggered_by.type` is a call: "Triggered by: \<call event name\>"
    - If no `triggered_by`: "Scheduled chain follow-up"
  - **Current watches** (read-only display, one row per limb):
    - Right: watch ID (or "Not assigned" if null) + **Lost** checkbox — checkbox only shown when `old_id` is not null
    - Left: same
    - These become `old_id` and `old_lost` in the saved record
  - AG Watch Right — new assignment (dropdown: active, unassigned, non-lost watches from inventory + **"No Watch Available"** option; required). Selecting "No Watch Available" sets `ag_watch_right.new_id` to `null`.
  - AG Watch Left — new assignment (dropdown — same options; required).
  - Sync date & time (datetime; cannot be in the future) — when the watches were synced / data downloaded. **Required if at least one new watch is assigned; omitted when both are "No Watch Available".**
  - Worn date & time (datetime; cannot be in the future) — when the patient put the watches on. Same requirement as Sync.
  - Next follow-up in N days (integer input, required; must be ≥ 1) — determines when the next chain entry is scheduled
  - Notes (textarea) — **required if either new watch is "No Watch Available"**; optional otherwise
- Server actions:
  - Move `watch_record` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `ag_watch_right: {old_id, old_lost, new_id}`, `ag_watch_left: {old_id, old_lost, new_id}`, `sync_datetime`, `worn_datetime`, `next_followup_days`, `notes`; `triggered_by` already present if entry was claimed
  - Update `agWatchRightID` and `agWatchLeftID` in `<homer_id>.json`
  - For each limb: close the existing open assignment record (`returned_date = completion_date`); if `old_lost: true`, also set `lost: true` on that assignment record and set `lost_date` on the inventory record
  - For each new watch assigned: append a new assignment record to `devices/assignments/agwatch.json`; write device log `Assigned to <homer_id> (<limb>)`
  - For each lost watch: write device log `Lost — reported by <homer_id>`
  - Seed next `watch_record` entry in `incomplete` with `scheduled_date = [completion_date + next_followup_days, completion_date + next_followup_days]`
- Log message: `Watch record filed`
