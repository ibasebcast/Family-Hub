"""Recurrence helpers for assigning chores to local calendar periods."""

from datetime import date, datetime, timedelta


def period_key(recurrence, day: date):
    """Return the period identifier used to prevent duplicate awards.

    Daily and weekly assignments use local dates supplied by the caller.
    One-time chores always share the same period key.
    """
    if recurrence == "once":
        return "once"
    if recurrence == "daily":
        return day.isoformat()
    if recurrence == "weekly":
        monday = day - timedelta(days=day.weekday())
        return monday.isoformat()
    raise ValueError(f"Unsupported recurrence: {recurrence}")


def is_completed(completions, chore_id, member_id, recurrence, day):
    """Check a specific member's completion in the current period."""
    key = period_key(recurrence, day)
    return any(
        item["chore_id"] == chore_id
        and item["member_id"] == member_id
        and item["period"] == key
        and item.get("status") == "approved"
        for item in completions
    )
