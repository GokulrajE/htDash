from flask import Blueprint, request, jsonify, render_template, redirect, url_for, session as flask_session
from utils.data_access import (
    get_patients_for_user, derive_status, get_hospital_folder,
    read_patient_meta, write_patient_meta, create_patient_folders, generate_homer_id,
    create_patient_log, write_patient_log,
)
import os
import csv
import json
import shutil
from datetime import datetime, timedelta
from config import Config
from models.user import current_session
from utils.file_handlers import FileHandler
from utils.file_handlers import FileHandler as FH
from utils.s3_operations import S3Operations
from utils.data_processors import DataProcessor
import uuid


bp = Blueprint("user_management", __name__)


# ── URL-routed patients page ───────────────────────────────────────────────────

@bp.route('/patients', methods=['GET'])
def patients_page():
    if not flask_session.get('login_place'):
        return redirect(url_for('login'))
    return render_template('patients.html', active_page='patients')


@bp.route('/api/patients', methods=['GET'])
def api_patients_list():
    if not flask_session.get('login_place'):
        return jsonify({'error': 'Not authenticated'}), 401
    patients = get_patients_for_user(flask_session['login_place'])
    return jsonify([{**p, 'status': derive_status(p)} for p in patients])


@bp.route('/api/patients', methods=['POST'])
def api_create_patient():
    if not flask_session.get('login_place'):
        return jsonify({'error': 'Not authenticated'}), 401
    if flask_session.get('privilege') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json() or {}
    hospital_id   = (data.get('hospitalID') or '').strip()
    training_side = (data.get('trainingSide') or '').strip()
    folder = get_hospital_folder(flask_session['login_place'])
    if not folder:
        return jsonify({'error': 'Cannot determine hospital folder'}), 400
    homer_id = generate_homer_id(folder)
    patient_data = {
        'homerID':                homer_id,
        'hospitalID':             hospital_id or None,
        'group':                  None,
        'trainingSide':           training_side or None,
        'enrollDate':             datetime.now().strftime('%Y-%m-%dT%H:%M'),
        'activationDate':         None,
        'discontinuationDate':    None,
        'trainingCompletionDate': None,
        'a0CompletionDate':       None,
        'a1CompletionDate':       None,
        'a2CompletionDate':       None,
    }
    write_patient_meta(folder, homer_id, patient_data)
    create_patient_folders(folder, homer_id, 'unassigned')
    create_patient_log(folder, homer_id)
    write_patient_log(
        folder, homer_id,
        flask_session.get('loginid', 'unknown'),
        flask_session.get('session_id', 0),
        f'Created new patient : {homer_id}.json'
    )
    return jsonify({'status': 'success', 'homerID': homer_id}), 201


@bp.route('/api/patients/<homer_id>/group', methods=['POST'])
def api_assign_group(homer_id):
    if not flask_session.get('login_place'):
        return jsonify({'error': 'Not authenticated'}), 401
    if flask_session.get('privilege') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403

    data   = request.get_json() or {}
    group  = (data.get('group') or '').strip().lower()
    a0_date = (data.get('a0CompletionDate') or '').strip()
    if group not in ('experimental', 'control'):
        return jsonify({'error': 'group must be "experimental" or "control"'}), 400
    if not a0_date:
        return jsonify({'error': 'a0CompletionDate is required'}), 400
    try:
        from datetime import datetime as dt
        if dt.strptime(a0_date, '%Y-%m-%dT%H:%M') > dt.now():
            return jsonify({'error': 'a0CompletionDate cannot be in the future'}), 400
    except ValueError:
        return jsonify({'error': 'a0CompletionDate format must be YYYY-MM-DDTHH:MM'}), 400

    folder = get_hospital_folder(flask_session['login_place'])
    if not folder:
        return jsonify({'error': 'Cannot determine hospital folder'}), 400

    patient = read_patient_meta(folder, homer_id)
    if not patient:
        return jsonify({'error': 'Patient not found'}), 404
    if patient.get('group'):
        return jsonify({'error': 'Patient is already assigned to a group'}), 409

    patient['group']            = group
    patient['a0CompletionDate'] = a0_date
    write_patient_meta(folder, homer_id, patient)
    create_patient_folders(folder, homer_id, group)

    try:
        write_patient_log(
            folder, homer_id,
            flask_session.get('loginid', 'unknown'),
            flask_session.get('session_id', 0),
            f'Assigned group to {group}'
        )
    except Exception as e:
        print(f'Warning: could not write patient log: {e}')

    return jsonify({'status': 'success', 'homerID': homer_id, 'group': group})


@bp.route('/api/patients/<homer_id>/discontinue', methods=['POST'])
def api_discontinue_patient(homer_id):
    if not flask_session.get('login_place'):
        return jsonify({'error': 'Not authenticated'}), 401
    if flask_session.get('privilege') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403

    folder = get_hospital_folder(flask_session['login_place'])
    if not folder:
        return jsonify({'error': 'Cannot determine hospital folder'}), 400

    patient = read_patient_meta(folder, homer_id)
    if not patient:
        return jsonify({'error': 'Patient not found'}), 404
    if patient.get('discontinuationDate'):
        return jsonify({'error': 'Patient is already discontinued'}), 409

    data   = request.get_json() or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'A reason is required'}), 400

    now = datetime.now().strftime('%Y-%m-%dT%H:%M')
    patient['discontinuationDate'] = now
    write_patient_meta(folder, homer_id, patient)

    # Write prediscontinuation.json to timeline/
    try:
        from utils.data_access import get_patients_path
        import json
        timeline_dir = get_patients_path(folder) / homer_id / 'timeline'
        timeline_dir.mkdir(parents=True, exist_ok=True)
        predc_data = {
            'homerID':   homer_id,
            'datetime':  now,
            'user':      flask_session.get('loginid', 'unknown'),
            'reason':    reason,
        }
        (timeline_dir / 'prediscontinuation.json').write_text(
            json.dumps(predc_data, indent=2)
        )
    except Exception as e:
        print(f'Warning: could not write prediscontinuation.json: {e}')

    try:
        write_patient_log(
            folder, homer_id,
            flask_session.get('loginid', 'unknown'),
            flask_session.get('session_id', 0),
            'Pre-discontinued patient : prediscontinuation.json'
        )
    except Exception as e:
        print(f'Warning: could not write patient log: {e}')

    return jsonify({'status': 'success', 'homerID': homer_id})


# ──────────────────────────────────────────────────────────────────────────────

