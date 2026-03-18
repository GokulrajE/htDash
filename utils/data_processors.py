import pandas as pd
from datetime import datetime, timedelta
import os
from config import Config

class DataProcessor:
    @staticmethod
    def is_trial_completed(hospital_id, device_name, place):
        """Check if trial period has ended based on end date"""
        try:
            config_path = os.path.join(Config.META_DATA_PATH, place, hospital_id, device_name, Config.CONFIG_DATA)
            if os.path.exists(config_path):
                df = pd.read_csv(config_path)
                if not df.empty and 'EndDate' in df.columns:
                    latest_end_date_str = df['EndDate'].iloc[-1]
                    
                    try:
                        end_date = datetime.strptime(latest_end_date_str, "%d-%m-%Y").date()
                        today = datetime.now().date()
                        return end_date < today
                    except ValueError:
                        try:
                            end_date = datetime.strptime(latest_end_date_str, "%Y-%m-%d").date()
                            today = datetime.now().date()
                            return end_date < today
                        except:
                            return False
        except Exception as e:
            print(f"Error checking trial completion for {hospital_id}: {e}")
        
        return False
    
    @staticmethod
    def get_user_ids_from_local(device_name):
        """Fetch all user IDs from local files"""
        user_ids_by_place = {}
        
        if not os.path.exists(Config.META_DATA_PATH):
            return user_ids_by_place
            
        for place in os.listdir(Config.META_DATA_PATH):
            place_path = os.path.join(Config.META_DATA_PATH, place)
            if not os.path.isdir(place_path):
                continue
            
            user_ids_by_place[place] = set()
            
            # Check each potential user folder
            for item in os.listdir(place_path):
                user_path = os.path.join(place_path, item, device_name)
                config_file = os.path.join(user_path, Config.CONFIG_DATA)
                if os.path.exists(config_file):
                    user_ids_by_place[place].add(item)
        
        return user_ids_by_place
    
    @staticmethod
    def get_hospital_details(hospital_id, device_name, place):
        """Get hospital details including usage statistics"""
        try:
            config_file = os.path.join(Config.META_DATA_PATH, place, hospital_id, device_name, Config.CONFIG_DATA)
            session_file = os.path.join(Config.META_DATA_PATH, place, hospital_id, device_name, "sessions/sessions.csv")
            
            if not os.path.exists(config_file) or not os.path.exists(session_file):
                return None
            
            # Load config data
            config_df = pd.read_csv(config_file)
            if config_df.empty:
                return None
            
            start_date = pd.to_datetime(config_df.iloc[-1]['StartDate'], format="%d-%m-%Y")
            end_date = pd.to_datetime(config_df.iloc[-1]['EndDate'], format="%d-%m-%Y")
            total_days = (end_date - start_date).days + 1
            
            # Load session data
            skip_rows = 2 if device_name.lower() == "pluto" else 3
            session_df = pd.read_csv(session_file, skiprows=skip_rows)
            
            session_df['DateTime'] = pd.to_datetime(session_df['DateTime'], format="%Y-%m-%d %H:%M:%S")
            session_df = session_df[(session_df['DateTime'].dt.date >= start_date.date()) &
                                    (session_df['DateTime'].dt.date <= end_date.date())]
            
            usage_days = session_df['DateTime'].dt.date.nunique()
            
            return {
                "start_date": start_date.strftime("%d-%m-%Y"),
                "end_date": end_date.strftime("%d-%m-%Y"),
                "total_days": total_days,
                "usage_days": usage_days
            }
            
        except Exception as e:
            print(f"Error getting hospital details: {e}")
            return None