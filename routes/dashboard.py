from datetime import date, datetime
from flask import Blueprint, jsonify
from models.user import current_session
from utils.data_access import get_patients_for_user, derive_status, iter_patients_with_folder
from utils.protocol_events import read_protocol_events, load_study_protocol

bp = Blueprint('dashboard', __name__)

_AE_FOLLOWUP_LABELS = {
    'adverse_event_followup':        'Follow-up Call',
    'adverse_event_followup_visit':  'Follow-up Visit',
    'adverse_event_clinical_visit':  'Clinical Visit',
}


def _topo_sort(events, event_defs, date_fn):
    """Group events by date_fn, topo-sort within each group (parents before dependents),
    return in ascending date order."""
    events_by_date = {}
    for ev in events:
        events_by_date.setdefault(date_fn(ev), []).append(ev)

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

    # Build flat event_names for display (merge all sections; names don't conflict)
    event_names = {}
    for section in ('experimental', 'control', 'shared'):
        for e in protocol.get(section, []):
            event_names[e['id']] = e['name']
    event_names['training_pause_followup'] = 'Training Pause Follow-up'

    # Build per-group event_defs so depends_on is looked up against the correct
    # group definition (e.g. activation has different depends_on per group).
    group_defs = {}
    for grp in ('experimental', 'control'):
        defs = {}
        for e in protocol.get('shared', []):
            defs[e['id']] = e
        for e in protocol.get(grp, []):
            defs[e['id']] = e
        defs['training_pause_followup'] = {'name': 'Training Pause Follow-up', 'depends_on': []}
        group_defs[grp] = defs

    # Merged defs for topo sort (experimental preferred — stricter depends_on).
    # Ordering within a date is cosmetic; correctness comes from blocked_by above.
    topo_defs = {**group_defs.get('control', {}), **group_defs.get('experimental', {})}

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

        # For broken_protocol patients: show discontinuation reminder + open AE follow-up stubs only
        if derive_status(patient) == 'broken_protocol':
            _BP_INTERACTIVE = frozenset({
                'adverse_event', 'adverse_event_followup',
                'adverse_event_followup_visit', 'adverse_event_clinical_visit',
            })
            ae_alias_map_bp = {
                e['id']: e['alias']
                for e in events_data.get('free', {}).get('adverse_event', [])
                if e.get('alias')
            }
            for entry in events_data.get('incomplete', []):
                pid = entry.get('protocol_event_id')
                if pid not in _BP_INTERACTIVE:
                    continue
                sched = entry.get('scheduled_date')
                if not sched or not isinstance(sched, list) or len(sched) < 2:
                    continue
                try:
                    end_dt = datetime.fromisoformat(sched[1]).date()
                except Exception:
                    continue
                if pid in _AE_FOLLOWUP_LABELS:
                    ae_ids  = entry.get('adverse_event_ids') or []
                    aliases = [ae_alias_map_bp[aid] for aid in ae_ids if aid in ae_alias_map_bp]
                    ev_name = f"{_AE_FOLLOWUP_LABELS[pid]}: {', '.join(aliases)}" if aliases else _AE_FOLLOWUP_LABELS[pid]
                else:
                    ev_name = event_names.get(pid, pid)
                overdue.append({
                    'id':                entry['id'],
                    'protocol_event_id': pid,
                    'homer_id':          homer_id,
                    'event_name':        ev_name,
                    'scheduled_date':    sched,
                    'days':              (end_dt - today).days,
                    'active_window':     end_dt >= today,
                    'blocked_by':        [],
                })
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
                    'scheduled_date':    [broken_date, broken_date],
                    'days':              (broken_sched - today).days,
                    'active_window':     False,
                    'blocked_by':        [],
                })
            continue

        # For paused patients: live check if D02/D03 window has already passed → treat as broken protocol
        if derive_status(patient) == 'paused':
            completed_ids_paused = {e['protocol_event_id'] for e in events_data.get('complete', [])}
            d0203_missed = False
            for visit_id in ('home_visit_d02', 'home_visit_d03'):
                if visit_id in completed_ids_paused:
                    continue
                inc_entry = next((e for e in events_data.get('incomplete', [])
                                  if e.get('protocol_event_id') == visit_id), None)
                if not inc_entry:
                    continue
                sd = inc_entry.get('scheduled_date')
                if not sd or sd[1] is None:
                    continue
                try:
                    end_date = datetime.fromisoformat(sd[1]).date()
                except (ValueError, TypeError):
                    continue
                if end_date < today:
                    d0203_missed = True
                    break
            if d0203_missed and not events_data.get('free', {}).get('discontinuation'):
                broken_date = today.isoformat()
                overdue.append({
                    'id':                'discontinuation_reminder',
                    'protocol_event_id': 'discontinuation_reminder',
                    'homer_id':          homer_id,
                    'event_name':        'Discontinue Patient',
                    'scheduled_date':    [broken_date, broken_date],
                    'days':              0,
                    'blocked_by':        [],
                })
                continue

        completed_ids = {e['protocol_event_id'] for e in events_data.get('complete', [])}
        known_ids     = completed_ids | {e['protocol_event_id'] for e in events_data.get('incomplete', [])}
        patient_defs  = group_defs.get(patient.get('group', ''), {})
        ae_alias_map  = {
            e['id']: e['alias']
            for e in events_data.get('free', {}).get('adverse_event', [])
            if e.get('alias')
        }

        _PAUSE_VISIBLE = frozenset({
            'adverse_event', 'adverse_event_followup', 'adverse_event_followup_visit',
            'adverse_event_clinical_visit',
            'robot_issue_call', 'robot_issue_visit', 'resolve_robot_issue_visit',
            'other_device_issue_call', 'other_device_issue_visit',
        })
        _DISCONTINUED_VISIBLE = frozenset({
            'adverse_event', 'adverse_event_followup',
            'adverse_event_followup_visit', 'adverse_event_clinical_visit',
            'a1_assessment', 'a2_assessment',
        })
        is_paused       = bool(patient.get('trainingPausedDate'))
        is_discontinued = bool(patient.get('discontinuationDate'))

        for entry in events_data.get('incomplete', []):
            sched = entry.get('scheduled_date')
            if not sched or not isinstance(sched, list) or len(sched) < 2:
                continue
            try:
                start_date = datetime.fromisoformat(sched[0]).date()
                end_date   = datetime.fromisoformat(sched[1]).date()
            except Exception:
                continue

            pid     = entry.get('protocol_event_id')

            if is_discontinued and pid not in _DISCONTINUED_VISIBLE:
                continue

            on_hold = is_paused and pid not in _PAUSE_VISIBLE and start_date <= today

            dep_ids    = patient_defs.get(pid, {}).get('depends_on') or []
            blocked_by = [event_names.get(d, d) for d in dep_ids if d in known_ids and d not in completed_ids]

            if pid in _AE_FOLLOWUP_LABELS:
                ae_ids   = entry.get('adverse_event_ids') or []
                aliases  = [ae_alias_map[aid] for aid in ae_ids if aid in ae_alias_map]
                ev_name  = f"{_AE_FOLLOWUP_LABELS[pid]}: {', '.join(aliases)}" if aliases else _AE_FOLLOWUP_LABELS[pid]
            else:
                ev_name  = event_names.get(pid, pid)

            record = {
                'id':                entry['id'],
                'protocol_event_id': pid,
                'homer_id':          homer_id,
                'event_name':        ev_name,
                'scheduled_date':    sched,
                'blocked_by':        blocked_by,
            }
            if entry.get('training_stopped'):
                record['training_stopped'] = True

            if on_hold:
                # On-hold events never appear in the dashboard upcoming list
                # (dashboard only shows events due within 7 days; on-hold ones are not actionable)
                continue
            elif start_date > today:
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

    # Active-window first, then past-due; within each sub-group sort by end date
    # and topo-sort within same-end-date groups so parents appear before dependents.
    end_date_fn = lambda ev: ev['scheduled_date'][1][:10]
    active_overdue = sorted([e for e in overdue if e.get('active_window')],     key=end_date_fn)
    past_overdue   = sorted([e for e in overdue if not e.get('active_window')], key=end_date_fn)
    overdue  = (_topo_sort(active_overdue, topo_defs, end_date_fn) +
                _topo_sort(past_overdue,   topo_defs, end_date_fn))
    upcoming = _topo_sort(upcoming, topo_defs, lambda ev: ev['scheduled_date'][0][:10])

    return jsonify({'overdue': overdue, 'upcoming': upcoming})
