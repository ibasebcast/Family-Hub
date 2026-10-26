"""Serve and register Family Hub Lovelace cards automatically.

The JavaScript bundle is hosted by Home Assistant. For storage-mode dashboards
we register it as a Lovelace module resource, so users do not have to paste
resource URLs manually. YAML-mode dashboards need a manual resource entry.
"""

from pathlib import Path
import logging

from homeassistant.components.http import StaticPathConfig

_LOGGER = logging.getLogger(__name__)
RESOURCE_URL = "/family_hub_static/family-hub.js"
RESOURCE_PATH = Path(__file__).parent / "www" / "family-hub.js"


async def register_frontend(hass):
    """Serve the card bundle and register it in storage-mode Lovelace."""
    if not RESOURCE_PATH.is_file():
        _LOGGER.warning("Family Hub card bundle is missing: %s", RESOURCE_PATH)
        return
    await hass.http.async_register_static_paths([
        StaticPathConfig(RESOURCE_URL, str(RESOURCE_PATH), cache_headers=False)
    ])
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None:
        _LOGGER.info(
            "Lovelace resource storage is unavailable. Add %s as a JavaScript module manually.",
            RESOURCE_URL,
        )
        return
    try:
        await resources.async_load()
        existing = resources.async_items()
        if any(item.get("url", "").split("?")[0] == RESOURCE_URL for item in existing):
            return
        await resources.async_create_item({"res_type": "module", "url": RESOURCE_URL})
        _LOGGER.info("Registered Family Hub dashboard cards")
    except (ValueError, RuntimeError, KeyError, TypeError) as exc:
        # Never block the household integration because a dashboard resource
        # could not be registered. Log the issue for troubleshooting.
        _LOGGER.warning("Unable to register Family Hub card resource: %s", exc)
