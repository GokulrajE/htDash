from datetime import date, datetime
from flask import Blueprint, jsonify
from models.user import current_session
from utils.data_access import get_patients_for_user, derive_status, iter_patients_with_folder
from utils.protocol_events import read_protocol_events, load_study_protocol

bp = Blueprint('dashboard', __name__)


def _topo_sort_upcoming(events, event_defs):
    """Sort upcoming events ascending by start date; within the same date, parents before dependents."""
    events_by_date = {}
    for ev in events:
        date_key = ev['scheduled_date'][0][:10]
        events_by_date.setdefault(date_key, []).append(ev)

    result = []
    for date_key in sorted(events_by_date):
        group = events_by_date[date_key]
        if len(group) <= 1:
            result.extend(group)
            continue
        ids_in_group = {ev['protocol_event_id'] for ev in group}
        ev_map       = {ev['protocol_event_id']: ev for ev in group}
        in_degree    = {ev['protocol_event_id']: 0 for ev in group}
        dependents   = {ev['protocol_event_id']: [] for ev in group}
        for ev in group:
            pid  = ev['protocol_event_id']
            deps = event_defs.get(pid, {}).get('depends_on') or []
            for d in deps:
                if d in ids_in_group:
                    in_degree[pid] += 1
                    dependents[d].append(pid)
        queue        = [ev for ev in group if in_degree[ev['protocol_event_id']] == 0]
        sorted_group = []
        while queue:
            ev = queue.pop(0)
            sorted_group.append(ev)
            for dep_pid in dependents[ev['protocol_event_id']]:
                in_degree[dep_pid] -= 1
                if in_degree[dep_pid] == 0:
                    queue.append(ev_map[dep_pid])
        placed = {ev['protocol_event_id'] for ev in sorted_group}
        sorted_group.extend(ev for ev in group if ev['protocol_event_id'] not in placed)
        result.extend(sorted_group)
    return result


@bp.route('/api/dashboard/stats', methods=['GET'])
def stats():
    """Return patient counts for the dashboard stat bubbles."""
    if not current_session.login_place:
        return jsonify({'error': 'Not authenticated'}), 401

    patients = get_patients_for_user(current_session.login_place)

    statuses = [derive_status(p) for p in patients]

    return jsonify({
        'total':              len(patients),
        'experimental':       sum(1 for p in patients if p.get('group') == 'experimental'),
        'control':            sum(1 for p in patients if p.get('group') == 'control'),
        'unassigned':         sum(1 for s in statuses if s == 'unassigned'),
        'inactive':           sum(1 for s in statuses if s == 'inactive'),
        'active':             sum(1 for s in statuses if s == 'active'),
        'paused':             sum(1 for s in statuses if s == 'paused'),
        'training_completed': sum(1 for s in statuses if s == 'training_completed'),
        'a1_completed':       sum(1 for s in statuses if s == 'a1_completed'),
        'all_completed':      sum(1 for s in statuses if s == 'all_completed'),
        'pre_discontinued':   sum(1 for s in statuses if s == 'pre_discontinued'),
        'broken_protocol':    sum(1 for s in statuses if s == 'broken_protocol'),
        'discontinued':       sum(1 for s in statuses if s == 'discontinued'),
    })


@bp.route('/api/dashboard/events', methods=['GET'])
def events():
    """Return overdue and upcoming (next 7 days) protocol events across all visible patients."""
    if not current_session.login_place:
        return jsonify({'error': 'Not authenticated'}), 401

    protocol = load_study_protocol()
    event_names = {}
    event_defs  = {}
    for section in ('experimental', 'control', 'shared'):
        for e in protocol.get(section, []):
            event_names[e['id']] = e['name']
            event_defs[e['id']]  = e
    event_names['training_pause_followup'] = 'Training Pause Follow-up'

    terminal = {'discontinued', 'pre_discontinued', 'all_completed'}
    today = date.today()
    overdue  = []
    upcoming = []

    for hospital_folder, homer_id, patient in iter_patients_with_folder(current_session.login_place):
        if derive_status(patient) in terminal:
            continue
        events_data = read_protocol_events(hospital_folder, homer_id)
        if not events_data:
            continue

        # For broken_protocol patients only show the discontinuation reminder
        if derive_status(patient) == 'broken_protocol':
            if not events_data.get('free', {}).get('discontinuation'):
                broken_date = patient.get('brokenProtocolDate') or today.isoformat()
                try:
                    broken_sched = datetime.fromisoformat(broken_date).date()
                except Exception:
                    broken_sched = today
                overdue.append({
                    'id':                'discontinuation_reminder',
                    'protocol_event_id': 'discontinuation_reminder',
                    'homer_id':          homer_id,
                    'event_name':        'Discontinue Patient',
                    'scheduled_date':    broken_date,
                    'days':              (broken_sched - today).days,
                    'blocked_by':        [],
                })
            continue

        completed_ids = {e['protocol_event_id'] for e in events_data.get('complete', [])}
        known_ids     = completed_ids | {e['protocol_event_id'] for e in events_data.get('incomplete', [])}

        for entry in events_data.get('incomplete', []):
            sched = entry.get('scheduled_date')
            if not sched or not isinstance(sched, list) or len(sched) < 2:
                continue
            try:
                start_date = datetime.fromisoformat(sched[0]).date()
                end_date   = datetime.fromisoformat(sched[1]).date()
            except Exception:
                continue

            dep_ids    = event_defs.get(entry['protocol_event_id'], {}).get('depends_on') or []
            blocked_by = [event_defs[d]['name'] for d in dep_ids if d in known_ids and d not in completed_ids]

            record = {
                'id':                entry['id'],
                'protocol_event_id': entry['protocol_event_id'],
                'homer_id':          homer_id,
                'event_name':        event_names.get(entry['protocol_event_id'], entry['protocol_event_id']),
                'scheduled_date':    sched,
                'blocked_by':        blocked_by,
            }

            if start_date > today:
                diff = (start_date - today).days
                if diff <= 7:
                    record['days'] = diff
                    record['active_window'] = False
                    upcoming.append(record)
            elif end_date >= today:
                record['days'] = (end_date - today).days
                record['active_window'] = True
                overdue.append(record)
            else:
                record['days'] = (end_date - today).days  # negative
                record['active_window'] = False
                overdue.append(record)

    # Active-window sub-group first, then past-due; both ascending by end date
    overdue.sort(key=lambda x: (0 if x.get('active_window') else 1, x['scheduled_date'][1]))
    upcoming = _topo_sort_upcoming(upcoming, event_defs)

    return jsonify({'overdue': overdue, 'upcoming': upcoming})
