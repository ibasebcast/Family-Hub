"""Unit tests for standalone domain logic (no Home Assistant required)."""

from datetime import date
import pytest
from custom_components.family_hub.models import Chore, Member, Reward
from custom_components.family_hub.ledger import balance, record_transaction, redeem
from custom_components.family_hub.schedules import period_key, is_completed


def test_member_validation():
    assert Member(name="Member One").role == "child"
    with pytest.raises(ValueError):
        Member(name="  ")
    with pytest.raises(ValueError):
        Member(name="Member Two", role="superuser")


def test_chore_validation():
    assert Chore(title="Task", assignee_ids=["member-1"], points=5).points == 5
    with pytest.raises(ValueError):
        Chore(title="Task", assignee_ids=[], points=5)


def test_balance_and_redemption():
    transactions = record_transaction([], "member-1", 25, "test_award")
    assert balance(transactions, "member-1") == 25
    reward = Reward(title="Reward", cost=10).to_dict()
    updated = redeem(transactions, "member-1", reward)
    assert balance(updated, "member-1") == 15
    assert balance(transactions, "member-1") == 25
    with pytest.raises(ValueError):
        redeem(updated, "member-1", {"id": "expensive", "cost": 100})


def test_recurrence_periods():
    assert period_key("daily", date(2026, 10, 25)) == "2026-10-25"
    assert period_key("weekly", date(2026, 10, 25)) == "2026-10-19"
    assert period_key("once", date(2026, 10, 25)) == "once"
    completions = [{"chore_id": "c", "member_id": "m", "period": "2026-10-25", "status": "approved"}]
    assert is_completed(completions, "c", "m", "daily", date(2026, 10, 25))
    assert not is_completed(completions, "c", "other", "daily", date(2026, 10, 25))
