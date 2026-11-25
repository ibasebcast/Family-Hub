"""Copy-on-write editing with validated fields and protected audit history.

Dashboard editors use one authenticated WebSocket command for every mutable
record type. Stored IDs, points transactions and completed chore history are
never rewritten by edits. A user must be an administrator to call edit_record.
"""

from copy import deepcopy
from datetime import date, datetime

from .models import Chore, Member, Reward, new_id

FIELDS = {
    "members": {"name", "color", "role", "ha_user_id"},
    "chores": {
        "title", "description", "points", "recurrence", "approval_required",
        "assignee_ids", "rotation_days", "rotation_start",
    },
    "rewards": {"title", "description", "cost"},
    "shopping": {"title", "quantity", "category", "checked"},
    "meals": {"title", "day", "meal_type", "notes"},
    "events": {"title", "starts_at", "ends_at", "member_ids", "notes"},
    "announcements": {"title", "message", "expires_at"},
    "reminders": {"title", "message", "due_at", "member_ids", "completed"},
    "routines": {"title", "member_ids", "steps"},
    "rotations": {"starts_on", "households", "days_per_block", "member_ids"},
}


def _member_ids(data, values, *, required=False):
    """Validate references to existing members before committing an edit."""
    known = {member["id"] for member in data["members"]}
    if not isinstance(values, list) or (required and not values):
        raise ValueError("Select at least one household member")
    if len(values) != len(set(values)) or any(item not in known for item in values):
        raise ValueError("Member assignments must be unique and valid")


def _timestamp(value, *, name):
    try:
        result = datetime.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{name} must be a valid timestamp") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError(f"{name} requires a timezone")
    return result


def edit_record(data, *, collection, record_id, changes):
    """Update permitted fields without mutating the input or historical IDs."""
    if collection not in FIELDS or not isinstance(changes, dict) or not changes:
        raise ValueError("Invalid edit request")
    if not set(changes).issubset(FIELDS[collection]):
        raise ValueError("Field cannot be edited")

    result = deepcopy(data)
    record = next(
        (item for item in result.get(collection, []) if item["id"] == record_id),
        None,
    )
    if record is None:
        raise ValueError("Record not found")
    candidate = {**record, **changes}

    if "title" in candidate and (
        not isinstance(candidate["title"], str) or not candidate["title"].strip()
    ):
        raise ValueError("Title is required")
    if "name" in candidate and (
        not isinstance(candidate["name"], str) or not candidate["name"].strip()
    ):
        raise ValueError("Name is required")

    if collection == "members":
        Member(
            candidate["name"], candidate.get("role", "child"),
            candidate.get("ha_user_id"), candidate.get("color", "#64748b"),
        )
        user_id = candidate.get("ha_user_id")
        if user_id and any(
            item["id"] != record_id and item.get("ha_user_id") == user_id
            for item in data["members"]
        ):
            raise ValueError("Home Assistant user is already linked")

    elif collection == "chores":
        _member_ids(data, candidate["assignee_ids"], required=True)
        if not isinstance(candidate.get("approval_required", False), bool):
            raise ValueError("Approval setting must be a boolean")
        Chore(
            candidate["title"], candidate["assignee_ids"],
            candidate.get("points", 0),
            candidate.get("recurrence", "daily"),
            candidate.get("approval_required", False),
            candidate.get("description", ""),
            candidate.get("rotation_days"),
            candidate.get("rotation_start"),
        )
    elif collection == "rewards":
        Reward(candidate["title"], candidate["cost"], candidate.get("description", ""))

    elif collection == "shopping":
        if not isinstance(candidate.get("checked", False), bool):
            raise ValueError("Shopping completion must be a boolean")
        if not isinstance(candidate.get("quantity", "1"), str):
            raise ValueError("Shopping quantity must be text")
        if not isinstance(candidate.get("category", "General"), str):
            raise ValueError("Shopping category must be text")

    elif collection == "meals":
        try:
            date.fromisoformat(candidate["day"])
        except (ValueError, TypeError) as exc:
            raise ValueError("Meal date is invalid") from exc
        if candidate.get("meal_type") not in {"breakfast", "lunch", "dinner", "snack"}:
            raise ValueError("Invalid meal type")

    elif collection == "events":
        start = _timestamp(candidate["starts_at"], name="Start")
        end = _timestamp(candidate["ends_at"], name="End")
        if end <= start:
            raise ValueError("Event end must follow its start")
        _member_ids(data, candidate.get("member_ids", []))

    elif collection == "reminders":
        _timestamp(candidate["due_at"], name="Reminder due time")
        _member_ids(data, candidate.get("member_ids", []))
        if not isinstance(candidate.get("completed", False), bool):
            raise ValueError("Reminder completion must be a boolean")
        if "due_at" in changes:
            # Re-scheduling an already delivered reminder makes it eligible
            # for another one-time notification at the newly selected time.
            candidate["notified"] = False
            candidate["completed"] = False

    elif collection == "announcements":
        if not isinstance(candidate.get("message", ""), str):
            raise ValueError("Announcement message must be text")
        if candidate.get("expires_at"):
            _timestamp(candidate["expires_at"], name="Announcement expiration")

    elif collection == "routines":
        _member_ids(data, candidate["member_ids"], required=True)
        steps = candidate.get("steps", [])
        if not isinstance(steps, list) or not steps:
            raise ValueError("A routine requires checklist steps")
        existing_ids = {step["id"] for step in record["steps"]}
        new_steps = []
        for step in steps:
            if not isinstance(step, dict) or not str(step.get("title", "")).strip():
                raise ValueError("Routine steps must have titles")
            step_id = step.get("id")
            if step_id and step_id not in existing_ids:
                raise ValueError("Unknown routine step")
            new_steps.append({"id": step_id or new_id(), "title": step["title"].strip()})
        ids = [step["id"] for step in new_steps]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate routine step")
        discarded = existing_ids - set(ids)
        if any(
            completed["routine_id"] == record_id
            and completed["step_id"] in discarded
            for completed in data.get("routine_completions", [])
        ):
            raise ValueError("Cannot remove a routine step with completion history")
        candidate["steps"] = new_steps

    elif collection == "rotations":
        try:
            date.fromisoformat(candidate["starts_on"])
        except (ValueError, TypeError) as exc:
            raise ValueError("Invalid rotation start date") from exc
        if (
            type(candidate["days_per_block"]) is not int
            or not 1 <= candidate["days_per_block"] <= 365
        ):
            raise ValueError("Rotation days must be between 1 and 365")
        _member_ids(data, candidate["member_ids"], required=True)
        homes = candidate.get("households", [])
        if (
            not isinstance(homes, list) or len(homes) < 2
            or any(not isinstance(home, str) or not home.strip() for home in homes)
        ):
            raise ValueError("At least two named households are required")

    record.update({
        key: candidate[key] for key in changes
    })
    if collection == "reminders" and "due_at" in changes:
        record["notified"] = False
        record["completed"] = False
    return result


