from flask import Blueprint, jsonify
from models.user import current_session
from utils.data_access import get_patients_for_user, derive_status

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
        'training_completed': sum(1 for p in patients if p.get('trainingCompletionDate')),
        'a1_completed':       sum(1 for p in patients if p.get('a1CompletionDate')),
        'pre_discontinued':   sum(1 for s in statuses if s == 'pre_discontinued'),
        'discontinued':       sum(1 for s in statuses if s == 'discontinued'),
    })
