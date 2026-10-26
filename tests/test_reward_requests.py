"""Reward requests cannot be fulfilled or refunded twice."""

import pytest
from custom_components.family_hub.reward_requests import review_redemption


def household():
    return {
        "rewards": [{"id": "reward", "cost": 10}],
        "redemptions": [{"id": "request", "member_id": "member",
                         "reward_id": "reward", "status": "requested"}],
        "transactions": [],
    }


def test_approval_and_fulfillment():
    approved = review_redemption(household(), redemption_id="request", status="approved")
    done = review_redemption(approved, redemption_id="request", status="fulfilled")
    assert done["redemptions"][0]["status"] == "fulfilled"
    with pytest.raises(ValueError):
        review_redemption(done, redemption_id="request", status="fulfilled")


def test_decline_refunds_once():
    declined = review_redemption(household(), redemption_id="request", status="declined")
    assert declined["transactions"][0]["amount"] == 10
    with pytest.raises(ValueError):
        review_redemption(declined, redemption_id="request", status="declined")

def test_decline_refunds_original_cost_after_price_change():
    data = household()
    data["redemptions"][0]["cost"] = 7
    data["rewards"][0]["cost"] = 15
    declined = review_redemption(data, redemption_id="request", status="declined")
    assert declined["transactions"][0]["amount"] == 7
    assert data["transactions"] == []
