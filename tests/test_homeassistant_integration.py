"""Integration-level contract tests using lightweight Home Assistant fakes.

These tests exercise the actual setup and undecorated WebSocket handlers without requiring
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
    install = AsyncMock(return_value=1)
    monkeypatch.setattr("custom_components.family_hub.async_ensure_dashboards_safely", install)
    notify = AsyncMock()
    unsubscribed = []
    monkeypatch.setattr(
        "custom_components.family_hub.async_notify_due_reminders_safely", notify
    )
    monkeypatch.setattr(
        "custom_components.family_hub.async_track_time_interval",
        lambda hass, callback, interval: lambda: unsubscribed.append(True)
    )
    hass = SimpleNamespace(data={})
    entry = SimpleNamespace(entry_id="entry-1")
    assert await async_setup_entry(hass, entry) is True
    store.load.assert_awaited_once()
    install.assert_awaited_once_with(hass, [])
    notify.assert_awaited_once_with(hass)
    assert hass.data[DOMAIN]["entry-1"] is store
    assert await async_unload_entry(hass, entry) is True
    assert unsubscribed == [True]
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
        await api.websocket_state.__wrapped__(hass, member, {"id": 1, "type": "family_hub/state"})
        assert member.error is None
        result = member.result[1]
        assert [m["id"] for m in result["members"]] == ["a"]
        assert [c["id"] for c in result["chores"]] == ["ca"]
        assert [t["id"] for t in result["transactions"]] == ["ta"]
        assert result["events"] == []
        stranger = FakeConnection(user("unknown"))
        await api.websocket_state.__wrapped__(hass, stranger, {"id": 2, "type": "family_hub/state"})
        assert stranger.error[1] == "unauthorized"
        admin = FakeConnection(user("admin", True))
        await api.websocket_state.__wrapped__(hass, admin, {"id": 3, "type": "family_hub/state"})
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
        await api.websocket_export.__wrapped__(hass, denied, {"id": 1})
        assert denied.error[1] == "unauthorized"
        await api.websocket_import.__wrapped__(hass, denied, {
            "id": 2, "backup": data, "confirm_replace": True
        })
        assert denied.error[1] == "unauthorized"
        assert hass.data[DOMAIN]["entry"].save_count == 0

        admin = FakeConnection(user("admin", True))
        await api.websocket_export.__wrapped__(hass, admin, {"id": 3})
        assert admin.result[1]["schema_version"] == data["schema_version"]
        await api.websocket_import.__wrapped__(hass, admin, {
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
        await api.websocket_rotation_schedule.__wrapped__(hass, member, {
            "id": 1, "starts_on": "2026-10-26", "days": 2
        })
        assert member.error is None
        assert {r["rotation_id"] for r in member.result[1]} == {"ra"}
        admin = FakeConnection(user("admin", True))
        await api.websocket_rotation_schedule.__wrapped__(hass, admin, {
            "id": 2, "starts_on": "2026-10-26", "days": 2
        })
        assert {r["rotation_id"] for r in admin.result[1]} == {"ra", "rb"}
    finally:
        api._store = original_store


@pytest.mark.asyncio
async def test_backup_restore_creates_missing_member_dashboards(monkeypatch):
    """Restoring members provisions personal views after data is saved."""
    data = empty_household()
    data["members"] = [
        {"id": "member-a", "name": "Generic Member", "role": "child"}
    ]
    hass = fake_hass(empty_household())
    install = AsyncMock()
    monkeypatch.setattr(api, "async_ensure_dashboards_safely", install)
    monkeypatch.setattr(api, "_store", lambda h: h.data[DOMAIN]["entry"])
    admin = FakeConnection(user("admin", True))
    await api.websocket_import.__wrapped__(hass, admin, {
        "id": 4, "backup": data, "confirm_replace": True
    })
    assert admin.error is None
    assert admin.result[1] == {"success": True}
    assert hass.data[DOMAIN]["entry"].save_count == 1
    install.assert_awaited_once_with(hass, data["members"])


@pytest.mark.asyncio
async def test_adding_member_provisions_dashboard_without_overwriting_data(monkeypatch):
    """Adding members retains one write and triggers the missing-view repair."""
    data = empty_household()
    hass = fake_hass(data)
    install = AsyncMock()
    monkeypatch.setattr(api, "async_ensure_dashboards_safely", install)
    monkeypatch.setattr(api, "_store", lambda h: h.data[DOMAIN]["entry"])
    registered = []

    # API registers one generated handler per mutation. Capture add_member.
    monkeypatch.setattr(
        api.websocket_api, "async_register_command",
        lambda hass_obj, handler: registered.append(handler)
    )
    api.register_api(hass)
    handler = next(
        cmd for cmd in registered
        if getattr(cmd, "_ws_command", None) == "family_hub/add_member"
    )
    connection = FakeConnection(user("admin", True))
    await handler.__wrapped__(hass, connection, {
        "id": 1, "type": "family_hub/add_member",
        "name": "Generic Member", "role": "child"
    })
    assert connection.error is None
    assert connection.result[1] == {"success": True}
    store = hass.data[DOMAIN]["entry"]
    assert store.save_count == 1
    assert len(store.data["members"]) == 1
    install.assert_awaited_once_with(hass, store.data["members"])


@pytest.mark.asyncio
async def test_frontend_registers_all_dashboard_assets(monkeypatch):
    from custom_components.family_hub import frontend

    registered_paths = []
    resources_created = []

    class FakeResources:
        async def async_load(self):
            pass

        def async_items(self):
            return []

        async def async_create_item(self, item):
            resources_created.append(item)

    http = SimpleNamespace(async_register_static_paths=AsyncMock(
        side_effect=lambda paths: registered_paths.extend(paths)
    ))
    hass = SimpleNamespace(http=http, data={
        "lovelace": SimpleNamespace(resources=FakeResources())
    })
    await frontend.register_frontend(hass)
    assert len(registered_paths) == len(frontend.FILES)
    assert len(resources_created) == len(frontend.FILES)
    assert {item["url"] for item in resources_created} == {
        "/family_hub_static/" + name for name in frontend.FILES
    }
    assert all(item["res_type"] == "module" for item in resources_created)


def test_every_websocket_command_has_schema():
    import voluptuous as vol

    assert api.COMMANDS
    for name, (operation, fields) in api.COMMANDS.items():
        assert callable(operation), name
        assert isinstance(fields, dict), name
        schema = vol.Schema({vol.Required("type"): "family_hub/" + name, **fields})
        assert schema is not None


def test_backend_domain_workflow_approval_redemption_and_refund():
    from datetime import date
    from custom_components.family_hub.household import (
        add_member, add_chore, add_reward, claim_chore, review_chore, redeem_reward
    )
    from custom_components.family_hub.reward_requests import review_redemption
    from custom_components.family_hub.ledger import balance

    data = empty_household()
    data = add_member(data, name="Adult", role="adult")
    data = add_member(data, name="Member", role="child")
    adult, member = [item["id"] for item in data["members"]]
    data = add_chore(data, title="Task", assignee_ids=[member],
                     points=25, approval_required=True)
    data = add_reward(data, title="Reward", cost=20)
    data = claim_chore(data, chore_id=data["chores"][0]["id"],
                       member_id=member, day=date(2026, 10, 26))
    assert balance(data["transactions"], member) == 0
    data = review_chore(data, completion_id=data["completions"][0]["id"],
                        approver_id=adult, approved=True)
    assert balance(data["transactions"], member) == 25
    data = redeem_reward(data, member_id=member, reward_id=data["rewards"][0]["id"])
    assert balance(data["transactions"], member) == 5
    redemption = data["redemptions"][0]["id"]
    data = review_redemption(data, redemption_id=redemption, status="declined")
    assert balance(data["transactions"], member) == 25
    with pytest.raises(ValueError):
        review_redemption(data, redemption_id=redemption, status="declined")


@pytest.mark.asyncio
async def test_dashboard_templates_require_admin_and_use_current_members():
    """Member accounts cannot enumerate other people's dashboard templates."""
    data = empty_household()
    data["members"] = [
        {"id": "member-one", "name": "Member One", "ha_user_id": "user-one"},
        {"id": "member-two", "name": "Member Two", "ha_user_id": "user-two"},
    ]
    hass = fake_hass(data)
    original_store = api._store
    api._store = lambda h: h.data[DOMAIN]["entry"]
    try:
        denied = FakeConnection(user("user-one"))
        await api.websocket_dashboard_templates.__wrapped__(
            hass, denied, {"id": 1, "type": "family_hub/dashboard_templates"}
        )
        assert denied.error[1] == "unauthorized"
        assert denied.result is None

        admin = FakeConnection(user("admin", True))
        await api.websocket_dashboard_templates.__wrapped__(
            hass, admin, {"id": 2, "type": "family_hub/dashboard_templates"}
        )
        assert admin.error is None
        assert admin.result[0] == 2
        assert admin.result[1]["family"]["url_path"] == "family-hub"
        assert len(admin.result[1]["members"]) == 2
    finally:
        api._store = original_store


