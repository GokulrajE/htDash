from flask import Blueprint, request, jsonify
import pandas as pd
from datetime import datetime, timedelta
import os
from config import Config
from models.user import current_session
from utils.data_processors import DataProcessor
 
bp = Blueprint("charts", __name__)
 
 
@bp.route("/get_hospital_details/<hospital_id>", methods=["GET"])
def get_hospital_details(hospital_id):
    if not hospital_id:
        return jsonify({"error": "Hospital ID required"}), 400
 
    # Determine place
    if current_session.is_admin():
        place = current_session.place_info.get(hospital_id, current_session.login_place)
    else:
        place = current_session.login_place
 
    details = DataProcessor.get_hospital_details(
        hospital_id, current_session.device_name, place
    )
 
    if details:
        return jsonify(details)
    else:
        return jsonify({"error": "Data not found for the given Hospital ID"}), 404
 
 
@bp.route("/chart-data/<hospital_id>/<device_name>", methods=["GET"])
def get_chart_data(hospital_id, device_name):
    print(device_name)
    

    print("Current working dir:", os.getcwd())
    try:
        # Determine place
        if current_session.is_admin():
            place = current_session.place_info.get(
                hospital_id, current_session.login_place
            )
        else:
            place = current_session.login_place
 
        config_file = os.path.join(
            Config.META_DATA_PATH, place, hospital_id, device_name, Config.CONFIG_DATA
        )
        ext_file = os.path.join(
            Config.META_DATA_PATH,
            place,
            hospital_id,
            device_name,
            "sessions/extdata.csv",
        )
 
        if not os.path.exists(config_file) or not os.path.exists(ext_file):
            print(f"Missing files - Config: {config_file}, Ext: {ext_file}")
            return jsonify({"error": "Data files not found"}), 404
 
        ext_data = pd.read_csv(ext_file)
        config_data = pd.read_csv(config_file)
 
        # Parse dates — study is always 30 days from StartDate
        # Parse StartDate safely
        start_date = pd.to_datetime(
            config_data["StartDate"].iloc[0],
            dayfirst=True,
            errors="coerce"
        )
 
        if pd.isna(start_date):
            return jsonify({"error": "Invalid StartDate format"}), 400
 
        end_date = start_date + timedelta(days=29)
        current_date = datetime.now().date()
 
        # Generate date range
        date_range = [
            start_date + timedelta(days=i)
            for i in range((end_date - start_date).days + 1)
        ]
 
        # Parse ext_data safely
        ext_data["DateTime"] = pd.to_datetime(
            ext_data["DateTime"],
            dayfirst=True,
            errors="coerce"
        )
 
        ext_data = ext_data.dropna(subset=["DateTime"])
        ext_data["Date"] = ext_data["DateTime"].dt.date
 
        # Aggregate session durations
        session_duration_by_date = ext_data.groupby("Date")["MoveTime"].sum() / 60
 
        # Prepare data — line_data must align 1-to-1 with labels (full date_range)
        # Use None for future dates so Chart.js shows gaps, not zeros
        labels = [date.strftime("%Y-%m-%d") for date in date_range]
        line_data = [
            round(float(session_duration_by_date.get(date.date(), 0)), 2)
            if date.date() <= current_date else None
            for date in date_range
        ]
 
        bubble_data = [
            {
                "x": date.strftime("%Y-%m-%d"),
                "y": session_duration_by_date.get(date.date(), 0),
                "r": 10,
            }
            for date in date_range
        ]
 
        # Get target time
        horizontal_line_y = (
            int(config_data["TotalTime"].iloc[-1])
            if current_session.device_name in ["Pluto", "Mars"]
            else 60
        )
 
        horizontal_line_data = [
            {"x": label, "y": horizontal_line_y} for label in labels
        ]
 
        chart_data = {
            "labels": labels,
            "datasets": [
                {
                    "label": "Session Duration",
                    "data": line_data,
                    "borderColor": "navy",
                    "backgroundColor": None,
                    "type": "line",
                    "fill": True,
                },
                {
                    "label": "Session Bubble",
                    "data": bubble_data,
                    "backgroundColor": "rgba(46, 139, 87, 0.6)",
                    "hoverBackgroundColor": "rgba(46, 139, 87, 0.8)",
                    "type": "bubble",
                },
                {
                    "label": "Target Line",
                    "data": horizontal_line_data,
                    "borderColor": "red",
                    "borderDash": [10, 5],
                    "type": "line",
                    "fill": False,
                },
            ],
        }
 
        return jsonify(chart_data)
 
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
 
 
@bp.route(
    "/fetch-mechanism-data/<hospital_id>/<selected_date>/<device_name>", methods=["GET"]
)
def fetch_mechanism_data(hospital_id, selected_date, device_name):
    """Fetch mechanism data for a specific date"""
    try:
        # Normalize device name to handle lowercase from frontend
        device_name_normalized = (
            device_name.lower().capitalize()
            if device_name.lower() in ["pluto", "mars"]
            else device_name
        )
 
        # Determine place
        if current_session.is_admin():
            place = current_session.place_info.get(
                hospital_id, current_session.login_place
            )
        else:
            place = current_session.login_place
 
        # Construct file path - use original name for file path
        date_file = os.path.join(
            Config.META_DATA_PATH,
            place,
            hospital_id,
            device_name,
            Config.DATES_FOLDER,
            f"{selected_date}.csv",
        )
 
        if not os.path.exists(date_file):
            return jsonify({"error": f"Date file not found: {date_file}"}), 404
 
        date_data = pd.read_csv(date_file)
 
        # Determine mechanism column name - use normalized name for config check
        if device_name_normalized == Config.PLUTO_LABEL:
            mechanism_col = "Mechanism"
            static_mechanisms = Config.PLUTO_MECHANISMS
        elif device_name_normalized == Config.MARS_LABEL:
            mechanism_col = "Movement"
            static_mechanisms = Config.MARS_MECHANISMS
        else:
            return jsonify(
                {
                    "error": f"Invalid device type: {device_name} (normalized: {device_name_normalized})"
                }
            ), 400
 
        # Group by mechanism
        mechanism_duration = (
            date_data.groupby(mechanism_col)["GameDuration"].sum().reset_index()
        )
 
        mechanisms = mechanism_duration[mechanism_col].tolist()
        durations = mechanism_duration["GameDuration"].tolist()
 
        # Ensure all mechanisms are present
        final_durations = []
        for mechanism in static_mechanisms:
            if mechanism in mechanisms:
                final_durations.append(durations[mechanisms.index(mechanism)])
            else:
                final_durations.append(0)
 
        # Get prescribed times from config
        config_file = os.path.join(
            Config.META_DATA_PATH, place, hospital_id, device_name, Config.CONFIG_DATA
        )
 
        lines = []
        if os.path.exists(config_file):
            config_data = pd.read_csv(config_file)
            for mechanism in static_mechanisms:
                if mechanism in config_data.columns:
                    lines.append(int(config_data[mechanism].iloc[-1]))
                else:
                    lines.append(0)
        else:
            lines = [0] * len(static_mechanisms)
 
        chart_data = {
            "mechanisms": static_mechanisms,
            "durations": final_durations,
            "lines": lines,
        }
 
        return jsonify(chart_data)
 
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
 
 
@bp.route("/get-patient-mechanisms/<hospital_id>", methods=["GET"])
def get_patient_mechanisms(hospital_id):
    """Get all mechanisms used by a patient from their config files"""
    try:
        from models.user import current_session
        import pandas as pd
        from datetime import datetime
 
        if not current_session.login_place:
            return jsonify({"error": "Not logged in"}), 401
 
        login_place = current_session.login_place
        # Correct path: META_DATA_PATH / place / hospital_id / Device / configdata.csv
        base_path = os.path.join(Config.META_DATA_PATH, login_place)
 
        mechanisms = []
        last_updated = None
 
        # Check Pluto config (capital P to match Config.PLUTO_LABEL)
        pluto_config = os.path.join(base_path, hospital_id, Config.PLUTO_LABEL, "configdata.csv")
        if os.path.exists(pluto_config):
            # Get file modification time
            file_mtime = os.path.getmtime(pluto_config)
            file_date = datetime.fromtimestamp(file_mtime)
            if last_updated is None or file_date > last_updated:
                last_updated = file_date
            try:
                df = pd.read_csv(pluto_config)
                pluto_mechs = Config.PLUTO_MECHANISMS  # ["WFE", "WURD", "FPS", "HOC", "FME1", "FME2"]
                for mech in pluto_mechs:
                    if mech in df.columns:
                        total = df[mech].sum()
                        if total > 0:
                            mechanisms.append(
                                {
                                    "name": mech,
                                    "device": "PLUTO",
                                    "totalDuration": float(total),
                                }
                            )
            except Exception as e:
                print(f"Error reading Pluto config: {e}")
 
        # Check Mars config (capital M to match Config.MARS_LABEL)
        mars_config = os.path.join(base_path, hospital_id, Config.MARS_LABEL, "configdata.csv")
        if os.path.exists(mars_config):
            # Get file modification time
            file_mtime = os.path.getmtime(mars_config)
            file_date = datetime.fromtimestamp(file_mtime)
            if last_updated is None or file_date > last_updated:
                last_updated = file_date
            try:
                df = pd.read_csv(mars_config)
                mars_mechs = ["ML", "AP", "MLAP"]
                for mech in mars_mechs:
                    if mech in df.columns:
                        total = df[mech].sum()
                        if total > 0:
                            mechanisms.append(
                                {
                                    "name": mech,
                                    "device": "MARS",
                                    "totalDuration": float(total),
                                }
                            )
            except Exception as e:
                print(f"Error reading Mars config: {e}")
 
        return jsonify(
            {
                "mechanisms": mechanisms,
                "hospital_id": hospital_id,
                "last_updated": last_updated.strftime("%Y-%m-%d %H:%M:%S")
                if last_updated
                else None,
            }
        )
 
    except Exception as e:
        print(f"Error getting patient mechanisms: {e}")
        return jsonify({"error": str(e)}), 500
 
 