def _auto_activate_experimental_patient(homer_id, place, device_name=None):
    """Auto-activate experimental patient if not already activated.
    Called when new configdata.csv is uploaded or first data is received.
    Returns True if patient was activated, False otherwise."""
    try:
        # Load patient data
        patient_data = FileHandler.load_homer_id_details(place)
        
        # Find the patient
        patient = None
        for user in patient_data.get("details", []):
            if user.get("homerID") == homer_id:
                patient = user
                break
        
        if not patient:
            print(f"DEBUG: Auto-activation: Patient {homer_id} not found")
            return False
        
        # Check if already activated (experimental patients need both pluto and mars active)
        if patient.get("group") != "experimental":
            print(f"DEBUG: Auto-activation: Patient {homer_id} is not experimental group")
            return False
        
        current_status = patient.get("status", {})
        if isinstance(current_status, dict):
            pluto_active = current_status.get("pluto") == "active"
            mars_active = current_status.get("mars") == "active"
            if pluto_active and mars_active:
                print(f"DEBUG: Auto-activation: Patient {homer_id} already fully activated")
                return False
        
        # Check if configdata.csv exists and has StartDate
        config_path = None
        for device in ["Pluto", "Mars", "pluto", "mars"]:
            test_path = os.path.join(Config.META_DATA_PATH, place, homer_id, device, "configdata.csv")
            if os.path.exists(test_path):
                config_path = test_path
                break
        
        if not config_path:
            print(f"DEBUG: Auto-activation: No configdata.csv found for {homer_id}")
            return False
        
        # Read StartDate from config
        activation_date = None
        with open(config_path, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            if rows and rows[0].get("StartDate"):
                start_date_str = rows[0].get("StartDate")
                try:
                    activation_date = datetime.strptime(start_date_str, "%d-%m-%Y")
                    print(f"DEBUG: Auto-activation: Found StartDate in config: {activation_date}")
                except ValueError as e:
                    print(f"DEBUG: Auto-activation: Could not parse date {start_date_str}: {e}")
                    activation_date = datetime.now()
        
        if not activation_date:
            activation_date = datetime.now()
        
        # Activate the patient - set both pluto and mars as active
        if not isinstance(patient.get("status"), dict):
            patient["status"] = {"pluto": "not_activated", "mars": "not_activated"}
        
        # Activate based on device or both
        if device_name:
            device_lower = device_name.lower() if isinstance(device_name, str) else ""
            if "pluto" in device_lower:
                patient["status"]["pluto"] = "active"
            elif "mars" in device_lower:
                patient["status"]["mars"] = "active"
            else:
                patient["status"]["pluto"] = "active"
                patient["status"]["mars"] = "active"
        else:
            # No device specified - activate both
            patient["status"]["pluto"] = "active"
            patient["status"]["mars"] = "active"
        
        # Set activation date if not already set
        if not patient.get("activation_date"):
            patient["activation_date"] = activation_date.strftime("%Y-%m-%d")
        
        # Generate timeline if not already generated
        if not patient.get("timeline_generated"):
            try:
                from routes.patient_events import generate_study_events, load_events, save_events
                events = generate_study_events(homer_id, activation_date, "experimental")
                all_events = load_events(place)
                all_events[homer_id] = events
                save_events(all_events, place)
                patient["timeline_generated"] = True
                print(f"DEBUG: Auto-activation: Generated timeline for {homer_id}")
            except Exception as te:
                print(f"Warning: Could not generate timeline for {homer_id}: {te}")
        
        # Save updated patient data
        FileHandler.save_homer_id_details(place, patient_data)
        print(f"DEBUG: Auto-activation: Successfully activated {homer_id}")
        return True
        
    except Exception as e:
        print(f"Error in auto-activate experimental patient {homer_id}: {e}")
        return False


def _resolve_place(homer_id):
    """Return the site folder that owns homer_id.
    For admin users, checks session.place_info (populated by get_userId).
    Falls back to scanning all META-DATA sub-folders.
    For site users, returns login_place directly."""
    import os
    if current_session.is_admin():
        # place_info is filled in by get_userId on every page load
        cached = current_session.place_info.get(homer_id)
        if cached:
            return cached
        # Fallback: scan folders
        for place in os.listdir(Config.META_DATA_PATH):
            place_path = os.path.join(Config.META_DATA_PATH, place)
            if not os.path.isdir(place_path):
                continue
            details = FileHandler.load_homer_id_details(place)
            for d in details.get("details", []):
                if d.get("homerID") == homer_id:
                    return place
        return current_session.login_place  # last resort
    return current_session.login_place


@bp.route("/create_homer_id", methods=["POST"])
def create_homer_id():
    data = request.get_json()
    hospital_id = data.get("hospitalId")
    training_side = data.get("trainingSide")
    group = data.get("group")

    if not current_session.login_place:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    homer_id = FileHandler.add_new_homer_id(
        current_session.login_place, hospital_id, training_side, group
    )

    # Log patient creation
    try:
        from routes.auth import log_patient_created
        log_patient_created(homer_id, training_side, current_session.login_place)
    except Exception as e:
        print(f"Warning: Could not log patient creation: {e}")

    # Upload the updated homerIdDetails.json to AWS
    try:
        details_path = os.path.join(
            Config.META_DATA_PATH, current_session.login_place, "homerIdDetails.json"
        )
        s3_key = f"{current_session.login_place}/homerIdDetails.json"
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(details_path), exist_ok=True)
        
        # Upload to AWS
        upload_success = S3Operations.upload_to_s3(details_path, s3_key)
        if upload_success:
            print(f"DEBUG: Uploaded homerIdDetails.json to S3 for {current_session.login_place}")
        else:
            print(f"WARNING: Failed to upload homerIdDetails.json to S3")
    except Exception as upload_err:
        print(f"ERROR: Could not upload to AWS: {upload_err}")

    return jsonify(
        {
            "status": "success",
            "message": "User registered successfully",
            "homer_id": homer_id,
        }
    ), 200


# In routes/user_management.py - Update the get_hospital_ids function


