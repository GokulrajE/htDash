from flask import Blueprint, request, jsonify
from config import Config
import json
import os
import time
import threading
from datetime import datetime
from models.user import current_session

bp = Blueprint('auth', __name__)

# ── In-process login rate limiter ─────────────────────────────────────────────
# Stores {ip: [timestamp, ...]} for failed attempts within the rolling window.
_failed_attempts: dict = {}
_failed_lock = threading.Lock()
_MAX_ATTEMPTS = 10          # max failures before lockout
_WINDOW_SECONDS = 300       # 5-minute rolling window
_LOCKOUT_SECONDS = 600      # 10-minute lockout after max failures


def _get_current_user_id():
    """Get the current logged-in user's ID from session"""
    try:
        from flask import session as flask_session
        return flask_session.get('loginid') or current_session.login_place or 'unknown'
    except:
        return current_session.login_place or 'unknown'


def log_user_activity(action, data=None, user_id=None):
    """
    Log user activity to a text file in user_logs folder.
    Creates a separate TXT file for each user.
    
    Args:
        action: The action being performed (e.g., 'PATIENT_DELETED', 'STUDY_RESUMED')
        data: Additional data to log (dict)
        user_id: The user ID (defaults to current logged in user)
    """
    if user_id is None:
        user_id = _get_current_user_id()
    
    safe_user_id = "".join(c for c in str(user_id) if c.isalnum() or c in "-_")
    if not safe_user_id:
        safe_user_id = "unknown"
    
    now = datetime.now()
    date_str = now.strftime("%d-%m-%Y")
    time_str = now.strftime("%H:%M:%S")
    
    message = action
    if data:
        if isinstance(data, dict):
            parts = [str(v) for k, v in data.items() if v and k not in ('timestamp', 'page')]
            if parts:
                message = action + " | " + " | ".join(parts)
        elif isinstance(data, str):
            message = action + " | " + data
    
    log_line = f"{date_str} {time_str} INFO >> {message}"
    
    os.makedirs(Config.LOG_DIR, exist_ok=True)
    filename = os.path.join(Config.LOG_DIR, f"{safe_user_id}.txt")
    
    try:
        with open(filename, "a") as f:
            f.write(log_line + "\n")
    except Exception as e:
        print(f"Error logging user activity: {e}")


def _check_rate_limit(ip: str) -> bool:
    """Returns True if this IP is currently locked out."""
    now = time.time()
    with _failed_lock:
        attempts = [t for t in _failed_attempts.get(ip, []) if now - t < _WINDOW_SECONDS]
        _failed_attempts[ip] = attempts
        return len(attempts) >= _MAX_ATTEMPTS


def _record_failure(ip: str) -> None:
    now = time.time()
    with _failed_lock:
        _failed_attempts.setdefault(ip, []).append(now)


def _clear_failures(ip: str) -> None:
    with _failed_lock:
        _failed_attempts.pop(ip, None)
# ──────────────────────────────────────────────────────────────────────────────


@bp.route("/validate_login", methods=["POST"])
def validate_login():
    ip = request.remote_addr or "unknown"

    if _check_rate_limit(ip):
        return jsonify({
            "status": "error",
            "message": "Too many failed login attempts. Please wait a few minutes."
        }), 429

    data = request.json or {}
    loginid = data.get("loginid", "").strip()
    password = data.get("password", "").strip()

    if not loginid or not password:
        return jsonify({"status": "error", "message": "Login ID and Password cannot be empty."}), 400

    user_data = Config.LOGIN_CREDENTIALS.get(loginid)
    if user_data and user_data["password"] == password:
        _clear_failures(ip)
        from flask import session as flask_session
        flask_session.clear()
        current_session.set_session(
            login_place=user_data["place"],
            privilege=user_data.get("privilege", "user")
        )
        return jsonify({
            "status": "success",
            "loginid": loginid,
            "place": user_data["place"],
            "privilege": user_data.get("privilege", "user")
        }), 200
    else:
        _record_failure(ip)
        return jsonify({"status": "error", "message": "Invalid Login ID or Password."}), 401


@bp.route("/logout", methods=["POST"])
def logout():
    from flask import session as flask_session
    flask_session.clear()
    return jsonify({"status": "success"})


@bp.route("/track-activity", methods=["POST"])
def track_activity():
    data = request.get_json() or {}
    user_id = data.get("user_id", "unknown")

    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    # Use the new logging function - pass all data as details
    log_user_activity(
        action=data.get("action", "activity"),
        data=data.get("details"),
        user_id=user_id
    )

    return jsonify({"status": "activity logged"})


def log_patient_delete(patient_id, reason, deleted_by=None):
    """Log patient deletion with reason"""
    log_user_activity(
        action="PATIENT_DELETED",
        data={"patient_id": patient_id, "reason": reason},
        user_id=deleted_by
    )


def log_study_resume(patient_id, resume_date, notes, resumed_by=None):
    """Log study resume with date and notes"""
    log_user_activity(
        action="STUDY_RESUMED",
        data={"patient_id": patient_id, "resume_date": resume_date},
        user_id=resumed_by
    )


def log_patient_created(patient_id, training_side, created_by=None):
    """Log patient creation"""
    log_user_activity(
        action="PARTICIPANT_CREATED",
        data={"patient_id": patient_id, "side": training_side},
        user_id=created_by
    )


def log_group_assigned(patient_id, group, assigned_by=None):
    """Log group assignment"""
    log_user_activity(
        action="GROUP_ASSIGNED",
        data={"patient_id": patient_id, "group": group},
        user_id=assigned_by
    )


def log_patient_activated(patient_id, activation_date, group, activated_by=None):
    """Log patient activation"""
    log_user_activity(
        action="PATIENT_ACTIVATED",
        data={"patient_id": patient_id, "activation_date": activation_date, "group": group},
        user_id=activated_by
    )


def log_patient_discontinued(patient_id, reason, discontinued_by=None):
    """Log patient discontinuation"""
    log_user_activity(
        action="PATIENT_DISCONTINUED",
        data={"patient_id": patient_id, "reason": reason},
        user_id=discontinued_by
    )


def log_adverse_event(patient_id, event_type, adverse_by=None):
    """Log adverse event"""
    log_user_activity(
        action="ADVERSE_EVENT_ADDED",
        data={"patient_id": patient_id, "event_type": event_type},
        user_id=adverse_by
    )


def log_adl_session(patient_id, exercises_count, recorded_by=None):
    """Log ADL session recording"""
    log_user_activity(
        action="ADL_SESSION_RECORDED",
        data={"patient_id": patient_id, "exercises": exercises_count},
        user_id=recorded_by
    )


def log_vcg_session(patient_id, exercises_count, recorded_by=None):
    """Log VCG session recording"""
    log_user_activity(
        action="VCG_SESSION_RECORDED",
        data={"patient_id": patient_id, "exercises": exercises_count},
        user_id=recorded_by
    )


def log_call(patient_id, call_type, logged_by=None):
    """Log patient call"""
    log_user_activity(
        action="CALL_LOGGED",
        data={"patient_id": patient_id, "type": call_type},
        user_id=logged_by
    )