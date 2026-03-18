# routes/patient_events.py
from flask import Blueprint, request, jsonify
from config import Config
from models.user import current_session
from utils.s3_operations import S3Operations
import os
import json
import tempfile
from datetime import datetime, timedelta
import uuid
from werkzeug.utils import secure_filename

bp = Blueprint("patient_events", __name__)


def get_events_file_path(place=None):
    if not place:
        place = current_session.login_place
    folder = os.path.join(Config.META_DATA_PATH, place)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "patient_events.json")


def get_patient_folder_path(patient_id, place=None):
    if not place:
        place = current_session.login_place
    folder = os.path.join(Config.META_DATA_PATH, place, patient_id)
    os.makedirs(folder, exist_ok=True)
    return folder


def get_patient_issues_file_path(patient_id, place=None):
    folder = get_patient_folder_path(patient_id, place)
    return os.path.join(folder, "issue_logs", "issues.json")


def get_patient_adverse_events_file_path(patient_id, place=None):
    folder = get_patient_folder_path(patient_id, place)
    return os.path.join(folder, "adverse_events", "events.json")


def load_patient_issues(patient_id, place=None):
    file_path = get_patient_issues_file_path(patient_id, place)
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            return json.load(f)
    return []


def save_patient_issues(issues, patient_id, place=None):
    file_path = get_patient_issues_file_path(patient_id, place)
    dir_path = os.path.dirname(file_path)
    os.makedirs(dir_path, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(issues, f, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def load_patient_adverse_events(patient_id, place=None):
    file_path = get_patient_adverse_events_file_path(patient_id, place)
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            return json.load(f)
    return []


def save_patient_adverse_events(events, patient_id, place=None):
    file_path = get_patient_adverse_events_file_path(patient_id, place)
    dir_path = os.path.dirname(file_path)
    os.makedirs(dir_path, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(events, f, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def load_events(place=None):
    file_path = get_events_file_path(place)
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            return json.load(f)
    return {}


def save_events(data, place=None):
    """Atomic save to prevent JSON corruption on concurrent writes"""
    file_path = get_events_file_path(place)
    dir_path = os.path.dirname(file_path)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def generate_study_events(patient_id, activation_date, group_type="experimental"):
    """Generate study events for a patient based on activation date and group type"""
    events = []

    if group_type == "experimental":
        experimental_events = [
            (0, "Day 0 - Device Installation + Demo", "checkin"),
            (1, "Day 1 - Assessment", "checkin"),
            (1, "Day 1 - ActiGraph watches", "checkin"),
            (2, "Day 2 - ADL(printOuts)", "checkin"),
            (3, "Day 3 - Exercise Video Time Upload", "checkin"),
            (7, "Day 7 - Follow-up Phone Call", "checkin"),
            (14, "Day 14 - Watch Swap Reminder + Follow-up Call", "checkin"),
            (15, "Day 15 - Home Visit + Watch Swap + Exercise video time upload", "checkin"),
            (21, "Day 21 - Follow-up Phone Call", "checkin"),
            (29, "Day 29 - Device & Watch Retrieval", "checkin"),
        ]
        for day, event_name, event_type in experimental_events:
            event_date = activation_date + timedelta(days=day)
            events.append({
                "id": str(uuid.uuid4()),
                "patientId": patient_id,
                "eventName": event_name,
                "eventType": event_type,
                "studyDay": day,
                "scheduledDate": event_date.isoformat(),
                "status": "pending",
                "completionDate": None,
                "notes": "",
            })
    else:
        # Control group — Day 1 is activation day
        control_events = [
            (1,"Day 1-ActiGraph watches","checkin"),
            (1, "Day 1 - ADL Exercise Prescription", "checkin"),
            (2, "Day 2 - Exercise PrintOuts", "checkin"),
            (3, "Day 3 - Exercise time records upload", "checkin"),
            (7, "Day 7 - Follow-up Phone Call", "checkin"),
            (14, "Day 14 - Watch Swap Reminder + Follow-up Call", "checkin"),
            (15, "Day 15 - Watch Swap Visit", "checkin"),
            (15, "Day 15 -exercise Revision","checkin"),
            (21, "Day 21 - Follow-up Phone Call", "checkin"),
            (28, "Day 28 - Trial Completion", "visit"),
            (29, "Day 29 - Watch Retrieval", "visit"),
        ]
        for day, event_name, event_type in control_events:
            event_date = activation_date + timedelta(days=day - 1)
            events.append({
                "id": str(uuid.uuid4()),
                "patientId": patient_id,
                "eventName": event_name,
                "eventType": event_type,
                "studyDay": day,
                "scheduledDate": event_date.isoformat(),
                "status": "pending",
                "completionDate": None,
                "notes": "",
            })

    return events


@bp.route("/generate_timeline/<patient_id>", methods=["POST"])
def generate_timeline(patient_id):
    """Generate timeline events for a patient"""
    try:
        data = request.get_json()
        activation_date_str = data.get("activationDate")
        if activation_date_str:
            try:
                activation_date = datetime.strptime(activation_date_str, "%Y-%m-%d")
            except ValueError:
                try:
                    activation_date = datetime.fromisoformat(activation_date_str)
                except:
                    activation_date = datetime.now()
        else:
            activation_date = datetime.now()
        group_type = data.get("groupType", "experimental")

        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        
        # Save activation_date in patient record if not already set
        try:
            from utils.file_handlers import FileHandler
            patient_data = FileHandler.load_homer_id_details(place)
            for user in patient_data.get("details", []):
                if user.get("homerID") == patient_id:
                    if not user.get("activation_date"):
                        user["activation_date"] = activation_date.strftime("%Y-%m-%d")
                    user["timeline_generated"] = True
                    break
            FileHandler.save_homer_id_details(place, patient_data)
        except Exception as save_err:
            print(f"Warning: Could not save activation_date: {save_err}")
        
        events = generate_study_events(patient_id, activation_date, group_type)
        all_events = load_events(place)
        all_events[patient_id] = events
        save_events(all_events, place)

        return jsonify({"status": "success", "events": events})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/get_timeline/<patient_id>", methods=["GET"])
def get_timeline(patient_id):
    """Get timeline events for a patient"""
    try:
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        all_events = load_events(place)
        events = all_events.get(patient_id, [])
        return jsonify({"status": "success", "events": events})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/update_event", methods=["POST"])
def update_event():
    """Update a timeline event"""
    try:
        data = request.get_json()
        patient_id = data.get("patientId")
        event_id = data.get("id")
        status = data.get("status")
        notes = data.get("notes")

        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        all_events = load_events(place)

        if patient_id in all_events:
            for event in all_events[patient_id]:
                if event["id"] == event_id:
                    if status:
                        event["status"] = status
                    if notes is not None:
                        event["notes"] = notes
                    if status == "completed":
                        event["completionDate"] = datetime.now().isoformat()
                    break

        save_events(all_events, place)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/adverse_events/<patient_id>", methods=["GET"])
def get_adverse_events(patient_id):
    """Get adverse events for a patient - uses patient-specific storage"""
    try:
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        adverse_events = load_patient_adverse_events(patient_id, place)
        return jsonify({"status": "success", "events": adverse_events})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def _iter_all_places():
    """Yield (place, homer_data) for every site the current user can see."""
    from utils.file_handlers import FileHandler
    import os
    if current_session.is_admin():
        meta = Config.META_DATA_PATH
        for place in os.listdir(meta):
            place_path = os.path.join(meta, place)
            if os.path.isdir(place_path):
                yield place, FileHandler.load_homer_id_details(place)
    else:
        yield current_session.login_place, FileHandler.load_homer_id_details(current_session.login_place)


@bp.route("/dropped_patients", methods=["GET"])
def get_dropped_patients():
    """Batch endpoint — returns patient IDs who are discontinued (active patients only).
    Includes: patients with discontinued=True in homerIdDetails, OR
              patients with a requiresDropout adverse event.
    Admin users scan all sites."""
    try:
        dropped = set()
        for place, homer_data in _iter_all_places():
            for d in homer_data.get("details", []):
                if d.get("discontinued") is True:
                    # Exclude pre-enrolment discontinued (no group assigned yet)
                    role = (d.get("role") or "").lower().strip()
                    if role in ("", "unassigned"):
                        continue
                    dropped.add(d.get("homerID"))

            active_ids = {d.get("homerID") for d in homer_data.get("details", [])}
            all_events = load_events(place)
            for key, events in all_events.items():
                if key.endswith("_adverse"):
                    patient_id = key[: -len("_adverse")]
                    if patient_id not in active_ids:
                        continue
                    if any(e.get("requiresDropout") for e in events):
                        dropped.add(patient_id)

        return jsonify({"status": "success", "droppedPatients": list(dropped)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/trial_completed_patients", methods=["GET"])
def get_trial_completed_patients():
    """Returns patient IDs whose last timeline event (Day 29) is marked completed
    OR have trialCompleted flag set in patient data.
    Admin users scan all sites."""
    try:
        completed = []
        for place, homer_data in _iter_all_places():
            # First check for trialCompleted flag in patient data
            for patient in homer_data.get("details", []):
                if patient.get("trialCompleted") == True:
                    patient_id = patient.get("homerID")
                    if patient_id:
                        completed.append(patient_id)
            
            # Also check timeline for Day 29 completion
            active_ids = {d.get("homerID") for d in homer_data.get("details", [])}
            all_events = load_events(place)
            for patient_id, events in all_events.items():
                if patient_id.endswith("_adverse") or patient_id.endswith("_issues"):
                    continue
                if patient_id not in active_ids:
                    continue
                if not events:
                    continue
                try:
                    last_event = max(events, key=lambda e: int(e.get("studyDay", 0)))
                    if last_event.get("status") == "completed":
                        completed.append(patient_id)
                except (ValueError, TypeError):
                    pass

        return jsonify({"status": "success", "completedPatients": completed})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/adverse_events", methods=["POST"])
def save_adverse_event():
    """Save an adverse event"""
    try:
        if request.content_type and "multipart/form-data" in request.content_type:
            patient_id = request.form.get("patientId")
            event_date = request.form.get("eventDate")
            study_day = request.form.get("studyDay")
            event_type = request.form.get("eventType")
            severity = request.form.get("severity")
            description = request.form.get("description")
            action_taken = request.form.get("actionTaken")
            reported_to_pi = request.form.get("reportedToPi") == "true"
            requires_dropout = request.form.get("requiresDropout") == "true"
            requires_pause = request.form.get("requiresPause") == "true"
            dropout_reason = request.form.get("dropoutReason")

            exit_questionnaire_path = None
            if "exitQuestionnaire" in request.files:
                file = request.files["exitQuestionnaire"]
                if file and file.filename:
                    if current_session.login_place:
                        place = (
                            current_session.place_info.get(patient_id, current_session.login_place)
                            if current_session.is_admin()
                            else current_session.login_place
                        )
                        # Use same path as save_exit_data for consistency
                        folder_path = os.path.join(
                            Config.META_DATA_PATH, place, patient_id,
                            Config.ACTILIFE_LABEL, "exit_data"
                        )
                        os.makedirs(folder_path, exist_ok=True)
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        safe_name = secure_filename(file.filename) or "upload"
                        filename = f"exit_questionnaire_{timestamp}_{safe_name}"
                        file_path = os.path.join(folder_path, filename)
                        file.save(file_path)
                        exit_questionnaire_path = file_path
        else:
            data = request.get_json()
            patient_id = data.get("patientId")
            event_date = data.get("eventDate")
            study_day = data.get("studyDay")
            event_type = data.get("eventType")
            severity = data.get("severity")
            description = data.get("description")
            action_taken = data.get("actionTaken")
            reported_to_pi = data.get("reportedToPi", False)
            requires_dropout = data.get("requiresDropout", False)
            requires_pause = bool(data.get("requiresPause", False))
            dropout_reason = data.get("dropoutReason")
            exit_questionnaire_path = data.get("exitQuestionnaire")

        if not patient_id:
            return jsonify({"status": "error", "message": "patientId required"}), 400

        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )

        event = {
            "id": str(uuid.uuid4()),
            "patientId": patient_id,
            "eventDate": event_date,
            "studyDay": study_day,
            "eventType": event_type,
            "severity": severity,
            "description": description,
            "actionTaken": action_taken,
            "reportedToPi": reported_to_pi,
            "requiresDropout": requires_dropout,
            "dropoutReason": dropout_reason,
            "requiresPause": requires_pause,   # extracted cleanly in each branch above
            "exitQuestionnaire": exit_questionnaire_path,
            "attachment": None,
            "createdAt": datetime.now().isoformat(),
        }

        # Handle optional attachment file upload - upload to S3 first
        attachment_path = None
        attachment_s3_key = None
        if "attachment" in request.files:
            file = request.files["attachment"]
            if file and file.filename:
                try:
                    import tempfile
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    safe_name = secure_filename(file.filename) or "upload"
                    filename = f"adverse_attachment_{timestamp}_{safe_name}"
                    s3_key = f"{place}/{patient_id}/adverse_events/{filename}"
                    
                    # Save to temp file first
                    temp_dir = tempfile.gettempdir()
                    temp_path = os.path.join(temp_dir, filename)
                    file.save(temp_path)
                    
                    # Upload to S3 first
                    try:
                        s3_uploaded = S3Operations.upload_to_s3(temp_path, s3_key)
                        if s3_uploaded:
                            attachment_path = s3_key  # Store S3 key instead of local path
                            attachment_s3_key = s3_key
                            # Delete temp file after successful upload
                            try:
                                os.remove(temp_path)
                            except:
                                pass
                            print(f"DEBUG: Uploaded adverse event attachment to S3: {s3_key}")
                        else:
                            # S3 failed, save locally as backup
                            folder_path = os.path.join(Config.META_DATA_PATH, place, patient_id, "adverse_events")
                            os.makedirs(folder_path, exist_ok=True)
                            local_path = os.path.join(folder_path, filename)
                            os.rename(temp_path, local_path)
                            attachment_path = local_path
                            print(f"WARNING: S3 upload failed, saved locally: {local_path}")
                    except Exception as s3_err:
                        # S3 error, save locally as backup
                        folder_path = os.path.join(Config.META_DATA_PATH, place, patient_id, "adverse_events")
                        os.makedirs(folder_path, exist_ok=True)
                        local_path = os.path.join(folder_path, filename)
                        try:
                            os.rename(temp_path, local_path)
                            attachment_path = local_path
                        except:
                            attachment_path = temp_path
                        print(f"Warning: Could not upload to S3, saved locally: {s3_err}")
                    
                    event["attachment"] = attachment_path
                    event["attachmentS3Key"] = attachment_s3_key
                        
                except Exception as attach_err:
                    print(f"Warning: Could not save attachment: {attach_err}")

        adverse_events = load_patient_adverse_events(patient_id, place)
        adverse_events.append(event)
        save_patient_adverse_events(adverse_events, patient_id, place)

        all_events = load_events(place)
        all_events[f"{patient_id}_adverse"] = adverse_events
        save_events(all_events, place)

        # Log adverse event
        try:
            from routes.auth import log_adverse_event
            log_adverse_event(patient_id, event_type, current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log adverse event: {e}")

        return jsonify({"status": "success", "event": event})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/update_adverse_event", methods=["POST"])
def update_adverse_event():
    """Patch fields on an existing adverse event (e.g. resolvedAt, actionTaken)"""
    try:
        data = request.get_json()
        patient_id = data.get("patientId")
        event_id   = data.get("eventId")
        if not patient_id or not event_id:
            return jsonify({"status": "error", "message": "patientId and eventId required"}), 400

        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        
        adverse_events = load_patient_adverse_events(patient_id, place)

        updated = False
        for ev in adverse_events:
            if ev.get("id") == event_id:
                for field, value in data.items():
                    if field not in ("patientId", "eventId"):
                        ev[field] = value
                updated = True
                break

        if not updated:
            return jsonify({"status": "error", "message": "Event not found"}), 404

        save_patient_adverse_events(adverse_events, patient_id, place)
        
        all_events = load_events(place)
        all_events[f"{patient_id}_adverse"] = adverse_events
        save_events(all_events, place)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/issue_logs/<patient_id>", methods=["GET"])
def get_issue_logs(patient_id):
    """Get issue logs for a patient - uses patient-specific storage"""
    try:
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )
        issue_logs = load_patient_issues(patient_id, place)
        return jsonify({"status": "success", "issues": issue_logs})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/issue_logs", methods=["POST"])
def save_issue_log():
    """Save an issue log — supports multipart for PDF attachment"""
    try:
        place = None
        pdf_path = None
        filename = None
        pdf_s3_key = None
        
        if request.content_type and "multipart/form-data" in request.content_type:
            patient_id = request.form.get("patientId")
            contact_date = request.form.get("contactDate")
            contact_type = request.form.get("contactType")
            duration = request.form.get("durationMinutes", 0)
            issue_type = request.form.get("issueType", "")
            issue_desc = request.form.get("issueDescription", "")
            solution = request.form.get("solutionProvided", "")
            followup_req = request.form.get("followUpRequired") == "true"
            followup_date = request.form.get("followUpDate", "")
            affected_devices = request.form.get("affectedDevices", "")

            # Determine place first
            place = (
                current_session.place_info.get(patient_id, current_session.login_place)
                if current_session.is_admin()
                else current_session.login_place
            )
            
            # Handle PDF upload - upload to S3 first
            if "pdfFile" in request.files:
                file = request.files["pdfFile"]
                if file and file.filename:
                    import tempfile
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"issuelog_{timestamp}_{secure_filename(file.filename)}"
                    s3_key = f"{place}/{patient_id}/issue_logs/{filename}"
                    
                    # Save to temp file first
                    temp_dir = tempfile.gettempdir()
                    temp_path = os.path.join(temp_dir, filename)
                    file.save(temp_path)
                    
                    # Upload to S3 first
                    try:
                        s3_uploaded = S3Operations.upload_to_s3(temp_path, s3_key)
                        if s3_uploaded:
                            pdf_path = s3_key  # Store S3 key instead of local path
                            pdf_s3_key = s3_key
                            # Delete temp file after successful upload
                            try:
                                os.remove(temp_path)
                            except:
                                pass
                            print(f"DEBUG: Uploaded issue log PDF to S3: {s3_key}")
                        else:
                            # S3 failed, save locally as backup
                            folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "issue_logs")
                            os.makedirs(folder, exist_ok=True)
                            local_path = os.path.join(folder, filename)
                            os.rename(temp_path, local_path)
                            pdf_path = local_path
                            print(f"WARNING: S3 upload failed, saved locally: {local_path}")
                    except Exception as s3_err:
                        # S3 error, save locally as backup
                        folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "issue_logs")
                        os.makedirs(folder, exist_ok=True)
                        local_path = os.path.join(folder, filename)
                        try:
                            os.rename(temp_path, local_path)
                            pdf_path = local_path
                        except:
                            pdf_path = temp_path
                        print(f"Warning: Could not upload issue log PDF to S3: {s3_err}")
        else:
            data = request.get_json() or {}
            patient_id = data.get("patientId")
            contact_date = data.get("contactDate")
            contact_type = data.get("contactType")
            duration = data.get("durationMinutes", 0)
            issue_type = data.get("issueType", "")
            issue_desc = data.get("issueDescription", "")
            solution = data.get("solutionProvided", "")
            followup_req = data.get("followUpRequired", False)
            followup_date = data.get("followUpDate", "")
            affected_devices = data.get("affectedDevices", "")

            place = (
                current_session.place_info.get(patient_id, current_session.login_place)
                if current_session.is_admin()
                else current_session.login_place
            )

        if not patient_id:
            return jsonify({"status": "error", "message": "patientId required"}), 400

        log = {
            "id": str(uuid.uuid4()),
            "patientId": patient_id,
            "contactDate": contact_date,
            "contactType": contact_type,
            "durationMinutes": duration,
            "issueType": issue_type,
            "issueDescription": issue_desc,
            "solutionProvided": solution,
            "followUpRequired": followup_req,
            "followUpDate": followup_date,
            "affectedDevices": affected_devices,
            "pdfAttached": pdf_path is not None,
            "pdfPath": pdf_path,
            "pdfS3Key": pdf_s3_key,  # Track if stored in S3
            "createdAt": datetime.now().isoformat(),
        }

        issue_logs = load_patient_issues(patient_id, place)
        issue_logs.append(log)
        save_patient_issues(issue_logs, patient_id, place)

        all_events = load_events(place)
        all_events[f"{patient_id}_issues"] = issue_logs
        save_events(all_events, place)

        return jsonify({"status": "success", "issue": log})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/get_all_events", methods=["GET"])
def get_all_events():
    """Get all events across patients for dashboard — only for existing patients.
    Admin users aggregate across all sites."""
    try:
        timeline_events = []
        all_issues = []

        for place, homer_data in _iter_all_places():
            active_ids = {d.get("homerID") for d in homer_data.get("details", [])}
            all_events = load_events(place)

            for patient_id, events in all_events.items():
                if patient_id.endswith("_adverse") or patient_id.endswith("_issues"):
                    continue
                if patient_id not in active_ids:
                    continue
                for event in events:
                    event["patientId"] = patient_id
                    timeline_events.append(event)

            for key, issues in all_events.items():
                if key.endswith("_issues"):
                    patient_id = key.replace("_issues", "")
                    if patient_id not in active_ids:
                        continue
                    for issue in issues:
                        issue["patientId"] = patient_id
                        all_issues.append(issue)

        return jsonify({
            "status": "success",
            "timelineEvents": timeline_events,
            "issueLogs": all_issues,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@bp.route("/pause_study/<patient_id>", methods=["POST"])
def pause_study(patient_id):
    """Pause a patient's study due to adverse event"""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        place = current_session.place_info.get(patient_id, current_session.login_place)
        from utils.file_handlers import FileHandler
        data = FileHandler.load_homer_id_details(place)
        for user in data.get("details", []):
            if user.get("homerID") == patient_id:
                user["studyPaused"] = True
                user["pausedAt"] = datetime.now().isoformat()
                break
        FileHandler.save_homer_id_details(place, data)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/resume_study/<patient_id>", methods=["POST"])
def resume_study(patient_id):
    """Resume a paused patient's study"""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        place = current_session.place_info.get(patient_id, current_session.login_place)
        # Support both JSON and multipart (for prescription file upload)
        if request.content_type and "multipart/form-data" in request.content_type:
            notes = request.form.get("notes", "")
            resume_date = request.form.get("resume_date", "")
            prescription_file = request.files.get("prescription_file")
        else:
            body = request.get_json(silent=True) or {}
            notes = body.get("notes", "")
            resume_date = body.get("resume_date", "")
            prescription_file = None
        
        from utils.file_handlers import FileHandler
        data = FileHandler.load_homer_id_details(place)
        
        # Use provided resume_date or default to current timestamp
        if resume_date:
            try:
                from datetime import datetime as dt
                resume_date_obj = dt.strptime(resume_date, "%Y-%m-%d")
                resumed_at = resume_date_obj.isoformat()
            except ValueError:
                resumed_at = datetime.now().isoformat()
        else:
            resumed_at = datetime.now().isoformat()

        for user in data.get("details", []):
            if user.get("homerID") == patient_id:
                user["studyPaused"] = False
                user["resumedAt"] = resumed_at
                user["resumeNotes"] = notes
                user["resumeDate"] = resume_date if resume_date else datetime.now().strftime("%Y-%m-%d")
                break
        # Upload prescription file to S3 if provided
        prescription_s3_key = None
        if prescription_file and prescription_file.filename:
            import tempfile as _tp
            from utils.s3_operations import S3Operations
            from werkzeug.utils import secure_filename
            ts_ = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name_ = secure_filename(prescription_file.filename) or "upload"
            fname_ = f"resume_prescription_{ts_}_{safe_name_}"
            s3_key_ = f"{place}/{patient_id}/resume_docs/{fname_}"
            td_, tp_ = _tp.mkstemp(suffix=".tmp")
            try:
                prescription_file.save(tp_)
                if S3Operations.upload_to_s3(tp_, s3_key_):
                    prescription_s3_key = s3_key_
            except Exception as _pe:
                print(f"Warning: prescription file upload failed: {_pe}")
            finally:
                try:
                    import os as _os; _os.unlink(tp_)
                except Exception:
                    pass

        FileHandler.save_homer_id_details(place, data)

        # Patch the most recent requiresPause adverse event with resolvedAt + resolvedActionNotes
        try:
            all_events = load_events(place)
            adverse_events = all_events.get(f"{patient_id}_adverse", [])
            # Find the last event that required a pause and hasn't been resolved yet
            for ev in reversed(adverse_events):
                if ev.get("requiresPause") and not ev.get("resolvedAt"):
                    ev["resolvedAt"] = resumed_at
                    ev["resolvedActionNotes"] = notes
                    break
            all_events[f"{patient_id}_adverse"] = adverse_events
            save_events(all_events, place)
        except Exception as patch_err:
            print(f"Warning: Could not patch adverse event on resume: {patch_err}")

        # Log the study resume
        try:
            from routes.auth import log_study_resume
            log_study_resume(
                patient_id=patient_id,
                resume_date=resume_date if resume_date else datetime.now().strftime("%Y-%m-%d"),
                notes=notes,
                resumed_by=current_session.login_place
            )
        except Exception as log_err:
            print(f"Warning: Could not log study resume: {log_err}")

        return jsonify({"status": "success", "resumedAt": resumed_at, "prescriptionFile": prescription_s3_key})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/discontinue_patient", methods=["POST"])
def discontinue_patient():
    """Discontinue a patient from the study"""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        patient_id = request.form.get("patientId")
        reason = request.form.get("reason")
        notes = request.form.get("notes", "")
        # Use date provided by user; fall back to today
        discontinue_date = request.form.get("discontinueDate") or datetime.now().strftime("%Y-%m-%d")

        if not patient_id or not reason:
            return jsonify({"status": "error", "message": "patientId and reason required"}), 400

        place = current_session.place_info.get(patient_id, current_session.login_place)

        pdf_path = None
        if "pdfFile" in request.files:
            file = request.files["pdfFile"]
            if file and file.filename:
                folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "discontinue_docs")
                os.makedirs(folder, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"discontinue_{timestamp}_{file.filename}"
                filepath = os.path.join(folder, filename)
                file.save(filepath)
                pdf_path = filepath

        from utils.file_handlers import FileHandler
        data = FileHandler.load_homer_id_details(place)
        for user in data.get("details", []):
            if user.get("homerID") == patient_id:
                user["discontinued"] = True
                user["discontinueReason"] = reason
                user["discontinueNotes"] = notes
                user["discontinueDate"] = discontinue_date
                user["discontinuePdf"] = pdf_path
                break
        FileHandler.save_homer_id_details(place, data)

        # Log patient discontinuation
        try:
            from routes.auth import log_patient_discontinued
            log_patient_discontinued(patient_id, reason, current_session.login_place)
        except Exception as e:
            print(f"Warning: Could not log patient discontinuation: {e}")

        return jsonify({"status": "success"})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/mark_trial_complete", methods=["POST"])
def mark_trial_complete():
    """Mark a patient's trial as complete with feedback and files"""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        
        patient_id = request.form.get("patientId")
        feedback = request.form.get("feedback", "")
        qualitative_conducted = request.form.get("qualitativeConducted", "no")
        
        if not patient_id:
            return jsonify({"status": "error", "message": "patientId required"}), 400
        
        if not feedback:
            return jsonify({"status": "error", "message": "Feedback summary required"}), 400
        
        place = current_session.place_info.get(patient_id, current_session.login_place)
        
        # Save uploaded files - upload to S3 first
        feedback_file_path = None
        qualitative_file_path = None
        audio_file_path = None
        feedback_s3_key = None
        qualitative_s3_key = None
        audio_s3_key = None
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Handle feedback file
        if "feedbackFile" in request.files:
            file = request.files["feedbackFile"]
            if file and file.filename:
                import tempfile
                safe_name = secure_filename(file.filename) or "upload"
                filename = f"feedback_{timestamp}_{safe_name}"
                s3_key = f"{place}/{patient_id}/trial_complete/{filename}"
                
                # Save to temp file first
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, filename)
                file.save(temp_path)
                
                # Upload to S3 first
                try:
                    s3_uploaded = S3Operations.upload_to_s3(temp_path, s3_key)
                    if s3_uploaded:
                        feedback_file_path = s3_key  # Store S3 key
                        feedback_s3_key = s3_key
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                        print(f"DEBUG: Uploaded feedback file to S3: {s3_key}")
                    else:
                        # S3 failed, save locally
                        folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                        os.makedirs(folder, exist_ok=True)
                        local_path = os.path.join(folder, filename)
                        os.rename(temp_path, local_path)
                        feedback_file_path = local_path
                        print(f"WARNING: S3 upload failed, saved locally: {local_path}")
                except Exception as s3_err:
                    # S3 error, save locally as backup
                    folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                    os.makedirs(folder, exist_ok=True)
                    local_path = os.path.join(folder, filename)
                    try:
                        os.rename(temp_path, local_path)
                        feedback_file_path = local_path
                    except:
                        feedback_file_path = temp_path
                    print(f"Warning: Could not upload feedback file to S3: {s3_err}")
        
        # Handle qualitative analysis file
        if "qualitativeFile" in request.files:
            file = request.files["qualitativeFile"]
            if file and file.filename:
                import tempfile
                safe_name = secure_filename(file.filename) or "upload"
                filename = f"qualitative_{timestamp}_{safe_name}"
                s3_key = f"{place}/{patient_id}/trial_complete/{filename}"
                
                # Save to temp file first
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, filename)
                file.save(temp_path)
                
                # Upload to S3 first
                try:
                    s3_uploaded = S3Operations.upload_to_s3(temp_path, s3_key)
                    if s3_uploaded:
                        qualitative_file_path = s3_key  # Store S3 key
                        qualitative_s3_key = s3_key
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                        print(f"DEBUG: Uploaded qualitative file to S3: {s3_key}")
                    else:
                        # S3 failed, save locally
                        folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                        os.makedirs(folder, exist_ok=True)
                        local_path = os.path.join(folder, filename)
                        os.rename(temp_path, local_path)
                        qualitative_file_path = local_path
                        print(f"WARNING: S3 upload failed, saved locally: {local_path}")
                except Exception as s3_err:
                    # S3 error, save locally as backup
                    folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                    os.makedirs(folder, exist_ok=True)
                    local_path = os.path.join(folder, filename)
                    try:
                        os.rename(temp_path, local_path)
                        qualitative_file_path = local_path
                    except:
                        qualitative_file_path = temp_path
                    print(f"Warning: Could not upload qualitative file to S3: {s3_err}")
        
        # Handle audio file
        if "audioFile" in request.files:
            file = request.files["audioFile"]
            if file and file.filename:
                import tempfile
                safe_name = secure_filename(file.filename) or "upload"
                filename = f"audio_{timestamp}_{safe_name}"
                s3_key = f"{place}/{patient_id}/trial_complete/{filename}"
                
                # Save to temp file first
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, filename)
                file.save(temp_path)
                
                # Upload to S3 first
                try:
                    s3_uploaded = S3Operations.upload_to_s3(temp_path, s3_key)
                    if s3_uploaded:
                        audio_file_path = s3_key  # Store S3 key
                        audio_s3_key = s3_key
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                        print(f"DEBUG: Uploaded audio file to S3: {s3_key}")
                    else:
                        # S3 failed, save locally
                        folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                        os.makedirs(folder, exist_ok=True)
                        local_path = os.path.join(folder, filename)
                        os.rename(temp_path, local_path)
                        audio_file_path = local_path
                        print(f"WARNING: S3 upload failed, saved locally: {local_path}")
                except Exception as s3_err:
                    # S3 error, save locally as backup
                    folder = os.path.join(Config.META_DATA_PATH, place, patient_id, "trial_complete")
                    os.makedirs(folder, exist_ok=True)
                    local_path = os.path.join(folder, filename)
                    try:
                        os.rename(temp_path, local_path)
                        audio_file_path = local_path
                    except:
                        audio_file_path = temp_path
                    print(f"Warning: Could not upload audio file to S3: {s3_err}")
        
        # Update patient record
        from utils.file_handlers import FileHandler
        data = FileHandler.load_homer_id_details(place)
        
        for user in data.get("details", []):
            if user.get("homerID") == patient_id:
                user["trialCompleted"] = True
                user["trialCompletedAt"] = datetime.now().isoformat()
                user["trialFeedback"] = feedback
                user["qualitativeConducted"] = qualitative_conducted
                user["trialFeedbackFile"] = feedback_file_path
                user["trialQualitativeFile"] = qualitative_file_path
                user["trialAudioFile"] = audio_file_path
                break
        
        # Save qualitative analysis flag
        qualitative_analysis = request.form.get("qualitativeAnalysis", "no")
        
        for user in data.get("details", []):
            if user.get("homerID") == patient_id:
                user["trialCompleted"] = True
                user["trialCompletedAt"] = datetime.now().isoformat()
                user["trialFeedback"] = feedback
                user["trialFeedbackFile"] = feedback_file_path
                user["trialQualitativeFile"] = qualitative_file_path
                user["trialAudioFile"] = audio_file_path
                user["qualitativeAnalysis"] = qualitative_analysis
                break
        
        FileHandler.save_homer_id_details(place, data)
        
        return jsonify({"status": "success", "message": "Trial marked as complete"})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/check_config_mismatch/<patient_id>", methods=["GET"])
def check_config_mismatch(patient_id):
    """Check if the config file StartDate matches the stored activation date.
    Returns mismatch events to display as errors in the timeline."""
    try:
        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )

        from utils.file_handlers import FileHandler
        homer_data = FileHandler.load_homer_id_details(place)
        patient = None
        for d in homer_data.get("details", []):
            if d.get("homerID") == patient_id:
                patient = d
                break

        if not patient:
            return jsonify({"status": "success", "mismatches": []})

        activation_date_str = patient.get("activation_date", "")
        if not activation_date_str:
            return jsonify({"status": "success", "mismatches": []})

        try:
            activation_date = datetime.strptime(activation_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"status": "success", "mismatches": []})

        mismatches = []
        group = patient.get("group", "")
        base_path = os.path.join(Config.META_DATA_PATH, place, patient_id)

        devices_to_check = []
        if group == "experimental":
            devices_to_check = ["Pluto", "Mars"]
        else:
            devices_to_check = ["actilife"]

        for device in devices_to_check:
            config_path = os.path.join(base_path, device, "configdata.csv")
            if not os.path.exists(config_path):
                continue
            try:
                import csv as _csv
                with open(config_path, "r") as f:
                    reader = _csv.DictReader(f)
                    rows = list(reader)
                if not rows:
                    continue
                start_date_str = rows[0].get("StartDate", "")
                if not start_date_str:
                    continue
                # Try both date formats
                config_date = None
                for fmt in ("%d-%m-%Y", "%Y-%m-%d"):
                    try:
                        config_date = datetime.strptime(start_date_str, fmt)
                        break
                    except ValueError:
                        continue
                if not config_date:
                    continue

                if config_date.date() != activation_date.date():
                    diff_days = (config_date.date() - activation_date.date()).days
                    direction = f"+{diff_days}" if diff_days > 0 else str(diff_days)
                    mismatches.append({
                        "device": device,
                        "configDate": config_date.strftime("%d-%m-%Y"),
                        "activationDate": activation_date.strftime("%d-%m-%Y"),
                        "diffDays": diff_days,
                        "direction": direction,
                        "message": f"{device} config StartDate ({config_date.strftime('%d %b %Y')}) differs from activation date ({activation_date.strftime('%d %b %Y')}) by {abs(diff_days)} day(s)"
                    })
            except Exception as e:
                print(f"Error checking config mismatch for {device}: {e}")

        return jsonify({"status": "success", "mismatches": mismatches})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bp.route("/update_activation_date/<patient_id>", methods=["POST"])
def update_activation_date(patient_id):
    """Update a patient's activation date and regenerate timeline."""
    try:
        if not current_session.login_place:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        data_in = request.get_json()
        new_date_str = data_in.get("activationDate", "")
        if not new_date_str:
            return jsonify({"status": "error", "message": "activationDate required"}), 400

        try:
            new_date = datetime.strptime(new_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"status": "error", "message": "Invalid date format"}), 400

        place = (
            current_session.place_info.get(patient_id, current_session.login_place)
            if current_session.is_admin()
            else current_session.login_place
        )

        from utils.file_handlers import FileHandler
        homer_data = FileHandler.load_homer_id_details(place)
        group = "experimental"
        for d in homer_data.get("details", []):
            if d.get("homerID") == patient_id:
                d["activation_date"] = new_date_str
                group = d.get("group", "experimental")
                d["timeline_generated"] = False  # force regen
                break
        FileHandler.save_homer_id_details(place, homer_data)

        # Regenerate timeline
        events = generate_study_events(patient_id, new_date, group)
        all_events = load_events(place)
        all_events[patient_id] = events
        save_events(all_events, place)

        return jsonify({"status": "success", "message": "Activation date updated and timeline regenerated"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500