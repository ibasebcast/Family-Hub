"""Backup validation must reject malformed data before replacement."""

import pytest
from custom_components.family_hub.exports import export_household, validate_backup


def test_backup_validation():
    keys = ("members", "chores", "completions", "rewards", "transactions",
            "routines", "events", "meals", "shopping")
    data = {"schema_version": 1, **{key: [] for key in keys}}
    result = export_household(data)
    assert validate_backup(result) == data
    result["members"].append({"id": "test"})
    assert data["members"] == []
    with pytest.raises(ValueError):
        validate_backup({"schema_version": 1, "members": []})
