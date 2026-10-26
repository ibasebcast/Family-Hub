"""Members who are marked away must not earn chore points accidentally."""

from datetime import date

import pytest

from custom_components.family_hub.household import (
    add_chore, add_member, claim_chore,
)
from custom_components.family_hub.routines import set_presence
from custom_components.family_hub.storage import empty_household


def test_away_member_cannot_claim_chore_and_can_resume_at_home():
    data = add_member(empty_household(), name="Generic Member")
    member_id = data["members"][0]["id"]
    data = add_chore(
        data, title="Generic chore", assignee_ids=[member_id], points=15,
    )
    chore_id = data["chores"][0]["id"]
    away = set_presence(data, member_id=member_id, present=False)

    with pytest.raises(ValueError, match="paused"):
        claim_chore(
            away, chore_id=chore_id, member_id=member_id,
            day=date(2026, 10, 26),
        )
    assert away["transactions"] == []
    assert away["completions"] == []
    assert data["presence"] == {}

    home = set_presence(away, member_id=member_id, present=True)
    result = claim_chore(
        home, chore_id=chore_id, member_id=member_id,
        day=date(2026, 10, 26),
    )
    assert len(result["transactions"]) == 1
    assert result["transactions"][0]["amount"] == 15


def test_one_members_away_status_does_not_pause_other_members():
    data = add_member(empty_household(), name="First Member")
    data = add_member(data, name="Second Member")
    first, second = [item["id"] for item in data["members"]]
    data = add_chore(
        data, title="Shared generic chore",
        assignee_ids=[first, second], points=5,
    )
    away = set_presence(data, member_id=first, present=False)
    chore_id = away["chores"][0]["id"]

    claimed = claim_chore(
        away, chore_id=chore_id, member_id=second,
        day=date(2026, 10, 26),
    )
    assert len(claimed["transactions"]) == 1
    assert claimed["transactions"][0]["member_id"] == second
