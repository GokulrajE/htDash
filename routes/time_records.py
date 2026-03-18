# routes/time_records.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime
import subprocess

bp = Blueprint('time_records', __name__)


def resolve_login_place(data=None):
    """Return login_place from session if live; restore it from login_id in
    request body if the Flask session was wiped (e.g. server restart) while
    the user's browser still has localStorage credentials."""
    if current_session.login_place:
        return current_session.login_place
    login_id = (data or {}).get("login_id", "")
    if login_id:
        user_data = Config.LOGIN_CREDENTIALS.get(login_id)
        if user_data:
            current_session.login_place = user_data.get("place")
            current_session.privilege = user_data.get("privilege", "user")
            return current_session.login_place
    return None

def get_time_records_path(user_id, place=None):
    """Get the path to the time records file for a patient."""
    if place is None:
        place = current_session.login_place
    
    folder = os.path.join(Config.META_DATA_PATH, place, user_id, Config.TIME_RECORDS_FOLDER)
    return os.path.join(folder, Config.TIME_RECORDS_FILE), folder


@bp.route('/save_time_record', methods=['POST'])
def save_time_record():
    """Save time record for a specific exercise (ADL or VCG)."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"status": "error", "message": "No data provided"}), 400
        
        login_place = resolve_login_place(data)
        if not login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        user_id = data.get('user_id')
        exercise_id = data.get('exercise_id')
        exercise_type = data.get('exercise_type')  # 'vcg' or 'adl'
        time_record = data.get('time_record')  # {date, startTime, endTime, reps}
        
        if not all([user_id, exercise_id, exercise_type, time_record]):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Determine path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, login_place)
        else:
            place = login_place
        
        file_path, folder_path = get_time_records_path(user_id, place)
        
        # Create folder if not exists
        os.makedirs(folder_path, exist_ok=True)
        
        # Load existing records or create new structure
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                records = json.load(f)
        else:
            records = {}
        
        # Create structure: {exercise_id: {exercise_type: [records]}}
        if exercise_id not in records:
            records[exercise_id] = {}
        
        if exercise_type not in records[exercise_id]:
            records[exercise_id][exercise_type] = []
        
        # Check for duplicates
        existing = records[exercise_id][exercise_type]
        is_duplicate = any(
            r.get('date') == time_record.get('date') and 
            r.get('startTime') == time_record.get('startTime') and 
            r.get('endTime') == time_record.get('endTime')
            for r in existing
        )
        
        if not is_duplicate:
            records[exercise_id][exercise_type].append(time_record)
        
        # Save to file
        with open(file_path, 'w') as f:
            json.dump(records, f, indent=2)
        
        # Upload to S3
        try:
            s3_key = f"{place}/{user_id}/{Config.TIME_RECORDS_FOLDER}/{Config.TIME_RECORDS_FILE}"
            
            command = [
                "aws", "s3", "cp",
                file_path,
                f"s3://{Config.BUCKET_NAME}/{s3_key}"
            ]
            subprocess.run(command, capture_output=True, text=True)
        except Exception as s3_error:
            print(f"S3 upload error: {s3_error}")
        
        # Log ADL or VCG session
        try:
            from routes.auth import log_adl_session, log_vcg_session
            if exercise_type == 'adl':
                log_adl_session(user_id, 1, login_place)
            elif exercise_type == 'vcg':
                log_vcg_session(user_id, 1, login_place)
        except Exception as e:
            print(f"Warning: Could not log session: {e}")
        
        return jsonify({
            "status": "success",
            "message": "Time record saved successfully"
        })
        
    except Exception as e:
        print(f"Error saving time record: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route('/get_time_records/<user_id>', methods=['GET'])
def get_time_records(user_id):
    """Get all time records for a patient."""
    try:
        login_place = resolve_login_place()
        if not login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Determine path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, login_place)
        else:
            place = login_place
        
        file_path, _ = get_time_records_path(user_id, place)
        
        if not os.path.exists(file_path):
            return jsonify({
                "status": "success",
                "has_records": False,
                "records": {}
            })
        
        with open(file_path, 'r') as f:
            records = json.load(f)
        
        return jsonify({
            "status": "success",
            "has_records": bool(records),
            "records": records
        })
        
    except Exception as e:
        print(f"Error getting time records: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route('/get_exercise_time_record/<user_id>/<exercise_id>', methods=['GET'])
def get_exercise_time_record(user_id, exercise_id):
    """Get time records for a specific exercise."""
    try:
        login_place = resolve_login_place()
        if not login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Determine path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, login_place)
        else:
            place = login_place
        
        file_path, _ = get_time_records_path(user_id, place)
        
        if not os.path.exists(file_path):
            return jsonify({
                "status": "success",
                "has_records": False,
                "vcg_records": [],
                "adl_records": []
            })
        
        with open(file_path, 'r') as f:
            records = json.load(f)
        
        exercise_records = records.get(exercise_id, {})
        
        return jsonify({
            "status": "success",
            "has_records": bool(exercise_records.get('vcg') or exercise_records.get('adl')),
            "vcg_records": exercise_records.get('vcg', []),
            "adl_records": exercise_records.get('adl', [])
        })
        
    except Exception as e:
        print(f"Error getting exercise time record: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route('/delete_time_record', methods=['POST'])
def delete_time_record():
    """Delete a specific time record."""
    try:
        data = request.get_json()
        
        login_place = resolve_login_place(data)
        if not login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        user_id = data.get('user_id')
        exercise_id = data.get('exercise_id')
        exercise_type = data.get('exercise_type')
        record_index = data.get('record_index')
        
        if not all([user_id, exercise_id, exercise_type, record_index is not None]):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Determine path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, login_place)
        else:
            place = login_place
        
        file_path, _ = get_time_records_path(user_id, place)
        
        if not os.path.exists(file_path):
            return jsonify({"status": "error", "message": "No records found"}), 404
        
        with open(file_path, 'r') as f:
            records = json.load(f)
        
        if exercise_id in records and exercise_type in records[exercise_id]:
            records[exercise_id][exercise_type].pop(record_index)
            
            # Clean up empty entries
            if not records[exercise_id][exercise_type]:
                del records[exercise_id][exercise_type]
            if not records[exercise_id]:
                del records[exercise_id]
            
            # Save updated records
            with open(file_path, 'w') as f:
                json.dump(records, f, indent=2)
            
            # Upload to S3
            try:
                s3_key = f"{place}/{user_id}/{Config.TIME_RECORDS_FOLDER}/{Config.TIME_RECORDS_FILE}"
                
                command = [
                    "aws", "s3", "cp",
                    file_path,
                    f"s3://{Config.BUCKET_NAME}/{s3_key}"
                ]
                subprocess.run(command, capture_output=True, text=True)
            except Exception as s3_error:
                print(f"S3 upload error: {s3_error}")
        
        return jsonify({
            "status": "success",
            "message": "Time record deleted successfully"
        })
        
    except Exception as e:
        print(f"Error deleting time record: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
