# routes/sim_cards.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime, timedelta
import uuid

bp = Blueprint('sim_cards', __name__)

def get_sim_file_path(place=None):
    if not place:
        place = current_session.login_place
    folder = os.path.join(Config.META_DATA_PATH, place)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, 'sim_cards.json')

def load_sims(place=None):
    file_path = get_sim_file_path(place)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return {'sims': []}

def save_sims(data, place=None):
    """Atomic save to prevent JSON corruption"""
    file_path = get_sim_file_path(place)
    dir_path = os.path.dirname(file_path)
    import tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix='.tmp')
    try:
        with os.fdopen(tmp_fd, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        try: os.unlink(tmp_path)
        except OSError: pass
        raise

@bp.route('/', methods=['GET'])
def get_sims():
    """Get all SIM cards for the current centre"""
    try:
        sims = load_sims()
        return jsonify({'status': 'success', 'sims': sims.get('sims', [])})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/', methods=['POST'])
def create_sim():
    """Create a new SIM card entry"""
    try:
        data = request.get_json()
        sims = load_sims()
        
        recharge_date = data.get('rechargeDate')
        expiry_date = data.get('expiryDate')
        
        sim = {
            'id': str(uuid.uuid4()),
            'phoneNumber': data.get('phoneNumber'),
            'network': data.get('network'),
            'modemSerial': data.get('modemSerial', ''),
            'rechargeDate': recharge_date,
            'expiryDate': expiry_date,
            'rechargeAmount': data.get('rechargeAmount'),
            'dataPlan': data.get('dataPlan'),
            'reminderDays': data.get('reminderDays', 3),
            'status': 'active',
            'notes': data.get('notes', ''),
            'createdAt': datetime.now().isoformat()
        }
        
        sims.setdefault('sims', []).append(sim)
        save_sims(sims)
        
        return jsonify({'status': 'success', 'sim': sim})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/<sim_id>', methods=['PUT'])
def update_sim(sim_id):
    """Update a SIM card"""
    try:
        data = request.get_json()
        sims = load_sims()
        
        for sim in sims.get('sims', []):
            if sim['id'] == sim_id:
                sim.update(data)
                sim['updatedAt'] = datetime.now().isoformat()
                break
        
        save_sims(sims)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/<sim_id>', methods=['DELETE'])
def delete_sim(sim_id):
    """Delete a SIM card"""
    try:
        sims = load_sims()
        
        sims['sims'] = [s for s in sims.get('sims', []) if s['id'] != sim_id]
        
        save_sims(sims)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/<sim_id>/recharge', methods=['POST'])
def recharge_sim(sim_id):
    """Record a SIM card recharge"""
    try:
        data = request.get_json()
        sims = load_sims()
        
        for sim in sims.get('sims', []):
            if sim['id'] == sim_id:
                sim['rechargeDate'] = data.get('rechargeDate')
                sim['expiryDate'] = data.get('expiryDate')
                sim['rechargeAmount'] = data.get('rechargeAmount')
                sim['dataPlan'] = data.get('dataPlan')
                sim['updatedAt'] = datetime.now().isoformat()
                break
        
        save_sims(sims)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/reminders', methods=['GET'])
def get_sim_reminders():
    """Get SIM cards that need recharge reminders"""
    try:
        sims = load_sims()
        today = datetime.now().date()
        reminders = []
        
        for sim in sims.get('sims', []):
            if sim.get('expiryDate'):
                expiry_date = datetime.strptime(sim['expiryDate'], '%Y-%m-%d').date()
                days_until_expiry = (expiry_date - today).days
                
                reminder_days = sim.get('reminderDays', 3)
                
                if days_until_expiry <= reminder_days and days_until_expiry >= 0:
                    reminders.append({
                        **sim,
                        'daysUntilExpiry': days_until_expiry
                    })
                elif days_until_expiry < 0:
                    reminders.append({
                        **sim,
                        'daysUntilExpiry': days_until_expiry,
                        'isExpired': True
                    })
        
        return jsonify({'status': 'success', 'reminders': reminders})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500