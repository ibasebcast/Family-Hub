"""Safe, copy-on-write record editing with protected audit history."""

from copy import deepcopy

FIELDS = {
    "members": {"name", "color", "role", "ha_user_id"},
    "chores": {"title", "description", "points", "recurrence", "approval_required", "assignee_ids"},
    "rewards": {"title", "description", "cost"},
    "shopping": {"title", "quantity", "category", "checked"},
    "meals": {"title", "day", "meal_type", "notes"},
    "events": {"title", "starts_at", "ends_at", "member_ids", "notes"},
    "announcements": {"title", "message", "expires_at"},
}


def edit_record(data, *, collection, record_id, changes):
    """Update allowed fields, preserving IDs and transaction history."""
    if collection not in FIELDS or not isinstance(changes, dict) or not changes:
        raise ValueError("Invalid edit request")
    if not set(changes).issubset(FIELDS[collection]):
        raise ValueError("Field cannot be edited")
    result = deepcopy(data)
    record = next((r for r in result.get(collection, []) if r["id"] == record_id), None)
    if record is None:
        raise ValueError("Record not found")
    candidate = {**record, **changes}
    if "title" in candidate and not str(candidate["title"]).strip():
        raise ValueError("Title is required")
    if "name" in candidate and not str(candidate["name"]).strip():
        raise ValueError("Name is required")
    if collection == "rewards" and (type(candidate["cost"]) is not int or candidate["cost"] < 0):
        raise ValueError("Invalid reward cost")
    if collection == "chores":
        if type(candidate["points"]) is not int or not 0 <= candidate["points"] <= 100000:
            raise ValueError("Invalid chore points")
        if candidate["recurrence"] not in {"once", "daily", "weekly"}:
            raise ValueError("Invalid recurrence")
        valid = {member["id"] for member in data["members"]}
        if not candidate["assignee_ids"] or any(m not in valid for m in candidate["assignee_ids"]):
            raise ValueError("Invalid assignees")
    record.update(changes)
    return result


def delete_record(data, *, collection, record_id):
    """Protect historical ledger references from orphaned deletions."""
    if collection not in FIELDS:
        raise ValueError("Collection cannot be deleted")
    result = deepcopy(data)
    records = result.get(collection, [])
    if not any(r["id"] == record_id for r in records):
        raise ValueError("Record not found")
    if collection == "members":
        if any(record_id in c["assignee_ids"] for c in result["chores"]):
            raise ValueError("Member still has chores")
        if any(t["member_id"] == record_id for t in result["transactions"]):
            raise ValueError("Member has point history")
    if collection == "chores" and any(c["chore_id"] == record_id for c in result["completions"]):
        raise ValueError("Chore has completion history")
    if collection == "rewards" and any(r["reward_id"] == record_id for r in result.get("redemptions", [])):
        raise ValueError("Reward has redemption history")
    result[collection] = [r for r in records if r["id"] != record_id]
    return result
