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
7. Active (Partial)
8. Training Complete
9. A1 Complete
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
- Filter tabs (in order): All, Unassigned, Inactive, Active, Active (Partial), Paused, Training Complete, A1 Complete, Pre-Discontinued, Broken Protocol, Discontinued, All Complete — each with count. "All" selected by default.
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
| active             | Adverse event / fault — full pause             | `trainingPausedDate` *(ctrl)* or both pause dates *(exp)* | paused             |
| active             | Adverse event / fault — partial pause *(exp)*  | `plutoPauseDate` or `marsPauseDate`                       | active_partial     |
| active_partial     | Remaining device also paused                   | other pause date set                                      | paused             |
| active_partial     | Paused device resumed                          | pause date cleared; counter incremented                   | active             |
| active_partial     | Cumulative device days > max                   | counter incremented                                       | broken_protocol    |
| paused             | Resume training                                | pause date(s) cleared; counter(s) incremented             | active             |
| paused             | Extend pause (≤ max)                           | counter(s) incremented                                    | paused             |
| paused             | Extend pause (> max)                           | counter(s) incremented                                    | broken_protocol    |
| training_completed | Record A1                                      | `a1CompletionDate`                                        | a1_completed       |
| training_completed | Discontinue                                    | `discontinuationDate`                                     | discontinued       |
| a1_completed       | Record A2                                      | `a2CompletionDate`                                        | all_completed      |
| a1_completed       | Discontinue                                    | `discontinuationDate`                                     | discontinued       |

**Actions:** [Add Patient](#add-patient), [Assign Group](#assign-group), [Pre-Discontinue](#pre-discontinue)

---

### `GET /patients/<homer_id>`

Patient detail. Shown for patients `inactive` and beyond (including `broken_protocol`, `paused`, `active_partial`). Not shown for `pre_discontinued` or `discontinued`.

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
  2. **Key Dates card** — A0, Activation, Training Completion, A1, A2, Discontinuation dates. On the right side of the card header: a large bold number showing days elapsed, with a subtitle label:
     - Before activation: **"Day N — since recruitment"** (N = today − `a0CompletionDate`)
     - After activation: **"Day N — since activation"** (N = today − `activationDate`)
     - Calculated client-side in `patient_detail.js`; not shown for terminal states (discontinued, all_completed)
  3. **Events panels** — Overdue (past deadline, red) and Upcoming (future, urgency-coded) protocol events. Fetched from `GET /api/patients/<homer_id>/events`. Clickable if today ≥ event's window start date.

- **Stub tabs** — Devices, ADL, VCG, Timeline, Adverse Events, Call Logs show "Coming soon"

**Actions:** [Activate](#activate), [Complete Training](#complete-training), [Record A1](#record-a1-assessment), [Record A2](#record-a2-assessment), [Discontinue](#discontinue), [Device Setup](#device-setup-exp_device_install)

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
- Trigger: "Activate" event row on patient detail (inactive patients)
- Allowed users: `admin`, `therapist`
- Prerequisites: all events listed in `depends_on` for `activation` in `study_protocol.json` must be in `complete` (e.g. `exp_device_install` for experimental patients)
- Modal fields:
  - Activation Date (datetime, required; cannot be in the future)
- Server actions:
  - Check `depends_on` prerequisites; return error if any are unmet
  - Update `<homer_id>.json` with `activationDate`
  - Compute and fill `scheduled_date` for all `reference: "activation"` entries in `protocol_events.json`
  - Create first `watch_record` entry in `incomplete` with `scheduled_date = activationDate`
- Log message: `Patient activated`
- UI behaviour: if prerequisites are unmet, the event row is rendered as a non-clickable `<div>` (no `href`) with a muted lock icon and a subtitle naming the blocking event(s) (e.g. "Complete device setup first")

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
- Applicable states: `inactive`, `broken_protocol`, `active`, `active_partial`, `paused`, `training_completed`, `a1_completed`
- Modal fields:
  - Reason / Comments (textarea, required)
- Server actions:
  - Update `<homer_id>.json` with `discontinuationDate`
  - Append `discontinuation` record to `protocol_events.json` free section
- Log message: `Patient discontinued`

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
