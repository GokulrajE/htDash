# htDash — Pages & Actions

---

## URL Structure

| Page           | URL                    | Blueprint                                                                                                      |
| -------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Login          | `/login`               | `routes/auth.py`                                                                                               |
| Dashboard      | `/`                    | `main.py`                                                                                                      |
| Patient list   | `/patients`            | `routes/user_management.py`                                                                                    |
| Patient detail | `/patients/<homer_id>` | `routes/user_management.py`                                                                                    |
| Devices        | `/devices/`            | `routes/devices.py`                                                                                            |
| SIM cards      | `/sim_cards/`          | `routes/sim_cards.py` (legacy — SIM management is integrated into the Devices page; `/sim_cards/` is not used) |

---

## Template Architecture

`base.html` contains: sidebar (real `<a href>` links), header bar, flash messages, and block definitions (`title`, `content`, `scripts`). All page templates extend it.

---

## User Permissions

| User type   | Description                                          |
| ----------- | ---------------------------------------------------- |
| `admin`     | Global admin — sees all sites, all actions           |
| `therapist` | Site user — sees own site patients, clinical actions |
| `engineer`  | Site user — device and technical actions             |

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

| Current state      | Action                                                                                                | Field set                                                       | Next state         |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| unassigned         | Assign group + Record A0                                                                              | `group`, `a0CompletionDate`                                     | inactive           |
| unassigned         | Pre-Discontinue                                                                                       | `discontinuationDate`                                           | pre_discontinued   |
| inactive           | Activate                                                                                              | `activationDate`                                                | active             |
| inactive           | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |
| inactive           | _(today > a0 + 5 days)_                                                                               | _(none — derived)_                                              | broken_protocol    |
| broken_protocol    | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |
| active             | Complete `training_completion_d29` event                                                              | `trainingCompletionDate`                                        | training_completed |
| active             | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |
| active             | Robot issue visit — device swapped with no replacement available                                      | `trainingPausedDate` set                                        | paused             |
| active             | Adverse event — `training_blocked` checked                                                            | `trainingPausedDate` set                                        | paused             |
| paused             | All pause causes resolved (`can_resume_from` set on all; no `resolve_robot_issue_visit` stubs remain) | `trainingPausedDate` cleared; `cumulativePauseDays` incremented | active             |
| paused             | All pause causes resolved (`cumulativePauseDays` > 10)                                                | `cumulativePauseDays` incremented                               | broken_protocol    |
| paused             | Complete `training_completion_d29` event                                                              | `trainingCompletionDate`                                        | training_completed |
| paused             | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |
| training_completed | Record A1                                                                                             | `a1CompletionDate`                                              | a1_completed       |
| training_completed | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |
| a1_completed       | Record A2                                                                                             | `a2CompletionDate`                                              | all_completed      |
| a1_completed       | Discontinue                                                                                           | `discontinuationDate`                                           | discontinued       |