def delete_record(data, *, collection, record_id):
    """Delete unused records, refusing to orphan ledger or completion history."""
    if collection not in FIELDS:
        raise ValueError("Collection cannot be deleted")
    result = deepcopy(data)
    records = result.get(collection, [])
    if not any(item["id"] == record_id for item in records):
        raise ValueError("Record not found")

    if collection == "members":
        if any(record_id in chore["assignee_ids"] for chore in result["chores"]):
            raise ValueError("Member still has chores")
        if any(t["member_id"] == record_id for t in result["transactions"]):
            raise ValueError("Member has point history")
        if any(c.get("member_id") == record_id for c in result.get("completions", [])):
            raise ValueError("Member has chore completion history")
        if any(r.get("member_id") == record_id for r in result.get("redemptions", [])):
            raise ValueError("Member has reward redemption history")
        for section in ("routines", "rotations", "events", "reminders"):
            if any(record_id in r.get("member_ids", []) for r in result.get(section, [])):
                raise ValueError(f"Member has assigned {section}")

    if collection == "chores" and any(
        completion["chore_id"] == record_id
        for completion in result.get("completions", [])
    ):
        raise ValueError("Chore has completion history")
    if collection == "rewards" and any(
        request["reward_id"] == record_id
        for request in result.get("redemptions", [])
    ):
        raise ValueError("Reward has redemption history")
    if collection == "routines" and any(
        item["routine_id"] == record_id
        for item in result.get("routine_completions", [])
    ):
        raise ValueError("Routine has completion history")

    result[collection] = [record for record in records if record["id"] != record_id]
    if collection == "members":
        result.get("presence", {}).pop(record_id, None)
        result.get("room_entities", {}).pop(record_id, None)
    return result
