# routes/devices.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime
import uuid

bp = Blueprint('devices', __name__)

def get_devices_file_path(place=None):
    if not place:
        place = current_session.login_place
    folder = os.path.join(Config.META_DATA_PATH, place)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, 'devices.json')

def load_devices(place=None):
    file_path = get_devices_file_path(place)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return {'deviceSets': [], 'watches': []}

def save_devices(data, place=None):
    """Atomic save to prevent JSON corruption"""
    import tempfile
    file_path = get_devices_file_path(place)
    dir_path = os.path.dirname(file_path)
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
def get_devices():
    """Get all devices for the current centre"""
    try:
        devices = load_devices()
        return jsonify({'status': 'success', 'devices': devices})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets', methods=['GET'])
def get_device_sets():
    """Get all device sets"""
    try:
        devices = load_devices()
        return jsonify({'status': 'success', 'deviceSets': devices.get('deviceSets', [])})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets', methods=['POST'])
def create_device_set():
    """Create a new device set"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        device_set = {
            'id': str(uuid.uuid4()),
            'setNumber': data.get('setNumber'),
            'marsDeviceId': data.get('marsDeviceId'),
            'plutoDeviceId': data.get('plutoDeviceId'),
            'laptopNumber': data.get('laptopNumber'),
            'modemSerial': data.get('modemSerial'),
            'status': 'available',
            'assignedPatientId': None,
            'assignmentDate': None,
            'expectedReturnDate': None,
            'returnDate': None,
            'createdAt': datetime.now().isoformat()
        }
        
        devices.setdefault('deviceSets', []).append(device_set)
        save_devices(devices)
        
        return jsonify({'status': 'success', 'deviceSet': device_set})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets/<device_id>', methods=['PUT'])
def update_device_set(device_id):
    """Update a device set"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        for ds in devices.get('deviceSets', []):
            if ds['id'] == device_id:
                ds.update(data)
                ds['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets/<device_id>', methods=['DELETE'])
def delete_device_set(device_id):
    """Delete a device set"""
    try:
        devices = load_devices()
        
        devices['deviceSets'] = [ds for ds in devices.get('deviceSets', []) if ds['id'] != device_id]
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets/<device_id>/assign', methods=['POST'])
def assign_device_set(device_id):
    """Assign a device set to a patient"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        for ds in devices.get('deviceSets', []):
            if ds['id'] == device_id:
                ds['status'] = 'assigned'
                ds['assignedPatientId'] = data.get('patientId')
                ds['assignmentDate'] = datetime.now().isoformat()
                if data.get('expectedReturnDate'):
                    ds['expectedReturnDate'] = data.get('expectedReturnDate')
                ds['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/device_sets/<device_id>/return', methods=['POST'])
def return_device_set(device_id):
    """Return a device set"""
    try:
        devices = load_devices()
        
        for ds in devices.get('deviceSets', []):
            if ds['id'] == device_id:
                ds['status'] = 'available'
                ds['assignedPatientId'] = None
                ds['returnDate'] = datetime.now().isoformat()
                ds['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ActiGraph Watches
@bp.route('/watches', methods=['GET'])
def get_watches():
    """Get all watches"""
    try:
        devices = load_devices()
        return jsonify({'status': 'success', 'watches': devices.get('watches', [])})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/watches', methods=['POST'])
def create_watch():
    """Create a new watch"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        watch = {
            'id': str(uuid.uuid4()),
            'name': data.get('name'),
            'leftSerial': data.get('leftSerial'),
            'rightSerial': data.get('rightSerial'),
            'status': 'available',
            'assignedPatientId': None,
            'assignmentDate': None,
            'isBackup': data.get('isBackup', False),
            'createdAt': datetime.now().isoformat()
        }
        
        devices.setdefault('watches', []).append(watch)
        save_devices(devices)
        
        return jsonify({'status': 'success', 'watch': watch})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/watches/<watch_id>', methods=['PUT'])