@pytest.mark.asyncio
async def test_frontend_registration_skips_yaml_resources_safely():
    """YAML resource mode must not break integration setup."""
    from custom_components.family_hub import frontend

    class YAMLResources:
        def async_items(self):
            return []

    registered_paths = []
    http = SimpleNamespace(async_register_static_paths=AsyncMock(
        side_effect=lambda paths: registered_paths.extend(paths)
    ))
    hass = SimpleNamespace(http=http, data={
        "lovelace": SimpleNamespace(resources=YAMLResources())
    })
    await frontend.register_frontend(hass)
    # The static paths are safe in either mode; YAML resources are immutable.
    assert len(registered_paths) == len(frontend.FILES)


@pytest.mark.asyncio
async def test_frontend_registration_keeps_existing_resources():
    """Registration must not replace or duplicate unrelated Lovelace scripts."""
    from custom_components.family_hub import frontend

    created = []

    class ExistingResources:
        async def async_load(self):
            pass

        def async_items(self):
            return [
                {"url": "/other-card.js", "type": "module"},
                {"url": "/family_hub_static/" + frontend.FILES[0] + "?v=1",
                 "type": "module"},
            ]

        async def async_create_item(self, item):
            created.append(item)

    hass = SimpleNamespace(
        http=SimpleNamespace(async_register_static_paths=AsyncMock()),
        data={"lovelace": SimpleNamespace(resources=ExistingResources())},
    )
    await frontend.register_frontend(hass)
    assert len(created) == len(frontend.FILES) - 1
    assert not any(item["url"].endswith(frontend.FILES[0]) for item in created)
