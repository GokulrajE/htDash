from datetime import date, datetime
from flask import Blueprint, jsonify
from models.user import current_session
from utils.data_access import get_patients_for_user, derive_status, iter_patients_with_folder
from utils.protocol_events import read_protocol_events, load_study_protocol

bp = Blueprint('dashboard', __name__)


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
    for section in ('experimental', 'control', 'shared'):
        for e in protocol.get(section, []):
            event_names[e['id']] = e['name']
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
        for entry in events_data.get('incomplete', []):
            sched = entry.get('scheduled_date')
            if not sched:
                continue
            try:
                sched_date = datetime.fromisoformat(sched).date()
            except Exception:
                continue
            diff = (sched_date - today).days
            record = {
                'id':                entry['id'],
                'protocol_event_id': entry['protocol_event_id'],
                'homer_id':          homer_id,
                'event_name':        event_names.get(entry['protocol_event_id'], entry['protocol_event_id']),
                'scheduled_date':    sched,
                'days':              diff,
            }
            if diff < 0:
                overdue.append(record)
            elif diff <= 7:
                upcoming.append(record)

    overdue.sort(key=lambda x: x['scheduled_date'])
    upcoming.sort(key=lambda x: x['scheduled_date'])

    return jsonify({'overdue': overdue, 'upcoming': upcoming})
