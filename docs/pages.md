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
7. Training Complete
8. A1 Complete
9. Paused
10. Broken Protocol
11. Discontinued
12. All Complete

Numbers are derived from `homer_id.json` files across all visible patients. Site users see their site only; admin sees all.

Below the stats: **Overdue** and **Upcoming** event panels showing protocol events across all non-terminal patients. Fetched from `GET /api/dashboard/events`.

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
| active             | Adverse event / fault — training paused        | `trainingPausedDate` set                                  | paused             |
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

  | Tab           | Shown for          |
  |---------------|--------------------|
  | Overview      | All                |
  | Devices       | All                |
  | ADL           | All                |
  | VCG           | Control only       |
  | Timeline      | All                |
  | Adverse Events| All                |
  | Call Logs     | All                |

- **Overview tab** (default):
  1. **Patient Info card** — Homer ID, Hospital ID, Group, Training Side, Status, Enrolment Date, Pluto ID *(experimental group)*, Mars ID *(experimental group)*, AG Watch Right ID *(both groups)*, AG Watch Left ID *(both groups)*,
  2. **Key Dates card** — A0, Activation, Training Completion, A1, A2, Discontinuation dates. A separate **Days card** sits alongside showing days elapsed since activation (Day 1 = activation date). Displays `—` until activated. Hidden for terminal states (discontinued, all_completed, pre_discontinued). Calculated client-side in `patient_detail.js`.
  3. **Events panels** — Overdue (past deadline, red) and Upcoming (future, urgency-coded) protocol events. Fetched from `GET /api/patients/<homer_id>/events`. Clickable if today ≥ event's window start date.
     - **Blocked events** (unmet `depends_on`): rendered as a non-clickable `<div>` with an amber badge on the right reading "Needs: \<event name\>" instead of the date/urgency label. A muted lock icon appears next to the event name.

- **Stub tabs** — Devices, ADL, VCG, Timeline, Adverse Events, Call Logs show "Coming soon"