@bp.route("/device-usage-overview", methods=["GET"])
def get_device_usage_overview():
    """
    Return daily session minutes for PLUTO and MARS across all assigned patients
    for the current site. Returns last 60 days of data aggregated by date.
    """
    try:
        place = current_session.login_place
        if current_session.is_admin():
            # Admin: pick a specific place from query param or default
            place = request.args.get("place", current_session.login_place)
 
        site_dir = os.path.join(Config.META_DATA_PATH, place)
        if not os.path.exists(site_dir):
            return jsonify({"pluto": [], "mars": [], "labels": []})
 
        from collections import defaultdict
        pluto_by_date = defaultdict(float)
        mars_by_date = defaultdict(float)
 
        # Walk every patient folder in this site
        for patient_id in os.listdir(site_dir):
            patient_dir = os.path.join(site_dir, patient_id)
            if not os.path.isdir(patient_dir):
                continue
 
            for device, store in [("Pluto", pluto_by_date), ("Mars", mars_by_date)]:
                ext_file = os.path.join(patient_dir, device, "sessions", "extdata.csv")
                if not os.path.exists(ext_file):
                    continue
                try:
                    df = pd.read_csv(ext_file)
                    if df.empty or "DateTime" not in df.columns or "MoveTime" not in df.columns:
                        continue
                    df["DateTime"] = pd.to_datetime(df["DateTime"], format="%d-%m-%Y %H:%M:%S", errors="coerce")
                    df = df.dropna(subset=["DateTime"])
                    df["Date"] = df["DateTime"].dt.date
                    daily = df.groupby("Date")["MoveTime"].sum() / 60
                    for date, minutes in daily.items():
                        store[date] += minutes
                except Exception:
                    continue
 
        # Build a unified date range covering all data (last 60 days max)
        from datetime import date, timedelta
        today = date.today()
        cutoff = today - timedelta(days=59)
 
        all_dates = set()
        for d in pluto_by_date:
            if d >= cutoff:
                all_dates.add(d)
        for d in mars_by_date:
            if d >= cutoff:
                all_dates.add(d)
 
        if not all_dates:
            return jsonify({"pluto": [], "mars": [], "labels": []})
 
        sorted_dates = sorted(all_dates)
        labels = [d.strftime("%d %b") for d in sorted_dates]
        pluto_vals = [round(pluto_by_date.get(d, 0), 1) for d in sorted_dates]
        mars_vals  = [round(mars_by_date.get(d, 0), 1) for d in sorted_dates]
 
        return jsonify({
            "labels": labels,
            "pluto": pluto_vals,
            "mars": mars_vals
        })
 
    except Exception as e:
        print(f"Error in device_usage_overview: {e}")
        return jsonify({"error": str(e)}), 500
 