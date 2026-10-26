"""Recurring household rotation schedules.

A rotation has a start date, an ordered sequence of household labels and a
positive number of days per block. No household labels are hardcoded.
"""

from copy import deepcopy
from datetime import date
from .models import new_id


def add_rotation(data, *, member_ids, starts_on, households, days_per_block=7):
    """Create a repeating custody or household rotation."""
    date.fromisoformat(starts_on)
    if type(days_per_block) is not int or not 1 <= days_per_block <= 365:
        raise ValueError("Invalid rotation length")
    if not isinstance(households, list) or len(households) < 2:
        raise ValueError("At least two household labels are required")
    if any(not isinstance(h, str) or not h.strip() for h in households):
        raise ValueError("Household labels cannot be blank")
    known = {member["id"] for member in data["members"]}
    if not member_ids or any(member not in known for member in member_ids):
        raise ValueError("Invalid rotation members")
    result = deepcopy(data)
    result.setdefault("rotations", []).append({
        "id": new_id(), "member_ids": list(dict.fromkeys(member_ids)),
        "starts_on": starts_on, "households": [h.strip() for h in households],
        "days_per_block": days_per_block,
    })
    return result


def household_for_day(rotation, day):
    """Return the scheduled household for a date, including before the anchor."""
    if isinstance(day, str):
        day = date.fromisoformat(day)
    anchor = date.fromisoformat(rotation["starts_on"])
    elapsed = (day - anchor).days
    index = (elapsed // rotation["days_per_block"]) % len(rotation["households"])
    return rotation["households"][index]


def rotation_schedule(data, *, starts_on, days=30, member_id=None):
    """Calculate the next N scheduled days without persisting derived events."""
    start = date.fromisoformat(starts_on)
    if type(days) is not int or not 1 <= days <= 366:
        raise ValueError("Invalid schedule length")
    from datetime import timedelta
    result = []
    for rotation in data.get("rotations", []):
        if member_id and member_id not in rotation["member_ids"]:
            continue
        for offset in range(days):
            day = start + timedelta(days=offset)
            result.append({
                "rotation_id": rotation["id"], "member_ids": rotation["member_ids"],
                "day": day.isoformat(), "household": household_for_day(rotation, day),
            })
    return sorted(result, key=lambda item: (item["day"], item["rotation_id"]))
