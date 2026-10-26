"""Regression tests for copy-on-write editing and historical references."""

import pytest
from custom_components.family_hub.editing import edit_record, delete_record


def sample():
    return {
        "members": [{"id": "member", "name": "Member", "role": "child"}],
        "chores": [{"id": "chore", "title": "Task", "points": 3,
                    "recurrence": "daily", "assignee_ids": ["member"]}],
        "rewards": [], "completions": [], "transactions": [],
    }


def test_edit_does_not_mutate_original():
    original = sample()
    edited = edit_record(original, collection="chores", record_id="chore",
                         changes={"points": 8})
    assert edited["chores"][0]["points"] == 8
    assert original["chores"][0]["points"] == 3


def test_edit_rejects_identifier_changes():
    with pytest.raises(ValueError):
        edit_record(sample(), collection="chores", record_id="chore",
                    changes={"id": "another"})


def test_edit_rejects_invalid_points():
    with pytest.raises(ValueError):
        edit_record(sample(), collection="chores", record_id="chore",
                    changes={"points": -4})


def test_delete_refuses_member_with_assigned_chores():
    with pytest.raises(ValueError):
        delete_record(sample(), collection="members", record_id="member")


def test_delete_refuses_chore_with_completion_history():
    data = sample()
    data["completions"].append({"chore_id": "chore"})
    with pytest.raises(ValueError):
        delete_record(data, collection="chores", record_id="chore")


def test_delete_unreferenced_chore():
    result = delete_record(sample(), collection="chores", record_id="chore")
    assert result["chores"] == []
