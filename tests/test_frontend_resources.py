"""Regression tests for missing Family Hub custom elements in Lovelace.

The integration can create dashboards before the browser has registered the
JavaScript custom elements. The screenshot symptom is 'Custom element doesn't
exist: family-hub-manage-card'. These tests verify resource *installation* as
well as the already-tested dashboard configuration.
"""

import asyncio
from types import SimpleNamespace
from urllib.parse import urlsplit
from unittest.mock import AsyncMock

import pytest

from custom_components.family_hub import frontend




async def _executor_job(job, *args):
    """Mirror Home Assistant's executor so disk I/O stays off the event loop."""
    return await asyncio.to_thread(job, *args)


class StorageResources:
    """Imitate Home Assistant's existing, lazy-loaded resource collection."""

    def __init__(self):
        self.loaded = False
        self.items = [
            {"id": "unrelated", "url": "/hacsfiles/other/other.js?v=6",
             "type": "module"},
            {"id": "old-manage", "url": "/family_hub_static/family-hub-manage.js",
             "type": "module"},
        ]
        self.load_count = 0
        self.creates = []
        self.updates = []

    async def async_load(self):
        self.load_count += 1

    def async_items(self):
        return list(self.items)

    async def async_create_item(self, data):
        # HA only accepts writes after its lazy resource storage was loaded.
        assert self.loaded is True
        item = {"id": f"new-{len(self.creates)}",
                "type": data["res_type"], "url": data["url"]}
        self.items.append(item)
        self.creates.append(data)
        return item

    async def async_update_item(self, item_id, data):
        assert self.loaded is True
        item = next(item for item in self.items if item["id"] == item_id)
        item.update({"type": data["res_type"], "url": data["url"]})
        self.updates.append((item_id, data))
        return item


@pytest.mark.asyncio
async def test_existing_resource_collection_keeps_other_cards_and_repairs_family_hub():
    resources = StorageResources()
    hass = SimpleNamespace(async_add_executor_job=_executor_job, data={
        "lovelace": SimpleNamespace(resource_mode="storage", resources=resources)
    })

    assert await frontend.async_ensure_lovelace_resources(hass) is True
    assert resources.load_count == 1
    assert resources.items[0]["url"] == "/hacsfiles/other/other.js?v=6"
    assert len(resources.creates) == len(frontend.FILES) - 1
    assert len(resources.updates) == 1
    assert resources.updates[0][0] == "old-manage"
    family = {
        urlsplit(item["url"]).path: item for item in resources.items
        if item["url"].startswith("/family_hub_static/")
    }
    assert set(family) == {
        "/family_hub_static/" + name for name in frontend.FILES
    }
    assert all("?v=" in item["url"] and item["type"] == "module"
               for item in family.values())
    assert "/family_hub_static/family-hub-backup.js" in family

    # Repeated setup must not duplicate the scripts or erase custom resources.
    assert await frontend.async_ensure_lovelace_resources(hass) is True
    assert len(resources.creates) == len(frontend.FILES) - 1
    assert len(resources.updates) == 1
    assert resources.load_count == 1


@pytest.mark.asyncio
async def test_lovelace_missing_at_first_setup_can_recover_on_entry_setup():
    hass = SimpleNamespace(async_add_executor_job=_executor_job, data={})
    assert await frontend.async_ensure_lovelace_resources(hass) is False

    resources = StorageResources()
    hass.data["lovelace"] = SimpleNamespace(
        resource_mode="storage", resources=resources
    )
    assert await frontend.async_ensure_lovelace_resources(hass) is True
    assert len(resources.creates) == len(frontend.FILES) - 1


@pytest.mark.asyncio
async def test_register_frontend_serves_every_script_and_sets_up_resources():
    resources = StorageResources()
    paths = []
    hass = SimpleNamespace(async_add_executor_job=_executor_job, 
        data={"lovelace": SimpleNamespace(
            resource_mode="storage", resources=resources,
        )},
        http=SimpleNamespace(async_register_static_paths=AsyncMock(
            side_effect=lambda p: paths.extend(p)
        )),
    )
    await frontend.register_frontend(hass)
    assert len(paths) == len(frontend.FILES)
    assert all(path.url_path.startswith("/family_hub_static/") for path in paths)
    assert len(resources.creates) == len(frontend.FILES) - 1


@pytest.mark.asyncio
async def test_yaml_resource_mode_uses_frontend_fallback_without_writing_yaml(monkeypatch):
    fallback = []
    monkeypatch.setattr(
        frontend.ha_frontend, "add_extra_js_url",
        lambda hass, url: fallback.append(url),
    )
    class YAMLResources:
        def async_items(self):
            return []

    hass = SimpleNamespace(async_add_executor_job=_executor_job, data={
        "lovelace": SimpleNamespace(
            resource_mode="yaml", resources=YAMLResources(),
        )
    })
    assert await frontend.async_ensure_lovelace_resources(hass) is True
    assert {urlsplit(url).path for url in fallback} == {
        "/family_hub_static/" + name for name in frontend.FILES
    }


@pytest.mark.asyncio
async def test_resource_collection_error_is_reported_without_breaking_ha():
    class BrokenStorageResources(StorageResources):
        async def async_load(self):
            raise RuntimeError("Cannot read Lovelace resource storage")

    hass = SimpleNamespace(async_add_executor_job=_executor_job, data={
        "lovelace": SimpleNamespace(
            resource_mode="storage", resources=BrokenStorageResources(),
        )
    })
    assert await frontend.async_ensure_lovelace_resources(hass) is False


@pytest.mark.asyncio
async def test_file_hashing_never_blocks_home_assistant_event_loop(monkeypatch):
    """Regression: Home Assistant detects Path.read_bytes/open inside setup.

    Raise if *any* JavaScript read runs on the event loop thread, while still
    allowing ordinary synchronous file reads inside the HA executor.
    """
    from pathlib import Path

    original = Path.read_bytes
    seen = []

    def checked_read_bytes(path):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            seen.append(path.name)
            return original(path)
        raise AssertionError(f"Blocking read_bytes on event loop: {path}")

    monkeypatch.setattr(Path, "read_bytes", checked_read_bytes)
    resources = StorageResources()
    hass = SimpleNamespace(
        async_add_executor_job=_executor_job,
        data={"lovelace": SimpleNamespace(
            resource_mode="storage", resources=resources,
        )},
    )
    assert await frontend.async_ensure_lovelace_resources(hass) is True
    assert sorted(seen) == sorted(frontend.FILES)
    assert len(resources.creates) == len(frontend.FILES) - 1
    assert len(resources.updates) == 1
