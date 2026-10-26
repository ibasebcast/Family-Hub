"""Fail CI if a core Family Hub feature is missing from the installable build.

A green Python test by itself is not enough: every dashboard template must
refer to a card actually shipped and registered by the integration. These
checks guard the agreed initial feature set against accidental omission when
merging changes from separate feature branches.
"""

import json
import re
from pathlib import Path

from custom_components.family_hub import api
from custom_components.family_hub.dashboard_templates import templates_for_members
from custom_components.family_hub.frontend import FILES


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "family_hub"
CARDS = COMPONENT / "www"


def test_required_modules_and_hacs_install_layout():
    """Everything used at runtime must ship inside custom_components."""
    metadata = json.loads((COMPONENT / "manifest.json").read_text())
    hacs = json.loads((ROOT / "hacs.json").read_text())

    assert metadata["domain"] == "family_hub"
    assert metadata["config_flow"] is True
    assert all(
        dependency in metadata["dependencies"]
        for dependency in ("lovelace", "websocket_api", "http", "persistent_notification")
    )
    assert hacs["content_in_root"] is False
    assert metadata["version"]
    for module in (
        "config_flow.py", "storage.py", "migrations.py", "household.py",
        "ledger.py", "reward_requests.py", "schedules.py",
        "calendar_adapter.py", "organizer.py", "routines.py",
        "custody.py", "reminders.py", "reminder_notifier.py",
        "room.py", "settings.py", "announcements.py", "exports.py",
        "dashboard_manager.py", "dashboard_templates.py", "frontend.py",
        "permissions.py",
    ):
        assert (COMPONENT / module).is_file(), module


def test_all_dashboard_cards_are_registered_and_shipped():
    """No family, wall, or personal dashboard may contain a missing custom card."""
    templates = templates_for_members([{"id": "generic-member", "name": "Generic Member"}])
    dashboards = [
        templates["family"], templates["wall"], *templates["members"]
    ]
    referenced = {
        card["type"].removeprefix("custom:")
        for dashboard in dashboards
        for view in dashboard["config"]["views"]
        for card in view["cards"]
        if card["type"].startswith("custom:")
    }
    assert len(FILES) == len(set(FILES))
    assert set(FILES) == {path.name for path in CARDS.glob("*.js")}
    for card_type in referenced:
        containing = [
            CARDS / filename for filename in FILES
            if re.search(r"[\x22']" + re.escape(card_type) + r"[\x22']", (
                CARDS / filename
            ).read_text(encoding="utf-8"))
        ]
        assert containing, f"{card_type} has no bundled JavaScript"
        assert any(
            "customElements.define(" in path.read_text(encoding="utf-8")
            for path in containing
        ), f"{card_type} is never registered as a custom element"


def test_every_agreed_backend_action_is_available():
    """The cards require these authenticated WebSocket commands."""
    required = {
        "add_member", "add_chore", "claim_chore", "review_chore",
        "add_reward", "redeem_reward", "review_redemption",
        "add_routine", "complete_routine_step", "set_presence",
        "add_rotation", "add_reminder", "complete_reminder",
        "add_event", "add_meal", "add_shopping_item",
        "set_shopping_checked", "add_announcement", "remove_announcement",
        "set_room_entities", "edit_record", "delete_record",
        "update_settings",
    }
    assert required <= set(api.COMMANDS)
    # These have custom read-only/backup permission rules instead.
    for read_command in (
        "websocket_state", "websocket_calendar", "websocket_export",
        "websocket_import", "websocket_rotation_schedule",
        "websocket_dashboard_templates",
    ):
        assert callable(getattr(api, read_command))


def test_wall_and_personal_templates_respect_admin_boundaries():
    """Avoid accidentally putting management controls on a shared tablet."""
    templates = templates_for_members([{"id": "generic-member", "name": "Generic Member"}])
    wall_cards = {
        card["type"]
        for view in templates["wall"]["config"]["views"]
        for card in view["cards"]
    }
    assert "custom:family-hub-manage-card" not in wall_cards
    assert "custom:family-hub-backup-card" not in wall_cards
    assert "custom:family-hub-room-card" not in wall_cards
    for member in templates["members"]:
        cards = [
            card for view in member["config"]["views"] for card in view["cards"]
        ]
        assert any(card["type"] == "custom:family-hub-member-card"
                   for card in cards)
        assert any(card["type"] == "custom:family-hub-room-card"
                   for card in cards)
        assert all(card.get("member_id") == "generic-member" for card in cards)