**Actions:** [Add Patient](#add-patient), [Assign Group](#assign-group), [Pre-Discontinue](#pre-discontinue)

---

### `GET /patients/<homer_id>`

Patient detail. Shown for patients `inactive` and beyond (including `broken_protocol`, `paused`). Not shown for `pre_discontinued` or `discontinued`.

#### Page elements

- Back button → `/patients`
- Page title: Homer ID + status badge

- **Tab bar** (JS-driven switching):

  | Tab            | Shown for         |
  | -------------- | ----------------- |
  | Overview       | All               |
  | Devices        | Experimental only |
  | VCG            | Control only      |
  | ADL            | All               |
  | Call Logs      | All               |
  | Adverse Events | All               |
  | Watch Records  | All               |
  | Robot Issues   | Experimental only |
  | Timeline       | All               |

- **Overview tab** (default): 0. **Pause alert banner** — shown only when `status === 'paused'`. Full-width amber strip (red when ≥ 8 days total) injected above the Patient Info / Key Dates grid. Contains:
  - "Training Paused" heading with pause icon
  - "Paused since: \<date\>" and "Days paused so far: X / 10"
  - A **segmented progress bar** over 10 days: one colour slice per closed past epoch (from `pauseHistory` closed entries) plus a distinct colour for the current open epoch. Each slice width = its `days` / 10. Turns red at ≥ 8 days total.
  - Reason pills: "Robot issue pending" (if any `resolve_robot_issue_visit` stubs exist in `incomplete`) and/or "Adverse event pending" (if any `adverse_event_followup` stubs exist in `incomplete`)
  - The "days paused so far" is `cumulativePauseDays` (closed epochs) + `(today − trainingPausedDate).days` (current open epoch). Banner is hidden for all other statuses.
    0b. **Pause history card** — rendered as a `col-span-5` card inside the Patient Info / Key Dates grid, appearing as a second row spanning the full width. Hidden when `pauseHistory` is empty; shown as soon as any pause epoch exists. Shows a compact table of all pause epochs from `pauseHistory`:
  - Columns: Epoch # | Start date | End date | Days | Reasons
  - The current open epoch shows "Ongoing" for End and "—" for Days.
  1. **Patient Info card** — Homer ID, Hospital ID, Group, Training Side, Status, Enrolment Date, Pluto ID _(experimental group)_, Mars ID _(experimental group)_, AG Watch Right ID _(both groups)_, AG Watch Left ID _(both groups)_,
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
  - _Left column_ (right-aligned): event name (bold), scheduled date (`start – end` for windowed, single date if `start == end`, `—` if `null`; omitted for synthetic events), **Day N** relative to `activationDate` (negative for events before activation; omitted if patient not yet activated), **transition badge** (bottom-left, see below).
  - _Centre column_: circle marker + connecting vertical line.
  - _Right column_: completion datetime, filed-at timestamp, then extra event-specific fields in order: Pluto Device, Mars Device, Demo Done, Right Watch, Left Watch, Prescription File, any additional fields, **Notes always last**. Empty/false fields are omitted.

  **Transition badges** — a small pill shown at the bottom-left of the left column whenever that event caused a patient state transition. Derived client-side by `_deriveTransitions(patient, events)` — never stored. At most one badge per event.

  | Badge            | Colour | Condition                                                         |
  | ---------------- | ------ | ----------------------------------------------------------------- |
  | Training paused  | amber  | Event `id` appears in any `pauseHistory[*].reasons[*].event_id`   |
  | Training resumed | green  | Event `id` matches a closed `pauseHistory[*].end_event_id`        |
  | Protocol broken  | red    | Event `completion_date` (date only) matches `brokenProtocolDate`  |
  | Discontinued     | slate  | Event `completion_date` (date only) matches `discontinuationDate` |

  `_deriveTransitions(patient, events)` returns a `Map<event_id, badge>` built once when the timeline renders. Synthetic events (Enrolled, A0) never carry badges.

  Data from the `complete` array in `GET /api/patients/<homer_id>/events` (all fields except `id` are returned).

- **ADL tab** — shows the ADL prescription history for the patient. Each prescription is a card with a coloured header (day 01 = blue-400, day 15 = blue-600). Each exercise row shows: numbered circle badge · exercise name · blocks × reps (right-aligned). If the corresponding AG watch timing event is complete, the recorded `HH:MM:SS → HH:MM:SS` window appears below blocks × reps in the same row. Data is fetched in parallel via:
  - `GET /api/patients/<homer_id>/prescription/adl_prescription_d01` (or `d15`)
  - `GET /api/patients/<homer_id>/agwatch-timing/adl_agwatch_timing_d03` (or `d15`)
  - If `prescription_printout_d01` (or `d15`) is complete, a **Download PDF** link appears in the card header.

- **VCG tab** _(control patients only)_ — same layout as ADL tab, using teal headers (day 01 = teal-400, day 15 = teal-600). Data fetched via:
  - `GET /api/patients/<homer_id>/prescription/vcg_prescription_d01` (or `d15`)
  - `GET /api/patients/<homer_id>/agwatch-timing/vcg_agwatch_timing_d03` (or `d15`)

- **Adverse Events tab** — `admin` and `therapist` only (engineers cannot see this tab). Shows one collapsible card per adverse event, assembled client-side from the events API.
  - **Alias:** each AE is assigned a stable alias `AE01`, `AE02`, … in chronological order (oldest = AE01). The alias never changes even as new AEs are filed.
  - **Display order:** newest first (most recently reported at the top).
  - **Card header** (always visible, click to expand/collapse):
    - Left: alias (`AE01`) + status badge
    - Right: chevron (rotates on open)
    - Status badge variants: red pill "Ongoing — Training blocked" (`training_blocked: true`, unresolved); amber pill "Ongoing" (unresolved, no block); green pill "Resolved"
  - **Meta row** (always visible, below header): `Reported: <date> | Resolved: <date> | Duration: N days | Day X`
    - Resolved date and Duration shown only when resolved. When ongoing, Duration shows "N days ongoing" (elapsed since report date). Day X from activation.
  - **Expanded body:**
    - Description and action taken
    - Triggered-by event (type + date)
    - Attachment download link (if present)
    - **Follow-up history** section: chronological list of all `adverse_event_followup`, `adverse_event_followup_visit`, and `adverse_event_clinical_visit` entries whose `ae_discussions` contains this AE's ID. Each row shows: event type, date, event notes, per-AE discussion notes, resolved/unresolved status, `can_resume_from` (if resolved and set), attachment link (if present).
  - **Color theme per card:** red border/header (training blocked + unresolved), amber border/header (unresolved, no block), green border/header (resolved).
  - Assembly: data fetched from `GET /api/patients/<homer_id>/events` (which returns all `free` arrays); assembled per-AE by filtering on `adverse_event_id` across follow-up event types — no separate endpoint required.

- **Stub tabs** — Devices, Call Logs, Watch Records, Robot Issues show "Coming soon"

**Actions:** [Device Setup](#device-setup-exp_device_install), [Activate](#activate), [ADL Prescription](#adl-prescription-adl_prescription_d01), [VCG Prescription](#vcg-prescription-vcg_prescription_d01), [Prescription Printout](#prescription-printout-prescription_printout_d01), [ADL Prescription Revision](#adl-prescription-revision-adl_prescription_d15), [VCG Prescription Revision](#vcg-prescription-revision-vcg_prescription_d15), [Home Visit](#home-visit), [Follow-up Call](#follow-up-call-followup_call_d07-followup_call_d21), [Patient Call](#patient-call), [Watch Record](#watch-record-watch_record), [Training Completion](#training-completion-visit-training_completion_d29), [File Adverse Event](#file-adverse-event-adverse_event), [Adverse Event Follow-up Call](#adverse-event-follow-up-call-adverse_event_followup), [Adverse Event Follow-up Visit](#adverse-event-follow-up-visit-adverse_event_followup_visit), [Adverse Event Clinical Visit](#adverse-event-clinical-visit-adverse_event_clinical_visit), [Record A1](#record-a1-assessment), [Record A2](#record-a2-assessment), [Discontinue](#discontinue)

---

### `GET /devices`

Device Management page. Shows all devices for the current site grouped by type. All users can view; admins can add devices, toggle clinic status, and link SIMs; engineers/admins can report and resolve issues.

#### Page elements

- **Location badge** — current site name in the page header.
- **SIM expiry banner** — amber alert strip shown when any SIM has `daysUntilExpiry ≤ 5`.
- Six device sections rendered as cards:

| Section           | Device type | Notes                                          |
| ----------------- | ----------- | ---------------------------------------------- |
| Pluto Devices     | `pluto`     | Robot devices; experimental patients only      |
| Mars Devices      | `mars`      | Robot devices; experimental patients only      |
| Actigraph Watches | `agwatch`   | Split into Right Watch / Left Watch sub-tables |
| Modems            | `modems`    | Shows linked SIM info                          |
| SIM Cards         | `sims`      | Shows expiry badge with countdown              |
| Laptops           | `laptops`   | Assignable to patients                         |

Each device row (Pluto/Mars/Agwatch/Laptops) shows:

- Device ID, Serial, Status badge, Assigned Patient (link to patient detail)
- **Actions column** (admin or engineer): Report Issue / Resolve Issue toggle; clinic toggle (admin only)

Status badges: **Available** (green) · **Assigned** (blue) · **Clinic Only** (slate) · **Issue** (red) · **Lost** (slate, agwatch only)

SIM row columns: Phone number, Network, Linked Modem, Recharge Date, Expiry Status badge.
SIM expiry badge: **Active** (green) · **Expires in Xd** amber (≤5d) · **Expires in Xd** red (≤3d) · **Expired** (red).
When a SIM is expired, a **Recharge** button appears inline in the Expiry Status cell. Clicking it opens the Recharge SIM modal (Recharge Date, Data Plan, Expiry Date auto-computed from plan).

Agwatch section header has **Right Watch** and **Left Watch** add buttons (admin only).

#### Data sources

- `GET /devices/api/inventory` — returns full inventory with assignment info for all device types:
  ```json
  {
    "pluto":   [{ "id", "serial", "clinic_only", "faulty", "assigned_to": {"homerID","hospitalID"}|null }],
    "mars":    [...],
    "agwatch": [{ ..., "has_issue", "lost", "assigned_to": {..., "limb"}|null }],
    "modems":  [{ "id", "serial", "clinic_only", "sim_id", "sim_info": {"id","phoneNumber","network"}|null }],
    "laptops": [{ "id", "serial", "clinic_only", "assigned_to": {...}|null }],
    "sims":    [{ "id", "phoneNumber", "network", "rechargeDate", "expiryDate", "daysUntilExpiry", "isExpired", "modem_id" }]
  }
  ```

#### Actions

- **Add Device** (Pluto/Mars) — admin only. Modal: device type selector, ID, serial. `POST /devices/api/add`
- **Add Watch** — admin only. Separate "Right Watch" / "Left Watch" buttons. Modal: ID, serial, limb pre-filled (read-only). `POST /devices/api/add` with `device_type: agwatch`.
- **Add Modem** — admin only. Modal: ID, serial. SIM is linked post-creation via Link SIM. `POST /devices/api/add` with `device_type: modem`.
- **Add SIM** — admin only. Modal: phone number, network, recharge date, expiry date, reminder days. `POST /devices/api/add` with `device_type: sim`.
- **Add Laptop** — admin only. Modal: ID, serial. `POST /devices/api/add` with `device_type: laptop`.
- **Link SIM** — admin only. Per-modem button. Dropdown of available SIMs (unlinked or currently linked). `POST /devices/api/link-sim`.
- **Toggle Clinic** — admin only. Switches `clinic_only` between true/false. Clinic-only devices do not appear in patient assignment dropdowns. `POST /devices/api/toggle-clinic`.
- **Report Issue / Resolve Issue** — admin or engineer. Sets/clears `faulty` (Pluto/Mars) or `has_issue` (Agwatch). Devices with active issues excluded from `get_available_devices()`. `POST /devices/api/toggle-issue`.

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
  - **Triggered events section** — user can optionally flag an adverse event, robot issue (exp only), and/or watch record as a consequence of this visit. Each toggle shows an info note only — no sub-form fields. Watch Record toggle only shown if at least one watch is currently assigned.
- Server actions:
  - Verify `depends_on` prerequisites are met (server-side safety check — the UI already blocks the action, but the endpoint rejects the request if any prerequisite event is not in `complete`)
  - Update `<homer_id>.json` with `activationDate` and `vcgGroup` (control patients only)
  - Compute and fill `scheduled_date` for all `reference: "activation"` entries in `protocol_events.json`
  - Seed first `watch_record` entry in `incomplete` with `scheduled_date = [activationDate, activationDate]` and `triggered_by = {type: "activation", id: <activation_entry_id>}`
  - For triggered `adverse_event`: append a stub to `incomplete` with `protocol_event_id = "adverse_event"`, `scheduled_date = [now, now]`, `triggered_by: {type: "activation", id: <activation_entry_id>}` — stub is completed later via the standalone modal
  - For triggered robot issue: append a `robot_issue_call` stub to `incomplete` with `triggered_by: {type: "activation", id: <activation_entry_id>}`, `scheduled_date: [now, now]` — no intermediate `robot_issue` event
  - For triggered `watch_record`: stamp `triggered_by` and update `scheduled_date = [now, now]` on the open `watch_record` chain entry
- Log message: `Patient activated`
- UI behaviour: if prerequisites are unmet, the event row is rendered as a non-clickable `<div>` (no `href`) with a muted lock icon next to the event name and an amber badge on the right reading "Needs: \<blocking event name\>" in place of the date/urgency label

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
    - _Editing state_ (entered when first added, or when Edit is pressed): exercise name + × (remove) button; Blocks field (number, required); Repetitions field (number, required); Notes field (textarea, optional); **Save** button — commits values and collapses to compact view
    - _Compact state_ (entered after Save is pressed): exercise name · `<blocks> blocks × <reps> reps`; **Edit** button (re-expands to editing state pre-filled with saved values); × button (removes exercise)
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
- Modal: `home-visit-modal` (dedicated; not shared)
  - Title: event name (e.g. "Home Visit Day 02")
  - Event Date (datetime, required; cannot be in the future)
  - Notes (textarea, optional)
  - **Triggered events section** — user can optionally flag an adverse event, robot issue (exp only), and/or watch record as a consequence of this visit. Each toggle shows an info note only — no sub-form fields. Watch Record toggle only shown if at least one watch is currently assigned.
- Server actions:
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `notes`, `triggered: [...]`
  - For triggered `adverse_event`: append a stub to `incomplete` with `protocol_event_id = "adverse_event"`, `scheduled_date = [now, now]`, `triggered_by: {type: "<home_visit_event_id>", id: <entry_id>}` — stub is completed later via the standalone modal
  - For triggered robot issue: append a `robot_issue_call` stub to `incomplete` with `triggered_by: {type: "<home_visit_event_id>", id: <entry_id>}`, `scheduled_date: [now, now]` — no intermediate `robot_issue` event
  - For triggered `watch_record`: stamp `triggered_by` and update `scheduled_date = [now, now]` on the open `watch_record` chain entry
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
  - **Triggered events section** — user can optionally flag an adverse event, robot issue (exp only), and/or watch record as a consequence of this call. Each toggle shows an info note only — no sub-form fields. Watch Record toggle only shown if at least one watch is currently assigned.
- Server actions:
  - Save uploaded PDF to `attachments/followup_call_d07.pdf` (or `d21`) in the patient folder, overwriting if exists
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `duration_minutes`, `attachment`, `notes`, `triggered: [...]`; if date differs from scheduled, also adds `date_change_reason`
  - For triggered `adverse_event`: append a stub to `incomplete` with `protocol_event_id = "adverse_event"`, `scheduled_date = [now, now]`, `triggered_by: {type: "<followup_call_event_id>", id: <entry_id>}` — stub is completed later via the standalone modal
  - For triggered robot issue: append a `robot_issue_call` stub to `incomplete` with `triggered_by: {type: "<followup_call_event_id>", id: <entry_id>}`, `scheduled_date: [now, now]` — no intermediate `robot_issue` event
  - For triggered `watch_record`: stamp `triggered_by` and update `scheduled_date = [now, now]` on the open `watch_record` chain entry
- Log message: `Follow-up call recorded — Day <N>`

---

### Patient Call

- Trigger: "Log Patient Call" button in the tab bar on patient detail (active patients)
- Allowed users: `admin`, `therapist`
- Modal: `patient-call-modal`
  - Title: "Log Patient Call"
  - Call Date/Time (datetime, required; cannot be in the future)
  - Duration (integer minutes, required; must be > 0)
  - Notes (textarea, required)
  - **Therapist initiated** (toggle, default off) — indicates an unplanned outbound call by the therapist (e.g. following up after an adverse event). Protocol follow-up calls (D7/D21) are not recorded here. When toggled on, a **Reason** field (textarea, required) appears to document why the call was made outside the normal protocol.
  - **Adverse event(s) discussed** (checkbox, default unchecked) — indicates that one or more ongoing adverse events were discussed during this call. Stored as `ae_discussed: true/false`. Used on the Adverse Events tab to show that a patient call touched an AE, and allows follow-up calls to reference this patient call as the initiating contact when `patient_initiated: true`.
  - **Triggered events section** — optional; user selects which downstream events arose from this call:
    - **Adverse Event** (toggle, both groups): if enabled, shows an info note only — no sub-form fields
    - **Robot Issue** (toggle, experimental only — hidden for control patients): if enabled, shows an info note only — no sub-form fields
    - **Watch Record** (toggle, both groups): only shown if at least one watch is currently assigned (`agWatchRightID` or `agWatchLeftID` is not null); if enabled, shows an info note — no sub-form fields
  - Multiple toggles may be enabled simultaneously
  - Attachment (optional PDF)
- Server actions:
  - Append `patient_call` entry to `free.patient_call` in `protocol_events.json`, with `call_type`, `reason` (if therapist initiated), `ae_discussed`, `triggered: [...]`
  - For each enabled toggle:
    - **Adverse event**: append a stub to `incomplete` with `protocol_event_id = "adverse_event"`, `scheduled_date = [now, now]`, `triggered_by: {type: "patient_call", id: <call_id>}` — stub is completed later via the standalone `adverse-event-modal`
    - **Robot issue** (exp only): append a `robot_issue_call` stub to `incomplete` with `triggered_by: {type: "patient_call", id: <call_id>}`, `scheduled_date: [now, now]` — no intermediate `robot_issue` event
    - **Watch record**: stamp `triggered_by: {type: "patient_call", id: <call_id>}` onto the existing open `watch_record` entry in `incomplete`, and update its `scheduled_date` to `[now, now]` — no new entry is created; the entry immediately becomes overdue; the therapist completes it via the Watch Record modal
- Log message: `Patient call recorded`; additional log entries for each triggered event (e.g. `Adverse event stub created`, `Robot issue stub created`, `Watch record triggered`)

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

- Trigger: `training_completion_d29` event row on patient detail (`active` or `paused` patients, day 29)
- Allowed users: `admin`, `therapist`
- Modal: `simple-event-modal` (shared)
  - Title: "Training Completion Day 29"
  - Event Date (datetime, required; cannot be in the future)
  - Notes (textarea, optional)
- Server actions:
  - Move entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `notes`
  - Update `<homer_id>.json` with `trainingCompletionDate = completion_date`
  - If patient was `paused`, also clear `trainingPausedDate` and increment `cumulativePauseDays`
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
  - Append to `devices/logs/pluto/<pluto_id>.log` and `devices/logs/mars/<mars_id>.log`
- Log message: `Device setup completed — Pluto: <pluto_id>, Mars: <mars_id>`

---

### File Adverse Event (`adverse_event`)

- Trigger: `adverse_event` event row on patient detail — only appears when a stub exists in `incomplete` (created by a triggering event: activation, home visit, follow-up call, or patient call)
- Allowed users: `admin`, `therapist`
- Modal: `adverse-event-modal`
  - Title: "File Adverse Event"
  - **Context banner** (read-only): "Triggered by: \<triggering event name\>" — derived from the stub's `triggered_by.type`
  - Event Date (datetime, required; cannot be in the future)
  - Description (textarea, required)
  - Action taken (textarea, required)
  - Training blocked as a result (checkbox) — when checked, `trainingPausedDate` is set and the patient transitions to `paused`
  - **Schedule follow-up visit** (optional toggle): when enabled, shows a target date/time input (required when toggle is on; cannot be in the past)
  - **Schedule clinical visit** (optional toggle): when enabled, shows a target date/time input (required when toggle is on; cannot be in the past)
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete` in `protocol_events.json`
  - Append completed entry to `free.adverse_event` with `completion_date`, `filed_at`, `description`, `action_taken`, `training_blocked`, `triggered_by` (carried from stub), `scheduled_followup_visit`, `scheduled_clinical_visit` (both `null` if not scheduled), `attachment` (if uploaded)
  - If `training_blocked` is checked: set `trainingPausedDate` on `<homer_id>.json`; append pause epoch to `pauseHistory`
  - If follow-up visit scheduled: create `adverse_event_followup_visit` stub in `incomplete` with `scheduled_date: [target, target]`, `adverse_event_ids: [<this_ae_id>]`, `triggered_by: {type: "adverse_event", id: <this_ae_id>}`; store `stub_id` in `scheduled_followup_visit`
  - If clinical visit scheduled: same for `adverse_event_clinical_visit`
  - **Always** (regardless of `training_blocked`): if an `adverse_event_followup` stub already exists in `incomplete`, add this event's ID to its `adverse_event_ids` list. If no stub exists, seed a new one with `adverse_event_ids: [<this_event_id>]`, `scheduled_date: [today, today + 1 day]`
- Log message: `Adverse event filed`; if training blocked: also `Training paused — adverse event`; if visits scheduled: `Adverse event follow-up visit scheduled` / `Adverse event clinical visit scheduled`

---

### Robot Issue — Engineer Call (`robot_issue_call`)

- Trigger: `robot_issue_call` event row on patient detail — only appears when a stub exists in `incomplete`. Stubs are created directly by triggering modals (activation, home visit, patient call, follow-up call) when the "robot issue" toggle is checked. There is no intermediate `robot_issue` event.
- Allowed users: `admin`, `engineer`
- Experimental patients only
- Modal: `robot-issue-call-modal`
  - **Context banner** (read-only): "Robot issue reported during \<triggering event name\> on \<date\>"
  - Call Date/Time (datetime, required; cannot be in the future)
  - **Per device** (Pluto and Mars, each with a checkbox):
    - If checked, reveals inline sub-form:
      - **Outcome** (radio, required): Resolved by call / Visit required
      - **Notes** (textarea, required) — what was discussed for this device
  - **Overall notes** (textarea) — required if neither device checkbox is checked; optional otherwise
  - Attachment (optional PDF)
- **Visit required** is derived: if any checked device has outcome = `visit_required`, a `robot_issue_visit` stub is created. If no device is checked (general call), visit is never required.
- Server actions:
  - Remove the stub from `incomplete`
  - Append completed entry to `free.robot_issue_call` with `completion_date`, `filed_at`, `notes`, `devices` (per checked device: `device`, `outcome`, `notes`), `visit_required` (derived), `triggered_by`, `attachment`
  - If `visit_required`: create one `robot_issue_visit` stub in `incomplete` with `triggered_by: {type: "robot_issue_call", id: <event_id>}`, `scheduled_date: [now, now]`
- Log message: `Robot issue call recorded`; if visit required: also `Robot issue visit required`

---

### Robot Issue — Engineer Visit (`robot_issue_visit`)

- Trigger: `robot_issue_visit` event row on patient detail — only appears when a stub exists in `incomplete` (created when a robot issue call outcome is "visit required")
- Allowed users: `admin`, `engineer`
- Experimental patients only
- Modal: `robot-issue-visit-modal`
  - **Context banner** (read-only): "Robot issue call on \<date\>"
  - Visit Date/Time (datetime, required; cannot be in the future)
  - **Per device — both Pluto and Mars always shown.** The engineer must record an outcome for every device. If nothing was done for a device, select **Neither** and explain in notes.
    - Device name and current device ID (read-only labels)
    - **Outcome** (radio, required):
      - **Repaired on site** — device fixed during the visit; stays assigned; no inventory change:
        - Notes (textarea, required) — what was done
      - **Swapped** — device replaced on site:
        - New device (dropdown): available working devices + null ("No device available")
        - **Swap type** (radio, required): **Fault-driven** (device suspected/confirmed faulty) / **Preventive** (precautionary replacement, not necessarily faulty)
        - Notes (textarea, required)
      - **Neither (no action taken)** — nothing done for this device (not relevant to visit, or usage guidance only):
        - Notes (textarea, required) — explain why no action was taken
  - Additional notes (textarea, optional)
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete`
  - For each device:
    - If **Repaired on site**: no assignment change, device not marked faulty; no fault report created (detail deferred to Devices page)
    - If **Swapped + fault-driven + new device selected**: close current assignment; mark old device faulty in inventory; open new assignment; create a pending fault report stub in `devices/fault_reports/<type>.json` (`resolution: null`, `swap_type: "fault_driven"`)
    - If **Swapped + fault-driven + null** (no replacement): close current assignment; mark old device faulty; no new assignment; set `trainingPausedDate`; create `resolve_robot_issue_visit` stub; create pending fault report stub
    - If **Swapped + preventive**: close current assignment; open new assignment if non-null; device NOT marked faulty; no fault report
    - If **Swapped + preventive + null**: close current assignment; no new assignment; set `trainingPausedDate`; create `resolve_robot_issue_visit` stub; device NOT marked faulty; no fault report
    - If **Neither**: no device change, no pause, no fault report
  - Append completed entry to `free.robot_issue_visit` with `completion_date`, `filed_at`, `device_outcomes` (per device: `device`, `outcome`, `swap_type`, `old_device_id`, `new_device_id`, `notes`), `notes`, `triggered_by`, `attachment`
- Log message: `Robot issue visit recorded`; if any device taken back with no replacement: also `Training paused — robot issue`

---

### Adverse Event Follow-up Call (`adverse_event_followup`)

- Trigger: `adverse_event_followup` event row on patient detail — only appears when a stub exists in `incomplete`
- Allowed users: `admin`, `therapist`
- Modal: `adverse-event-followup-modal`
  - **Context banner** (read-only): lists all adverse events covered by this follow-up (names + dates), derived from `adverse_event_ids`
  - **Patient initiated** (toggle, default off) — indicates that the patient contacted the clinic first (rather than the therapist initiating the call). When on, a **Related patient call** selector appears (required when toggle is on): dropdown of all `patient_call` entries for this patient where `ae_discussed: true`, shown as "DD Mon YYYY · HH:MM". Selecting one stores `related_patient_call_id`. The therapist should first log the patient call via the Patient Call modal, then open this follow-up.
  - Call Date/Time (datetime, required; cannot be in the future)
  - Duration (integer minutes, required; must be > 0)
  - Notes (textarea, optional) — general call-level notes
  - **Per adverse event** — one section per AE in `adverse_event_ids`:
    - AE name/date (read-only label)
    - **Discussion notes** (textarea, optional) — what was discussed about this AE during the call
    - **Resolved** (checkbox)
    - **Can resume from** (date, required if resolved AND that AE had `training_blocked: true`; hidden otherwise) — the earliest date training is possible again from this AE's perspective
  - **Schedule follow-up visit** (optional toggle): when enabled, shows a target date/time input (required when toggle is on; cannot be in the past). If an `adverse_event_followup_visit` stub already exists that covers all current `adverse_event_ids`, this toggle is hidden (stub already scheduled)
  - **Schedule clinical visit** (optional toggle): when enabled, shows a target date/time input (required when toggle is on; cannot be in the past). Same hide-if-exists logic as above.
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete` in `protocol_events.json`
  - Append completed entry to `free.adverse_event_followup` with `completion_date`, `filed_at`, `patient_initiated`, `related_patient_call_id` (if patient-initiated), `duration_minutes`, `notes`, `ae_discussions` (per-AE: `ae_id`, `notes`, `resolved`, `can_resume_from`), `scheduled_followup_visit`, `scheduled_clinical_visit` (both `null` if not scheduled), `triggered_by` (from stub), `attachment` (if uploaded)
  - If follow-up visit scheduled: create `adverse_event_followup_visit` stub in `incomplete` with `scheduled_date: [target, target]`, `adverse_event_ids: [<all AE IDs in this call>]`, `triggered_by: {type: "adverse_event_followup", id: <this_event_id>}`
  - If clinical visit scheduled: same for `adverse_event_clinical_visit`
  - If any AEs remain unresolved: seed next `adverse_event_followup` stub with `adverse_event_ids` = unresolved AE IDs, `scheduled_date: [today, today + 1 day]`
  - If all AEs resolved and no `resolve_robot_issue_visit` stubs remain in `incomplete`: increment `cumulativePauseDays` by `(max(can_resume_from across all pausing AEs) − trainingPausedDate.date()).days` (minimum 0); clear `trainingPausedDate`; if `cumulativePauseDays` > 10, patient transitions to `broken_protocol`
  - If all AEs resolved but `resolve_robot_issue_visit` stubs still remain: no change to pause fields (robot issue still blocking)
- Log message: `Adverse event follow-up call recorded`; if visits scheduled: `AE follow-up visit scheduled` / `AE clinical visit scheduled`; if all resolved: also `Adverse event(s) resolved`

---

### Resolve Robot Issue — Replacement Visit (`resolve_robot_issue_visit`)

- Trigger: `resolve_robot_issue_visit` event row on patient detail — only appears when a stub exists in `incomplete` (created when a robot issue visit swaps a device with no replacement available)
- Allowed users: `admin`, `engineer`
- Experimental patients only
- Modal: `resolve-robot-issue-visit-modal`
  - **Context banner** (read-only): "Robot issue visit on \<date\> — device(s) taken back without replacement"
  - Visit Date/Time (datetime, required; cannot be in the future)
  - **Per taken-back device** (one row per device that was taken back without replacement — always required):
    - Device name + "taken back — no current assignment" (read-only label)
    - New device (dropdown): available working devices + null ("No device available")
    - Notes (textarea, required if null selected — explain why no replacement available)
    - If null selected: another `resolve_robot_issue_visit` stub is created on save
  - **Other device** (the device that was NOT taken back — optional section):
    - Checkbox: "Also attended to \<device name\> during this visit"
    - If checked, reveals full outcome sub-form identical to `robot_issue_visit`:
      - Current device ID (read-only)
      - **Outcome** (radio, required): Repaired on site / Swapped / Neither (no action taken)
        - Repaired: Notes (required)
        - Swapped: New device dropdown + **Swap type** (Fault-driven / Preventive) + Notes (required)
        - Neither: Notes (required)
  - **Can resume from** (date, required; cannot be in the future) — earliest date training is possible again
  - Additional notes (textarea, optional)
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete`
  - For each taken-back device:
    - If new device selected: open new assignment; if `swap_type` was fault-driven on the original `robot_issue_visit`, update existing fault report stub with replacement info
    - If null again: create another `resolve_robot_issue_visit` stub
  - For the other device (if attended to): same per-device logic as `robot_issue_visit` server actions
  - Append completed entry to `free.resolve_robot_issue_visit` with `completion_date`, `filed_at`, `can_resume_from`, `device_replacements` (per taken-back device: `device`, `old_device_id`, `new_device_id`, `notes`), `other_device_outcomes` (per attended other device: same fields as `robot_issue_visit` `device_outcomes`), `notes`, `attachment`
  - If no `resolve_robot_issue_visit` stubs remain in `incomplete` AND no `adverse_event_followup` stubs remain: compute `cumulativePauseDays`; clear `trainingPausedDate`; if total > 10, patient transitions to `broken_protocol`
  - If `adverse_event_followup` stubs remain: no change to pause fields
- Log message: `Robot issue resolved — replacement device assigned`

---

### Adverse Event Follow-up Visit (`adverse_event_followup_visit`)

- Trigger: `adverse_event_followup_visit` event row on patient detail — only appears when a stub exists in `incomplete`. Stubs are created by the Adverse Event Follow-up Call modal (or directly from the File Adverse Event modal) when a follow-up visit is scheduled.
- Allowed users: `admin`, `therapist`
- Cancellable: yes — a **Cancel Visit** button is shown in the modal footer. Clicking it prompts for a cancellation reason (textarea, required). Cancellation moves the stub to the top-level `cancelled` array in `protocol_events.json` with `cancelled_at` timestamp and `cancellation_reason`. No further stubs are created.
- Modal: `adverse-event-followup-visit-modal`
  - **Context banner** (read-only): lists all adverse events covered by this visit (names + dates), derived from `adverse_event_ids`
  - Visit start (datetime, required; cannot be in the future)
  - Visit end (datetime, required; must be same calendar date as start; must be after start)
  - **Per adverse event** — one section per AE in `adverse_event_ids`:
    - AE name/date (read-only label)
    - **Discussion notes** (textarea, optional) — what was discussed / observed during this visit for this AE
    - **Resolved** (checkbox)
    - **Can resume from** (date, required if resolved AND that AE had `training_blocked: true`; hidden otherwise)
  - Visit-level notes (textarea, optional)
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete`
  - Append completed entry to `free.adverse_event_followup_visit` with `completion_date` (= visit start), `filed_at`, `visit_start`, `visit_end`, `ae_discussions` (per-AE: `ae_id`, `notes`, `resolved`, `can_resume_from`), `notes`, `triggered_by` (from stub), `attachment` (if uploaded)
  - If any AEs remain unresolved: seed next `adverse_event_followup` stub with `adverse_event_ids` = unresolved AE IDs, `scheduled_date: [today, today + 1 day]` (back to call-based follow-up)
  - If all AEs resolved and no `resolve_robot_issue_visit` stubs remain in `incomplete`: clear pause (same logic as follow-up call)
- Log message: `Adverse event follow-up visit recorded`; if all resolved: also `Adverse event(s) resolved`

---

### Adverse Event Clinical Visit (`adverse_event_clinical_visit`)

- Trigger: `adverse_event_clinical_visit` event row on patient detail — only appears when a stub exists in `incomplete`. Stubs are created by the Adverse Event Follow-up Call modal (or directly from the File Adverse Event modal) when a clinical visit is scheduled.
- Allowed users: `admin`, `therapist`
- Cancellable: yes — same cancellation behaviour as `adverse_event_followup_visit` (reason required, stored as `cancellation_reason`)
- Modal: `adverse-event-clinical-visit-modal`
  - **Context banner** (read-only): lists all adverse events covered by this visit (names + dates)
  - Visit start (datetime, required; cannot be in the future)
  - Visit end (datetime, required; same calendar date; after start)
  - **Per adverse event** — one section per AE in `adverse_event_ids`:
    - AE name/date (read-only label)
    - **Discussion notes** (textarea, optional) — notes from the consultant / therapist discussion about this AE
    - **Resolved** (checkbox)
    - **Can resume from** (date, required if resolved AND that AE had `training_blocked: true`; hidden otherwise)
  - Visit-level notes (textarea, optional)
  - Attachment (optional PDF)
- Server actions:
  - Remove the stub from `incomplete`
  - Append completed entry to `free.adverse_event_clinical_visit` with `completion_date` (= visit start), `filed_at`, `visit_start`, `visit_end`, `ae_discussions` (per-AE: `ae_id`, `notes`, `resolved`, `can_resume_from`), `notes`, `triggered_by` (from stub), `attachment` (if uploaded)
  - If any AEs remain unresolved: seed next `adverse_event_followup` stub (back to call-based chain)
  - If all AEs resolved and no `resolve_robot_issue_visit` stubs remain: clear pause (same logic)
- Log message: `Adverse event clinical visit recorded`; if all resolved: also `Adverse event(s) resolved`

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
  - For each new watch assigned: append a new assignment record to `devices/assignments/agwatch.json`; write device log `Assigned to <homer_id> (<limb>)` to `devices/logs/agwatch/<watch_id>.log`
  - For each lost watch: write device log `Lost — reported by <homer_id>` to `devices/logs/agwatch/<watch_id>.log`
  - Seed next `watch_record` entry in `incomplete` with `scheduled_date = [completion_date + next_followup_days, completion_date + next_followup_days]`
- Log message: `Watch record filed`

---

## Future Requirements

### Device Repair (Devices page — not yet implemented)

**Context:** When a robot issue causes a training pause but the patient completes training (day 29) before the `resolve_robot_issue_visit` stub is filled, the stub is auto-discarded (robot is returned on day 29). However, the device may still be physically faulty — it has not been repaired and cannot be safely assigned to a new patient.

**Required feature:** A **"Repair Device"** action in the Devices page, available to `engineer` and `admin`, that:

- Lists Pluto/Mars devices flagged as faulty (i.e. their last robot issue was not formally resolved before training completion)
- Allows the engineer to record:
  - Repair date
  - Description of repair / action taken
  - Outcome: `repaired` | `condemned` (beyond repair, permanently retired)
- On save: clears the faulty flag on the device inventory record; if `condemned`, marks the device as inactive so it can never be assigned again
- Log message written to the device log

This ensures the device inventory accurately reflects availability for new patient assignments, independent of the patient protocol lifecycle.

### Fault Report Classification (Devices page — not yet implemented)

**Context:** When a device is swapped with `swap_type: "fault_driven"` in `robot_issue_visit` or `resolve_robot_issue_visit`, a pending fault report stub is created in `devices/fault_reports/<type>.json` with `resolution: null`. The engineer needs to complete this report when they have had time to diagnose the fault.

**Required feature:** A **"Complete Fault Report"** action in the Devices page, available to `engineer` and `admin`, that:

- Lists all pending fault report stubs (where `resolution: null`)
- For each stub, allows the engineer to record:
  - Fault description — what was wrong with the device
  - Action taken — what was done (repaired, parts replaced, etc.)
  - Outcome: `repaired` | `condemned` (beyond repair)
- On save: fills `resolution` on the stub; if `condemned`, marks the device as permanently inactive
- Log message written to the device log

**Note:** Swaps with `swap_type: "preventive"` do not create fault report stubs — the device is not considered faulty and can be reassigned immediately.

### Adverse Event Amendment (Future)

**Context:** Once an adverse event is filed, the description and action taken are locked. There is currently no way to correct a clerical error.

**Required feature:** An **"Amend"** action on each AE card in the Adverse Events tab, available to `admin` only, that:

- Opens a small modal with editable description and action taken fields pre-filled
- Requires an amendment reason (textarea, required)
- On save: updates the record in `free.adverse_event` and appends an `amendments` list entry recording the original values, the reason, and the amendment timestamp
- Log message: `Adverse event amended — <ae_id>`

### Clinical Notes Tab (Future)

**Context:** The current Adverse Events tab assembles a per-AE history for monitoring purposes. As the study grows, therapists have requested a dedicated free-form notes area per patient — not tied to a specific event.

**Required feature:** A **Clinical Notes** tab on the patient detail page, available to `admin` and `therapist`, with:

- A chronological list of free-text notes, each with author, date, and text
- An "Add Note" button opening a simple modal with a textarea (required)
- Notes stored in `free.clinical_notes` array
- Notes are read-only after filing; amendment via admin only (same amendment pattern as AE)
