"""Install missing editable Lovelace dashboards through Home Assistant's live collection.

Home Assistant's dashboard collection owns the metadata, sidebar panels and
storage lifecycle. Creating a second collection or editing .storage directly
would bypass its change listeners and risk losing other dashboards.

Only dashboards that do not already exist are created. Existing dashboards,
including user-modified Family Hub dashboards, are never rewritten.
"""

import asyncio
import logging

from homeassistant.components import frontend, websocket_api
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import DashboardsCollection

from .const import DOMAIN
from .dashboard_templates import templates_for_members

_LOGGER = logging.getLogger(__name__)

# Share a lock across initial setup and subsequent member additions/imports.
_DASHBOARD_LOCK_KEY = DOMAIN + "_dashboard_lock"


def _live_dashboard_collection(hass):
    """Resolve the collection already registered by the Lovelace component.

    Home Assistant currently exposes this collection through the bound
    `lovelace/dashboards/list` WebSocket handler rather than directly on
    LovelaceData. Verify the type so an incompatible Home Assistant upgrade
    fails safely instead of writing dashboards using a detached collection.
    """
    registered = hass.data.get(websocket_api.DOMAIN, {})
    command = registered.get("lovelace/dashboards/list")
    handler = command[0] if isinstance(command, tuple) and command else None
    owner = getattr(handler, "__self__", None)
    live = getattr(owner, "storage_collection", None)
    if not isinstance(live, DashboardsCollection):
        raise RuntimeError("Home Assistant's live Lovelace dashboard collection is unavailable")
    return live


async def async_ensure_dashboards(hass, members):
    """Create missing shared/member dashboards and return their count.

    This function may run repeatedly. Existing configurations are never
    changed, and failures writing a newly created dashboard are rolled back.
    Member dashboard creation uses current stored member IDs, not sample data.
    """
    if getattr(getattr(hass, "config", None), "recovery_mode", False):
        _LOGGER.info("Not creating Family Hub dashboards in recovery mode")
        return 0

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        raise RuntimeError("Lovelace has not finished setting up")

    collection = _live_dashboard_collection(hass)
    requested = templates_for_members(members)
    templates = [requested["family"], requested["wall"], *requested["members"]]

    lock = hass.data.setdefault(_DASHBOARD_LOCK_KEY, asyncio.Lock())
    created_count = 0
    async with lock:
        # The live collection is already loaded and connected to HA's
        # dashboard-change listeners and sidebar registration.
        existing = {item["url_path"] for item in collection.async_items()}
        for item in templates:
            path = item["url_path"]
            if (
                path in existing
                or path in lovelace.dashboards
                or frontend.async_panel_exists(hass, path)
            ):
                # Another integration, YAML config or user may own this path.
                # Never replace it or adopt it as our own.
                continue

            metadata = {
                "url_path": path,
                "title": item["title"],
                "icon": item["icon"],
                "require_admin": path == "family-hub",
                "show_in_sidebar": path == "family-hub",
            }
            created = await collection.async_create_item(metadata)
            try:
                # async_create_item notifies HA's Lovelace listener, which
                # populates this map with a storage-backed LovelaceConfig.
                dashboard = lovelace.dashboards[path]
                await dashboard.async_save(item["config"])
            except Exception:
                # Roll back only the dashboard we just created, so a transient
                # write failure can safely retry after the next setup.
                try:
                    await collection.async_delete_item(created["id"])
                except Exception:
                    _LOGGER.exception("Could not roll back dashboard %s", path)
                raise

            existing.add(path)
            created_count += 1
            _LOGGER.info("Created editable Family Hub dashboard %s", path)

    return created_count


async def async_ensure_dashboards_safely(hass, members):
    """Keep ordinary household operations usable if Lovelace is unavailable."""
    try:
        return await async_ensure_dashboards(hass, members)
    except Exception:
        _LOGGER.exception(
            "Could not finish automatic Family Hub dashboard setup. "
            "Existing dashboards and household data were left unchanged."
        )
        return 0
