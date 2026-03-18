import os
import logging
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
from typing import List, Dict, Any

# Configuration 
BUCKET_NAME = "homerclouds"
local_base = "./META-DATA"
# local_base = "/home/admin/dashboard/META-DATA"

PLUTO = ["WFE", "WURD", "FPS", "HOC", "FME1", "FME2"]
MARS = ["ML", "AP", "ML-AP"]
LOGINPLACE = ["Ludhiana", "Manipal", "Ranipet"]

output_fields_p = [
    "Date", "HospitalID", "Name", "Status",
    "ConfigWFE", "ConfigWURD", "ConfigFPS", "ConfigHOC", "ConfigFME1", "ConfigFME2",
    "UsedWFE", "UsedWURD", "UsedFPS", "UsedHOC", "UsedFME1", "UsedFME2"
]
output_fields_archived = [
    "Date", "HospitalID"
]
output_fields_m = [
    "Date", "HospitalID", "Name", "Status",
    "ConfigML", "ConfigAP", "ConfigML-AP",
    "UsedML", "UsedAP", "UsedML-AP"
]

# boto3 client
s3 = boto3.client("s3")

# ---------------- Logging ----------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

def sync_homer_id_details_to_s3(place: str) -> bool:
    """
    Sync homerIdDetails.json from local to S3.
    Returns True if successful, False otherwise.
    """
    local_file = os.path.join(local_base, place, "homerIdDetails.json")
    s3_key = f"{place}/homerIdDetails.json"
    
    if not os.path.exists(local_file):
        logger.warning(f"Local file not found: {local_file}")
        return False
    
    try:
        # Upload file to S3
        s3.upload_file(local_file, BUCKET_NAME, s3_key)
        logger.info(f"Successfully uploaded {local_file} to s3://{BUCKET_NAME}/{s3_key}")
        return True
    except Exception as e:
        logger.error(f"Error uploading {local_file} to S3: {e}")
        return False

def sync_all_homer_id_details_to_s3() -> Dict[str, bool]:
    """
    Sync homerIdDetails.json for all places to S3.
    Returns dict with place -> success status.
    """
    results = {}
    for place in LOGINPLACE:
        results[place] = sync_homer_id_details_to_s3(place)
    return results


