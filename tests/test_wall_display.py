"""Security and privacy tests for explicitly allowlisted wall displays."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.family_hub import api
from custom_components.family_hub.settings import update_settings
from custom_components.family_hub.storage import empty_household


def household():
    data = empty_household()
    data["members"] = [
        {"id":"a", "name":"Member A", "role":"child",
         "ha_user_id":"linked-a", "secret":"not-for-display"},
        {"id":"b", "name":"Member B", "role":"adult",
         "ha_user_id":"linked-b"},
    ]
    data["chores"] = [
        {"id":"chore", "assignee_ids":["a"], "description":"Private text"}
    ]
    data["transactions"] = [
        {"id":"transaction", "member_id":"a", "amount":20,
         "reason":"private", "reference_id":"hidden"}
    ]
    data["events"] = [
        {"id":"event", "title":"Shared event",
         "starts_at":"2026-10-26T12:00:00+00:00",
         "ends_at":"2026-10-26T13:00:00+00:00",
         "notes":"Private event details"}
    ]
    data["shopping"] = [
        {"id":"item", "title":"Item", "checked":False,
         "quantity":"1", "created_at":"private"}
    ]
    data["announcements"] = [
        {"id":"notice", "title":"Shared notice", "message":"Message"}
    ]
    data["room_entities"] = {"a":["light.private"]}
    data["settings"]["display_user_ids"] = ["wall-account"]
    return data


def test_display_requires_an_explicit_unique_user_allowlist():
    data = empty_household()
    assert data["settings"]["display_user_ids"] == []
    assert not api._is_display_account(data, SimpleNamespace(id="wall-account"))
    saved = update_settings(data, display_user_ids=["wall-account"])
    assert saved["settings"]["display_user_ids"] == ["wall-account"]
    assert api._is_display_account(saved, SimpleNamespace(id="wall-account"))
    assert not api._is_display_account(saved, SimpleNamespace(id="other"))
    with pytest.raises(ValueError):
        update_settings(data, display_user_ids=["wall-account", "wall-account"])
    assert data["settings"]["display_user_ids"] == []


def test_display_state_omits_private_data_and_mutation_features():
    state = api._display_state(household())
    assert state["members"] == [
        {"id":"a", "name":"Member A", "role":"child"},
        {"id":"b", "name":"Member B", "role":"adult"},
    ]
    assert state["transactions"] == [{"member_id":"a", "amount":20}]
    assert state["chores"] == [{"id":"chore", "assignee_ids":["a"]}]
    assert state["events"] == [
        {"title":"Shared event",
         "starts_at":"2026-10-26T12:00:00+00:00",
         "ends_at":"2026-10-26T13:00:00+00:00"}
    ]
    assert state["room_entities"] == {}
    assert state["completions"] == []
    assert state["redemptions"] == []
    assert state["settings"] == {"currency_name":"Points"}
    assert state["shopping"][0]["title"] == "Item"
    assert state["announcements"][0]["title"] == "Shared notice"


class Connection:
    def __init__(self, identifier, admin=False):
        self.user = SimpleNamespace(id=identifier, is_admin=admin)
        self.result = None
        self.error = None

    def send_result(self, message_id, data):
        self.result = data

    def send_error(self, message_id, code, reason):
        self.error = (code, reason)


@pytest.mark.asyncio
async def test_only_wall_account_gets_display_state(monkeypatch):
    data = household()
    store = SimpleNamespace(snapshot=AsyncMock(return_value=data))
    monkeypatch.setattr(api, "_store", lambda hass: store)

    wall = Connection("wall-account")
    await api.websocket_state.__wrapped__(None, wall, {"id":1})
    assert wall.error is None
    assert wall.result["transactions"] == [{"member_id":"a", "amount":20}]

    # Unlinked and unapproved users cannot obtain the household roster.
    stranger = Connection("unapproved")
    await api.websocket_state.__wrapped__(None, stranger, {"id":2})
    assert stranger.result is None
    assert stranger.error[0] == "unauthorized"

    admin = Connection("admin", admin=True)
    await api.websocket_state.__wrapped__(None, admin, {"id":3})
    assert admin.result["members"][0]["ha_user_id"] == "linked-a"
