import os
import csv
import json
import tempfile
import pandas as pd
from datetime import datetime
from config import Config
import shutil


class FileHandler:

    @staticmethod
    def load_homer_id_details(place):
        """Load homer ID details for a specific place"""
        dir_path = os.path.join(Config.META_DATA_PATH, place)
        os.makedirs(dir_path, exist_ok=True)
        file_path = os.path.join(dir_path, Config.HOMER_ID_DETAILS)
        if not os.path.exists(file_path):
            return {"details": []}
        with open(file_path, "r") as f:
            return json.load(f)

    @staticmethod
    def save_homer_id_details(place, data):
        """Save homer ID details atomically to prevent corruption on concurrent writes"""
        dir_path = os.path.join(Config.META_DATA_PATH, place)
        os.makedirs(dir_path, exist_ok=True)
        file_path = os.path.join(dir_path, Config.HOMER_ID_DETAILS)
        # Write to temp file then rename — atomic on POSIX systems
        tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
        try:
            with os.fdopen(tmp_fd, "w") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_path, file_path)
        except Exception:
            os.unlink(tmp_path)
            raise

    @staticmethod
    def add_new_homer_id(place, hospital_id, training_side, group):
        """Add a new homer ID to the system, generating a collision-safe ID"""
        data = FileHandler.load_homer_id_details(place)
        if "details" not in data:
            data["details"] = []

        PLACE_MAP = {
            "Manipal": "MAHE",
            "Ranipet": "CMCV",
            "Ludhiana": "CMCL"
        }
        place_code = PLACE_MAP.get(place, "UNK")
        prefix = f"HO{place_code}"

        # Find max existing numeric suffix to avoid collisions after deletions
        max_num = 0
        for item in data["details"]:
            hid = item.get("homerID", "")
            if hid.startswith(prefix):
                try:
                    num = int(hid[len(prefix):])
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass

        next_num = max_num + 1
        homer_id = f"{prefix}{next_num:03d}"

        # Choose the right track record template based on group
        if group == "experimental":
            track_record = Config.exprTrackRecord
            status = {"pluto": "not_activated", "mars": "not_activated"}
        elif group == "control":
            track_record = Config.ctrlTrackRecord
            status = "not_activated"
        else:
            track_record = {}
            status = "not_activated"

        new_item = {
            "hospitalId": hospital_id,
            "homerID": homer_id,
            "trainingSide": training_side,
            "group": group,
            "status": status,
            "trackRecord": track_record,
        }

        data["details"].append(new_item)
        FileHandler.save_homer_id_details(place, data)
        return homer_id

    @staticmethod
    def write_csv_data(file_path, data_list, header_row):
        """Write data to CSV file"""
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file_exists = os.path.isfile(file_path)
        with open(file_path, "a" if file_exists else "w", newline='', encoding='utf-8') as f:
            csvwriter = csv.writer(f)
            if not file_exists:
                csvwriter.writerow(header_row)
            csvwriter.writerow(data_list)
        return True

    @staticmethod
    def read_csv_data(file_path):
        """Read CSV file and return header and last row"""
        try:
            with open(file_path, "r") as file:
                csvreader = csv.reader(file)
                header = next(csvreader)
                last_row = None
                for row in csvreader:
                    last_row = row
            return header, last_row
        except Exception as e:
            print(f"Error reading CSV: {e}")
            return None, None

    @staticmethod
    def cleanup_user_folder(base_path, device, config_filename):
        """Clean up user folder in case of errors"""
        if os.path.exists(base_path):
            config_file = os.path.join(base_path, device, config_filename)
            if os.path.exists(config_file):
                os.remove(config_file)
            device_path = os.path.join(base_path, device)
            if os.path.isdir(device_path):
                shutil.rmtree(device_path, ignore_errors=True)
            if os.path.isdir(base_path):
                shutil.rmtree(base_path, ignore_errors=True)