"""Prevent missing Lovelace files and unregistered WebSocket commands."""

from pathlib import Path

from custom_components.family_hub.frontend import FILES
from custom_components.family_hub.api import COMMANDS


def test_every_registered_card_has_a_source_file():
    directory = Path(__file__).resolve().parents[1] / "custom_components" / "family_hub" / "www"
    assert len(FILES) == len(set(FILES))
    for filename in FILES:
        assert (directory / filename).is_file(), filename


def test_required_commands_are_registered():
    assert {"add_member", "add_chore", "claim_chore", "review_chore",
            "redeem_reward", "review_redemption", "add_rotation",
            "add_event", "add_meal", "set_room_entities"}.issubset(COMMANDS)


def test_rotation_block_length_is_validated_at_api_boundary():
    """The UI must be able to save a custom custody rotation safely."""
    import pytest
    import voluptuous as vol

    operation, fields = COMMANDS["add_rotation"]
    schema = vol.Schema(fields)
    required = {
        "member_ids": ["member-a"],
        "starts_on": "2026-10-26",
        "households": ["Home A", "Home B"],
    }
    assert schema(required)["days_per_block"] == 7
    assert schema({**required, "days_per_block": 14})["days_per_block"] == 14
    for invalid in (0, -1, 366, "not-a-number"):
        with pytest.raises(vol.Invalid):
            schema({**required, "days_per_block": invalid})
