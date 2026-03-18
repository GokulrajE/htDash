# routes/exercise_timing.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime
import subprocess
import uuid

bp = Blueprint('exercise_timing', __name__)

@bp.route('/get_exercise_timing_status/<user_id>', methods=['GET'])
def get_exercise_timing_status(user_id):
    """Check if exercise timing should be available based on days from start date."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Get config file to check start date
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            config_path = os.path.join(Config.META_DATA_PATH, place, user_id, Config.ACTILIFE_LABEL, Config.CONFIG_DATA)
        else:
            config_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id, Config.ACTILIFE_LABEL, Config.CONFIG_DATA)
        
        if not os.path.exists(config_path):
            return jsonify({
                "status": "success",
                "available": False,
                "message": "No activation found"
            })
        
        # Read config to get start date
        import csv
        with open(config_path, 'r') as f:
            reader = csv.reader(f)
            header = next(reader)  # Skip header
            last_row = None
            for row in reader:
                last_row = row
        
        if not last_row:
            return jsonify({"status": "success", "available": False})
        
        # Find StartDate column index
        try:
            start_date_idx = header.index("StartDate")
            start_date_str = last_row[start_date_idx]
            start_date = datetime.strptime(start_date_str, "%d-%m-%Y")
        except (ValueError, AttributeError):
            return jsonify({"status": "success", "available": False})
        
        # Calculate days from start
        today = datetime.now()
        days_diff = (today - start_date).days
        
        # Available on day 3 and day 15
        is_available = days_diff in [2, 3, 14, 15]  # Day 3 and 15 (and day after for buffer)
        
        # Check if already completed for today
        timing_folder = os.path.join(os.path.dirname(config_path), Config.EXERCISE_TIMING_FOLDER)
        if os.path.exists(timing_folder):
            vcg_file = os.path.join(timing_folder, f"day_{days_diff}_vcg_timing.json")
            adl_file = os.path.join(timing_folder, f"day_{days_diff}_adl_timing.json")
            
            if os.path.exists(vcg_file) and os.path.exists(adl_file):
                is_available = False
        
        return jsonify({
            "status": "success",
            "available": is_available,
            "day": days_diff,
            "start_date": start_date_str
        })
        
    except Exception as e:
        print(f"Error checking timing status: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route('/save_exercise_timing', methods=['POST'])
def save_exercise_timing():
    """Save start/stop times for exercises."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        data = request.get_json()
        user_id = data.get('user_id')
        exercise_type = data.get('exercise_type')  # 'vcg' or 'adl'
        timing_data = data.get('timing_data', [])
        
        if not all([user_id, exercise_type]):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Determine file path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            base_path = os.path.join(Config.META_DATA_PATH, place, user_id)
        else:
            base_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id)
        
        # Create timing folder
        timing_folder = os.path.join(base_path, Config.EXERCISE_TIMING_FOLDER)
        os.makedirs(timing_folder, exist_ok=True)
        
        # Get current day from start date
        config_path = os.path.join(base_path, Config.CONFIG_DATA)
        if os.path.exists(config_path):
            import csv
            with open(config_path, 'r') as f:
                reader = csv.reader(f)
                header = next(reader)
                last_row = None
                for row in reader:
                    last_row = row
            
            if last_row:
                start_date_idx = header.index("StartDate")
                start_date_str = last_row[start_date_idx]
                start_date = datetime.strptime(start_date_str, "%d-%m-%Y")
                days_diff = (datetime.now() - start_date).days
            else:
                days_diff = datetime.now().day
        else:
            days_diff = datetime.now().day
        
        # Create filename with day and timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"day_{days_diff}_{exercise_type}_timing_{timestamp}.json"
        file_path = os.path.join(timing_folder, filename)
        
        # Prepare data
        timing_record = {
            "user_id": user_id,
            "exercise_type": exercise_type,
            "day_from_start": days_diff,
            "recorded_at": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "timing_data": timing_data
        }
        
        # Save locally
        with open(file_path, 'w') as f:
            json.dump(timing_record, f, indent=2)
        
        # Upload to S3
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            s3_key = f"{place}/{user_id}/{Config.EXERCISE_TIMING_FOLDER}/{filename}"
        else:
            s3_key = f"{current_session.login_place}/{user_id}/{Config.EXERCISE_TIMING_FOLDER}/{filename}"
        
        try:
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
            "message": f"{exercise_type.upper()} timing saved successfully",
            "filename": filename
        })
        
    except Exception as e:
        print(f"Error saving exercise timing: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route('/get_exercise_timings/<user_id>', methods=['GET'])
def get_exercise_timings(user_id):
    """Get all exercise timings for a user."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Determine base path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            timing_folder = os.path.join(Config.META_DATA_PATH, place, user_id, Config.EXERCISE_TIMING_FOLDER)
        else:
            timing_folder = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id,  Config.EXERCISE_TIMING_FOLDER)
        
        if not os.path.exists(timing_folder):
            return jsonify({
                "status": "success",
                "has_timings": False,
                "timings": []
            })
        
        # Get all timing files
        timings = {
            "vcg": [],
            "adl": []
        }
        
        for filename in os.listdir(timing_folder):
            if filename.endswith('.json'):
                file_path = os.path.join(timing_folder, filename)
                with open(file_path, 'r') as f:
                    timing_data = json.load(f)
                
                if 'vcg' in filename:
                    timings["vcg"].append(timing_data)
                elif 'adl' in filename:
                    timings["adl"].append(timing_data)
        
        return jsonify({
            "status": "success",
            "has_timings": len(timings["vcg"]) > 0 or len(timings["adl"]) > 0,
            "timings": timings
        })
        
    except Exception as e:
        print(f"Error getting exercise timings: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500