"""Serve and register Family Hub JavaScript dashboard resources."""

import logging
from pathlib import Path
from homeassistant.components.http import StaticPathConfig

_LOGGER = logging.getLogger(__name__)
FILES = ("family-hub.js", "family-hub-shopping.js", "family-hub-calendar.js", "family-hub-manage.js", "family-hub-organizer.js", "family-hub-backup.js", "family-hub-approvals.js", "family-hub-weather.js", "family-hub-rewards-queue.js", "family-hub-room.js")


async def register_frontend(hass):
    """Register static routes and Lovelace resources for storage dashboards."""
    paths = [
        StaticPathConfig(
            "/family_hub_static/" + filename,
            str(Path(__file__).parent / "www" / filename),
            cache_headers=False,
        )
        for filename in FILES
    ]
    await hass.http.async_register_static_paths(paths)
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None:
        _LOGGER.info("Lovelace resources not ready; no registration attempted")
        return
    if not hasattr(resources, "async_create_item"):
        # YAML-managed resources cannot be modified through the storage API.
        _LOGGER.info("Lovelace resources use YAML; add Family Hub modules to YAML resources")
        return
    try:
        # Reading an unloaded collection before registration may discard existing
        # Lovelace resources, so always load it before checking for duplicates.
        if hasattr(resources, "async_load"):
            await resources.async_load()
        existing = resources.async_items()
        for filename in FILES:
            url = "/family_hub_static/" + filename
            if not any(item.get("url", "").split("?")[0] == url for item in existing):
                await resources.async_create_item({"res_type": "module", "url": url})
    except (ValueError, RuntimeError, KeyError, TypeError) as exc:
        _LOGGER.warning("Could not register Family Hub resources: %s", exc)