@bp.route("/get_userId", methods=["POST"])
def get_hospital_ids():
    device_name = request.form.get("search_term", "Pluto")
    current_session.device_name = device_name

    # Always derive login_place from LOGIN_CREDENTIALS using the loginId sent by frontend
    login_id = request.form.get("LoginId", "")
    user_data = Config.LOGIN_CREDENTIALS.get(login_id) if login_id else None

    if user_data:
        current_session.login_place = user_data.get("place")
        current_session.privilege = user_data.get("privilege", "user")

    # login_place must be a real place at this point
    if not current_session.login_place:
        return jsonify({"hospital_info": []}), 200

    hospital_info = []
    local_hospital_ids = set()
    _local_place_info = {}  # collected here, written to session once at end

    # First, load homerIdDetails.json to get status for all users
    # Only the global lab admin sees all centres; site admins see their own place only
    homer_details = {}
    if not current_session.is_admin():
        if current_session.login_place:
            homer_data = FileHandler.load_homer_id_details(current_session.login_place)
            for user in homer_data.get("details", []):
                homer_details[user.get("homerID")] = {
                    "group": user.get("group"),
                    "status": user.get("status", {}),
                    "trainingSide": user.get("trainingSide"),
                }
    else:
        # For admin, load from all places
        if os.path.exists(Config.META_DATA_PATH):
            for place in os.listdir(Config.META_DATA_PATH):
                place_path = os.path.join(Config.META_DATA_PATH, place)
                if os.path.isdir(place_path):
                    homer_data = FileHandler.load_homer_id_details(place)
                    for user in homer_data.get("details", []):
                        user_id = user.get("homerID")
                        homer_details[user_id] = {
                            "group": user.get("group"),
                            "status": user.get("status", {}),
                            "trainingSide": user.get("trainingSide"),
                            "place": place,
                        }

    def read_csv_file(
        path,
        default_status,
        deviceName,
        role_value=None,
        place=None,
    ):
        try:
            with open(path, mode="r", encoding="utf-8") as file:
                csv_reader = csv.DictReader(file)
                for row in csv_reader:
                    hospital_id = row.get("HospitalID") or row.get(
                        "HomerID"
                    )  # Support both headers
                    if not hospital_id:
                        continue

                    role = role_value
                    place_to_check = place if place else current_session.login_place

                    if role == "experimental":
                        # Do NOT auto-activate here — activation should only happen
                        # when cloud data is confirmed uploaded (via activate_experimental_patient route)
                        # or via the manual activate button in the UI.
                        pass

                    if place:
                        _local_place_info[hospital_id] = place
                    local_hospital_ids.add(hospital_id)
        except Exception as e:
            print(f"Error reading CSV: {e}")

    # Helper function to update status in homerDetails.json
    def update_user_status(place, homer_id, new_status, device_name):
        try:
            data = FileHandler.load_homer_id_details(place)
            user_updated = False

            for user in data.get("details", []):
                if user.get("homerID") == homer_id:
                    current_status = user.get("status")

                    print(
                        f"🔵 Updating {homer_id} - Current status type: {type(current_status)}, Current status: {current_status}"
                    )
                    print(f"🔵 Device: {device_name}, New status: {new_status}")

                    # If status is dictionary (multiple device values for experimental)
                    if isinstance(current_status, dict):
                        user["status"][device_name.lower()] = new_status
                        print(
                            f"✅ Updated dict status for {device_name}: {user['status']}"
                        )
                    # If status is single value (string for control)
                    elif isinstance(current_status, str):
                        user["status"] = new_status
                        print(f"✅ Updated string status: {user['status']}")
                    # If status doesn't exist, create it (for experimental users)
                    elif current_status is None:
                        # For experimental users, create dict; for control, create string
                        if device_name and device_name.lower() in ["pluto", "mars"]:
                            user["status"] = {device_name.lower(): new_status}
                            print(f"✅ Created new dict status: {user['status']}")
                        else:
                            user["status"] = new_status
                            print(f"✅ Created new string status: {user['status']}")

                    user_updated = True
                    break

            # Save updated data to file
            if user_updated:
                FileHandler.save_homer_id_details(place, data)
                print(f"✅ Saved homerDetails.json for {place}")
            else:
                print(f"❌ User {homer_id} not found in {place}")

            # Update in-memory dictionary to reflect the change (with error handling)
            if homer_id in homer_details:
                try:
                    current_in_memory = homer_details[homer_id]["status"]
                    if isinstance(current_in_memory, dict):
                        homer_details[homer_id]["status"][device_name.lower()] = (
                            new_status
                        )
                    else:
                        homer_details[homer_id]["status"] = new_status
                    print(f"✅ In-memory status updated for {homer_id}")
                except Exception as e:
                    print(f"⚠️ Could not update in-memory status: {e}")

        except Exception as e:
            print(f"❌ Error updating status: {e}")
            import traceback

            traceback.print_exc()

    if current_session.is_admin():
        # Admin view - check all places
        if os.path.exists(Config.META_DATA_PATH):
            for place in os.listdir(Config.META_DATA_PATH):
                place_path = os.path.join(Config.META_DATA_PATH, place)
                if os.path.isdir(place_path):
                    exp_csv = os.path.join(
                        place_path, f"{device_name.lower()}UserDetails.csv"
                    )
                    ctrl_csv = os.path.join(place_path, Config.CONTROL_USER_DETAILS)
                    if os.path.exists(exp_csv):
                        read_csv_file(
                            exp_csv,
                            default_status="",
                            deviceName=device_name.lower(),
                            role_value="experimental",
                            place=place,
                        )
                    if os.path.exists(ctrl_csv):
                        read_csv_file(
                            ctrl_csv,
                            default_status="",
                            deviceName="",
                            role_value="control",
                            place=place,
                        )

        # Deactivate users not in any CSV files (admin view)
        # Guard: only run deactivation if we actually read some CSV data.
        # If all CSV files are temporarily missing, local_hospital_ids will be empty
        # and we must NOT wipe every patient's activation status.
        if local_hospital_ids and os.path.exists(Config.META_DATA_PATH):
            for place in os.listdir(Config.META_DATA_PATH):
                place_path = os.path.join(Config.META_DATA_PATH, place)
                if os.path.isdir(place_path):
                    data = FileHandler.load_homer_id_details(place)
                    for user in data.get("details", []):
                        user_id = user.get("homerID")
                        if user_id and user_id not in local_hospital_ids:
                            if (
                                user.get("status") == "active"
                                and user.get("group") == "experimental"
                            ):
                                print(
                                    f"Deactivating user {user_id} - not found in CSV files"
                                )
                                update_user_status(place, user_id, "not_activated", device_name)
                                user["status"] = "not_activated"
    else:
        # Regular user view
        place_path = os.path.join(Config.META_DATA_PATH, current_session.login_place)
        pexp_csv = os.path.join(place_path, f"plutoUserDetails.csv")
        mexp_csv = os.path.join(place_path, f"marsUserDetails.csv")
        ctrl_csv = os.path.join(place_path, Config.CONTROL_USER_DETAILS)

        if os.path.exists(pexp_csv):
            read_csv_file(
                pexp_csv,
                default_status="",
                deviceName="pluto",
                role_value="experimental",
            )
        if os.path.exists(mexp_csv):
            read_csv_file(
                mexp_csv,
                default_status="",
                deviceName="mars",
                role_value="experimental",
            )
        if os.path.exists(ctrl_csv):
            read_csv_file(
                ctrl_csv, default_status="", deviceName="", role_value="control"
            )

    # Deactivate users who are active but NOT in any CSV files (for non-admin only)
    # Guard: skip if no CSV data was loaded — prevents wiping all patients on CSV read failure.
    if not current_session.is_admin() and local_hospital_ids:
        place = current_session.login_place
        data = FileHandler.load_homer_id_details(place)
        for user in data.get("details", []):
            user_id = user.get("homerID")
            if user_id and user_id not in local_hospital_ids:
                if (
                    user.get("status") == "active"
                    and user.get("group") == "experimental"
                ):
                    print(f"Deactivating user {user_id} - not found in CSV files")
                    update_user_status(place, user_id, "not_activated", device_name)
                    user["status"] = "not_activated"

    # Build hospital_info from homerIdDetails for current place
    # For admin, iterate all places since they can see everyone
    if current_session.is_admin():
        if os.path.exists(Config.META_DATA_PATH):
            for place in os.listdir(Config.META_DATA_PATH):
                place_path = os.path.join(Config.META_DATA_PATH, place)
                if os.path.isdir(place_path):
                    place_data = FileHandler.load_homer_id_details(place)
                    for item in place_data.get("details", []):
                        homer_id = item.get("homerID")
                        if homer_id:
                            _local_place_info[homer_id] = place  # ← needed for save routes
                        hospital_info.append({
                            "HospitalID": homer_id,
                            "Status": item.get("status", {}),
                            "role": item.get("group"),
                            "trainingSide": item.get("trainingSide"),
                            "activated": item.get("activated", False),
                            "vcgType": item.get("vcg_type") or item.get("vcgType"),
                            "place": place,
                            "discontinued": item.get("discontinued", False),
                            "studyPaused": item.get("studyPaused", False),
                            "pausedAt": item.get("pausedAt", None),
                            "resumedAt": item.get("resumedAt", None),
                            "activationDate": item.get("activation_date", None),
                            "discontinueReason": item.get("discontinueReason", ""),
                            "discontinueDate": item.get("discontinueDate", ""),
                        })
    else:
        data = FileHandler.load_homer_id_details(current_session.login_place)
        for item in data.get("details", []):
            hospital_info.append({
                "HospitalID": item.get("homerID"),
                "Status": item.get("status", {}),
                "role": item.get("group"),
                "trainingSide": item.get("trainingSide"),
                "activated": item.get("activated", False),
                "vcgType": item.get("vcg_type") or item.get("vcgType"),
                "discontinued": item.get("discontinued", False),
                "studyPaused": item.get("studyPaused", False),
                "pausedAt": item.get("pausedAt", None),
                "resumedAt": item.get("resumedAt", None),
                "activationDate": item.get("activation_date", None),
                "discontinueReason": item.get("discontinueReason", ""),
                "discontinueDate": item.get("discontinueDate", ""),
            })

    # Flush place_info to session once (avoids Flask not detecting nested dict mutations)
    if _local_place_info:
        current_session.set_place_info(_local_place_info)

    return jsonify({"hospital_info": hospital_info})



@bp.route("/trackrecord/<homer_id>", methods=["GET"])
def get_track_record(homer_id):
    """Get track record for a specific homer ID"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    place = _resolve_place(homer_id)
    data = FileHandler.load_homer_id_details(place)

    for user in data.get("details", []):
        if user.get("homerID") == homer_id:
            return jsonify(
                {"homerID": homer_id, "trackRecord": user.get("trackRecord", [])}
            )

    return jsonify({"error": "HomerID not found"}), 404


@bp.route("/update-trackrecord", methods=["POST"])
def update_track_record():
    """Update track record for a homer ID"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    payload = request.json
    homer_id = payload.get("homerID")
    updated_record = payload.get("trackRecord")

    if not homer_id or updated_record is None:
        return jsonify({"error": "Missing homerID or trackRecord"}), 400

    place = _resolve_place(homer_id)
    data = FileHandler.load_homer_id_details(place)

    user_found = False
    for user in data.get("details", []):
        if user.get("homerID") == homer_id:
            user["trackRecord"] = updated_record  # Store as list
            user_found = True
            break

    if not user_found:
        return jsonify({"error": "HomerID not found"}), 404

    FileHandler.save_homer_id_details(place, data)
    return jsonify({"success": True})


