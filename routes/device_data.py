from flask import Blueprint, request, jsonify
import os
from datetime import datetime
from config import Config
from models.user import current_session
from utils.file_handlers import FileHandler
from utils.s3_operations import S3Operations

bp = Blueprint('device_data', __name__)

@bp.route('/get_user_data', methods=['POST'])
def get_user_data():
    user_name = request.form.get('Name')
    device_name = request.form.get('devicename')
    
    if not user_name or not device_name:
        return jsonify({"status": "error", "message": "Name or device name parameter is missing"}), 400
    
    # Determine file path based on user type
    if current_session.is_admin():
        place = current_session.place_info.get(user_name, current_session.login_place)
        file_path = os.path.join(Config.META_DATA_PATH, place, user_name, device_name, Config.CONFIG_DATA)
    else:
        pfile_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_name, "Pluto", Config.CONFIG_DATA)
        mfile_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, user_name, "Mars", Config.CONFIG_DATA)
    
    if not os.path.exists(pfile_path):
        return jsonify({"status": "error", "message": "CSV file not found"}), 404
    if not os.path.exists(mfile_path):
        return jsonify({"status": "error", "message": "CSV file not found"}), 404
    
    try:
        pheader, plast_row = FileHandler.read_csv_data(pfile_path)
        mheader, mlast_row = FileHandler.read_csv_data(mfile_path)

        if pheader and plast_row and mheader and mlast_row:
            return jsonify({
                "status": "success",
                "message": f"Data received for user {user_name}",
                "data": {
                    "pheader": pheader,
                    "plast_row": plast_row,
                    "mheader": mheader,
                    "mlast_row": mlast_row
                }
            }), 200
        else:
            return jsonify({"status": "error", "message": "Failed to read CSV data"}), 500
    except Exception as e:
        print(f"Error processing CSV file: {e}")
        return jsonify({"status": "error", "message": "Failed to process CSV file"}), 500

@bp.route('/get_last_modified', methods=['POST'])
def get_last_modified():
    user_name = request.form.get('Name')
    device_name = request.form.get('devicename')
    
    if not user_name or not device_name:
        return jsonify({"status": "error", "message": "Name or device name parameter is missing"}), 400
    
    # Determine S3 key
    if current_session.is_admin():
        place = current_session.place_info.get(user_name, current_session.login_place)
        s3_key = f"{place}/{user_name}/{device_name}/{Config.CONFIG_DATA}"
    else:
        s3_key = f"{current_session.login_place}/{user_name}/{device_name}/{Config.CONFIG_DATA}"
    
    last_modified = S3Operations.get_last_modified(s3_key)
    
    if last_modified:
        return jsonify({
            "status": "success",
            "last_modified": last_modified
        }), 200
    else:
        return jsonify({
            "status": "error",
            "message": "Failed to fetch last modified timestamp"
        }), 500

@bp.route('/get_last_modified_Actilife', methods=['POST'])
def get_last_modified_actilife():
    user_name = request.form.get('Name')
    use_hand = request.form.get('Hand')
    
    if not user_name or not use_hand:
        return jsonify({"status": "error", "message": "Parameters missing"}), 400
    
    # Determine S3 prefix
    if current_session.is_admin():
        place = current_session.place_info.get(user_name, current_session.login_place)
        s3_prefix = f"{place}/{user_name}/{Config.ACTILIFE_LABEL}"
    else:
        s3_prefix = f"{current_session.login_place}/{user_name}/{Config.ACTILIFE_LABEL}"
    
    last_modified = S3Operations.get_last_modified_actilife(s3_prefix, use_hand)
    
    if last_modified:
        return jsonify({
            "status": "success",
            "useHand": use_hand,
            "last_modified": last_modified
        }), 200
    else:
        return jsonify({
            "status": "error",
            "message": "No data found"
        }), 200