def _auto_activate_on_download(place: str, user: str, devices: List[str]):
    """
    Auto-activate experimental patient when configdata.csv is downloaded from S3.
    This is called after downloading files from S3.
    """
    import json
    
    # Check if patient is experimental
    details_path = os.path.join(local_base, place, "homerIdDetails.json")
    if not os.path.exists(details_path):
        logger.info(f"homerIdDetails.json not found for {place}")
        return
    
    try:
        with open(details_path, 'r') as f:
            data = json.load(f)
        
        # Find the patient
        patient = None
        for u in data.get("details", []):
            if u.get("homerID") == user:
                patient = u
                break
        
        if not patient:
            logger.debug(f"Patient {user} not found in homerIdDetails.json")
            return
        
        # Check if experimental
        if patient.get("group") != "experimental":
            logger.debug(f"Patient {user} is not experimental group")
            return
        
        # Check if already activated (both pluto and mars)
        current_status = patient.get("status", {})
        if isinstance(current_status, dict):
            if current_status.get("pluto") == "active" and current_status.get("mars") == "active":
                logger.debug(f"Patient {user} already fully activated")
                return
        
        # Check if configdata.csv exists and get StartDate
        activation_date = None
        for device in devices:
            device_dir = "Pluto" if device == "PLUTO" else "Mars"
            config_path = os.path.join(local_base, place, user, device_dir, "configdata.csv")
            if os.path.exists(config_path):
                try:
                    df = pd.read_csv(config_path)
                    if not df.empty and "StartDate" in df.columns:
                        start_date_str = df.iloc[0].get("StartDate")
                        if start_date_str and pd.notna(start_date_str):
                            activation_date = pd.to_datetime(start_date_str, format="%d-%m-%Y")
                            logger.info(f"Found StartDate for {user}: {activation_date}")
                            break
                except Exception as e:
                    logger.warning(f"Could not read configdata.csv for {user}: {e}")
        
        if not activation_date:
            logger.debug(f"No StartDate found in configdata.csv for {user}")
            return
        
        # Update patient status
        if not isinstance(patient.get("status"), dict):
            patient["status"] = {"pluto": "not_activated", "mars": "not_activated"}
        
        # Activate all devices
        patient["status"]["pluto"] = "active"
        patient["status"]["mars"] = "active"
        
        # Set activation date if not set
        if not patient.get("activation_date"):
            patient["activation_date"] = activation_date.strftime("%Y-%m-%d")
        
        # Save updated details
        with open(details_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Auto-activated experimental patient {user} with StartDate {activation_date}")
        
    except Exception as e:
        logger.error(f"Error in auto-activation for {user}: {e}")



def is_end_date_passed(config_data: Dict[str, Any]) -> bool:
    """
    Check if the end date in config data has passed.
    Returns True if end date exists and is in the past, False otherwise.
    """
    try:
        end_date_str = config_data.get("end_date") or config_data.get("EndDate") or config_data.get("endDate")
        if not end_date_str or pd.isna(end_date_str):
            return False
        
        # Try different date formats
        date_formats = ["%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y", "%m/%d/%Y"]
        
        for date_format in date_formats:
            try:
                end_date = datetime.strptime(str(end_date_str).strip(), date_format).date()
                today = datetime.now().date()
                return end_date < today
            except ValueError:
                continue
        
        logger.warning(f"Could not parse end date: {end_date_str}")
        return False
        
    except Exception as e:
        logger.warning(f"Error checking end date: {e}")
        return False

def archive_user_data(user_data: Dict[str, Any], place: str, device_type: str):
    try:
        archived_dir = os.path.join(local_base, place)
        os.makedirs(archived_dir, exist_ok=True)

        if device_type == "pluto":
            archive_file = os.path.join(archived_dir, "archived_pluto_users.csv")
            fields = output_fields_archived
        else:
            archive_file = os.path.join(archived_dir, "archived_mars_users.csv")
            fields = output_fields_archived

        archive_data = {field: user_data.get(field, "") for field in fields}
        archive_data["ArchivedDate"] = datetime.now().strftime("%d-%m-%Y")
        archive_data["OriginalEndDate"] = user_data.get("EndDate", "") or user_data.get("end_date", "")

        new_df = pd.DataFrame([archive_data])

        # If archive file exists, load and check duplicates
        if os.path.exists(archive_file):
            archive_df = pd.read_csv(archive_file, dtype=str)
            if not archive_df.empty:
                existing_ids = archive_df["HospitalID"].astype(str).tolist()
                if str(user_data.get("HospitalID", "")) in existing_ids:
                    logger.info(f"User {user_data.get('HospitalID')} already archived. Skipping duplicate.")
                    return
            archive_df = pd.concat([archive_df, new_df], ignore_index=True)
        else:
            archive_df = new_df

        archive_df.to_csv(archive_file, index=False)
        logger.info(f"Archived user {user_data.get('HospitalID', 'Unknown')} to {archive_file}")

    except Exception as e:
        logger.error(f"Error archiving user data: {e}")

def process_user_with_archive_check(user_id: str, place: str, devices: List[str]) -> List[Dict[str, Any]]:
    """
    Process one user's devices with end date check and archiving.
    Returns list of result dicts for this user (one per device).
    """
    output_data = []
    users_to_archive = []  # Track users that need archiving

    for device in devices:
        device_dir = "Pluto" if device == "PLUTO" else "Mars"
        config_local = os.path.join(local_base, place, user_id, device_dir, "configdata.csv")
        session_local = os.path.join(local_base, place, user_id, device_dir, "sessions", "sessions.csv")
        extdata_file = os.path.join(local_base, place, user_id, device_dir, "sessions", "extdata.csv")
        date_folder = os.path.join(local_base, place, user_id, device_dir, "Dates")

        if not os.path.exists(config_local) or not os.path.exists(session_local):
            logger.info(f"Skipping processing for {place}/{user_id}/{device_dir} because required files missing.")
            continue

        try:
            config_df = pd.read_csv(config_local)
            if config_df.empty:
                logger.info(f"Config file empty for {place}/{user_id}/{device_dir}. Skipping.")
                continue
            last_config_row = config_df.iloc[-1].to_dict()

            # Check if end date has passed
            if is_end_date_passed(last_config_row):
                logger.info(f"End date passed for user {user_id} in {place}. Will archive data.")
                # We'll process normally but mark for archiving
                archive_needed = True
            else:
                archive_needed = False

            # Mechanism key differs based on device type
            mechanism_key = "Mechanism" if device == "PLUTO" else "Movement"

            # First pass: compute session durations aggregated per Date and SessionNumber
            session_durations = compute_session_durations(session_local, mechanism_key)

            # Second pass: process chunks, write extdata and per-date files, and compute today's mechanism times
            mechanism_times = process_sessions_and_write(session_local, date_folder, extdata_file, mechanism_key, session_durations)

            # Build user-level summary using last_config_row and mechanism_times
            user_data = {
                "Date": datetime.now().strftime("%d-%m-%Y"),
                "HospitalID": last_config_row.get("HospitalNumber", last_config_row.get("HomerID","")),
                "Name": last_config_row.get("name", "") or "",
                "EndDate": last_config_row.get("end_date") or last_config_row.get("EndDate") or ""
            }

            keys = PLUTO if device == "PLUTO" else MARS
            for key in keys:
                # config value may be stored under column named exactly key or another; use safe_get
                cfg_val = last_config_row.get(key, last_config_row.get(str(key), 0))
                user_data[f"Config{key}"] = safe_float(cfg_val, 0.0)
                user_data[f"Used{key}"] = safe_float(mechanism_times.get(key, 0.0), 0.0)

            # status: Done only if for all keys used >= config
            try:
                status_done = all(user_data.get(f"Used{key}", 0.0) >= user_data.get(f"Config{key}", 0.0) for key in keys)
            except Exception:
                status_done = False
            user_data["Status"] = "Done" if status_done else "InComplete"

            # If archive needed, add to archive list and skip adding to active users
            if archive_needed:
                users_to_archive.append({
                    "user_data": user_data,
                    "device_type": "pluto" if device == "PLUTO" else "mars",
                    "place": place
                })
                continue  # skip 

            output_data.append(user_data)

        except Exception as e:
            logger.exception(f"Failed processing for user {user_id} / device {device}: {e}")

    # Archive users whose end date has passed
    for archive_item in users_to_archive:
        archive_user_data(archive_item["user_data"], archive_item["place"], archive_item["device_type"])

    return output_data

def get_user_devices(user_id: str, place: str) -> List[str]:
    """
    Quick check for device prefixes under a user. Returns list containing "PLUTO" and/or "MARS".
    """
    devices = []
    prefixes = {
        "PLUTO": f"{place}/{user_id}/Pluto/",
        "MARS": f"{place}/{user_id}/Mars/"
    }
    for dev, prefix in prefixes.items():
        try:
            resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, MaxKeys=1)
            if resp.get("Contents"):
                devices.append(dev)
        except Exception as e:
            logger.warning(f"Error checking {dev} for {user_id} at {place}: {e}")
    return devices

