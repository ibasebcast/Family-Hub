"""Persistent household storage with serialized writes and safe defaults.

All household information stays in Home Assistant's private .storage directory.
Never place real family data in the integration source repository.
"""

import asyncio
from copy import deepcopy
from homeassistant.helpers.storage import Store
from .const import STORAGE_KEY, STORAGE_VERSION
from .migrations import migrate_household


def empty_household():
    """Return a fresh empty dataset, never shared mutable defaults."""
    return {
        "schema_version": STORAGE_VERSION,
        "members": [],
        "chores": [],
        "completions": [],
        "rewards": [],
        "transactions": [],
        "routines": [],
        "events": [],
        "meals": [],
        "shopping": [],
        "settings": {"currency_name": "Points", "display_user_ids": []},
        "redemptions": [],
        "routine_completions": [],
        "presence": {},
        "room_entities": {},
        "announcements": [],
        "rotations": [],
        "reminders": [],
        "calendar_entities": [],
    }


class HouseholdStorage:
    """Coordinate persistence and avoid concurrent write corruption."""

    def __init__(self, hass):
        self._store = Store(hass, 1, STORAGE_KEY)
        self._lock = asyncio.Lock()
        self.data = empty_household()

    async def load(self):
        """Load saved data without overwriting it on integration updates."""
        saved = await self._store.async_load()
        if saved is not None:
            if not isinstance(saved, dict):
                raise ValueError("Family Hub storage has an unexpected format")
            migrated = migrate_household(saved)
            self.data = {**empty_household(), **migrated}
            if migrated != saved:
                await self._store.async_save(self.data)
        return deepcopy(self.data)

    async def snapshot(self):
        """Return an isolated snapshot to prevent accidental mutation."""
        async with self._lock:
            return deepcopy(self.data)

    async def save(self, updated):
        """Persist an entire validated snapshot atomically under a lock."""
        if not isinstance(updated, dict) or updated.get("schema_version") != STORAGE_VERSION:
            raise ValueError("Invalid Family Hub storage schema")
        async with self._lock:
            await self._store.async_save(updated)
            self.data = deepcopy(updated)
