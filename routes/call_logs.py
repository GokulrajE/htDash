# routes/call_logs.py
from flask import Blueprint, request, jsonify, send_file
from config import Config
from models.user import current_session
import os
import json
from datetime import datetime
import subprocess
import uuid

bp = Blueprint('call_logs', __name__)

@bp.route('/save_call_record', methods=['POST'])
def save_call_record():
    """Save a call record with optional file upload."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        user_id = request.form.get('user_id')
        call_type = request.form.get('call_type')
        call_date = request.form.get('call_date')
        notes = request.form.get('notes', '')
        
        if not all([user_id, call_type, call_date]):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Determine base path and place
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            base_path = os.path.join(Config.META_DATA_PATH, place, user_id)
        else:
            place = current_session.login_place
            base_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id)
        
        # Create call_records folder
        call_records_folder = os.path.join(base_path, "call_records")
        os.makedirs(call_records_folder, exist_ok=True)
        
        # Generate unique ID for this record
        record_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Handle file upload if present
        file_info = None
        if 'log_file' in request.files and call_type == 'weekly':
            file = request.files['log_file']
            if file and file.filename:
                # Sanitize filename
                original_filename = file.filename
                ext = original_filename.split('.')[-1] if '.' in original_filename else 'bin'
                safe_filename = f"call_{timestamp}_{record_id}.{ext}"
                file_path = os.path.join(call_records_folder, safe_filename)
                
                # Save file
                file.save(file_path)
                
                # Upload to S3
                if current_session.is_admin():
                    place = current_session.place_info.get(user_id, current_session.login_place)
                    s3_key = f"{place}/{user_id}/call_records/{safe_filename}"
                else:
                    s3_key = f"{current_session.login_place}/{user_id}/call_records/{safe_filename}"
                
                try:
                    command = [
                        "aws", "s3", "cp",
                        file_path,
                        f"s3://{Config.BUCKET_NAME}/{s3_key}"
                    ]
                    subprocess.run(command, capture_output=True, text=True)
                except Exception as s3_error:
                    print(f"S3 upload error: {s3_error}")
                
                file_info = {
                    "filename": safe_filename,
                    "original_name": original_filename,
                    "s3_key": s3_key
                }
        
        # Create record data
        record_data = {
            "record_id": record_id,
            "user_id": user_id,
            "call_type": call_type,
            "call_date": call_date,
            "notes": notes,
            "created_at": datetime.now().isoformat(),
            "file": file_info
        }
        
        # Save to JSON file
        records_file = os.path.join(call_records_folder, "call_records.json")
        
        # Load existing records
        existing_records = []
        if os.path.exists(records_file):
            with open(records_file, 'r') as f:
                try:
                    existing_records = json.load(f)
                except:
                    existing_records = []
        
        # Add new record
        existing_records.append(record_data)
        
        # Atomic save — prevents JSON corruption if the process dies mid-write
        import tempfile as _tf
        _dir = os.path.dirname(records_file)
        _fd, _tmp = _tf.mkstemp(dir=_dir, suffix=".tmp")
        try:
            with os.fdopen(_fd, "w") as _f:
                json.dump(existing_records, _f, indent=2)
            os.replace(_tmp, records_file)
        except Exception:
            try:
                os.unlink(_tmp)
            except OSError:
                pass
            raise
        
        # Upload JSON to S3
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            s3_key = f"{place}/{user_id}/call_records/call_records.json"
        else:
            s3_key = f"{current_session.login_place}/{user_id}/call_records/call_records.json"
        
        try:
            command = [
                "aws", "s3", "cp",
                records_file,
                f"s3://{Config.BUCKET_NAME}/{s3_key}"
            ]
            subprocess.run(command, capture_output=True, text=True)
        except Exception as s3_error:
            print(f"S3 upload error: {s3_error}")
        
        # Log call
        try:
            from routes.auth import log_call
            log_call(user_id, call_type, current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log call: {e}")
        
        return jsonify({
            "status": "success",
            "message": "Call record saved successfully",
            "record": record_data
        }), 200
        
    except Exception as e:
        print(f"Error saving call record: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route('/get_call_records/<user_id>', methods=['GET'])
def get_call_records(user_id):
    """Get all call records for a user."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        # Determine file path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            records_file = os.path.join(Config.META_DATA_PATH, place, user_id, "call_records", "call_records.json")
        else:
            records_file = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id, "call_records", "call_records.json")
        
        if not os.path.exists(records_file):
            return jsonify({
                "status": "success",
                "has_records": False,
                "records": []
            })
        
        with open(records_file, 'r') as f:
            records = json.load(f)
        
        return jsonify({
            "status": "success",
            "has_records": len(records) > 0,
            "records": records
        })
        
    except Exception as e:
        print(f"Error getting call records: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route('/download_file/<user_id>/<filename>', methods=['GET'])
def download_file(user_id, filename):
    """Download a call log file."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        # Path traversal guard — reject filenames containing directory separators
        if os.sep in filename or "/" in filename or ".." in filename:
            return jsonify({"error": "Invalid filename"}), 400

        # Determine file path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            file_path = os.path.join(Config.META_DATA_PATH, place, user_id, "call_records", filename)
        else:
            file_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_id, "call_records", filename)

        # Guard against path traversal attacks
        safe_base = os.path.realpath(os.path.join(Config.META_DATA_PATH))
        real_path = os.path.realpath(file_path)
        if not real_path.startswith(safe_base + os.sep):
            return jsonify({"error": "Invalid file path"}), 400

        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"Error downloading file: {e}")
        return jsonify({"error": str(e)}), 500