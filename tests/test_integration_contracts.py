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
    """Verify the callable boundary validator regardless of HA's vol compatibility layer."""
    import pytest

    operation, fields = COMMANDS["add_rotation"]
    assert callable(operation)
    marker = next(
        key for key in fields if getattr(key, "schema", key) == "days_per_block"
    )
    assert marker.default() == 7
    validate = fields[marker]
    assert validate(1) == 1
    assert validate(14) == 14
    assert validate(365) == 365
    for invalid in (0, -1, 366, "not-a-number"):
        with pytest.raises(Exception):
            validate(invalid)
