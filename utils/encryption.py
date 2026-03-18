import bcrypt
import json
import os
import tempfile
from datetime import datetime
from typing import Optional
from config import Config


class EncryptionUtils:
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, hashed: Optional[str]) -> bool:
        """Verify a password against a hash"""
        if not hashed:
            return False
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        except Exception:
            return False


class CredentialsManager:
    CREDENTIALS_FOLDER = "_dashboard/Credentials"
    LAB_LOCATION = "LAB"
    
    @staticmethod
    def _get_credentials_key(location: str = None) -> str:
        """Get S3 key for credentials file"""
        loc = location or CredentialsManager.LAB_LOCATION
        safe_location = "".join(c for c in loc if c.isalnum() or c in "-_")
        return f"{safe_location}/{CredentialsManager.CREDENTIALS_FOLDER}/credentials.json"
    
    @staticmethod
    def load_credentials_from_s3(location: str = None) -> Optional[dict]:
        """Load credentials from S3"""
        from utils.s3_operations import S3Operations
        
        s3_key = CredentialsManager._get_credentials_key(location)
        
        temp_path = None
        try:
            temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json')
            temp_path = temp_file.name
            temp_file.close()
            
            command = [
                "aws", "s3", "cp",
                f"s3://{Config.BUCKET_NAME}/{s3_key}",
                temp_path
            ]
            import subprocess
            result = subprocess.run(command, capture_output=True, text=True)
            
            if result.returncode == 0:
                with open(temp_path, 'r') as f:
                    credentials = json.load(f)
                os.unlink(temp_path)
                return credentials
            else:
                os.unlink(temp_path)
                return None
        except Exception as e:
            print(f"Error loading credentials from S3: {e}")
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
            return None
    
    @staticmethod
    def save_credentials_to_s3(credentials: dict, location: str = None) -> bool:
        """Save credentials to S3"""
        from utils.s3_operations import S3Operations
        
        s3_key = CredentialsManager._get_credentials_key(location)
        
        temp_path = None
        try:
            temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', 
                                                     dir=Config.BASE_DIR)
            temp_path = temp_file.name
            temp_file.close()
            
            with open(temp_path, 'w') as f:
                json.dump(credentials, f, indent=2)
            
            success = S3Operations.upload_to_s3(temp_path, s3_key)
            os.unlink(temp_path)
            return success
        except Exception as e:
            print(f"Error saving credentials to S3: {e}")
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
            return False
    
    @staticmethod
    def get_or_create_credentials() -> dict:
        """Get credentials from S3 or create empty structure"""
        credentials = CredentialsManager.load_credentials_from_s3()
        if credentials is None:
            credentials = {}
        return credentials
    
    @staticmethod
    def initialize_credentials_if_empty() -> bool:
        """Initialize S3 with LAB admin if empty"""
        credentials = CredentialsManager.load_credentials_from_s3()
        if credentials is None or len(credentials) == 0:
            credentials = {
                "LAB-HS-DATA": {
                    "place": "admin",
                    "privilege": "admin",
                    "password": "lab@123",
                    "password_hash": EncryptionUtils.hash_password("lab@123"),
                    "created_by": "system",
                    "created_at": datetime.now().isoformat(),
                    "first_login": False,
                    "password_changed": True
                }
            }
            return CredentialsManager.save_credentials_to_s3(credentials)
        return True
    
    @staticmethod
    def create_user(loginid: str, default_password: str, place: str, privilege: str = "user") -> tuple:
        """Create a new user - called by LAB admin"""
        credentials = CredentialsManager.get_or_create_credentials()
        
        if loginid in credentials:
            return False, "User already exists"
        
        hashed = EncryptionUtils.hash_password(default_password)
        
        credentials[loginid] = {
            "place": place,
            "privilege": privilege,
            "password": default_password,
            "password_hash": hashed,
            "created_by": "LAB-HS-DATA",
            "created_at": datetime.now().isoformat(),
            "first_login": True,
            "password_changed": False
        }
        
        success = CredentialsManager.save_credentials_to_s3(credentials)
        if success:
            return True, f"User {loginid} created successfully"
        return False, "Failed to save to S3"
    
    @staticmethod
    def change_password(loginid: str, old_password: str, new_password: str) -> tuple:
        """Change password for a user"""
        credentials = CredentialsManager.get_or_create_credentials()
        
        user_data = credentials.get(loginid)
        if not user_data:
            return False, "User not found"
        
        stored_hash = user_data.get("password_hash")
        
        if stored_hash:
            if not EncryptionUtils.verify_password(old_password, stored_hash):
                return False, "Current password is incorrect"
        else:
            if user_data.get("password") != old_password:
                return False, "Current password is incorrect"
        
        new_hash = EncryptionUtils.hash_password(new_password)
        
        credentials[loginid]["password"] = new_password
        credentials[loginid]["password_hash"] = new_hash
        credentials[loginid]["last_changed"] = datetime.now().isoformat()
        credentials[loginid]["password_changed"] = True
        credentials[loginid]["first_login"] = False
        
        success = CredentialsManager.save_credentials_to_s3(credentials)
        if success:
            return True, "Password changed successfully"
        return False, "Failed to save to S3"
    
    @staticmethod
    def get_user(loginid: str) -> Optional[dict]:
        """Get user data"""
        credentials = CredentialsManager.get_or_create_credentials()
        return credentials.get(loginid)
    
    @staticmethod
    def authenticate_user(loginid: str, password: str) -> tuple:
        """Authenticate user - returns (success, message, user_data)"""
        credentials = CredentialsManager.get_or_create_credentials()
        
        user_data = credentials.get(loginid)
        
        if not user_data and loginid in Config.LOGIN_CREDENTIALS:
            config_user = Config.LOGIN_CREDENTIALS[loginid]
            credentials[loginid] = {
                "place": config_user["place"],
                "privilege": config_user.get("privilege", "user"),
                "password": config_user["password"],
                "password_hash": EncryptionUtils.hash_password(config_user["password"]),
                "created_by": "system",
                "created_at": datetime.now().isoformat(),
                "first_login": False,
                "password_changed": True
            }
            CredentialsManager.save_credentials_to_s3(credentials)
            user_data = credentials.get(loginid)
        
        if not user_data:
            return False, "User not found", None
        
        stored_hash = user_data.get("password_hash")
        stored_password = user_data.get("password")
        
        password_valid = False
        if stored_hash:
            password_valid = EncryptionUtils.verify_password(password, stored_hash)
        elif stored_password == password:
            password_valid = True
        
        if not password_valid:
            return False, "Invalid credentials", None
        
        needs_password_change = user_data.get("first_login", False)
        
        return True, "Authentication successful", {
            **user_data,
            "needs_password_change": needs_password_change
        }
    
    @staticmethod
    def delete_user(loginid: str) -> tuple:
        """Delete a user"""
        credentials = CredentialsManager.get_or_create_credentials()
        
        if loginid not in credentials:
            return False, "User not found"
        
        if loginid == "LAB-HS-DATA":
            return False, "Cannot delete main admin"
        
        del credentials[loginid]
        
        success = CredentialsManager.save_credentials_to_s3(credentials)
        if success:
            return True, f"User {loginid} deleted"
        return False, "Failed to save to S3"
    
    @staticmethod
    def list_users() -> dict:
        """List all users"""
        return CredentialsManager.get_or_create_credentials()