def download_required_files(place: str, user: str, device: str) -> bool:
    """
    Ensure configdata.csv and sessions/sessions.csv are downloaded locally if newer on S3.
    Returns True if any file was downloaded/updated, False otherwise.
    """
    device_dir = "Pluto" if device == "PLUTO" else "Mars"
    prefix = f"{place}/{user}/{device_dir}/"
    files = [f"{prefix}configdata.csv", f"{prefix}sessions/sessions.csv"]
    updated = False

    for key in files:
        local_path = os.path.join(local_base, key)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        # Head object to get S3 last modified
        try:
            s3_obj = s3.head_object(Bucket=BUCKET_NAME, Key=key)
            s3_lastmodified = s3_obj["LastModified"].timestamp()  # float seconds since epoch (UTC)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                logger.info(f"Skipping {key}: Not found in S3")
                continue
            else:
                logger.exception(f"Error in head_object for {key}")
                continue

        # If local exists and is up-to-date, skip
        if os.path.exists(local_path):
            local_mtime = os.path.getmtime(local_path)  # seconds since epoch (local)
            # Compare numeric timestamps (both seconds since epoch), more robust across tz
            if local_mtime >= s3_lastmodified:
                # Local file is already up-to-date
                continue

        # Download atomically to temp then replace
        tmp_path = local_path + ".tmp"
        try:
            logger.info(f"Downloading {key} -> {local_path}")
            s3.download_file(BUCKET_NAME, key, tmp_path)
            os.replace(tmp_path, local_path)
            updated = True
        except Exception as e:
            logger.exception(f"Error downloading {key}: {e}")
            # cleanup tmp if exists
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass

    return updated

# ------------------- Listing users with boto3 -------------------
def download_homer_id_details():
    """
    Download homerIdDetails.json for each location.
    """
    for place in LOGINPLACE:
        s3_key = f"{place}/homerIdDetails.json"
        local_path = os.path.join(local_base, place, "homerIdDetails.json")

        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        try:
            logger.info(f"Downloading {s3_key} -> {local_path}")
            s3.download_file(BUCKET_NAME, s3_key, local_path)
        except ClientError as e:
            logger.warning(f"File not found for {place}: {e}")
        except Exception as e:
            logger.error(f"Error downloading {s3_key}: {e}")
