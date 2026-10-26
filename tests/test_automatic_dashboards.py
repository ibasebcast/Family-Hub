"""Exercise automatic dashboard setup against realistic HA collection behavior.

These fakes mirror Home Assistant's live dashboard collection: creating an
item immediately invokes the Lovelace listener, which registers a storage
dashboard in the live map. Nothing in these tests edits .storage files.
"""

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from homeassistant.components import websocket_api
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import (
    DashboardsCollection,
    DashboardsCollectionWebSocket,
)

from custom_components.family_hub import dashboard_manager


class FakeDashboard:
    """Storage dashboard whose configuration can be customized after setup."""

    def __init__(self, *, fail_save=False):
        self.saved = None
        self.fail_save = fail_save
        self.save_count = 0

    async def async_save(self, config):
        self.save_count += 1
        if self.fail_save:
            raise RuntimeError("Simulated storage write failure")
        self.saved = deepcopy(config)


class FakeCollection:
    """Fake collection that invokes HA's registered dashboard listener."""

    def __init__(self, lovelace, *, fail_save_path=None):
        self.lovelace = lovelace
        self.items = []
        self.created = []
        self.deleted = []
        self.fail_save_path = fail_save_path

    def async_items(self):
        return list(self.items)

    async def async_create_item(self, metadata):
        item = {"id": metadata["url_path"], **metadata}
        self.items.append(item)
        self.created.append(item)
        self.lovelace.dashboards[metadata["url_path"]] = FakeDashboard(
            fail_save=metadata["url_path"] == self.fail_save_path
        )
        return item

    async def async_delete_item(self, item_id):
        self.deleted.append(item_id)
        self.items = [item for item in self.items if item["id"] != item_id]
        self.lovelace.dashboards.pop(item_id, None)


def fake_hass(*, member_ids=(), fail_save_path=None):
    lovelace = SimpleNamespace(dashboards={})
    hass = SimpleNamespace(
        data={LOVELACE_DATA: lovelace},
        config=SimpleNamespace(recovery_mode=False),
    )
    collection = FakeCollection(lovelace, fail_save_path=fail_save_path)
    members = [
        {"id": member_id, "name": f"Generic Member {i}"}
        for i, member_id in enumerate(member_ids, 1)
    ]
    return hass, collection, members


@pytest.mark.asyncio
async def test_installation_creates_shared_dashboard_and_is_idempotent():
    hass, collection, _ = fake_hass()
    with (
        patch.object(dashboard_manager, "_live_dashboard_collection", return_value=collection),
        patch.object(dashboard_manager.frontend, "async_panel_exists", return_value=False),
    ):
        assert await dashboard_manager.async_ensure_dashboards(hass, []) == 2
        assert [item["url_path"] for item in collection.items] == ["family-hub", "family-hub-wall"]
        shared = collection.items[0]
        assert shared["require_admin"] is True
        assert shared["show_in_sidebar"] is True
        original = hass.data[LOVELACE_DATA].dashboards["family-hub"]
        assert original.saved["views"][0]["path"] == "home"

        # A user can edit their dashboard without an update resetting it.
        original.saved["views"][0]["title"] = "Customized by household"
        assert await dashboard_manager.async_ensure_dashboards(hass, []) == 0
        assert len(collection.created) == 2
        assert original.save_count == 1
        assert original.saved["views"][0]["title"] == "Customized by household"


@pytest.mark.asyncio
async def test_new_members_get_missing_dashboards_without_rewriting_existing():
    hass, collection, members = fake_hass(member_ids=("opaque-a", "opaque-b"))
    with (
        patch.object(dashboard_manager, "_live_dashboard_collection", return_value=collection),
        patch.object(dashboard_manager.frontend, "async_panel_exists", return_value=False),
    ):
        assert await dashboard_manager.async_ensure_dashboards(hass, members[:1]) == 3
        existing_paths = [item["url_path"] for item in collection.items]
        assert len(existing_paths) == 3
        first = hass.data[LOVELACE_DATA].dashboards[existing_paths[-1]]
        assert first.saved["views"][0]["cards"][0]["member_id"] == "opaque-a"
        assert await dashboard_manager.async_ensure_dashboards(hass, members) == 1
        assert len(collection.items) == 4
        assert first.save_count == 1
        created = collection.items[-1]
        assert created["show_in_sidebar"] is False
        assert created["require_admin"] is False


@pytest.mark.asyncio
async def test_collision_with_unowned_panel_or_existing_yaml_is_skipped():
    hass, collection, _ = fake_hass()
    hass.data[LOVELACE_DATA].dashboards["family-hub"] = FakeDashboard()
    with (
        patch.object(dashboard_manager, "_live_dashboard_collection", return_value=collection),
        patch.object(dashboard_manager.frontend, "async_panel_exists", return_value=True),
    ):
        assert await dashboard_manager.async_ensure_dashboards(hass, []) == 0
    assert collection.items == []


@pytest.mark.asyncio
async def test_failed_initial_save_rolls_back_only_the_new_dashboard():
    hass, collection, _ = fake_hass(fail_save_path="family-hub")
    with (
        patch.object(dashboard_manager, "_live_dashboard_collection", return_value=collection),
        patch.object(dashboard_manager.frontend, "async_panel_exists", return_value=False),
    ):
        with pytest.raises(RuntimeError, match="Simulated storage"):
            await dashboard_manager.async_ensure_dashboards(hass, [])
    assert collection.deleted == ["family-hub"]
    assert collection.items == []
    assert hass.data[LOVELACE_DATA].dashboards == {}


@pytest.mark.asyncio
async def test_recovery_mode_does_not_create_dashboards():
    hass, collection, _ = fake_hass()
    hass.config.recovery_mode = True
    assert await dashboard_manager.async_ensure_dashboards(hass, []) == 0
    assert collection.items == []


def test_live_collection_is_resolved_from_real_ha_websocket_handler():
    """Confirm lookup against Home Assistant's actual WebSocket registration."""
    # The production Lovelace integration registers a bound method on a
    # DashboardsCollectionWebSocket. We validate that exact registry shape.
    real_collection = object.__new__(DashboardsCollection)
    manager = DashboardsCollectionWebSocket(
        real_collection, "lovelace/dashboards", "dashboard", {}, {}
    )
    hass = SimpleNamespace(
        data={
            websocket_api.DOMAIN: {
                "lovelace/dashboards/list": (manager.ws_list_item, None)
            }
        }
    )
    assert dashboard_manager._live_dashboard_collection(hass) is real_collection
