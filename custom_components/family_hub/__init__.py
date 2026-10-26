"""Family Hub integration entry point.

The integration loads existing household data without resetting it. The
WebSocket API is registered once and uses a shared lock for mutations.
"""

import asyncio
from .api import register_api
from .const import DOMAIN
from .storage import HouseholdStorage


async def async_setup(hass, config):
    """Register authenticated API endpoints once per Home Assistant process."""
    hass.data.setdefault(DOMAIN + "_mutation_lock", asyncio.Lock())
    register_api(hass)
    return True


async def async_setup_entry(hass, entry):
    """Load persisted household data without modifying existing records."""
    store = HouseholdStorage(hass)
    await store.load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store
    return True


async def async_unload_entry(hass, entry):
    """Remove in-memory references, never delete saved household data."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
