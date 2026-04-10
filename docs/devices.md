# Device Management — Lifecycle & Rules

This document defines the device state machine, assignment rules, and data model for all device types in htDash.

---

## Device Types

| Type | Inventory File | Assignment File | Notes |
|------|---------------|-----------------|-------|
| Pluto | `inventory/pluto.json` | `assignments/pluto.json` | Therapy robot |
| Mars | `inventory/mars.json` | `assignments/mars.json` | Therapy robot |
| Agwatch | `inventory/agwatch.json` | `assignments/agwatch.json` | Actigraph watch; Left or Right limb |
| Modem | `inventory/modems.json` | `assignments/modems.json` | WiFi modem; linked to a SIM card |
| Laptop | `inventory/laptops.json` | `assignments/laptops.json` | Study laptop |
| SIM | `sims.json` | — | Linked to modem via `sim_id` on modem record |

All files live under `data/<hospital>/devices/`.

---

## Device States

Each device is in **exactly one** of four states at any time. State is derived — never stored directly.

| State | Badge | Conditions |
|-------|-------|-----------|
| **Available** | green | Not assigned, `clinic_only=false`, `faulty/has_issue=false`, `removal_date/lost_date=null` |
| **Assigned** | blue | Active assignment record (`returned_date=null`) exists for this device |
| **Clinic** | gray | `clinic_only=true`, no active assignment |
| **Issue** | red | `faulty=true` (pluto/mars) OR `has_issue=true` (agwatch) — **overrides all other states** |

### Issue Overrides Everything

A device with `faulty=true` or `has_issue=true`:
- Does **not** appear in assignable device lists
- Does **not** appear in clinic selection dropdown
- Cannot be assigned or set to clinic until issue is resolved

---

## Valid State Transitions

```
Available  →  Assigned   Patient assignment (device setup modal in patient flow)
Available  →  Clinic     Admin sets clinic_only=true on an Available device
Assigned   →  Issue      Issue reported (optional: swap to an Available device)
Assigned   →  Available  Device returned manually, or 28-day auto-reset
Clinic     →  Available  Admin clears clinic_only
Issue      →  Available  Issue resolved
```

### Blocked Transitions

| Transition | Blocked? | Reason |
|-----------|---------|--------|
| Issue → Assigned | ❌ | Device not usable while faulty |
| Issue → Clinic | ❌ | Device not usable while faulty |
| Assigned → Clinic | ❌ | Must unassign first (return to Available) |
| Clinic → Assigned | ❌ | Must clear clinic first (return to Available) |

---

## Clinic Logic (Pluto / Mars only)

- Only **one device per type** can be in Clinic state at a time.
- When an admin sets a device to Clinic:
  - Any other device of the same type that is currently `clinic_only=true` is automatically cleared to Available.
  - The target device must be in Available state (not assigned, not faulty).
- Clearing a Clinic device simply sets `clinic_only=false`; no other devices are affected.
- Agwatch, Modem, and Laptop do **not** support clinic_only toggle.

---

## Issue Handling (Pluto / Mars / Agwatch)

### Reporting an Issue

The **Report Issue** section button opens a modal where the admin/engineer:
1. Selects which device has an issue.
2. If the device is currently assigned to a patient, a swap option is shown — showing only Available devices of the same type.
3. On save:
   - Device is marked `faulty=true` (pluto/mars) or `has_issue=true` (agwatch).
   - If a swap device was selected:
     - Old assignment is closed (`returned_date = now`).
     - New assignment is created for the same patient (and limb, for agwatch).
     - A **Device Replacement History** record is written.
   - A device log entry is appended.

### Resolving an Issue

Same modal — selecting a device that already has an issue shows a "Resolve Issue" action. On save:
- `faulty` field is cleared (pluto/mars) or `has_issue` set to `false` (agwatch).
- Device returns to Available state.

---

## Device Replacement History

Stored in `data/<hospital>/devices/device_history.json`.

```json
{
  "history": [
    {
      "id": "uuid",
      "device_type": "pluto",
      "old_device_id": "PLT-001",
      "new_device_id": "PLT-002",
      "patient_id": "HOCMCV002",
      "timestamp": "2026-04-08T12:00",
      "reason": "Device Issue Replacement"
    }
  ]
}
```

A record is created whenever a device is swapped via `POST /devices/api/swap-device`.

---

## 28-Day Auto-Reset (Modems and Laptops)

