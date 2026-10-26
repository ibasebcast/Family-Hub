"""Non-destructive, additive storage migrations.

Existing records are never replaced by sample data. Unknown keys are kept so
downgrades or optional modules do not silently erase household information.
"""

from copy import deepcopy

CURRENT_SCHEMA = 3


def migrate_household(saved):
    """Upgrade supported snapshots in memory before persistence."""
    if not isinstance(saved, dict):
        raise ValueError("Family Hub storage is not an object")
    version = saved.get("schema_version", 1)
    if type(version) is not int or version < 1 or version > CURRENT_SCHEMA:
        raise ValueError("Unsupported Family Hub storage schema")
    data = deepcopy(saved)
    if version == 1:
        data.setdefault("redemptions", [])
        data.setdefault("routine_completions", [])
        data.setdefault("presence", {})
        data.setdefault("room_entities", {})
        data.setdefault("announcements", [])
        data.setdefault("calendar_entities", [])
        data.setdefault("rotations", [])
        data["schema_version"] = 2
    if data["schema_version"] == 2:
        # Add reminder and display-account settings without touching records.
        data.setdefault("reminders", [])
        data.setdefault("settings", {}).setdefault("display_user_ids", [])
        data["schema_version"] = 3
    # Backfill keys for older snapshots that declared the current version.
    data.setdefault("reminders", [])
    data.setdefault("settings", {}).setdefault("display_user_ids", [])
    # Rotations were introduced after the schema version was incremented.
    # Backfill them for already-migrated households without dropping records.
    data.setdefault("rotations", [])
    return data