def update_watch(watch_id):
    """Update a watch"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        for watch in devices.get('watches', []):
            if watch['id'] == watch_id:
                watch.update(data)
                watch['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/watches/<watch_id>', methods=['DELETE'])
def delete_watch(watch_id):
    """Delete a watch"""
    try:
        devices = load_devices()
        
        devices['watches'] = [w for w in devices.get('watches', []) if w['id'] != watch_id]
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/watches/<watch_id>/assign', methods=['POST'])
def assign_watch(watch_id):
    """Assign a watch to a patient"""
    try:
        data = request.get_json()
        devices = load_devices()
        
        for watch in devices.get('watches', []):
            if watch['id'] == watch_id:
                watch['status'] = 'assigned'
                watch['assignedPatientId'] = data.get('patientId')
                watch['assignmentDate'] = datetime.now().isoformat()
                watch['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/watches/<watch_id>/return', methods=['POST'])
def return_watch(watch_id):
    """Return a watch"""
    try:
        devices = load_devices()
        
        for watch in devices.get('watches', []):
            if watch['id'] == watch_id:
                watch['status'] = 'available'
                watch['assignedPatientId'] = None
                watch['returnDate'] = datetime.now().isoformat()
                watch['updatedAt'] = datetime.now().isoformat()
                break
        
        save_devices(devices)
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Device statistics for dashboard
@bp.route('/stats', methods=['GET'])
def get_device_stats():
    """Get device statistics"""
    try:
        devices = load_devices()
        
        device_sets = devices.get('deviceSets', [])
        watches = devices.get('watches', [])
        
        available_sets = sum(1 for ds in device_sets if ds.get('status') == 'available')
        assigned_sets = sum(1 for ds in device_sets if ds.get('status') == 'assigned')
        dropped_sets = sum(1 for ds in device_sets if ds.get('status') == 'dropped')
        
        available_watches = sum(1 for w in watches if w.get('status') == 'available')
        assigned_watches = sum(1 for w in watches if w.get('status') == 'assigned')
        
        return jsonify({
            'status': 'success',
            'stats': {
                'deviceSets': {
                    'total': len(device_sets),
                    'available': available_sets,
                    'assigned': assigned_sets,
                    'dropped': dropped_sets
                },
                'watches': {
                    'total': len(watches),
                    'available': available_watches,
                    'assigned': assigned_watches
                }
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def load_device_config():
    """Load the predefined device configuration"""
    config_path = os.path.join(Config.BASE_DIR, Config.DEVICE_CONFIG_PATH)
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return {'locations': {}}


@bp.route('/config/<place>', methods=['GET'])
def get_device_config(place):
    """Get device configuration for a specific location"""
    try:
        config = load_device_config()
        location_config = config.get('locations', {}).get(place, {})
        return jsonify({
            'status': 'success',
            'location': place,
            'deviceSets': location_config.get('deviceSets', [])
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/config/available/<place>', methods=['GET'])
def get_available_device_sets(place):
    """Get available (unassigned) device sets for a location"""
    try:
        config = load_device_config()
        location_config = config.get('locations', {}).get(place, {})
        
        devices = load_devices()
        assigned_set_ids = {ds.get('assignedDeviceSetId') for ds in devices.get('deviceSets', []) if ds.get('assignedDeviceSetId')}
        
        available_sets = []
        for ds in location_config.get('deviceSets', []):
            if ds.get('setId') not in assigned_set_ids:
                available_sets.append(ds)
        
        return jsonify({
            'status': 'success',
            'availableSets': available_sets
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/assign_from_config', methods=['POST'])
def assign_device_from_config():
    """Assign a device set from predefined config to a patient"""
    try:
        data = request.get_json()
        place = data.get('place')
        patient_id = data.get('patientId')
        set_id = data.get('setId')
        
        if not place or not patient_id or not set_id:
            return jsonify({'status': 'error', 'message': 'place, patientId, and setId are required'}), 400
        
        config = load_device_config()
        location_config = config.get('locations', {}).get(place, {})
        
        selected_set = None
        for ds in location_config.get('deviceSets', []):
            if ds.get('setId') == set_id:
                selected_set = ds
                break
        
        if not selected_set:
            return jsonify({'status': 'error', 'message': 'Device set not found'}), 404
        
        devices = load_devices(place)
        
        device_set = {
            'id': str(uuid.uuid4()),
            'setNumber': selected_set.get('setId'),
            'marsDeviceId': selected_set.get('mars'),
            'plutoDeviceId': selected_set.get('pluto'),
            'modemSerial': selected_set.get('modem'),
            'simCard': selected_set.get('simCard'),
            'simNumber': data.get('simNumber') or selected_set.get('simCard'),
            'laptopNumber': selected_set.get('laptop'),
            'assignedDeviceSetId': set_id,
            'status': 'assigned',
            'assignedPatientId': patient_id,
            'assignmentDate': datetime.now().isoformat(),
            'createdAt': datetime.now().isoformat()
        }
        
        devices.setdefault('deviceSets', []).append(device_set)
        save_devices(devices, place)
        
        return jsonify({'status': 'success', 'deviceSet': device_set})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_device_swap_history_file_path(place=None):
    if not place:
        place = current_session.login_place
    folder = os.path.join(Config.META_DATA_PATH, place)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, 'device_swap_history.json')


def load_device_swap_history(place=None):
    file_path = get_device_swap_history_file_path(place)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return {'swaps': []}


def save_device_swap_history(data, place=None):
    import tempfile
    file_path = get_device_swap_history_file_path(place)
    dir_path = os.path.dirname(file_path)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix='.tmp')
    try:
        with os.fdopen(tmp_fd, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


@bp.route('/swap_history/<patient_id>', methods=['GET'])
def get_device_swap_history(patient_id):
    """Get device swap history for a patient"""
    try:
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        
        history = load_device_swap_history(place)
        patient_swaps = [s for s in history.get('swaps', []) if s.get('patientId') == patient_id]
        
        return jsonify({
            'status': 'success',
            'swaps': patient_swaps
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/swap', methods=['POST'])
def record_device_swap():
    """Record a device swap for a patient"""
    try:
        data = request.get_json()
        patient_id = data.get('patientId')
        device_type = data.get('deviceType')
        old_device_id = data.get('oldDeviceId')
        new_device_id = data.get('newDeviceId')
        reason = data.get('reason', '')
        swap_date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        if not patient_id or not device_type or not new_device_id:
            return jsonify({'status': 'error', 'message': 'patientId, deviceType, and newDeviceId are required'}), 400
        
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        
        history = load_device_swap_history(place)
        
        swap_record = {
            'id': str(uuid.uuid4()),
            'patientId': patient_id,
            'deviceType': device_type,
            'oldDeviceId': old_device_id,
            'newDeviceId': new_device_id,
            'reason': reason,
            'date': swap_date,
            'swappedAt': datetime.now().isoformat(),
            'swappedBy': current_session.login_place
        }
        
        history.setdefault('swaps', []).append(swap_record)
        save_device_swap_history(history, place)
        
        return jsonify({'status': 'success', 'swap': swap_record})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/swap_history_all', methods=['GET'])
def get_all_swap_history():
    """Get all device swap history for the current location"""
    try:
        history = load_device_swap_history()
        return jsonify({'status': 'success', 'swaps': history.get('swaps', [])})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500