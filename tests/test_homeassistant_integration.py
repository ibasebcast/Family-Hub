"""Integration-level contract tests using lightweight Home Assistant fakes.

These tests exercise the actual setup and WebSocket handlers without requiring
a running Home Assistant server or modifying persistent user data.
"""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.family_hub import async_setup, async_setup_entry, async_unload_entry
from custom_components.family_hub import api
from custom_components.family_hub.const import DOMAIN
from custom_components.family_hub.storage import empty_household


class FakeConnection:
    def __init__(self, user):
        self.user = user
        self.result = None
        self.error = None

    def send_result(self, request_id, value):
        self.result = (request_id, value)

    def send_error(self, request_id, code, message):
        self.error = (request_id, code, message)


class FakeStore:
    def __init__(self, data):
        self.data = deepcopy(data)
        self.save_count = 0

    async def snapshot(self):
        return deepcopy(self.data)

    async def save(self, data):
        self.data = deepcopy(data)
        self.save_count += 1


def fake_hass(data):
    return SimpleNamespace(data={
        DOMAIN: {"entry": FakeStore(data)},
        DOMAIN + "_mutation_lock": asyncio.Lock(),
    })


def user(identifier, admin=False):
    return SimpleNamespace(id=identifier, is_admin=admin)


@pytest.mark.asyncio
async def test_integration_setup_registers_api_and_frontend(monkeypatch):
    registered = []
    frontend = AsyncMock()
    monkeypatch.setattr("custom_components.family_hub.register_api", registered.append)
    monkeypatch.setattr("custom_components.family_hub.register_frontend", frontend)
    hass = SimpleNamespace(data={})
    assert await async_setup(hass, {}) is True
    assert registered == [hass]
    frontend.assert_awaited_once_with(hass)
    assert DOMAIN + "_mutation_lock" in hass.data


@pytest.mark.asyncio
async def test_setup_entry_loads_and_unload_preserves_storage(monkeypatch):
    store = SimpleNamespace(load=AsyncMock(), data={"existing": True})
    monkeypatch.setattr("custom_components.family_hub.HouseholdStorage", lambda hass: store)
    hass = SimpleNamespace(data={})
    entry = SimpleNamespace(entry_id="entry-1")
    assert await async_setup_entry(hass, entry) is True
    store.load.assert_awaited_once()
    assert hass.data[DOMAIN]["entry-1"] is store
    assert await async_unload_entry(hass, entry) is True
    assert hass.data[DOMAIN] == {}


@pytest.mark.asyncio
async def test_member_state_is_filtered_and_admin_sees_full_data():
    data = empty_household()
    data["members"] = [
        {"id": "a", "name": "Member A", "ha_user_id": "user-a"},
        {"id": "b", "name": "Member B", "ha_user_id": "user-b"},
    ]
    data["chores"] = [
        {"id": "ca", "assignee_ids": ["a"]},
        {"id": "cb", "assignee_ids": ["b"]},
    ]
    data["transactions"] = [
        {"id": "ta", "member_id": "a", "amount": 10},
        {"id": "tb", "member_id": "b", "amount": 20},
    ]
    data["events"] = [{"id": "private", "title": "Private"}]
    hass = fake_hass(data)
    original_store = api._store
    api._store = lambda h: h.data[DOMAIN]["entry"]
    try:
        member = FakeConnection(user("user-a"))
        await api.websocket_state(hass, member, {"id": 1, "type": "family_hub/state"})
        assert member.error is None
        result = member.result[1]
        assert [m["id"] for m in result["members"]] == ["a"]
        assert [c["id"] for c in result["chores"]] == ["ca"]
        assert [t["id"] for t in result["transactions"]] == ["ta"]
        assert result["events"] == []
        stranger = FakeConnection(user("unknown"))
        await api.websocket_state(hass, stranger, {"id": 2, "type": "family_hub/state"})
        assert stranger.error[1] == "unauthorized"
        admin = FakeConnection(user("admin", True))
        await api.websocket_state(hass, admin, {"id": 3, "type": "family_hub/state"})
        assert len(admin.result[1]["members"]) == 2
        assert len(admin.result[1]["events"]) == 1
    finally:
        api._store = original_store


@pytest.mark.asyncio
async def test_backup_export_import_permissions_and_persistence():
    data = empty_household()
    hass = fake_hass(data)
    original_store = api._store
    api._store = lambda h: h.data[DOMAIN]["entry"]
    try:
        denied = FakeConnection(user("child"))
        await api.websocket_export(hass, denied, {"id": 1})
        assert denied.error[1] == "unauthorized"
        await api.websocket_import(hass, denied, {
            "id": 2, "backup": data, "confirm_replace": True
        })
        assert denied.error[1] == "unauthorized"
        assert hass.data[DOMAIN]["entry"].save_count == 0

        admin = FakeConnection(user("admin", True))
        await api.websocket_export(hass, admin, {"id": 3})
        assert admin.result[1]["schema_version"] == data["schema_version"]
        await api.websocket_import(hass, admin, {
            "id": 4, "backup": data, "confirm_replace": True
        })
        assert admin.result[1] == {"success": True}
        assert hass.data[DOMAIN]["entry"].save_count == 1
    finally:
        api._store = original_store


@pytest.mark.asyncio
async def test_rotation_schedule_only_exposes_linked_member():
    data = empty_household()
    data["members"] = [
        {"id": "a", "ha_user_id": "user-a"},
        {"id": "b", "ha_user_id": "user-b"},
    ]
    data["rotations"] = [
        {"id": "ra", "member_ids": ["a"], "starts_on": "2026-10-01",
         "households": ["A", "B"], "days_per_block": 7},
        {"id": "rb", "member_ids": ["b"], "starts_on": "2026-10-01",
         "households": ["A", "B"], "days_per_block": 7},
    ]
    hass = fake_hass(data)
    original_store = api._store
    api._store = lambda h: h.data[DOMAIN]["entry"]
    try:
        member = FakeConnection(user("user-a"))
        await api.websocket_rotation_schedule(hass, member, {
            "id": 1, "starts_on": "2026-10-26", "days": 2
        })
        assert member.error is None
        assert {r["rotation_id"] for r in member.result[1]} == {"ra"}
        admin = FakeConnection(user("admin", True))
        await api.websocket_rotation_schedule(hass, admin, {
            "id": 2, "starts_on": "2026-10-26", "days": 2
        })
        assert {r["rotation_id"] for r in admin.result[1]} == {"ra", "rb"}
    finally:
        api._store = original_store