@bp.route("/add-swap-watch", methods=["POST"])
def add_swap_watch_record():
    """Add swap watch record for a homer ID"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    payload = request.json
    homer_id = payload.get("homerID")
    swap_watch_record = payload.get("swapWatchRecord")

    if not homer_id or swap_watch_record is None:
        return jsonify({"error": "Missing homerID or swapWatchRecord"}), 400

    place = _resolve_place(homer_id)
    data = FileHandler.load_homer_id_details(place)

    user_found = False
    for user in data.get("details", []):
        if user.get("homerID") == homer_id:
            if "swapWatchRecords" not in user:
                user["swapWatchRecords"] = []
            user["swapWatchRecords"].append(swap_watch_record)
            user_found = True
            break

    if not user_found:
        return jsonify({"error": "HomerID not found"}), 404

    FileHandler.save_homer_id_details(place, data)
    return jsonify({"success": True, "message": "Swap watch record added successfully"})


@bp.route("/swap-watch-records/<homer_id>", methods=["GET"])
def get_swap_watch_records(homer_id):
    """Get swap watch records for a homer ID"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    place = _resolve_place(homer_id)
    data = FileHandler.load_homer_id_details(place)

    for user in data.get("details", []):
        if user.get("homerID") == homer_id:
            return jsonify({"swapWatchRecords": user.get("swapWatchRecords", [])})

    return jsonify({"error": "HomerID not found"}), 404


