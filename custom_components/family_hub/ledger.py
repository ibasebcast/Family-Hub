"""Pure functions for calculating and recording reward balances.

Balances are derived from an append-only transaction history. This prevents
lost balances when chores or rewards are subsequently edited or removed.
"""

from .models import new_id, timestamp


def balance(transactions, member_id):
    """Calculate the current balance for one member."""
    return sum(item["amount"] for item in transactions if item["member_id"] == member_id)


def record_transaction(transactions, member_id, amount, reason, reference_id=None):
    """Return a new ledger with one auditable transaction appended."""
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise ValueError("Transaction amount must be an integer")
    if not reason.strip():
        raise ValueError("Transaction reason is required")
    entry = {
        "id": new_id(),
        "member_id": member_id,
        "amount": amount,
        "reason": reason,
        "reference_id": reference_id,
        "created_at": timestamp(),
    }
    return [*transactions, entry]


def redeem(transactions, member_id, reward):
    """Spend points only when the member can afford the selected reward."""
    cost = reward["cost"]
    if not isinstance(cost, int) or isinstance(cost, bool) or cost < 0:
        raise ValueError("Invalid reward cost")
    if balance(transactions, member_id) < cost:
        raise ValueError("Insufficient points")
    return record_transaction(transactions, member_id, -cost, "reward_redeemed", reward["id"])