def list_user_ids(place: str) -> List[str]:
    """
    List the top-level user IDs under a place. Uses Delimiter='/' to get CommonPrefixes.
    """
    prefix = f"{place}/"
    continuation_token = None
    user_ids = []
    try:
        while True:
            if continuation_token:
                resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, Delimiter='/', ContinuationToken=continuation_token)
            else:
                resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, Delimiter='/')
            for cp in resp.get("CommonPrefixes", []):
                # CommonPrefix like 'Ludhiana/USERID/'
                p = cp.get("Prefix", "")
                parts = p.split("/")
                if len(parts) >= 2 and parts[1]:
                    user_ids.append(parts[1])
            if resp.get("IsTruncated"):
                continuation_token = resp.get("NextContinuationToken")
            else:
                break
    except Exception as e:
        logger.exception(f"Failed to list user ids for place {place}: {e}")
    return user_ids

# ------------------- Processing (two-pass chunked) -------------------

def compute_session_durations(session_local: str, mechanism_key: str) -> Dict[tuple, float]:
    """
    First pass: iterate chunks and compute total GameDuration (minutes) per (Date, SessionNumber).
    Return dict keyed by (date_str_dd-mm-YYYY, sessionnumber) -> total_minutes
    """
    session_durations = {}
    if not os.path.exists(session_local):
        return session_durations

    try:
        for chunk in pd.read_csv(session_local, skiprows= 3 if mechanism_key == "Mechanism" else 3, chunksize=5000, usecols=lambda c: True, dtype=str):
            # Ensure columns exist safely, parse DateTime and MoveTime
            if "DateTime" not in chunk.columns or "MoveTime" not in chunk.columns or "SessionNumber" not in chunk.columns:
                continue
            # parse DateTime and MoveTime robustly
            chunk["DateTime"] = pd.to_datetime(chunk["DateTime"], errors="coerce")
            chunk = chunk.dropna(subset=["DateTime"])
            # MoveTime numeric
            chunk["MoveTime"] = pd.to_numeric(chunk["MoveTime"], errors="coerce").fillna(0.0)
            # GameDuration in minutes
            chunk["GameDuration"] = (chunk["MoveTime"] / 60.0).round(4)
            chunk["Date"] = chunk["DateTime"].dt.strftime("%d-%m-%Y")

            grouped = chunk.groupby(["Date", "SessionNumber"], as_index=False)["GameDuration"].sum()
            for _, r in grouped.iterrows():
                key = (r["Date"], str(r["SessionNumber"]))
                session_durations[key] = session_durations.get(key, 0.0) + float(r["GameDuration"])
    except Exception as e:
        logger.exception(f"Error in compute_session_durations for {session_local}: {e}")

    return session_durations