@bp.route("/get-config-dates/<homer_id>", methods=["GET"])
def get_config_dates(homer_id):
    """Get startDate, endDate and group from homerIdDetails.json or device-specific configdata.csv"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        from flask import request

        # Get the current device from query parameter
        current_device = request.args.get(
            "device", "Pluto"
        )  # Default to Pluto if not specified
        print(f"DEBUG: Getting dates for {homer_id}, current device: {current_device}")

        start_date = None
        end_date = None
        group = None
        found_source = None

        # FIRST: Always check homerIdDetails.json to determine group
        homer_details_path = os.path.join(
            Config.META_DATA_PATH, current_session.login_place, "homerIdDetails.json"
        )
        user_group = None

        if os.path.exists(homer_details_path):
            try:
                with open(homer_details_path, "r") as f:
                    data = json.load(f)
                    for user in data.get("details", []):
                        if user.get("homerID") == homer_id:
                            user_group = user.get("group")
                            group = user_group

                            # For CONTROL group: Always get from homerIdDetails.json
                            if user_group == "control":
                                # Try both possible field names for dates
                                start_date = user.get("startDate") or user.get(
                                    "activation_date"
                                )
                                end_date = user.get("endDate") or user.get("end_date")
                                if start_date and end_date:
                                    found_source = "homerIdDetails.json (control group)"
                                    print(
                                        f"DEBUG: Control group - Found dates in homerIdDetails.json: {start_date} - {end_date}"
                                    )
                            break
            except Exception as e:
                print(f"DEBUG: Error reading homerIdDetails.json: {e}")

        # For EXPERIMENTAL group: Get from device-specific configdata.csv
        if not found_source and user_group == "experimental":
            print(
                f"DEBUG: Experimental group - Looking for {current_device}/configdata.csv"
            )
            base_path = os.path.join(
                Config.META_DATA_PATH, current_session.login_place, homer_id
            )

            # Build path for the specific device
            device_config = os.path.join(base_path, current_device, "configdata.csv")
            print(
                f"DEBUG: Checking device config: {device_config} - Exists: {os.path.exists(device_config)}"
            )

            if os.path.exists(device_config):
                try:
                    with open(device_config, "r") as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                        if rows:
                            first_row = rows[0]
                            last_row = rows[-1]
                            start_date = first_row.get("StartDate")
                            end_date = last_row.get("EndDate")
                            found_source = (
                                f"{current_device}/configdata.csv (experimental group)"
                            )
                            print(
                                f"DEBUG: Found dates in {current_device}: {start_date} - {end_date}"
                            )
                except Exception as e:
                    print(f"DEBUG: Error reading {current_device} config: {e}")
            else:
                # Fallback: If device config not found for experimental group, try others
                print(
                    f"DEBUG: {current_device} config not found, checking other devices..."
                )
                base_path = os.path.join(
                    Config.META_DATA_PATH, current_session.login_place, homer_id
                )

                for device in ["Pluto", "Mars", "actilife"]:
                    if device == current_device:
                        continue  # Already checked this

                    device_config = os.path.join(base_path, device, "configdata.csv")
                    print(
                        f"DEBUG: Checking fallback device {device}: {device_config} - Exists: {os.path.exists(device_config)}"
                    )

                    if os.path.exists(device_config):
                        try:
                            with open(device_config, "r") as f:
                                reader = csv.DictReader(f)
                                rows = list(reader)
                                if rows:
                                    first_row = rows[0]
                                    last_row = rows[-1]
                                    start_date = first_row.get("StartDate")
                                    end_date = last_row.get("EndDate")
                                    found_source = f"{device}/configdata.csv (fallback)"
                                    print(
                                        f"DEBUG: Found dates in {device}: {start_date} - {end_date}"
                                    )
                                    break
                        except Exception as e:
                            print(f"DEBUG: Error reading {device} config: {e}")

        if not start_date or not end_date:
            error_msg = f"Config dates not found for {homer_id} (group: {user_group}, device: {current_device})"
            print(f"DEBUG: {error_msg}")
            return jsonify({"error": error_msg}), 404

        print(f"DEBUG: Successfully found dates from {found_source}")
        return jsonify(
            {
                "startDate": start_date,
                "endDate": end_date,
                "group": group or "unknown",
                "source": found_source,
            }
        )

    except Exception as e:
        error_msg = f"Exception in get_config_dates: {str(e)}"
        print(f"DEBUG: {error_msg}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": error_msg}), 500


@bp.route("/assign_group_user", methods=["POST"])
def assign_group_for_user():
    """Assign group to a user (experimental/control)"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        request_data = request.get_json()
        homer_id = request_data.get("userID")
        group = request_data.get("selectedGroup")

        if not homer_id or not group:
            return jsonify(
                {"status": "error", "message": "Missing userID or group"}
            ), 400

        # Load user data
        data = FileHandler.load_homer_id_details(current_session.login_place)

        # Find user and get training side
        trainingside = None
        for user in data.get("details", []):
            if user.get("homerID") == homer_id:
                trainingside = user.get("trainingSide")
                break

        if not trainingside:
            return jsonify({"status": "error", "message": "User not found"}), 404

        startdate = ""
        enddate = ""
        location = current_session.login_place

        if group == "experimental":
            # Create rows for Pluto and Mars
            header_pluto = Config.PLUTO_CONFIG_HEADER
            mech_values_pluto = [0, 0, 0, 0, 0, 0]  # 6 values for Pluto
            row_pluto = (
                [homer_id, startdate, enddate, 0]
                + mech_values_pluto
                + [trainingside, location, group, 0, 0]
            )

            header_mars = Config.MARS_CONFIG_HEADER
            mech_values_mars = [0, 0, 0]  # 3 values for Mars
            row_mars = (
                [homer_id, startdate, enddate, 0]
                + mech_values_mars
                + ["150", "250", trainingside, location, group]
            )

            # Create directories and write files
            local_folder_path = os.path.join(
                Config.META_DATA_PATH, current_session.login_place, homer_id
            )

            for device, header, row in [
                ("Pluto", header_pluto, row_pluto),
                ("Mars", header_mars, row_mars),
            ]:
                file_path = os.path.join(local_folder_path, device, Config.CONFIG_DATA)
                try:
                    FileHandler.write_csv_data(file_path, row, header)
                    # Upload to S3 (non-blocking - local data saved regardless)
                    s3_key = f"{current_session.login_place}/{homer_id}/{device}/{Config.CONFIG_DATA}"
                    S3Operations.upload_to_s3(file_path, s3_key)
                    # Update user record in homerIdDetails after writing CSV
                    if device == "Mars":  # Only update JSON once, after both devices processed
                        for user in data["details"]:
                            if user["homerID"] == homer_id:
                                user["group"] = group
                                user["status"] = {
                                    "pluto": "not_activated",
                                    "mars": "not_activated",
                                }
                                if "trackRecord" not in user:
                                    user["trackRecord"] = []
                                user["trackRecord"] = Config.exprTrackRecord
                                FH.save_homer_id_details(
                                    current_session.login_place, data
                                )
                                break

                except Exception as e:
                    # Cleanup on error
                    if os.path.exists(local_folder_path):
                        FileHandler.cleanup_user_folder(
                            local_folder_path, device, Config.CONFIG_DATA
                        )
                    return jsonify(
                        {"status": "error", "message": f"Failed for {device}: {str(e)}"}
                    ), 500

        else:  # Control group
            device = Config.ACTILIFE_LABEL
            row = [homer_id, startdate, enddate, location, group]
            header = Config.ACTILIFE_CONFIG_HEADER

            local_folder_path = os.path.join(
                Config.META_DATA_PATH, current_session.login_place, homer_id
            )
            file_path = os.path.join(local_folder_path, device, Config.CONFIG_DATA)

            try:
                FileHandler.write_csv_data(file_path, row, header)
                # Upload to S3
                s3_key = f"{current_session.login_place}/{homer_id}/{device}/{Config.CONFIG_DATA}"
                if not S3Operations.upload_to_s3(file_path, s3_key):
                    raise Exception("S3 upload failed")
                else:
                    for user in data["details"]:
                        if user["homerID"] == homer_id:
                            # ✅ update group
                            user["group"] = group
                            # ✅ update status
                            user["status"] = "not_activated"

                            # ✅ add new trackRecord
                            user["trackRecord"] = Config.ctrlTrackRecord

                            FH.save_homer_id_details(current_session.login_place, data)
                            break  # stop after updating the correct user

                # Write to control user details
                control_data = [
                    datetime.now().strftime("%d-%m-%Y"),
                    homer_id,
                    location,
                    group,
                ]
                control_file_path = os.path.join(
                    Config.META_DATA_PATH,
                    current_session.login_place,
                    Config.CONTROL_USER_DETAILS,
                )
                FileHandler.write_csv_data(
                    control_file_path,
                    control_data,
                    ["Date", "HomerID", "Location", "Group"],
                )

            except Exception as e:
                if os.path.exists(local_folder_path):
                    FileHandler.cleanup_user_folder(
                        local_folder_path, device, Config.CONFIG_DATA
                    )
                    return jsonify({"status": "error", "message": f"Failed: {str(e)}"}), 500

        # Log group assignment
        try:
            from routes.auth import log_group_assigned
            log_group_assigned(homer_id, group, current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log group assignment: {e}")

        return jsonify(
            {
                "status": "success",
                "message": f"User {homer_id} assigned to {group} group successfully",
            }
        ), 200

    except Exception as e:
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


@bp.route("/activate_control_patient", methods=["POST"])
def activate_control_patient():
    """Activate a control patient with VCG type selection"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        request_data = request.get_json()
        homer_id = request_data.get("userID")
        vcg_type_raw = request_data.get("vcgType")
        activation_date_str = request_data.get("activationDate", "")  # NEW: user-selected date

        if not homer_id or not vcg_type_raw:
            return jsonify(
                {"status": "error", "message": "Missing userID or vcgType"}
            ), 400

        # Normalise to canonical key (handles vcg4_5 → VCG4,5 etc.)
        vcg_type_map = {
            "vcg2": "VCG2", "VCG2": "VCG2",
            "vcg3": "VCG3", "VCG3": "VCG3",
            "vcg4_5": "VCG4,5", "VCG4_5": "VCG4,5",
            "vcg4,5": "VCG4,5", "VCG4,5": "VCG4,5",
            "vcg4&5": "VCG4,5", "VCG4&5": "VCG4,5",
        }
        vcg_type = vcg_type_map.get(vcg_type_raw, vcg_type_raw.upper())

        # Parse user-provided activation date, fall back to today
        if activation_date_str:
            try:
                activation_date = datetime.strptime(activation_date_str, "%Y-%m-%d")
            except ValueError:
                activation_date = datetime.now()
        else:
            activation_date = datetime.now()

        # Resolve correct site for this patient (admin may manage multiple sites)
        activate_place = _resolve_place(homer_id)
        # Load user data from the correct site
        data = FileHandler.load_homer_id_details(activate_place)

        # Find user and update
        user_found = False
        for user in data.get("details", []):
            if user.get("homerID") == homer_id:
                user["activated"] = True
                user["vcg_type"] = vcg_type  # always stored as canonical key
                user["activation_date"] = activation_date.strftime("%Y-%m-%d")  # always use provided date
                user_found = True
                break

        if not user_found:
            return jsonify({"status": "error", "message": "User not found"}), 404

        FileHandler.save_homer_id_details(activate_place, data)

        # Generate timeline events for the patient
        try:
            from routes.patient_events import (
                generate_study_events,
                load_events,
                save_events,
            )

            events = generate_study_events(homer_id, activation_date, "control")
            all_events = load_events(activate_place)
            all_events[homer_id] = events
            save_events(all_events, activate_place)
        except Exception as te:
            pass  # Don't fail activation if timeline generation fails

        # Log patient activation
        try:
            from routes.auth import log_patient_activated
            log_patient_activated(homer_id, activation_date_str, "control", current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log patient activation: {e}")

        return jsonify(
            {
                "status": "success",
                "message": f"Patient {homer_id} activated with {vcg_type.upper()} exercises",
            }
        ), 200

    except Exception as e:
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


@bp.route("/register_new_user", methods=["POST"])
def register_new_user():
    """Register a new user with all details"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        data = request.get_json()
        username = data.get("username")
        hospital_id = data.get("hospitalId")
        start_date = data.get("startDate")
        end_date = data.get("endDate")
        age = data.get("age")
        location = data.get("location")
        training_side = data.get("trainingSide")
        group = data.get("group")
        fme1k = data.get("fme1k")
        fme2k = data.get("fme2k")

        prescribed_times_pluto = data.get("prescribedTimesPluto", [])
        prescribed_times_mars = data.get("prescribedTimesMars", [])

        # Validate required fields
        if not all([username, hospital_id, start_date, end_date, group]):
            return jsonify(
                {"status": "error", "message": "Missing required fields"}
            ), 400

        # Format dates
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").strftime("%d-%m-%Y")
            end_date = datetime.strptime(end_date, "%Y-%m-%d").strftime("%d-%m-%Y")
        except ValueError:
            return jsonify(
                {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD"}
            ), 400

        # Calculate total times
        total_time_pluto = sum(float(p.get("time", 0)) for p in prescribed_times_pluto)
        total_time_mars = sum(float(p.get("time", 0)) for p in prescribed_times_mars)

        local_folder_path = os.path.join(
            Config.META_DATA_PATH, current_session.login_place, hospital_id
        )

        if group == "experimental":
            # Pluto configuration
            header_pluto = Config.PLUTO_CONFIG_HEADER
            mech_values_pluto = [p.get("time", 0) for p in prescribed_times_pluto]
            if len(mech_values_pluto) < 6:
                mech_values_pluto.extend([0] * (6 - len(mech_values_pluto)))

            # PLUTO_CONFIG_HEADER: HomerID, StartDate, EndDate, TotalTime, WFE, WURD, FPS, HOC, FME1, FME2, TrainingSide, Location, Group, FME1K, FME2K (15 cols)
            row_pluto = (
                [hospital_id, start_date, end_date, total_time_pluto]
                + mech_values_pluto
                + [training_side, location, group, fme1k or 0, fme2k or 0]
            )

            # Mars configuration
            header_mars = Config.MARS_CONFIG_HEADER
            mech_values_mars = [p.get("time", 0) for p in prescribed_times_mars]
            if len(mech_values_mars) < 3:
                mech_values_mars.extend([0] * (3 - len(mech_values_mars)))

            forearm_length = data.get("forearmLength", "150")
            upperarm_length = data.get("upperarmLength", "250")

            # MARS_CONFIG_HEADER: HomerID, StartDate, EndDate, TotalTime, ML, AP, MLAP, ForeArmLength, UpperArmLength, TrainingSide, Location, Group (12 cols)
            row_mars = (
                [hospital_id, start_date, end_date, total_time_mars]
                + mech_values_mars
                + [forearm_length, upperarm_length, training_side, location, group]
            )

            # Create files for both devices
            for device, header, row in [
                ("Pluto", header_pluto, row_pluto),
                ("Mars", header_mars, row_mars),
            ]:
                file_path = os.path.join(local_folder_path, device, Config.CONFIG_DATA)
                try:
                    FileHandler.write_csv_data(file_path, row, header)
                    # Upload to S3
                    s3_key = f"{current_session.login_place}/{hospital_id}/{device}/{Config.CONFIG_DATA}"
                    if not S3Operations.upload_to_s3(file_path, s3_key):
                        raise Exception(f"S3 upload failed for {device}")
                except Exception as e:
                    if os.path.exists(local_folder_path):
                        FileHandler.cleanup_user_folder(
                            local_folder_path, device, Config.CONFIG_DATA
                        )
                    return jsonify(
                        {"status": "error", "message": f"Failed for {device}: {str(e)}"}
                    ), 500

        else:  # Control group
            device = Config.ACTILIFE_LABEL
            # ACTILIFE_CONFIG_HEADER: HomerID, StartDate, EndDate, Location, Group (5 cols)
            row = [hospital_id, start_date, end_date, location, group]
            header = Config.ACTILIFE_CONFIG_HEADER

            file_path = os.path.join(local_folder_path, device, Config.CONFIG_DATA)

            try:
                FileHandler.write_csv_data(file_path, row, header)
                # Upload to S3
                s3_key = f"{current_session.login_place}/{hospital_id}/{device}/{Config.CONFIG_DATA}"
                if not S3Operations.upload_to_s3(file_path, s3_key):
                    raise Exception("S3 upload failed")

                # Write to control user details
                control_data = [
                    datetime.now().strftime("%d-%m-%Y"),
                    hospital_id,
                    location,
                    group,
                ]
                control_file_path = os.path.join(
                    Config.META_DATA_PATH,
                    current_session.login_place,
                    Config.CONTROL_USER_DETAILS,
                )
                FileHandler.write_csv_data(
                    control_file_path,
                    control_data,
                    ["Date", "HomerID", "Location", "Group"],
                )

            except Exception as e:
                if os.path.exists(local_folder_path):
                    FileHandler.cleanup_user_folder(
                        local_folder_path, device, Config.CONFIG_DATA
                    )
                return jsonify({"status": "error", "message": f"Failed: {str(e)}"}), 500

        # Homer ID entry is already created by assign_group logic; 
        # here we only need to add if not already present (create_homer_id handles this)
        # Note: register_new_user creates CSV files only - the homerIdDetails entry
        # was created earlier by create_homer_id route

        # Generate timeline events for patients
        try:
            from routes.patient_events import (
                generate_study_events,
                load_events,
                save_events,
            )

            start_date_dt = datetime.strptime(start_date, "%d-%m-%Y")
            events = generate_study_events(hospital_id, start_date_dt, group)
            all_events = load_events(current_session.login_place)
            all_events[hospital_id] = events
            save_events(all_events, current_session.login_place)
        except Exception as te:
            pass  # Don't fail registration if timeline generation fails

        return jsonify(
            {
                "status": "success",
                "message": "User registered and data uploaded successfully",
            }
        ), 200

    except Exception as e:
        return jsonify(
            {"status": "error", "message": f"Registration failed: {str(e)}"}
        ), 500


@bp.route("/update_data_in_aws", methods=["POST"])
def upload_updated_data():
    """Update user data and upload to AWS"""
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        data = request.form.getlist("updatedData[]")
        user_name = request.form.get("userName")
        device_name = request.form.get("deviceName")

        if not all([data, user_name, device_name]):
            return jsonify({"status": "error", "message": "Missing required data"}), 400

        # Determine header based on device
        if device_name == Config.PLUTO_LABEL:
            header = Config.PLUTO_CONFIG_HEADER
        elif device_name == Config.MARS_LABEL:
            header = Config.MARS_CONFIG_HEADER
        else:
            return jsonify({"status": "error", "message": "Invalid device name"}), 400

        # Build paths
        if current_session.is_admin():
            place = current_session.place_info.get(user_name, current_session.login_place)
            file_path = os.path.join(
                Config.META_DATA_PATH, place, user_name, device_name, Config.CONFIG_DATA
            )
            s3_key = f"{place}/{user_name}/{device_name}/{Config.CONFIG_DATA}"
        else:
            place = current_session.login_place
            file_path = os.path.join(
                Config.META_DATA_PATH,
                current_session.login_place,
                user_name,
                device_name,
                Config.CONFIG_DATA,
            )
            s3_key = f"{current_session.login_place}/{user_name}/{device_name}/{Config.CONFIG_DATA}"

        # First, upload to S3
        # Create a temp file for upload
        import tempfile
        import os as _os
        
        # Create temp file with the data
        temp_dir = tempfile.gettempdir()
        temp_file = _os.path.join(temp_dir, f"upload_{user_name}_{device_name}_{int(datetime.now().timestamp())}.csv")
        
        try:
            # Write to temp file
            FileHandler.write_csv_data(temp_file, data, header)
            
            # Upload to S3 first
            s3_uploaded = S3Operations.upload_to_s3(temp_file, s3_key)
            
            if not s3_uploaded:
                # Clean up temp file
                if _os.path.exists(temp_file):
                    _os.remove(temp_file)
                return jsonify(
                    {"status": "error", "message": "Failed to upload to S3"}
                ), 500
            
            # S3 upload successful - now save locally as backup/metadata
            _os.makedirs(_os.path.dirname(file_path), exist_ok=True)
            _os.rename(temp_file, file_path)  # Move temp file to local storage
            
            print(f"DEBUG: Uploaded to S3 and saved locally: {s3_key}")
            
        except Exception as e:
            # Clean up temp file on error
            if _os.path.exists(temp_file):
                _os.remove(temp_file)
            return jsonify(
                {"status": "error", "message": f"Upload failed: {str(e)}"}
            ), 500

        # Auto-activate experimental patient if not already activated
        try:
            _auto_activate_experimental_patient(user_name, place, device_name)
        except Exception as auto_err:
            print(f"Warning: Auto-activation check failed: {auto_err}")

        # Change 2: Check if config StartDate matches stored activation_date
        mismatch_warning = None
        try:
            homer_data = FileHandler.load_homer_id_details(place)
            patient_record = next(
                (u for u in homer_data.get("details", []) if u.get("homerID") == user_name), None
            )
            if patient_record and patient_record.get("activation_date"):
                stored_activation = datetime.strptime(patient_record["activation_date"], "%Y-%m-%d")
                # Read StartDate from the newly uploaded config file
                try:
                    import pandas as _pd
                    cfg_df = _pd.read_csv(file_path)
                    if not cfg_df.empty and "StartDate" in cfg_df.columns:
                        config_start_str = cfg_df["StartDate"].iloc[0]
                        config_start = datetime.strptime(config_start_str, "%d-%m-%Y")
                        diff_days = abs((config_start - stored_activation).days)
                        if diff_days > 0:
                            mismatch_warning = {
                                "activation_date": patient_record["activation_date"],
                                "config_start_date": config_start.strftime("%Y-%m-%d"),
                                "diff_days": diff_days,
                            }
                            # Save mismatch as an event so it appears in the timeline error section
                            try:
                                from routes.patient_events import load_events, save_events
                                all_events = load_events(place)
                                mismatches = all_events.setdefault(f"{user_name}_config_mismatches", [])
                                import uuid as _uuid
                                mismatches.append({
                                    "id": str(_uuid.uuid4()),
                                    "type": "config_date_mismatch",
                                    "device": device_name,
                                    "activation_date": patient_record["activation_date"],
                                    "config_start_date": config_start.strftime("%Y-%m-%d"),
                                    "diff_days": diff_days,
                                    "detected_at": datetime.now().isoformat(),
                                })
                                save_events(all_events, place)
                            except Exception as _ev_err:
                                print(f"Warning: Could not save mismatch event: {_ev_err}")
                except Exception as _cfg_err:
                    print(f"Warning: Could not read config StartDate for mismatch check: {_cfg_err}")
        except Exception as _mm_err:
            print(f"Warning: Mismatch check failed: {_mm_err}")

        response_payload = {"status": "success", "message": "Data uploaded to AWS successfully"}
        if mismatch_warning:
            response_payload["mismatch_warning"] = mismatch_warning
        return jsonify(response_payload), 200

    except Exception as e:
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


@bp.route("/get_config_mismatches/<user_id>", methods=["GET"])
def get_config_mismatches(user_id):
    """Return any config StartDate vs activation_date mismatches for a patient."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        place = _resolve_place(user_id)
        from routes.patient_events import load_events
        all_events = load_events(place)
        mismatches = all_events.get(f"{user_id}_config_mismatches", [])
        return jsonify({"status": "success", "mismatches": mismatches})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Add this function to routes/user_management.py
@bp.route("/check_control_activation/<user_id>", methods=["GET"])
def check_control_activation(user_id):
    """Check if control user is activated"""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        # Determine file path
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            config_path = os.path.join(
                Config.META_DATA_PATH,
                place,
                user_id,
                Config.ACTILIFE_LABEL,
                Config.CONFIG_DATA,
            )
        else:
            config_path = os.path.join(
                Config.META_DATA_PATH,
                current_session.login_place,
                user_id,
                Config.ACTILIFE_LABEL,
                Config.CONFIG_DATA,
            )

        activated = os.path.exists(config_path)

        return jsonify({"status": "success", "activated": activated})

    except Exception as e:
        print(f"Error checking activation: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/activate_control_user", methods=["POST"])
def activate_control_user():
    """Activate control group user with start and end dates."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        data = request.get_json()
        user_id = data.get("user_id")
        vcg_type = data.get("vcg_type")
        activation_date_str = data.get("activation_date", "")  # NEW: user-selected date

        if not user_id:
            return jsonify({"status": "error", "message": "Missing user ID"}), 400

        if not vcg_type:
            return jsonify(
                {"status": "error", "message": "Please select VCG type"}
            ), 400

        # Use user-provided activation date, fall back to today
        if activation_date_str:
            try:
                start_date = datetime.strptime(activation_date_str, "%Y-%m-%d")
            except ValueError:
                start_date = datetime.now()
        else:
            start_date = datetime.now()

        end_date = start_date + timedelta(days=28)

        start_date_str = start_date.strftime("%d-%m-%Y")
        end_date_str = end_date.strftime("%d-%m-%Y")

        # Determine paths
        if current_session.is_admin():
            place = current_session.place_info.get(user_id, current_session.login_place)
            base_path = os.path.join(Config.META_DATA_PATH, place, user_id)
        else:
            place = current_session.login_place
            base_path = os.path.join(
                Config.META_DATA_PATH, current_session.login_place, user_id
            )

        # Create actilife folder for config
        device_path = os.path.join(base_path, Config.ACTILIFE_LABEL)
        os.makedirs(device_path, exist_ok=True)

        # Create config data
        config_file = os.path.join(device_path, Config.CONFIG_DATA)

        # Prepare row data
        row_data = [
            user_id,
            start_date_str,
            end_date_str,
            current_session.login_place,
            "control",
        ]

        # Write to CSV
        with open(config_file, "w", newline="", encoding="utf-8") as f:
            csvwriter = csv.writer(f)
            csvwriter.writerow(Config.ACTILIFE_CONFIG_HEADER)
            csvwriter.writerow(row_data)

        # Upload to S3
        if current_session.is_admin():
            s3_key = f"{place}/{user_id}/{Config.ACTILIFE_LABEL}/{Config.CONFIG_DATA}"
        else:
            s3_key = f"{current_session.login_place}/{user_id}/{Config.ACTILIFE_LABEL}/{Config.CONFIG_DATA}"

        upload_success = S3Operations.upload_to_s3(config_file, s3_key)

        if not upload_success:
            # Cleanup on failure
            if os.path.exists(config_file):
                os.remove(config_file)
            return jsonify(
                {"status": "error", "message": "Failed to upload to S3"}
            ), 500

        # Create VCG and ADL folders
        vcg_folder = os.path.join(device_path, "vcg_prescriptions")
        adl_folder = os.path.join(device_path, "adl_prescriptions")
        os.makedirs(vcg_folder, exist_ok=True)
        os.makedirs(adl_folder, exist_ok=True)

        # Update homerIdDetails with activation info and VCG type
        # Use the resolved `place` (not login_place which is "admin" for global admin)
        data = FileHandler.load_homer_id_details(place)
        user_found = False
        for user in data.get("details", []):
            if user.get("homerID") == user_id:
                user["status"] = "active"
                user["activated"] = True
                user["activation_date"] = start_date_str
                user["end_date"] = end_date_str
                user["vcg_type"] = vcg_type  # Store VCG type here
                user["trackRecord"] = Config.ctrlTrackRecord
                user_found = True
                break

        if not user_found:
            # Add new entry if not found
            data["details"].append(
                {
                    "homerID": user_id,
                    "status": "active",
                    "activated": True,
                    "activation_date": start_date_str,
                    "end_date": end_date_str,
                    "group": "control",
                    "vcg_type": vcg_type,
                    "trackRecord": Config.ctrlTrackRecord,
                }
            )

        # Use resolved place so admin writes to the correct site file
        FileHandler.save_homer_id_details(place, data)

        return jsonify(
            {
                "status": "success",
                "message": "User activated successfully",
                "start_date": start_date_str,
                "end_date": end_date_str,
                "vcg_type": vcg_type,
            }
        ), 200

    except Exception as e:
        print(f"Error activating user: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/delete_patient", methods=["POST"])
def delete_patient():
    """Delete a patient permanently - admin only"""
    try:
        req_data = request.get_json()
        patient_id = req_data.get("patientId")
        password = req_data.get("password")
        reason = req_data.get("reason", "")

        if not patient_id or not password:
            return jsonify(
                {"status": "error", "message": "Patient ID and password required"}
            ), 400

        if not reason:
            return jsonify(
                {"status": "error", "message": "Reason for deletion is required"}
            ), 400

        # Check if user is admin (site admin or global admin can delete)
        if not current_session.is_site_admin():
            return jsonify(
                {"status": "error", "message": "Only admins can delete patients"}
            ), 403

        # Verify password
        admin_password = getattr(Config, "ADMIN_DELETE_PASSWORD", "homeradmin123")
        if password != admin_password:
            print("pass :", password," admin:", admin_password)
            return jsonify({"status": "error", "message": "Invalid password"}), 401

        # Resolve the actual site folder first — for global admin, login_place is "admin"
        # (not a real folder), so we must find the patient's real site before loading.
        actual_place = _resolve_place(patient_id)

        # Load patient data from the correct site file
        homer_data = FileHandler.load_homer_id_details(actual_place)

        # Find and remove patient
        found = False
        if "details" in homer_data:
            original_count = len(homer_data["details"])
            homer_data["details"] = [
                p
                for p in homer_data["details"]
                if p.get("hospitalId") != patient_id and p.get("homerID") != patient_id
            ]
            found = len(homer_data["details"]) < original_count

        if found:
            FileHandler.save_homer_id_details(actual_place, homer_data)

            # Log the deletion with reason before deleting data
            try:
                from routes.auth import log_patient_delete
                log_patient_delete(
                    patient_id=patient_id,
                    reason=reason,
                    deleted_by=current_session.login_place
                )
            except Exception as log_err:
                print(f"Warning: Could not log patient deletion: {log_err}")

            # Delete patient data folder
            patient_folder = os.path.join(
                Config.META_DATA_PATH, actual_place, patient_id
            )
            if os.path.exists(patient_folder):
                try:
                    shutil.rmtree(patient_folder)
                except Exception as e:
                    print(f"Error deleting patient folder: {e}")

            # Clean up patient_events.json - remove timeline, adverse, issues entries
            # so a re-registered patient with same ID starts completely fresh
            try:
                from routes.patient_events import load_events, save_events
                all_events = load_events(actual_place)
                keys_to_remove = [
                    k for k in list(all_events.keys())
                    if k == patient_id
                    or k == f"{patient_id}_adverse"
                    or k == f"{patient_id}_issues"
                ]
                for k in keys_to_remove:
                    del all_events[k]
                save_events(all_events, actual_place)
            except Exception as e:
                print(f"Warning: Could not clean patient events: {e}")

            return jsonify(
                {"status": "success", "message": "Patient deleted successfully"}
            )
        else:
            return jsonify({"status": "error", "message": "Patient not found"}), 404

    except Exception as e:
        print(f"Error deleting patient: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/change_vcg_type", methods=["POST"])
def change_vcg_type():
    """Change VCG type for an activated patient"""
    try:
        data = request.get_json()
        patient_id = data.get("patientId")
        new_vcg_type = data.get("vcgType")

        if not patient_id or not new_vcg_type:
            return jsonify(
                {"status": "error", "message": "Patient ID and VCG type required"}
            ), 400

        # Load patient data
        patient_data = FileHandler.load_homer_id_details(current_session.login_place)

        # Find and update patient
        found = False
        if "details" in patient_data:
            for patient in patient_data["details"]:
                if (
                    patient.get("hospitalId") == patient_id
                    or patient.get("homerID") == patient_id
                ):
                    # Store old VCG type in history
                    old_vcg_type = patient.get("vcg_type") or patient.get("vcgType", "")
                    if "vcgHistory" not in patient:
                        patient["vcgHistory"] = []
                    if old_vcg_type:
                        patient["vcgHistory"].append(
                            {
                                "vcg_type": old_vcg_type,
                                "changedAt": datetime.now().isoformat(),
                            }
                        )
                    # Update to new VCG type (standardized field name)
                    patient["vcg_type"] = new_vcg_type
                    # Remove old field if present
                    patient.pop("vcgType", None)
                    patient["vcgChangedAt"] = datetime.now().isoformat()
                    found = True
                    break

        if found:
            FileHandler.save_homer_id_details(current_session.login_place, patient_data)
            return jsonify(
                {
                    "status": "success",
                    "message": f"VCG type changed to {new_vcg_type.upper()}",
                }
            )
        else:
            return jsonify({"status": "error", "message": "Patient not found"}), 404

    except Exception as e:
        print(f"Error changing VCG type: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route("/activate_experimental_patient", methods=["POST"])
def activate_experimental_patient():
    """Activate an experimental group patient for a specific device.
    
    This is triggered either:
    1. Automatically when cloud data upload is confirmed (called from S3 sync logic)
    2. Manually via the debug 'Manual Activate' button in the UI
    """
    if not current_session.login_place:
        return jsonify({"error": "Not logged in"}), 401

    try:
        req_data = request.get_json()
        homer_id = req_data.get("userID")
        device = req_data.get("device", "").lower()  # "pluto" or "mars" or "both"
        activation_date_str = req_data.get("activationDate", "")  # NEW: user-selected date

        if not homer_id:
            return jsonify({"status": "error", "message": "Missing userID"}), 400

        # Parse user-provided activation date, fall back to config file / today
        user_activation_date = None
        if activation_date_str:
            try:
                user_activation_date = datetime.strptime(activation_date_str, "%Y-%m-%d")
            except ValueError:
                pass

        data = FileHandler.load_homer_id_details(current_session.login_place)

        user_found = False
        for user in data.get("details", []):
            if user.get("homerID") == homer_id:
                if user.get("group") != "experimental":
                    return jsonify({"status": "error", "message": "Patient is not in experimental group"}), 400

                current_status = user.get("status", {})
                if not isinstance(current_status, dict):
                    current_status = {"pluto": "not_activated", "mars": "not_activated"}

                if device == "both" or not device:
                    current_status["pluto"] = "active"
                    current_status["mars"] = "active"
                elif device in ["pluto", "mars"]:
                    current_status[device] = "active"
                else:
                    return jsonify({"status": "error", "message": "Invalid device. Use 'pluto', 'mars', or 'both'"}), 400

                user["status"] = current_status
                # Set activated flag so frontend patient.activated check works
                user["activated"] = True
                if not user.get("timeline_generated"):
                    try:
                        from routes.patient_events import generate_study_events, load_events, save_events

                        # Prefer user-provided activation date, then config file, then today
                        activation_date = user_activation_date

                        if not activation_date:
                            base_path = os.path.join(Config.META_DATA_PATH, current_session.login_place, homer_id)
                            for device_name in ["Pluto", "Mars", "pluto", "mars", "actilife"]:
                                config_path = os.path.join(base_path, device_name, "configdata.csv")
                                if os.path.exists(config_path):
                                    try:
                                        with open(config_path, "r") as f:
                                            reader = csv.DictReader(f)
                                            rows = list(reader)
                                            if rows and rows[0].get("StartDate"):
                                                start_date_str = rows[0].get("StartDate")
                                                activation_date = datetime.strptime(start_date_str, "%d-%m-%Y")
                                                break
                                    except Exception as e:
                                        print(f"DEBUG: Error reading config for activation date: {e}")

                        if not activation_date:
                            activation_date = datetime.now()

                        user["activation_date"] = activation_date.strftime("%Y-%m-%d")
                        events = generate_study_events(homer_id, activation_date, "experimental")
                        all_events = load_events(current_session.login_place)
                        all_events[homer_id] = events
                        save_events(all_events, current_session.login_place)
                        user["timeline_generated"] = True
                    except Exception as te:
                        print(f"Warning: Could not generate timeline for {homer_id}: {te}")
                else:
                    # Already generated — update activation_date if user provided one
                    if user_activation_date:
                        user["activation_date"] = user_activation_date.strftime("%Y-%m-%d")

                user_found = True
                break

        if not user_found:
            return jsonify({"status": "error", "message": "Patient not found"}), 404

        FileHandler.save_homer_id_details(current_session.login_place, data)

        # Log patient activation
        try:
            from routes.auth import log_patient_activated
            log_patient_activated(homer_id, activation_date_str or "N/A", "experimental", current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log patient activation: {e}")

        activated_device_label = device if device and device != "both" else "both devices"
        return jsonify({
            "status": "success",
            "message": f"Patient {homer_id} activated successfully for {activated_device_label}",
        }), 200

    except Exception as e:
        print(f"Error activating experimental patient: {e}")
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


@bp.route("/auto_activate_experimental/<patient_id>", methods=["POST"])
def auto_activate_experimental_api(patient_id):
    """Manually trigger auto-activation for an experimental patient.
    This checks if configdata.csv exists and activates the patient if not already active."""
    if not current_session.login_place:
        return jsonify({"status": "error", "message": "Not logged in"}), 401
    
    try:
        place = _resolve_place(patient_id)
        activated = _auto_activate_experimental_patient(patient_id, place)
        
        if activated:
            return jsonify({
                "status": "success",
                "message": f"Patient {patient_id} activated successfully"
            })
        else:
            return jsonify({
                "status": "info",
                "message": f"Patient {patient_id} could not be activated (may already be active or no config data found)"
            })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500