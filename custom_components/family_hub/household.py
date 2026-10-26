"""Household operations: members, chores, approvals, and reward redemption.

These pure functions accept a snapshot and return a new snapshot. The caller
must persist the returned value through HouseholdStorage. No Home Assistant
objects are needed, which keeps behavior testable and migration-friendly.
"""

from copy import deepcopy
from datetime import date
from .ledger import balance, record_transaction, redeem
from .models import Chore, Member, Reward, new_id, timestamp
from .schedules import period_key


def _member(data, member_id):
    """Require a real member rather than silently creating orphaned records."""
    return next((m for m in data["members"] if m["id"] == member_id), None)


def _chore(data, chore_id):
    return next((c for c in data["chores"] if c["id"] == chore_id), None)


def add_member(data, *, name, role="child", ha_user_id=None, color="#64748b"):
    """Add a member; linking to a Home Assistant user is optional."""
    result = deepcopy(data)
    if ha_user_id and any(m.get("ha_user_id") == ha_user_id for m in result["members"]):
        raise ValueError("Home Assistant user is already assigned to a member")
    result["members"].append(Member(name, role, ha_user_id, color).to_dict())
    return result


def add_chore(data, *, title, assignee_ids, points=0, recurrence="daily",
              approval_required=False, description="", rotation_days=None,
              rotation_start=None):
    """Create a chore only when every assignee exists."""
    if len(assignee_ids) != len(set(assignee_ids)):
        raise ValueError("Duplicate assignees are not allowed")
    if any(_member(data, member_id) is None for member_id in assignee_ids):
        raise ValueError("Unknown chore assignee")
    result = deepcopy(data)
    result["chores"].append(
        Chore(
            title, assignee_ids, points, recurrence, approval_required,
            description, rotation_days, rotation_start,
        ).to_dict()
    )
    return result


def add_reward(data, *, title, cost, description=""):
    """Register a reward without affecting existing balances."""
    result = deepcopy(data)
    result["rewards"].append(Reward(title, cost, description).to_dict())
    return result


def active_rotating_assignee(chore, day: date):
    """Return whose turn it is, or None for chores assigned to everyone."""
    if not chore.get("rotation_days"):
        return None
    anchor = date.fromisoformat(chore["rotation_start"])
    elapsed = (day - anchor).days
    index = (elapsed // chore["rotation_days"]) % len(chore["assignee_ids"])
    return chore["assignee_ids"][index]


def claim_chore(data, *, chore_id, member_id, day: date):
    """Claim one occurrence; award points immediately only if no approval is needed."""
    chore = _chore(data, chore_id)
    if chore is None or member_id not in chore["assignee_ids"]:
        raise ValueError("Chore is not assigned to this member")
    current_assignee = active_rotating_assignee(chore, day)
    if current_assignee is not None and current_assignee != member_id:
        raise ValueError("This rotating chore is assigned to another member today")
    period = period_key(chore["recurrence"], day)
    if any(c["chore_id"] == chore_id and c["member_id"] == member_id
           and c["period"] == period and c["status"] != "rejected"
           for c in data["completions"]):
        raise ValueError("This chore has already been claimed for the period")
    result = deepcopy(data)
    approved = not chore["approval_required"]
    completion = {
        "id": new_id(), "chore_id": chore_id, "member_id": member_id,
        "period": period, "status": "approved" if approved else "pending",
        "created_at": timestamp(), "reviewed_at": None, "reviewed_by": None,
    }
    result["completions"].append(completion)
    if approved:
        result["transactions"] = record_transaction(
            result["transactions"], member_id, chore["points"],
            "chore_completed", completion["id"]
        )
    return result


def review_chore(data, *, completion_id, approver_id, approved):
    """Approve or reject a pending claim exactly once.

    Authorization of the acting Home Assistant user must happen at the API
    boundary; this function also requires an adult household member.
    """
    approver = _member(data, approver_id)
    if approver is None or approver["role"] != "adult":
        raise ValueError("An adult household member must approve chores")
    result = deepcopy(data)
    completion = next((c for c in result["completions"] if c["id"] == completion_id), None)
    if completion is None or completion["status"] != "pending":
        raise ValueError("Completion is not awaiting approval")
    completion["status"] = "approved" if approved else "rejected"
    completion["reviewed_at"] = timestamp()
    completion["reviewed_by"] = approver_id
    if approved:
        chore = _chore(result, completion["chore_id"])
        if chore is None:
            raise ValueError("Original chore no longer exists")
        result["transactions"] = record_transaction(
            result["transactions"], completion["member_id"], chore["points"],
            "chore_approved", completion["id"]
        )
    return result


def redeem_reward(data, *, member_id, reward_id):
    """Redeem a reward and retain an auditable record of the purchase."""
    if _member(data, member_id) is None:
        raise ValueError("Unknown member")
    reward = next((r for r in data["rewards"] if r["id"] == reward_id), None)
    if reward is None:
        raise ValueError("Unknown reward")
    result = deepcopy(data)
    result["transactions"] = redeem(result["transactions"], member_id, reward)
    result.setdefault("redemptions", []).append({
        "id": new_id(), "member_id": member_id, "reward_id": reward_id,
        "created_at": timestamp(), "status": "requested", "cost": reward["cost"]
    })
    return result
