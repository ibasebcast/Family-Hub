"""Family Hub integration entry point.

The integration loads existing household data without resetting it. The
WebSocket API is registered once and uses a shared lock for mutations.
"""

import asyncio
from datetime import timedelta
from homeassistant.helpers.event import async_track_time_interval
from .api import register_api
from .const import DOMAIN
from .storage import HouseholdStorage
from .frontend import register_frontend
from .dashboard_manager import async_ensure_dashboards_safely
from .reminder_notifier import async_notify_due_reminders_safely


async def async_setup(hass, config):
    """Register authenticated API endpoints once per Home Assistant process."""
    hass.data.setdefault(DOMAIN + "_mutation_lock", asyncio.Lock())
    register_api(hass)
    await register_frontend(hass)
    return True


async def async_setup_entry(hass, entry):
    """Load persisted household data without modifying existing records."""
    store = HouseholdStorage(hass)
    await store.load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store
    # The integration is usable immediately: the shared dashboard is created
    # on first setup and missing personal dashboards are created on upgrades.
    # Existing, user-edited dashboards are never overwritten.
    await async_ensure_dashboards_safely(hass, store.data.get("members", []))

    # Reminders must survive restarts and fire without a wall/tablet browser
    # staying open. Use a native HA interval listener and cancel it on unload.
    async def reminder_tick(_now):
        await async_notify_due_reminders_safely(hass)

    unsubscriber = async_track_time_interval(
        hass, reminder_tick, timedelta(minutes=1)
    )
    hass.data.setdefault(DOMAIN + "_reminder_unsub", {})[entry.entry_id] = unsubscriber
    # Deliver anything missed while Home Assistant was offline.
    await async_notify_due_reminders_safely(hass)
    return True


async def async_unload_entry(hass, entry):
    """Remove in-memory references, never delete saved household data."""
    unsubscriber = hass.data.get(DOMAIN + "_reminder_unsub", {}).pop(
        entry.entry_id, None
    )
    if unsubscriber is not None:
        unsubscriber()
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
