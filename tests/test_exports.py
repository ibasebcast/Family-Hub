"""Backup validation must reject malformed and orphaned records."""

import pytest
from custom_components.family_hub.exports import export_household, validate_backup
from custom_components.family_hub.storage import empty_household


def test_backup_validation():
    data = empty_household()
    result = export_household(data)
    assert validate_backup(result) == data
    result["members"].append({"id": "test"})
    assert data["members"] == []


def test_rejects_missing_sections():
    with pytest.raises(ValueError):
        validate_backup({"schema_version": 2, "members": []})


def test_rejects_orphaned_ledger():
    data = empty_household()
    data["transactions"].append({"id": "txn", "member_id": "unknown", "amount": 10})
    with pytest.raises(ValueError):
        validate_backup(data)


def test_rejects_duplicate_record_ids():
    data = empty_household()
    data["members"] = [{"id": "same"}, {"id": "same"}]
    with pytest.raises(ValueError):
        validate_backup(data)

def test_rejects_unhashable_backup_identifiers():
    data = empty_household()
    data["members"] = [{"id": ["invalid"]}]
    with pytest.raises(ValueError):
        validate_backup(data)


def test_backup_without_rotations_gets_empty_rotation_list():
    data = empty_household()
    data.pop("rotations")
    restored = validate_backup(data)
    assert restored["rotations"] == []


@pytest.mark.parametrize("section,record", [
    ("redemptions", {"id": "redemption", "member_id": "missing", "reward_id": "reward"}),
    ("routines", {"id": "routine", "member_ids": ["missing"]}),
    ("rotations", {"id": "rotation", "member_ids": ["missing"]}),
    ("events", {"id": "event", "member_ids": ["missing"]}),
    ("routine_completions", {"id": "completion", "routine_id": "missing", "member_id": "missing"}),
])
def test_rejects_orphaned_household_references(section, record):
    data = empty_household()
    data[section].append(record)
    with pytest.raises(ValueError):
        validate_backup(data)


def test_rejects_room_devices_for_unknown_member():
    data = empty_household()
    data["room_entities"]["missing"] = ["light.bedroom"]
    with pytest.raises(ValueError):
        validate_backup(data)
