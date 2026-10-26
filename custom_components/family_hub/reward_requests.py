"""Manage reward fulfillment after points have been redeemed."""

from copy import deepcopy
from .models import timestamp
from .ledger import record_transaction


def review_redemption(data, *, redemption_id, status):
    """Update fulfillment state without charging points a second time."""
    if status not in {"approved", "fulfilled", "declined"}:
        raise ValueError("Invalid redemption status")
    result = deepcopy(data)
    record = next((r for r in result.get("redemptions", [])
                   if r["id"] == redemption_id), None)
    if record is None:
        raise ValueError("Unknown redemption")
    current = record.get("status", "requested")
    allowed = {
        "requested": {"approved", "declined"},
        "approved": {"fulfilled", "declined"},
        "fulfilled": set(),
        "declined": set(),
    }
    if status not in allowed.get(current, set()):
        raise ValueError("Invalid redemption transition")
    if status == "declined":
        reward = next((r for r in result["rewards"] if r["id"] == record["reward_id"]), None)
        if reward is None:
            raise ValueError("Original reward is missing")
        result["transactions"] = record_transaction(
            result["transactions"], record["member_id"], reward["cost"],
            "reward_refunded", record["id"]
        )
    record["status"] = status
    record["updated_at"] = timestamp()
    return result
