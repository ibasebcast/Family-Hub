"""Non-destructive, additive storage migrations.

Existing records are never replaced by sample data. Unknown keys are kept so
downgrades or optional modules do not silently erase household information.
"""

from copy import deepcopy

CURRENT_SCHEMA = 2


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
    # Rotations were introduced after the schema version was incremented.
    # Backfill them for already-migrated households without dropping records.
    data.setdefault("rotations", [])
    return data