**Actions:** [Device Setup](#device-setup-exp_device_install), [Activate](#activate), [ADL Prescription](#adl-prescription-adl_prescription_d1), [VCG Prescription](#vcg-prescription-vcg_prescription_d1), [Prescription Printout](#prescription-printout-prescription_printout_d1), [ADL Prescription Revision](#adl-prescription-revision-adl_prescription_d15), [VCG Prescription Revision](#vcg-prescription-revision-vcg_prescription_d15), [Home Visit](#home-visit), [Follow-up Call](#follow-up-call), [Training Completion](#training-completion-training_completion_d29), [Complete Training](#complete-training), [Record A1](#record-a1-assessment), [Record A2](#record-a2-assessment), [Discontinue](#discontinue)

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
  - AG Watch Right (dropdown — active, unassigned watch from inventory; required)
  - AG Watch Left (dropdown — active, unassigned watch from inventory; required)
  - **VCG Group** (dropdown: VCG 2 / VCG 3 / VCG 4–5; required; **control patients only**) — therapist selects the patient's VCG level at the activation visit; fixed for the entire study duration
  - Notes (textarea, optional). The notes text area must be large enough for the user to write the their notes comfortably.
- Server actions:
  - Verify `depends_on` prerequisites are met (server-side safety check — the UI already blocks the action, but the endpoint rejects the request if any prerequisite event is not in `complete`)
  - Update `<homer_id>.json` with `activationDate` and `vcgGroup` (control patients only)
  - Compute and fill `scheduled_date` for all `reference: "activation"` entries in `protocol_events.json`
  - Create first `watch_record` entry in `incomplete` with `scheduled_date = activationDate`
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

### ADL Prescription (`adl_prescription_d1`)
- Trigger: `adl_prescription_d1` event row on patient detail (both groups, day 1 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Event Date (datetime, pre-filled with `activationDate`, read-only)
  - **Exercise search bar** — live-filters the ADL exercise list fetched from `GET /api/exercises?type=adl`; clicking a result adds it to the selected list; already-selected exercises are excluded from search results
  - **Selected exercises list** (scrollable if long) — each exercise exists in one of two states:
    - *Editing state* (entered when first added, or when Edit is pressed): exercise name + × (remove) button; Blocks field (number, required); Repetitions field (number, required); Notes field (textarea, optional); **Save** button — commits values and collapses to compact view
    - *Compact state* (entered after Save is pressed): exercise name · `<blocks> blocks × <reps> reps`; **Edit** button (re-expands to editing state pre-filled with saved values); × button (removes exercise)
    - The modal's **Save Prescription** button is **disabled** while any exercise card is in editing state — the therapist must Save or remove all cards before submitting
  - General Notes (textarea, optional)
- Server actions:
  - Write prescription to `adl/adl_prescription_d1.json` in the patient folder
  - Move `adl_prescription_d1` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "adl/adl_prescription_d1.json"`
- Log message: `ADL prescription recorded`

---

### VCG Prescription (`vcg_prescription_d1`)
- Trigger: `vcg_prescription_d1` event row on patient detail (control patients only, day 1 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields:
  - Event Date (datetime, pre-filled with `activationDate`, read-only)
  - **VCG Group** (read-only display — pre-filled from `vcgGroup` in `<homer_id>.json`, set at activation)
  - **Exercise search bar** — live-filters the VCG exercise list fetched from `GET /api/exercises?type=vcg&group=<vcg_group>`; clicking a result adds it to the selected list; already-selected exercises are excluded
  - **Selected exercises list** (scrollable if long) — same two-state card behaviour as [ADL Prescription](#adl-prescription-adl_prescription_d1); **Save Prescription** button disabled while any card is in editing state
  - General Notes (textarea, optional)
- Server actions:
  - Write prescription to `vcg_exercise/vcg_prescription_d1.json` in the patient folder
  - Move `vcg_prescription_d1` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "vcg_exercise/vcg_prescription_d1.json"`
- Log message: `VCG prescription recorded`

---

### Prescription Printout (`prescription_printout_d1`)
- Trigger: `prescription_printout_d1` event row on patient detail (both groups, day 1 after activation)
- Allowed users: `admin`, `therapist`
- `depends_on`: `adl_prescription_d1` (both); `vcg_prescription_d1` (ctrl only)
- Modal fields: TBD
- Server actions: TBD
- Log message: `Prescription printout generated`

---

### ADL Prescription Revision (`adl_prescription_d15`)
- Trigger: `adl_prescription_d15` event row on patient detail (both groups, day 15 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields: same structure as [ADL Prescription](#adl-prescription-adl_prescription_d1), with:
  - Event Date pre-filled with `activationDate + 15 days`, read-only
  - Exercise list and notes pre-populated from `adl/adl_prescription_d1.json` — all cards open in **compact state** (already saved); therapist edits individual cards as needed
- Server actions:
  - Write revised prescription to `adl/adl_prescription_d15.json` in the patient folder
  - Move `adl_prescription_d15` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "adl/adl_prescription_d15.json"`
- Log message: `ADL prescription revised`

---

### VCG Prescription Revision (`vcg_prescription_d15`)
- Trigger: `vcg_prescription_d15` event row on patient detail (control patients only, day 15 after activation)
- Allowed users: `admin`, `therapist`
- Modal fields: same structure as [VCG Prescription](#vcg-prescription-vcg_prescription_d1), with:
  - Event Date pre-filled with `activationDate + 15 days`, read-only
  - VCG Group read-only (from `vcgGroup` in `<homer_id>.json` — fixed for entire study)
  - Exercise list and notes pre-populated from `vcg_exercise/vcg_prescription_d1.json` — all cards open in **compact state**; therapist edits individual cards as needed
- Server actions:
  - Write revised prescription to `vcg_exercise/vcg_prescription_d15.json` in the patient folder
  - Move `vcg_prescription_d15` entry from `incomplete` to `complete` in `protocol_events.json`, adding `completion_date`, `filed_at`, `prescription_file: "vcg_exercise/vcg_prescription_d15.json"`
- Log message: `VCG prescription revised`

---

### Home Visit (`home_visit_d02`, `home_visit_d03`, `home_visit_d15`)
- Trigger: respective event row on patient detail
- Allowed users: `admin`, `therapist`
- Modal fields: TBD
- Server actions: TBD
- Log message: `Home visit recorded — Day <N>`

---

### Follow-up Call (`followup_call_d07`, `followup_call_d21`)
- Trigger: respective event row on patient detail
- Allowed users: `admin`, `therapist`
- Modal fields: TBD
- Server actions: TBD
- Log message: `Follow-up call recorded — Day <N>`

---

### Training Completion Visit (`training_completion_d29`)
- Trigger: `training_completion_d29` event row on patient detail (active patients, day 29)
- Allowed users: `admin`, `therapist`
- Modal fields: TBD
- Server actions: TBD
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
