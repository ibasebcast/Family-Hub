"""Scheduled household reminders with one-time notification delivery.

A reminder may be shared across the household or assigned to specific members.
The due time must include a timezone so a reminder remains meaningful across
Home Assistant restarts, DST changes and clients in different locations.
"""

from copy import deepcopy
from datetime import datetime, timezone

from .models import new_id, timestamp


def add_reminder(data, *, title, due_at, member_ids=None, message=""):
    """Schedule a reminder without changing existing household records."""
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Reminder title is required")
    if not isinstance(message, str):
        raise ValueError("Reminder message must be text")
    try:
        due = datetime.fromisoformat(due_at)
    except (TypeError, ValueError) as exc:
        raise ValueError("Reminder due time must be a valid ISO timestamp") from exc
    if due.tzinfo is None or due.utcoffset() is None:
        raise ValueError("Reminder due time must include a timezone")
    assignees = list(member_ids or [])
    if len(assignees) != len(set(assignees)):
        raise ValueError("Duplicate reminder assignees")
    known = {member["id"] for member in data["members"]}
    if any(member_id not in known for member_id in assignees):
        raise ValueError("Unknown reminder assignee")

    result = deepcopy(data)
    result.setdefault("reminders", []).append({
        "id": new_id(),
        "title": title.strip(),
        "message": message.strip(),
        "due_at": due.isoformat(),
        "member_ids": assignees,
        "completed": False,
        "notified": False,
        "created_at": timestamp(),
    })
    return result


def complete_reminder(data, *, reminder_id, member_id=None, completed=True):
    """Mark a reminder complete without deleting its notification history."""
    result = deepcopy(data)
    item = next(
        (reminder for reminder in result.get("reminders", [])
         if reminder["id"] == reminder_id),
        None,
    )
    if item is None:
        raise ValueError("Reminder not found")
    if member_id is not None and (
        member_id not in item.get("member_ids", [])
        and item.get("member_ids")
    ):
        raise ValueError("Reminder is not assigned to this member")
    item["completed"] = bool(completed)
    return result


def due_reminders(data, now=None):
    """Return reminders needing one notification, ordered by due date."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Current time must include a timezone")
    return sorted(
        (
            reminder for reminder in data.get("reminders", [])
            if not reminder.get("notified", False)
            and not reminder.get("completed", False)
            and datetime.fromisoformat(reminder["due_at"]) <= now
        ),
        key=lambda item: item["due_at"],
    )
