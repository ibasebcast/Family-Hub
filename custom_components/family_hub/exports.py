"""Portable household backup serialization with explicit schema checks.

Exports are returned to authenticated administrators by the API. Import must
remain disabled until validation and migration behavior is fully tested.
"""

from copy import deepcopy
from .const import STORAGE_VERSION


def export_household(data):
    """Return a complete independent copy suitable for JSON serialization."""
    if data.get("schema_version") != STORAGE_VERSION:
        raise ValueError("Unsupported Family Hub storage version")
    return deepcopy(data)


def validate_backup(payload):
    """Check structural safety before any future import operation."""
    if not isinstance(payload, dict) or payload.get("schema_version") != STORAGE_VERSION:
        raise ValueError("Unsupported backup schema version")
    required_lists = ("members", "chores", "completions", "rewards", "transactions",
                      "routines", "events", "meals", "shopping")
    for key in required_lists:
        if not isinstance(payload.get(key), list):
            raise ValueError(f"Backup section {key} must be a list")
    return deepcopy(payload)
