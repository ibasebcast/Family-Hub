"""Family Hub integration entry point.

This development foundation deliberately does not register unfinished cards,
panels, or mutation APIs. Those must be tested before deployment.
"""

from .const import DOMAIN
from .storage import HouseholdStorage


async def async_setup(hass, config):
    """Allow Home Assistant to load the integration."""
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