def process_sessions_and_write(session_local: str, date_folder: str, extdata_file: str, mechanism_key: str,
                               session_durations: Dict[tuple, float]) -> Dict[str, float]:
    """
    Second pass: iterate chunks again, write extdata.csv and per-date grouped CSVs.
    Also compute mechanism_times for today's date and return mapping mechanism->minutes (rounded to 2 decimals).
    """
    mechanism_times_seconds = {}  # accumulate MoveTime in seconds for today per mechanism
    if not os.path.exists(session_local):
        return {}

    os.makedirs(os.path.dirname(extdata_file), exist_ok=True)
    os.makedirs(date_folder, exist_ok=True)

    # Collect all extdata and date data first, then write once
    ext_data_frames = []
    date_data_dict = {}  # {date: list_of_dataframes}

    today_iso = datetime.now().strftime("%Y-%m-%d")

    try:
        for chunk in pd.read_csv(session_local, skiprows= 3 if mechanism_key == "Mechanism" else 3, chunksize=5000, dtype=str):
            if "DateTime" not in chunk.columns:
                continue
            chunk["DateTime"] = pd.to_datetime(chunk["DateTime"], errors="coerce")
            chunk = chunk.dropna(subset=["DateTime"])
            # Columns used: DateTime, SessionNumber, GameName, MoveTime, (Mechanism or Movement)
            # Ensure presence
            if "SessionNumber" not in chunk.columns or "GameName" not in chunk.columns or "MoveTime" not in chunk.columns:
                continue
            mech_present = mechanism_key in chunk.columns
            if not mech_present:
                chunk[mechanism_key] = ""  # fill missing mechanism column

            # Numeric conversions
            chunk["MoveTime"] = pd.to_numeric(chunk["MoveTime"], errors="coerce").fillna(0.0)
            chunk["GameDuration"] = (chunk["MoveTime"] / 60.0).round(4)
            chunk["Date"] = chunk["DateTime"].dt.strftime("%d-%m-%Y")
            # Format DateTime text for extdata per your original: dd-mm-YYYY HH:MM:SS
            chunk["DateTime_str"] = chunk["DateTime"].dt.strftime("%d-%m-%Y %H:%M:%S")

            # Build extdata rows: DateTime, SessionNumber, SessionDuration, GameName, GameDuration, Mechanism, MoveTime
            ext_rows = []
            for _, row in chunk.iterrows():
                date_str = row["Date"]
                sess_num = str(row["SessionNumber"])
                session_duration = session_durations.get((date_str, sess_num), 0.0)
                ext_rows.append({
                    "DateTime": row["DateTime_str"],
                    "SessionNumber": sess_num,
                    "SessionDuration": round(float(session_duration), 4),
                    "GameName": row.get("GameName", ""),
                    "GameDuration": round(float(row.get("GameDuration", 0.0)), 4),
                    mechanism_key: row.get(mechanism_key, ""),
                    "MoveTime": float(row.get("MoveTime", 0.0))
                })

            # Collect extdata
            ext_df = pd.DataFrame(ext_rows)
            if not ext_df.empty:
                ext_data_frames.append(ext_df)

            # Per-date grouped summaries: group by Date, SessionNumber, mechanism_key, GameName and sum GameDuration
            grouped = chunk.groupby(["Date", "SessionNumber", mechanism_key, "GameName"], as_index=False)["GameDuration"].sum()

            # Collect date data
            for date, date_group in grouped.groupby("Date"):
                if date not in date_data_dict:
                    date_data_dict[date] = []
                date_data_dict[date].append(date_group[["SessionNumber", mechanism_key, "GameName", "GameDuration"]])

            # Compute today's mechanism times (compare DateTime to today's ISO)
            # Note: chunk["DateTime"] is datetime; convert to date string in ISO to compare
            chunk_today = chunk[chunk["DateTime"].dt.strftime("%Y-%m-%d") == today_iso]
            if not chunk_today.empty:
                for _, r in chunk_today.iterrows():
                    mech = r.get(mechanism_key, "")
                    mechanism_times_seconds[mech] = mechanism_times_seconds.get(mech, 0.0) + float(r.get("MoveTime", 0.0))

    except Exception as e:
        logger.exception(f"Error in process_sessions_and_write for {session_local}: {e}")

    # Write extdata.csv once with all data
    if ext_data_frames:
        final_ext_df = pd.concat(ext_data_frames, ignore_index=True)
        final_ext_df.to_csv(extdata_file, index=False)
        logger.info(f"Created extdata.csv: {extdata_file} (rows={len(final_ext_df)})")

    # Write date files once with all data (replace existing files)
    for date, date_frames in date_data_dict.items():
        if date_frames:
            out_path = os.path.join(date_folder, f"{date}.csv")
            combined_date_df = pd.concat(date_frames, ignore_index=True)
            # Remove duplicates based on key columns
            combined_date_df = combined_date_df.drop_duplicates(
                subset=["SessionNumber", mechanism_key, "GameName"], 
                keep="last"
            )
            combined_date_df.to_csv(out_path, index=False)
            logger.info(f"Created date file: {out_path} (rows={len(combined_date_df)})")

    # Convert seconds -> minutes and round to 2 decimals
    mechanism_times_minutes = {k: round(v / 60.0, 2) for k, v in mechanism_times_seconds.items()}
    return mechanism_times_minutes

def safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except Exception:
        try:
            # pandas NaN case
            return float(pd.to_numeric(val, errors="coerce")) if pd.notnull(val) else default
        except Exception:
            return default

# ------------------- CSV helpers -------------------

def append_or_create_csv(file_path: str, new_data: List[Dict[str, Any]], columns: List[str]):
    """
    COMPLETELY REPLACES the existing file with new data.
    This prevents any duplicate entries.
    """
    if not new_data:
        logger.info(f"No new data for {file_path}, skipping file creation.")
        return
    
    new_df = pd.DataFrame(new_data, columns=columns)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    # ALWAYS create new file (overwrite if exists) - NO appending
    new_df.to_csv(file_path, index=False)
    logger.info(f"Created summary CSV: {file_path} (rows={len(new_df)})")

