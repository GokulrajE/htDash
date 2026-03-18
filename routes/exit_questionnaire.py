# routes/exit_questionnaire.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime
import subprocess
import uuid
from werkzeug.utils import secure_filename

bp = Blueprint('exit', __name__)

@bp.route('/save_exit_data', methods=['POST'])
def save_exit_data():
    """Save exit questionnaire and adverse events."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Get form data
        user_id = request.form.get('user_id')
        reason = request.form.get('reason')
        adverse_events = request.form.get('adverse_events', 'no')
        adverse_description = request.form.get('adverse_description', '')
        satisfaction = request.form.get('satisfaction', '')
        comments = request.form.get('comments', '')
        
        # Get uploaded files
        questionnaire_file = request.files.get('questionnaire')
        adverse_file = request.files.get('adverse_file')
        
        if not user_id or not reason:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Determine base path — resolve place once and reuse throughout
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
        else:
            place = current_session.login_place
        base_path = os.path.join(Config.META_DATA_PATH, place, user_id, Config.ACTILIFE_LABEL)
        
        # Create exit folder
        exit_folder = os.path.join(base_path, "exit_data")
        os.makedirs(exit_folder, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save questionnaire data
        questionnaire_data = {
            "user_id": user_id,
            "discontinue_date": datetime.now().strftime("%d-%m-%Y"),
            "reason": reason,
            "adverse_events": adverse_events,
            "adverse_description": adverse_description,
            "satisfaction": satisfaction,
            "comments": comments,
            "questionnaire_file": None,
            "adverse_file": None
        }
        
        # Save uploaded files
        if questionnaire_file:
            safe_name = secure_filename(questionnaire_file.filename) or "upload"
            filename = f"questionnaire_{timestamp}_{safe_name}"
            file_path = os.path.join(exit_folder, filename)
            questionnaire_file.save(file_path)
            questionnaire_data["questionnaire_file"] = filename
            
            # Upload to S3
            s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{filename}"
            s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{filename}"
            
            try:
                command = [
                    "aws", "s3", "cp",
                    file_path,
                    f"s3://{Config.BUCKET_NAME}/{s3_key}"
                ]
                subprocess.run(command, capture_output=True, text=True)
            except Exception as e:
                print(f"S3 upload error: {e}")
        
        if adverse_file:
            safe_name = secure_filename(adverse_file.filename) or "upload"
            filename = f"adverse_{timestamp}_{safe_name}"
            file_path = os.path.join(exit_folder, filename)
            adverse_file.save(file_path)
            questionnaire_data["adverse_file"] = filename
            
            # Upload to S3
            s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{filename}"
            s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{filename}"
            
            try:
                command = [
                    "aws", "s3", "cp",
                    file_path,
                    f"s3://{Config.BUCKET_NAME}/{s3_key}"
                ]
                subprocess.run(command, capture_output=True, text=True)
            except Exception as e:
                print(f"S3 upload error: {e}")
        
        # Save questionnaire data as JSON — atomic write to prevent corruption
        import tempfile as _tf
        json_filename = f"exit_data_{timestamp}.json"
        json_path = os.path.join(exit_folder, json_filename)
        _fd, _tmp = _tf.mkstemp(dir=exit_folder, suffix=".tmp")
        try:
            with os.fdopen(_fd, "w") as _f:
                json.dump(questionnaire_data, _f, indent=2)
            os.replace(_tmp, json_path)
        except Exception:
            try:
                os.unlink(_tmp)
            except OSError:
                pass
            raise
        
        # Upload JSON to S3
        s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{json_filename}"
        s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/exit_data/{json_filename}"
        
        try:
            command = [
                "aws", "s3", "cp",
                json_path,
                f"s3://{Config.BUCKET_NAME}/{s3_key}"
            ]
            subprocess.run(command, capture_output=True, text=True)
        except Exception as e:
            print(f"S3 upload error: {e}")
        
        # Mark patient as discontinued in homerIdDetails
        try:
            from utils.file_handlers import FileHandler
            homer_data = FileHandler.load_homer_id_details(place)
            for _user in homer_data.get("details", []):
                if _user.get("homerID") == user_id:
                    _user["discontinued"] = True
                    _user.setdefault("discontinueDate", datetime.now().strftime("%Y-%m-%d"))
                    _user.setdefault("discontinueReason", reason)
                    break
            FileHandler.save_homer_id_details(place, homer_data)
        except Exception as _e:
            print(f"Warning: could not mark patient as discontinued: {_e}")

        return jsonify({
            "status": "success",
            "message": "Exit data saved successfully"
        })
        
    except Exception as e:
        print(f"Error saving exit data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500