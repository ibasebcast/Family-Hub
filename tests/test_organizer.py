"""Tests for meal, shopping, and event management."""

import pytest
from custom_components.family_hub.organizer import (
    add_event, add_meal, add_shopping_item, set_shopping_checked
)


def empty():
    return {"shopping": [], "meals": [], "events": []}


def test_shopping_preserves_input_and_toggles():
    original = empty()
    updated = add_shopping_item(original, title="Example item")
    assert original["shopping"] == []
    item_id = updated["shopping"][0]["id"]
    checked = set_shopping_checked(updated, item_id=item_id, checked=True)
    assert checked["shopping"][0]["checked"]
    assert not updated["shopping"][0]["checked"]


def test_meals_validate_dates():
    assert add_meal(empty(), day="2026-10-25", title="Example")["meals"]
    with pytest.raises(ValueError):
        add_meal(empty(), day="not-a-date", title="Example")


def test_event_rejects_invalid_range():
    with pytest.raises(ValueError):
        add_event(empty(), title="Example",
                  starts_at="2026-10-25T12:00:00+00:00",
                  ends_at="2026-10-25T11:00:00+00:00")
