"""Portable household export and restore with explicit structural validation."""

from copy import deepcopy
from .const import STORAGE_VERSION
from .migrations import migrate_household

LIST_SECTIONS = (
    "members", "chores", "completions", "rewards", "transactions",
    "routines", "events", "meals", "shopping", "redemptions",
    "routine_completions", "announcements", "calendar_entities", "rotations",
)
MAP_SECTIONS = ("settings", "presence", "room_entities")


def export_household(data):
    """Return an independent JSON-compatible household snapshot."""
    if not isinstance(data, dict) or data.get("schema_version") != STORAGE_VERSION:
        raise ValueError("Unsupported Family Hub storage version")
    return deepcopy(data)


def validate_backup(payload):
    """Migrate and validate an imported backup without mutating the input."""
    data = migrate_household(payload)
    if data.get("schema_version") != STORAGE_VERSION:
        raise ValueError("Unsupported backup schema version")
    data.setdefault("rotations", [])
    for key in LIST_SECTIONS:
        if not isinstance(data.get(key), list):
            raise ValueError(f"Backup section {key} must be a list")
    for key in MAP_SECTIONS:
        if not isinstance(data.get(key), dict):
            raise ValueError(f"Backup section {key} must be an object")
    for section in LIST_SECTIONS:
        if section == "calendar_entities":
            continue
        if any(not isinstance(item, dict) or not isinstance(item.get("id"), str)
               or not item["id"] for item in data[section]):
            raise ValueError(f"Invalid record in {section}")
        identifiers = [item["id"] for item in data[section]]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError(f"Duplicate record ID in {section}")
    members = {m["id"] for m in data["members"]}
    chores = {c["id"] for c in data["chores"]}
    rewards = {r["id"] for r in data["rewards"]}
    if any(any(member not in members for member in chore.get("assignee_ids", []))
           for chore in data["chores"]):
        raise ValueError("Backup has unknown chore assignees")
    if any(t.get("member_id") not in members for t in data["transactions"]):
        raise ValueError("Backup has transactions for unknown members")
    if any(c.get("chore_id") not in chores for c in data["completions"]):
        raise ValueError("Backup has completions for unknown chores")
    if any(r.get("reward_id") not in rewards for r in data["redemptions"]):
        raise ValueError("Backup has redemptions for unknown rewards")
    if any(r.get("member_id") not in members for r in data["redemptions"]):
        raise ValueError("Backup has redemptions for unknown members")
    if any(c.get("member_id") not in members for c in data["completions"]):
        raise ValueError("Backup has completions for unknown members")
    if any(any(member not in members for member in r.get("member_ids", []))
           for r in data["routines"] + data["rotations"] + data["events"]):
        raise ValueError("Backup has assignments for unknown members")
    routine_ids = {r["id"] for r in data["routines"]}
    if any(c.get("routine_id") not in routine_ids or c.get("member_id") not in members
           for c in data["routine_completions"]):
        raise ValueError("Backup has orphaned routine completions")
    if any(member not in members for member in data["room_entities"]):
        raise ValueError("Backup has room devices assigned to unknown members")
    if any(member not in members for member in data["presence"]):
        raise ValueError("Backup has presence records for unknown members")
    return deepcopy(data)
