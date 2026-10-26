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
