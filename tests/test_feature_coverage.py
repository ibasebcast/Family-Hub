"""Keep the originally agreed Family Hub features reachable from the UI.

A backend-only feature is not usable on a wall tablet. These contracts ensure
the main user journeys have both a registered API and a dashboard card.
"""

from pathlib import Path

from custom_components.family_hub.api import COMMANDS
from custom_components.family_hub.dashboard_templates import (
    family_dashboard,
    member_dashboard,
)
from custom_components.family_hub.frontend import FILES

ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "family_hub"
CARDS = {
    "family-hub-overview-card": "family-hub.js",
    "family-hub-member-card": "family-hub.js",
    "family-hub-manage-card": "family-hub-manage.js",
    "family-hub-calendar-card": "family-hub-calendar.js",
    "family-hub-approvals-card": "family-hub-approvals.js",
    "family-hub-rewards-queue-card": "family-hub-rewards-queue.js",
    "family-hub-shopping-card": "family-hub-shopping.js",
    "family-hub-meals-card": "family-hub-organizer.js",
    "family-hub-announcements-card": "family-hub-organizer.js",
    "family-hub-backup-card": "family-hub-backup.js",
    "family-hub-weather-card": "family-hub-weather.js",
    "family-hub-room-card": "family-hub-room.js",
    "family-hub-routines-card": "family-hub-routines.js",
    "family-hub-custody-card": "family-hub-routines.js",
    "family-hub-reminders-card": "family-hub-reminders.js",
}

MUTATION_FEATURES = {
    "household": {"add_member", "edit_record", "delete_record"},
    "chores": {"add_chore", "claim_chore", "review_chore"},
    "rewards": {"add_reward", "redeem_reward", "review_redemption"},
    "daily_routines": {"add_routine", "complete_routine_step", "set_presence"},
    "custody_rotations": {"add_rotation"},
    "calendar": {"add_event"},
    "shopping": {"add_shopping_item", "set_shopping_checked"},
    "meals": {"add_meal"},
    "announcements": {"add_announcement", "remove_announcement"},
    "member_room_devices": {"set_room_entities"},
    "settings": {"update_settings"},
    "reminders": {"add_reminder", "complete_reminder"},
}


def test_every_required_feature_has_a_websocket_operation():
    for label, commands in MUTATION_FEATURES.items():
        assert commands <= COMMANDS.keys(), f"{label}: missing API commands"


def test_all_family_hub_cards_are_registered_from_real_modules():
    sources = {
        filename: (ROOT / "www" / filename).read_text(encoding="utf-8")
        for filename in FILES
    }
    for card, script in CARDS.items():
        assert script in sources, f"{card}: script not registered"
        assert f'"{card}"' in sources[script], card
        assert "customElements.define(" in sources[script], card


def test_generated_dashboards_cover_every_major_daily_screen():
    family = family_dashboard()
    member = member_dashboard({"id": "opaque", "name": "Generic Member"})
    family_cards = {
        card["type"] for view in family["views"] for card in view["cards"]
    }
    member_cards = {
        card["type"] for view in member["views"] for card in view["cards"]
    }
    for card in CARDS:
        full_type = f"custom:{card}"
        assert full_type in family_cards or full_type in member_cards, (
            f"{card}: unreachable from prebuilt dashboards"
        )
    # Personal cards must remain explicitly tied to one member's ID.
    for view in member["views"]:
        for card in view["cards"]:
            if card["type"] in {
                "custom:family-hub-member-card",
                "custom:family-hub-room-card",
                "custom:family-hub-routines-card",
                "custom:family-hub-custody-card",
                "custom:family-hub-reminders-card",
            }:
                assert card["member_id"] == "opaque"


def test_setup_does_not_need_manual_dashboard_creation():
    from custom_components.family_hub import async_setup_entry
    from custom_components.family_hub import dashboard_manager

    assert callable(async_setup_entry)
    assert callable(dashboard_manager.async_ensure_dashboards_safely)
