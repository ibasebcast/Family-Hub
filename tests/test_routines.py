"""Verify independent daily routine completion and presence settings."""

import pytest
from custom_components.family_hub.routines import add_routine, complete_routine_step, set_presence


def test_routine_completion_is_independent():
    data = {"members": [{"id": "a"}, {"id": "b"}], "routines": []}
    data = add_routine(data, title="Morning", member_ids=["a", "b"], steps=["Step one"])
    routine = data["routines"][0]
    completed = complete_routine_step(
        data, routine_id=routine["id"], step_id=routine["steps"][0]["id"],
        member_id="a", day="2026-10-25"
    )
    assert len(completed["routine_completions"]) == 1
    with pytest.raises(ValueError):
        complete_routine_step(
            completed, routine_id=routine["id"], step_id=routine["steps"][0]["id"],
            member_id="a", day="2026-10-25"
        )
    updated = set_presence(completed, member_id="b", present=False)
    assert updated["presence"]["b"] is False
    assert len(updated["routine_completions"]) == 1
