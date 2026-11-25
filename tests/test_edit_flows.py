"""Contract tests for the management UI's edit and delete operations.

All edits must preserve record IDs, financial history and previously completed
chores. No real household names or sample account data are stored in tests.
"""

from copy import deepcopy

import pytest

from custom_components.family_hub.editing import delete_record, edit_record
from custom_components.family_hub.household import add_chore, add_member, add_reward
from custom_components.family_hub.organizer import add_meal, add_shopping_item
from custom_components.family_hub.reminders import add_reminder
from custom_components.family_hub.routines import add_routine
from custom_components.family_hub.custody import add_rotation
from custom_components.family_hub.storage import empty_household


def household():
    data = empty_household()
    data = add_member(data, name="Generic One")
    data = add_member(data, name="Generic Two")
    first, second = (m["id"] for m in data["members"])
    data = add_chore(
        data, title="Generic task", assignee_ids=[first], points=10,
        recurrence="daily"
    )
    data = add_reward(data, title="Generic reward", cost=25)
    data = add_shopping_item(data, title="Generic item", quantity="2")
    data = add_meal(data, day="2026-11-24", title="Generic dinner")
    data = add_reminder(
        data, title="Generic reminder", due_at="2026-12-03T15:00:00+00:00",
        member_ids=[first]
    )
    data = add_routine(
        data, title="Generic routine", member_ids=[first],
        steps=["Step one", "Step two"]
    )
    data = add_rotation(
        data, starts_on="2026-11-24", days_per_block=7,
        member_ids=[first, second], households=["Home One", "Home Two"],
    )
    return data, first, second


def test_edit_member_role_name_and_link_without_changing_id():
    data, first, _ = household()
    updated = edit_record(
        data, collection="members", record_id=first,
        changes={"name": "Updated member", "role": "adult", "ha_user_id": "account-1"},
    )
    assert updated["members"][0]["id"] == first
    assert updated["members"][0]["name"] == "Updated member"
    assert updated["members"][0]["role"] == "adult"
    assert data["members"][0]["name"] == "Generic One"
    with pytest.raises(ValueError, match="already linked"):
        edit_record(
            updated, collection="members", record_id=updated["members"][1]["id"],
            changes={"ha_user_id": "account-1"},
        )


def test_edit_chore_points_rotation_and_assignment_preserves_history():
    data, first, second = household()
    record_id = data["chores"][0]["id"]
    data["transactions"].append({
        "id": "existing-credit", "member_id": first, "amount": 10,
    })
    snapshot = deepcopy(data)
    updated = edit_record(
        data, collection="chores", record_id=record_id,
        changes={
            "title": "Updated task", "points": 20,
            "assignee_ids": [first, second],
            "rotation_days": 3, "rotation_start": "2026-11-24",
        }
    )
    chore = updated["chores"][0]
    assert chore["id"] == record_id
    assert chore["points"] == 20
    assert chore["rotation_days"] == 3
    assert updated["transactions"] == snapshot["transactions"]
    assert data == snapshot

    with pytest.raises(ValueError):
        edit_record(
            updated, collection="chores", record_id=record_id,
            changes={"rotation_days": 0},
        )
    with pytest.raises(ValueError):
        edit_record(
            updated, collection="chores", record_id=record_id,
            changes={"assignee_ids": ["missing-member"]},
        )


def test_edit_reward_and_shopping_without_recreating_records():
    data, _, _ = household()
    reward_id = data["rewards"][0]["id"]
    shopping_id = data["shopping"][0]["id"]
    updated = edit_record(
        data, collection="rewards", record_id=reward_id,
        changes={"title": "Better reward", "cost": 30}
    )
    updated = edit_record(
        updated, collection="shopping", record_id=shopping_id,
        changes={
            "title": "Updated item", "quantity": "3",
            "category": "Household", "checked": True
        }
    )
    assert updated["rewards"][0]["id"] == reward_id
    assert updated["rewards"][0]["cost"] == 30
    assert updated["shopping"][0]["id"] == shopping_id
    assert updated["shopping"][0]["checked"] is True


def test_edit_meal_and_reschedule_reminder_with_timezone_validation():
    data, _, _ = household()
    meal_id = data["meals"][0]["id"]
    reminder_id = data["reminders"][0]["id"]
    data["reminders"][0]["notified"] = True
    updated = edit_record(
        data, collection="meals", record_id=meal_id,
        changes={"day": "2026-11-25", "meal_type": "lunch"},
    )
    updated = edit_record(
        updated, collection="reminders", record_id=reminder_id,
        changes={"due_at": "2026-12-04T16:30:00+00:00"}
    )
    reminder = updated["reminders"][0]
    assert reminder["notified"] is False
    assert reminder["completed"] is False
    assert updated["meals"][0]["day"] == "2026-11-25"
    assert data["reminders"][0]["notified"] is True
    with pytest.raises(ValueError, match="timezone"):
        edit_record(
            updated, collection="reminders", record_id=reminder_id,
            changes={"due_at": "2026-12-05T09:00:00"},
        )


def test_edit_routine_steps_keeps_ids_and_protects_completed_steps():
    data, first, _ = household()
    routine = data["routines"][0]
    original_first = routine["steps"][0]["id"]
    original_second = routine["steps"][1]["id"]
    updated = edit_record(
        data, collection="routines", record_id=routine["id"],
        changes={"steps": [
            {"id": original_first, "title": "Reworded step"},
            {"id": original_second, "title": "Step two"},
            {"title": "New step"},
        ]},
    )
    assert updated["routines"][0]["steps"][0]["id"] == original_first
    assert len(updated["routines"][0]["steps"]) == 3

    updated["routine_completions"].append({
        "id": "old-completion", "routine_id": routine["id"],
        "step_id": original_first, "member_id": first, "day": "2026-11-24",
    })
    with pytest.raises(ValueError, match="completion history"):
        edit_record(
            updated, collection="routines", record_id=routine["id"],
            changes={"steps": [{"id": original_second, "title": "Step two"}]},
        )


def test_edit_rotation_without_changing_member_history():
    data, first, second = household()
    original = data["rotations"][0]
    updated = edit_record(
        data, collection="rotations", record_id=original["id"],
        changes={
            "starts_on": "2026-11-25", "days_per_block": 4,
            "member_ids": [first, second],
            "households": ["House A", "House B"],
        },
    )
    assert updated["rotations"][0]["id"] == original["id"]
    assert updated["rotations"][0]["days_per_block"] == 4
    assert data["rotations"][0]["days_per_block"] == 7
    with pytest.raises(ValueError):
        edit_record(
            data, collection="rotations", record_id=original["id"],
            changes={"households": ["Only one"]},
        )


def test_member_deletion_cleans_persisted_room_and_presence_keys():
    data, first, second = household()
    # A member can only be deleted after removing references to their records.
    for key in ("chores", "routines", "rotations", "reminders"):
        data[key] = []
    data["presence"][first] = True
    data["room_entities"][first] = ["light.generic"]
    updated = delete_record(data, collection="members", record_id=first)
    assert all(item["id"] != first for item in updated["members"])
    assert first not in updated["presence"]
    assert first not in updated["room_entities"]
    assert second in {item["id"] for item in updated["members"]}
