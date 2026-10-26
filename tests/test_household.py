"""Behavior tests for the non-destructive household operation layer."""

from datetime import date
import pytest
from custom_components.family_hub.household import (
    add_member, add_chore, add_reward, claim_chore, review_chore, redeem_reward
)
from custom_components.family_hub.ledger import balance


def fresh():
    return {"members": [], "chores": [], "rewards": [], "completions": [],
            "transactions": [], "redemptions": []}


def test_claim_and_approval_awards_only_once():
    data = add_member(fresh(), name="Adult", role="adult")
    data = add_member(data, name="Child")
    adult, child = [m["id"] for m in data["members"]]
    data = add_chore(data, title="Example chore", assignee_ids=[child],
                     points=12, approval_required=True)
    chore_id = data["chores"][0]["id"]
    claimed = claim_chore(data, chore_id=chore_id, member_id=child, day=date(2026, 10, 25))
    assert balance(claimed["transactions"], child) == 0
    with pytest.raises(ValueError):
        claim_chore(claimed, chore_id=chore_id, member_id=child, day=date(2026, 10, 25))
    approved = review_chore(claimed, completion_id=claimed["completions"][0]["id"],
                            approver_id=adult, approved=True)
    assert balance(approved["transactions"], child) == 12
    with pytest.raises(ValueError):
        review_chore(approved, completion_id=claimed["completions"][0]["id"],
                     approver_id=adult, approved=True)
    assert balance(data["transactions"], child) == 0


def test_redemption_preserves_history():
    data = add_member(fresh(), name="Child")
    child = data["members"][0]["id"]
    data = add_chore(data, title="Example", assignee_ids=[child], points=20)
    data = claim_chore(data, chore_id=data["chores"][0]["id"],
                       member_id=child, day=date(2026, 10, 25))
    data = add_reward(data, title="Example reward", cost=15)
    result = redeem_reward(data, member_id=child, reward_id=data["rewards"][0]["id"])
    assert balance(result["transactions"], child) == 5
    assert len(result["redemptions"]) == 1
    assert balance(data["transactions"], child) == 20


def test_unknown_member_cannot_receive_assignment():
    with pytest.raises(ValueError):
        add_chore(fresh(), title="Example", assignee_ids=["missing"])
