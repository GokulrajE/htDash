"""
Reset the four ranipet test patients to enrolled state with specified a0 dates.

Always creates exactly four patients:
  HOCMCV002 — experimental 1
  HOCMCV003 — experimental 2
  HOCMCV004 — control 1
  HOCMCV005 — control 2

Dates are supplied as four dd/mm values (current year assumed).
All existing patient data and device assignments are wiped first.

Usage:
    python scripts/reset_test_patient.py 23/03 24/03 22/03 21/03
    # order: expt1  expt2  ctrl1  ctrl2
"""

import sys
from datetime import datetime
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import json

from utils.data_access import (
    get_patients_path,
    write_patient_meta,
    create_patient_folders,
    create_patient_log,
    read_device_assignments,
    write_device_assignments,
)
from utils.protocol_events import create_protocol_events

HOSPITAL       = 'ranipet'
DEVICE_TYPES   = ('pluto', 'mars', 'agwatch')
CURRENT_YEAR   = datetime.now().year

# Fixed patient definitions — order matches the four date arguments
PATIENTS = [
    {'homer_id': 'HOCMCV002', 'hospital_id': 'RP-T001', 'group': 'experimental', 'side': 'Right'},
    {'homer_id': 'HOCMCV003', 'hospital_id': 'RP-T002', 'group': 'experimental', 'side': 'Left'},
    {'homer_id': 'HOCMCV004', 'hospital_id': 'RP-T003', 'group': 'control',      'side': 'Right'},
    {'homer_id': 'HOCMCV005', 'hospital_id': 'RP-T004', 'group': 'control',      'side': 'Left'},
]


def parse_date(ddmm: str) -> str:
    """Parse dd/mm and return 'YYYY-MM-DDTHH:MM' at noon using the current year."""
    try:
        day, month = ddmm.split('/')
        dt = datetime(CURRENT_YEAR, int(month), int(day), 12, 0)
        return dt.strftime('%Y-%m-%dT%H:%M')
    except Exception:
        print(f"  ERROR: invalid date '{ddmm}' — expected dd/mm format")
        sys.exit(1)


def clear_all_device_assignments() -> None:
    """Remove all patient assignments across all device types for this site."""
    for dtype in DEVICE_TYPES:
        assignments = read_device_assignments(HOSPITAL, dtype)
        if assignments:
            write_device_assignments(HOSPITAL, dtype, [])
            print(f"  Cleared all {dtype} assignments ({len(assignments)} record(s))")


def _devices_log_dir() -> Path:
    return PROJECT_ROOT / 'data' / HOSPITAL / 'devices' / 'logs'


def _inventory_dir() -> Path:
    return PROJECT_ROOT / 'data' / HOSPITAL / 'devices' / 'inventory'


def clean_device_inventory() -> None:
    """Remove faulty flags and lost_date from all devices in all inventory files."""
    inv_dir = _inventory_dir()
    if not inv_dir.exists():
        return
    for inv_path in sorted(inv_dir.glob('*.json')):
        with open(inv_path, encoding='utf-8') as f:
            data = json.load(f)
        changed = 0
        for d in data.get('devices', []):
            if d.get('faulty', False):
                d['faulty'] = False
                changed += 1
            if 'lost_date' in d:
                del d['lost_date']
                changed += 1
        if changed:
            tmp = inv_path.with_suffix('.tmp')
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            tmp.replace(inv_path)
            print(f"  Cleaned {changed} field(s) from {inv_path.name}")


def clear_all_device_logs() -> None:
    """Strip all patient-event lines from every device log, keeping only headers."""
    log_dir = _devices_log_dir()
    if not log_dir.exists():
        return
    for log_path in sorted(log_dir.glob('*.log')):
        lines  = log_path.read_text(encoding='utf-8').splitlines(keepends=True)
        kept   = [l for l in lines if l.startswith(':')]
        removed = len(lines) - len(kept)
        if removed:
            log_path.write_text(''.join(kept), encoding='utf-8')
            print(f"  Cleared {removed} line(s) from {log_path.name}")


def reset_patient(defn: dict, a0_date: str) -> None:
    homer_id = defn['homer_id']
    group    = defn['group']
    print(f"  {homer_id}  ({group}, {defn['side']}, a0={a0_date})")

    # Delete existing folder if present
    patient_dir = get_patients_path(HOSPITAL) / homer_id
    if patient_dir.exists():
        shutil.rmtree(patient_dir)

    # Recreate folder structure, log, meta and protocol events
    create_patient_folders(HOSPITAL, homer_id, group)
    create_patient_log(HOSPITAL, homer_id)

    meta = {
        'homerID':                homer_id,
        'hospitalID':             defn['hospital_id'],
        'group':                  group,
        'trainingSide':           defn['side'],
        'enrollDate':             a0_date,
        'a0CompletionDate':       a0_date,
        'activationDate':         None,
        'discontinuationDate':    None,
        'trainingCompletionDate': None,
        'trainingPausedDate':     None,
        'brokenProtocolDate':     None,
        'a1CompletionDate':       None,
        'a2CompletionDate':       None,
        'cumulativePauseDays':    0,
        'vcgGroup':               None,
        'agWatchRightID':         None,
        'agWatchLeftID':          None,
    }
    write_patient_meta(HOSPITAL, homer_id, meta)
    create_protocol_events(HOSPITAL, homer_id, group, a0_date)


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) != 4:
        print("Usage: python scripts/reset_test_patient.py expt1_dd/mm expt2_dd/mm ctrl1_dd/mm ctrl2_dd/mm")
        print("Example: python scripts/reset_test_patient.py 23/03 24/03 22/03 21/03")
        sys.exit(1)

    dates = [parse_date(a) for a in args]

    print("Clearing device assignments, logs, and inventory flags…")
    clear_all_device_assignments()
    clear_all_device_logs()
    clean_device_inventory()

    print("\nCreating patients…")
    for defn, date in zip(PATIENTS, dates):
        reset_patient(defn, date)

    print("\nDone. Four test patients ready in ranipet.")