# ------------------- ThreadPool helpers -------------------

def process_single_user(user: str, place: str, devices: List[str]) -> Dict[str, Any]:
    """
    Called in thread pool. Downloads necessary files (if newer) and processes the user. Returns structured result.
    """
    result = {"pluto": [], "mars": [], "control": None}

    # Always try to download updated files for devices
    for device in devices:
        try:
            download_required_files(place, user, device)
            # Don't check updated_any - we want to process even if files weren't updated
        except Exception:
            logger.exception(f"Error downloading files for {place}/{user}/{device}")

    # Auto-activate experimental patient after downloading configdata.csv
    try:
        _auto_activate_on_download(place, user, devices)
    except Exception as e:
        logger.warning(f"Auto-activation check failed for {place}/{user}: {e}")

    if not devices:
        # treat as control device as in original code
        result["control"] = {
            "Date": datetime.now().strftime("%d-%m-%Y"),
            "HospitalID": user,
            "place": place,
            "Group": "control"
        }
        return result

    # Check if we have local files to process (regardless of whether they were just updated)
    any_local_present = False
    for device in devices:
        device_dir = "Pluto" if device == "PLUTO" else "Mars"
        config_local = os.path.join(local_base, place, user, device_dir, "configdata.csv")
        session_local = os.path.join(local_base, place, user, device_dir, "sessions", "sessions.csv")
        if os.path.exists(config_local) and os.path.exists(session_local):
            any_local_present = True
            break

    if not any_local_present:
        # nothing to process locally
        logger.info(f"No local files present for {place}/{user}. Returning empty result.")
        return result

    # PROCESS THE USER regardless of whether files were updated
    # This ensures we process all users with valid local data
    try:
        # Use the new function with archive check
        data = process_user_with_archive_check(user, place, devices)
        for row in data:
            # detect pluto vs mars by presence of ConfigWFE key used in user_data
            if any(k.startswith("ConfigWFE") for k in row.keys()) or "ConfigWFE" in row:
                result["pluto"].append(row)
            else:
                result["mars"].append(row)
    except Exception as e:
        logger.exception(f"Error processing user {place}/{user}: {e}")

    return result

# ------------------- Main -------------------

def main():
    pluto_all, mars_all, control_all = [], [], []
    processed_users = set()  # Track processed users to avoid duplicates

    logger.info(f"Script started at: {datetime.now().isoformat()}")
    # download_homer_id_details();
    max_workers = 4

    for place in LOGINPLACE:
        users = list_user_ids(place)
        if not users:
            logger.info(f"No users found for place {place}. Continuing.")
            continue

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_user = {}
            for user in users:
                if user == "logs":
                    continue
                
                user_key = f"{place}/{user}"
                if user_key in processed_users:
                    logger.info(f"Skipping already processed user: {user_key}")
                    continue
                processed_users.add(user_key)
                
                devices = get_user_devices(user, place)
                future = executor.submit(process_single_user, user, place, devices)
                future_to_user[future] = user

            for future in as_completed(future_to_user):
                user = future_to_user[future]
                try:
                    user_data = future.result()
                except Exception as e:
                    logger.exception(f"Future for user {user} raised exception: {e}")
                    continue

                # Use extend instead of append to avoid nested lists
                pluto_all.extend(user_data.get("pluto", []))
                mars_all.extend(user_data.get("mars", []))
                if user_data.get("control"):
                    control_all.append(user_data["control"])

        # Create fresh files for each place (REPLACE, don't append)
        append_or_create_csv(os.path.join(local_base, place, "plutoUserDetails.csv"), pluto_all, output_fields_p)
        append_or_create_csv(os.path.join(local_base, place, "marsUserDetails.csv"), mars_all, output_fields_m)
        append_or_create_csv(os.path.join(local_base, place, "controlUserDetails.csv"), control_all, ["Date", "HospitalID", "place", "Group"])
        sync_success = sync_homer_id_details_to_s3(place)
        if sync_success:
            logger.info(f"Synced homerIdDetails.json to S3 for {place}")
        else:
            logger.warning(f"Failed to sync homerIdDetails.json to S3 for {place}")

        # Clear for next place
        pluto_all.clear()
        mars_all.clear()
        control_all.clear()

    logger.info("Processing completed.")

if __name__ == "__main__":
    main()