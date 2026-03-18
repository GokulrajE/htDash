"""
Per-request session proxy.

Reads/writes Flask's per-browser cookie session so every logged-in user
sees only their own data. Drop-in replacement for the old global singleton.
"""
from flask import session as flask_session


class _SessionProxy:

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        if name == "device_name":
            return flask_session.get("device_name", "Pluto")
        if name == "place_info":
            return flask_session.get("place_info", {})
        return flask_session.get(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super().__setattr__(name, value)
            return
        flask_session[name] = value
        flask_session.modified = True

    def set_session(self, login_place, privilege, device_name="Pluto"):
        flask_session["login_place"] = login_place
        flask_session["privilege"]   = privilege
        flask_session["device_name"] = device_name
        flask_session["place_info"]  = {}
        flask_session.modified = True

    def set_place_info(self, mapping):
        """Fully replace place_info dict — use instead of place_info[k]=v
        so Flask detects the change and saves it to the cookie."""
        flask_session["place_info"] = mapping
        flask_session.modified = True

    def is_admin(self):
        """True only for the global lab admin (place == 'admin').
        Site admins (RP-HS-ADMIN etc.) have privilege==admin but a real place,
        so they should see ONLY their own site — not all centres."""
        return flask_session.get("login_place") == "admin"

    def is_site_admin(self):
        """True for site-level admins who can do admin actions but only for their site."""
        return (flask_session.get("privilege") or "").lower() == "admin"


current_session = _SessionProxy()