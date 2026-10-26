"""Routine and custody schedule domain operations.

Routine steps are lightweight checklist entries. Each completion records the
member, step and date independently so daily resets do not erase history.
"""

from copy import deepcopy
from datetime import date
from .models import new_id, timestamp


def add_routine(data, *, title, member_ids, steps):
    """Create a routine with named steps and valid household members."""
    if not title.strip() or not steps or any(not s.strip() for s in steps):
        raise ValueError("A routine requires a title and at least one named step")
    known = {m["id"] for m in data["members"]}
    if not member_ids or any(member not in known for member in member_ids):
        raise ValueError("Every routine assignee must exist")
    result = deepcopy(data)
    result["routines"].append({
        "id": new_id(), "title": title.strip(), "member_ids": list(dict.fromkeys(member_ids)),
        "steps": [{"id": new_id(), "title": step.strip()} for step in steps],
        "created_at": timestamp(),
    })
    return result


def complete_routine_step(data, *, routine_id, step_id, member_id, day):
    """Record a daily step completion once without changing other members."""
    routine = next((r for r in data["routines"] if r["id"] == routine_id), None)
    if routine is None or member_id not in routine["member_ids"]:
        raise ValueError("Routine is not assigned to this member")
    if step_id not in {step["id"] for step in routine["steps"]}:
        raise ValueError("Unknown routine step")
    date.fromisoformat(day)
    result = deepcopy(data)
    completions = result.setdefault("routine_completions", [])
    if any(c["routine_id"] == routine_id and c["step_id"] == step_id
           and c["member_id"] == member_id and c["day"] == day for c in completions):
        raise ValueError("Step already completed today")
    completions.append({
        "id": new_id(), "routine_id": routine_id, "step_id": step_id,
        "member_id": member_id, "day": day, "created_at": timestamp(),
    })
    return result


def set_presence(data, *, member_id, present):
    """Explicitly mark a member home or away, without deleting assignments."""
    if member_id not in {m["id"] for m in data["members"]}:
        raise ValueError("Unknown household member")
    result = deepcopy(data)
    result.setdefault("presence", {})[member_id] = bool(present)
    return result
