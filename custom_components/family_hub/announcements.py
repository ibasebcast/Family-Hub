"""Shared household notices and optional expiration dates."""

from copy import deepcopy
from datetime import datetime
from .models import new_id, timestamp


def add_announcement(data, *, title, message, expires_at=None):
    """Create an announcement visible on the shared family display."""
    if not title.strip() or not message.strip():
        raise ValueError("Announcement title and message are required")
    if expires_at:
        if datetime.fromisoformat(expires_at).tzinfo is None:
            raise ValueError("Expiration must include a timezone")
    result = deepcopy(data)
    result.setdefault("announcements", []).append({
        "id": new_id(), "title": title.strip(), "message": message.strip(),
        "created_at": timestamp(), "expires_at": expires_at,
    })
    return result


def remove_announcement(data, *, announcement_id):
    """Remove a specific announcement without changing other records."""
    result = deepcopy(data)
    original = result.get("announcements", [])
    result["announcements"] = [a for a in original if a["id"] != announcement_id]
    if len(result["announcements"]) == len(original):
        raise ValueError("Unknown announcement")
    return result
