"""Verify older household data is migrated without modifying source records."""

from copy import deepcopy
import pytest
from custom_components.family_hub.migrations import migrate_household
from custom_components.family_hub.storage import empty_household


def test_v1_migration_preserves_records_and_source():
    source = empty_household()
    source["schema_version"] = 1
    source["members"] = [{"id": "member", "name": "Example"}]
    source["future_extension"] = {"enabled": True}
    original = deepcopy(source)
    migrated = migrate_household(source)
    assert migrated["schema_version"] == 3
    assert migrated["reminders"] == []
    assert migrated["settings"]["display_user_ids"] == []
    assert migrated["members"] == source["members"]
    assert migrated["future_extension"] == source["future_extension"]
    assert source == original


def test_rejects_future_schema():
    with pytest.raises(ValueError):
        migrate_household({"schema_version": 99})


def test_rejects_invalid_schema_type():
    with pytest.raises(ValueError):
        migrate_household({"schema_version": True})


def test_empty_household_isolation():
    first = empty_household()
    first["members"].append({"id": "one"})
    assert empty_household()["members"] == []


def test_v2_migration_backfills_reminders_without_resetting_household():
    source = empty_household()
    source["schema_version"] = 2
    source.pop("reminders")
    source["settings"].pop("display_user_ids")
    source["members"] = [{"id": "generic-member", "name": "Generic"}]
    migrated = migrate_household(source)
    assert migrated["schema_version"] == 3
    assert migrated["members"] == source["members"]
    assert migrated["reminders"] == []
    assert migrated["settings"]["display_user_ids"] == []
    assert source["schema_version"] == 2
