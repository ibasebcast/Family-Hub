"""Rotating chores should assign only one member per scheduled block.

Older non-rotating chores keep their original shared assignment behavior.
All test data is generic and must remain suitable for a public repository.
"""

from datetime import date, timedelta

import pytest

from custom_components.family_hub.household import (
    active_rotating_assignee,
    add_chore,
    add_member,
    claim_chore,
)
from custom_components.family_hub.storage import empty_household


@pytest.fixture
def members():
    data = empty_household()
    data = add_member(data, name="Member A")
    data = add_member(data, name="Member B")
    return data


def test_rotating_chore_changes_assignment_only_after_block(members):
    member_a, member_b = [member["id"] for member in members["members"]]
    data = add_chore(
        members,
        title="Shared weekly task",
        assignee_ids=[member_a, member_b],
        points=10,
        rotation_days=7,
        rotation_start="2026-10-01",
    )
    chore = data["chores"][0]
    assert active_rotating_assignee(chore, date(2026, 10, 1)) == member_a
    assert active_rotating_assignee(chore, date(2026, 10, 7)) == member_a
    assert active_rotating_assignee(chore, date(2026, 10, 8)) == member_b
    assert active_rotating_assignee(chore, date(2026, 10, 15)) == member_a
    assert active_rotating_assignee(chore, date(2026, 9, 30)) == member_b
    # The inactive member cannot claim the other member's rotation.
    with pytest.raises(ValueError, match="another member"):
        claim_chore(data, chore_id=chore["id"], member_id=member_b,
                    day=date(2026, 10, 1))
    assert data["completions"] == []
    completed = claim_chore(data, chore_id=chore["id"], member_id=member_a,
                            day=date(2026, 10, 1))
    assert completed["completions"][0]["member_id"] == member_a


@pytest.mark.parametrize("days,start", [
    (0, "2026-10-01"),
    (366, "2026-10-01"),
    (-1, "2026-10-01"),
    (7, "not-a-date"),
])
def test_invalid_rotations_are_rejected(members, days, start):
    ids = [member["id"] for member in members["members"]]
    with pytest.raises(ValueError):
        add_chore(
            members, title="Task", assignee_ids=ids,
            rotation_days=days, rotation_start=start,
        )


def test_rotation_requires_multiple_members(members):
    with pytest.raises(ValueError, match="at least two"):
        add_chore(
            members, title="Task",
            assignee_ids=[members["members"][0]["id"]],
            rotation_days=7, rotation_start="2026-10-01",
        )


def test_existing_chores_remain_compatible(members):
    ids = [member["id"] for member in members["members"]]
    data = add_chore(members, title="Shared task", assignee_ids=ids)
    chore = data["chores"][0]
    assert active_rotating_assignee(chore, date(2026, 10, 1)) is None
    first = claim_chore(data, chore_id=chore["id"],
                        member_id=ids[0], day=date(2026, 10, 1))
    second = claim_chore(first, chore_id=chore["id"],
                         member_id=ids[1], day=date(2026, 10, 1))
    assert len(second["completions"]) == 2
