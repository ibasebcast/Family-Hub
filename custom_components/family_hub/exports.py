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
        identifiers = [item.get("id") for item in data[section] if isinstance(item, dict)]
        if len(identifiers) != len(data[section]):
            raise ValueError(f"Invalid record in {section}")
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
    return deepcopy(data)
