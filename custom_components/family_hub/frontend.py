"""Serve and reliably register all Family Hub Lovelace JavaScript cards.

A Home Assistant dashboard may be created successfully even when its custom
JavaScript resources were never registered. Always ensure both halves of setup.
Resources are reconciled by URL path, never deleted, and are versioned by file
contents so updated JavaScript cannot be hidden by an old browser cache.
"""

from hashlib import sha256
import logging
from pathlib import Path
from urllib.parse import urlsplit

from homeassistant.components import frontend as ha_frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE

_LOGGER = logging.getLogger(__name__)
_BASE_URL = "/family_hub_static"
_WWW = Path(__file__).parent / "www"

# Static tuple so the repository audit detects both omissions and extra files.
FILES = ("family-hub.js", "family-hub-shopping.js", "family-hub-calendar.js", "family-hub-manage.js", "family-hub-organizer.js", "family-hub-backup.js", "family-hub-approvals.js", "family-hub-weather.js", "family-hub-rewards-queue.js", "family-hub-room.js", "family-hub-routines.js", "family-hub-reminders.js")


def _module_url(filename):
    """Build a versioned URL. Call only from the executor-backed URL builder."""
    source = _WWW / filename
    version = sha256(source.read_bytes()).hexdigest()[:12]
    return f"{_BASE_URL}/{filename}?v={version}"


def _module_urls():
    """Hash all bundled files off the Home Assistant event loop.

    Path.read_bytes/open perform disk I/O, so this entire function is run by
    hass.async_add_executor_job and never called directly by async setup.
    """
    return {filename: _module_url(filename) for filename in FILES}


async def register_frontend(hass):
    """Expose static files, then register or repair Lovelace module resources."""
    paths = [
        StaticPathConfig(
            f"{_BASE_URL}/{filename}",
            str(_WWW / filename),
            cache_headers=False,
        )
        for filename in FILES
    ]
    try:
        await hass.http.async_register_static_paths(paths)
    except RuntimeError:
        # Idempotent when Home Assistant reuses the same integration setup.
        _LOGGER.debug("Family Hub static routes already registered")

    await async_ensure_lovelace_resources(hass)


async def async_ensure_lovelace_resources(hass):
    """Ensure every card module appears in the current HA resource collection.

    Safe to call from both async_setup and async_setup_entry. This covers HA
    startup ordering, as well as upgrades and previously incomplete installs.
    Existing unrelated Lovelace resources and user dashboards are untouched.
    """
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.warning(
            "Lovelace is not ready; Family Hub will retry card registration "
            "when the config entry is set up"
        )
        return False

    resources = getattr(lovelace, "resources", None)
    if resources is None:
        _LOGGER.error("Lovelace has no resource collection for Family Hub cards")
        return False

    try:
        # Path.read_bytes() triggers Home Assistant's blocking-I/O detector
        # if called on the event loop. Hash files in HA's executor instead.
        module_urls = await hass.async_add_executor_job(_module_urls)
        mode = getattr(lovelace, "resource_mode", MODE_STORAGE)
        if mode != MODE_STORAGE or not hasattr(resources, "async_create_item"):
            # YAML resources are read-only. Register with HA's frontend
            # without changing the user's configuration.yaml.
            for url in module_urls.values():
                ha_frontend.add_extra_js_url(hass, url)
            _LOGGER.info(
                "Registered %d Family Hub modules through frontend YAML-mode fallback",
                len(FILES),
            )
            return True

        # In HA 2026.x the storage collection can exist before being loaded.
        # Load it before writing to preserve all previously configured resources.
        if not getattr(resources, "loaded", False):
            await resources.async_load()
            resources.loaded = True

        existing = {
            urlsplit(item.get("url", "")).path: item
            for item in resources.async_items()
            if item.get("url")
        }
        created = 0
        updated = 0
        for filename in FILES:
            target_url = module_urls[filename]
            base_url = urlsplit(target_url).path
            match = existing.get(base_url)
            if match is None:
                await resources.async_create_item({
                    "res_type": "module", "url": target_url,
                })
                created += 1
            elif (
                match.get("url") != target_url
                or match.get("type") not in (None, "module")
            ):
                # Existing resources have IDs in HA. Fakes and old providers
                # without an update API are left intact instead of duplicated.
                if "id" in match and hasattr(resources, "async_update_item"):
                    await resources.async_update_item(match["id"], {
                        "res_type": "module", "url": target_url,
                    })
                    updated += 1
                else:
                    _LOGGER.warning(
                        "Family Hub resource %s needs an update, but its "
                        "collection cannot update the existing item", base_url
                    )
        _LOGGER.info(
            "Family Hub Lovelace resources ready: %d total, %d created, %d updated",
            len(FILES), created, updated,
        )
        return True
    except Exception:
        _LOGGER.exception(
            "Family Hub could not register Lovelace modules; the dashboard "
            "may show 'Custom element doesn't exist' until registration succeeds"
        )
        return False
