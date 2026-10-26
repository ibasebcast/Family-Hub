"""Household organizer: shopping, meals, and family events.

These functions operate on snapshots. Each record receives a stable identifier
so editing a dashboard cannot accidentally replace unrelated records.
"""

from copy import deepcopy
from datetime import date
from .models import new_id, timestamp


def add_shopping_item(data, *, title, quantity="1", category="General"):
    """Add an unchecked shopping item to the shared list."""
    if not title.strip():
        raise ValueError("Shopping item title is required")
    result = deepcopy(data)
    result["shopping"].append({
        "id": new_id(), "title": title.strip(), "quantity": quantity,
        "category": category, "checked": False, "created_at": timestamp(),
    })
    return result


def set_shopping_checked(data, *, item_id, checked):
    """Mark one shopping item complete without deleting its history."""
    result = deepcopy(data)
    item = next((i for i in result["shopping"] if i["id"] == item_id), None)
    if item is None:
        raise ValueError("Unknown shopping item")
    item["checked"] = bool(checked)
    return result


def add_meal(data, *, day, title, meal_type="dinner", notes=""):
    """Schedule a meal; dates must be ISO formatted."""
    date.fromisoformat(day)
    if not title.strip():
        raise ValueError("Meal title is required")
    if meal_type not in {"breakfast", "lunch", "dinner", "snack"}:
        raise ValueError("Invalid meal type")
    result = deepcopy(data)
    result["meals"].append({
        "id": new_id(), "day": day, "title": title.strip(),
        "meal_type": meal_type, "notes": notes,
    })
    return result


def add_event(data, *, title, starts_at, ends_at, member_ids=None, notes=""):
    """Add a local family event after validating its time range.

    External calendar synchronization is a separate adapter and must not
    duplicate these records automatically.
    """
    from datetime import datetime
    start = datetime.fromisoformat(starts_at)
    end = datetime.fromisoformat(ends_at)
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("Event timestamps must include a timezone")
    if end <= start or not title.strip():
        raise ValueError("Event must have a title and end after its start")
    result = deepcopy(data)
    result["events"].append({
        "id": new_id(), "title": title.strip(), "starts_at": starts_at,
        "ends_at": ends_at, "member_ids": list(member_ids or []), "notes": notes,
    })
    return result