Modems and laptops are assigned for the study duration (28 days). On every `GET /devices/api/inventory` call:
- All active modem and laptop assignments are checked.
- If `assigned_date` is ≥ 28 days ago, `returned_date` is set to now and the assignment is written back.
- Device returns to Available state automatically.

This avoids a background job — the reset happens lazily on the next page load.

Pluto, Mars, and Agwatch are **not** auto-reset (their lifecycle is managed through the patient flow).

---

## Actigraph Watch (Left / Right)

- Each watch has a `limb_default` field on its inventory record: `"Left"` or `"Right"`.
- Two separate buttons exist in the page header: **Add Left Watch** and **Add Right Watch** — the limb is pre-filled and read-only in the add modal.
- Watches are displayed in two columns (Left / Right) based on `limb_default`.
- When a watch is assigned to a patient, the assignment record also stores `limb`.
- A lost watch is permanently retired (`lost_date` set, excluded from all lists).

---

## SIM → Modem Linkage

- Each modem inventory record has an optional `sim_id` field pointing to a SIM in `sims.json`.
- A SIM can only be linked to **one** modem at a time (enforced server-side).
- When a modem is assigned to a patient, SIM details are shown automatically on the modem row.
- **SIM expiry is only shown when the linked modem has an active patient assignment.** An unassigned modem's SIM expiry is not shown (it's not in active use).

### SIM Expiry Badges

| Condition | Badge |
|-----------|-------|
| No expiry set | — |
| Expired | red "Expired" |
| ≤ 3 days remaining | red "Expires in Xd" |
| ≤ 5 days remaining | amber "Expires in Xd" |
| Active | green with expiry date |

An amber banner appears at the top of the devices page if any active SIM expires within 5 days.

---

## Assignment Rules

A device is **assignable** only if:
- State = Available
- `clinic_only = false`
- `faulty / has_issue = false`
- Not already assigned (`returned_date = null` on any existing record)
- `removal_date = null` and `lost_date = null`

These checks are enforced by `get_available_devices()` in `utils/data_access.py` and by the relevant API endpoints.

---

## Data File Schemas

### Inventory record — Pluto / Mars

```json
{
  "id": "PLT-001",
  "serial": "PLT2024001",
  "clinic_only": false,
  "faulty": false,
  "inclusion_date": "2024-01-15",
  "removal_date": null
}
```

### Inventory record — Agwatch

```json
{
  "id": "AGW-001",
  "serial": "AGW2024001",
  "limb_default": "Right",
  "has_issue": false,
  "lost_date": null,
  "inclusion_date": "2024-01-15",
  "removal_date": null
}
```

### Inventory record — Modem

```json
{
  "id": "MDM-001",
  "serial": "MDM2024001",
  "sim_id": "uuid-or-null",
  "inclusion_date": "2024-01-15",
  "removal_date": null
}
```

### Inventory record — Laptop

```json
{
  "id": "LPT-001",
  "serial": "LPT2024001",
  "inclusion_date": "2024-01-15",
  "removal_date": null
}
```

### Assignment record (all types)

```json
{
  "id": "uuid",
  "device_id": "PLT-001",
  "homer_id": "HOCMCV002",
  "assigned_date": "2026-04-08T09:00",
  "returned_date": null,
  "limb": "Right"
}
```

`limb` is present only on agwatch assignments. `returned_date: null` means the assignment is active.

### SIM record

```json
{
  "id": "uuid",
  "phoneNumber": "9090909090",
  "network": "jio",
  "rechargeDate": "2026-04-07",
  "expiryDate": "2026-05-07",
  "dataPlan": "28",
  "reminderDays": 5,
  "status": "active",
  "notes": "",
  "createdAt": "2026-04-08T12:00:00"
}
```

---

## API Endpoints

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/devices/page` | GET | Required | Render HTML page |
| `/devices/api/inventory` | GET | Required | Full inventory + assignments + SIMs |
| `/devices/api/add` | POST | Admin | Add device or SIM |
| `/devices/api/toggle-clinic` | POST | Admin | Toggle clinic_only (pluto/mars, one-per-type rule) |
| `/devices/api/toggle-issue` | POST | Admin/Engineer | Mark or resolve issue |
| `/devices/api/swap-device` | POST | Admin/Engineer | Replace faulty device; patient follows |
| `/devices/api/link-sim` | POST | Admin | Link or unlink SIM to modem |
| `/devices/api/assign-device` | POST | Admin | Manually assign modem/laptop to patient |
| `/devices/api/unassign-device` | POST | Admin | Return modem/laptop from patient |
