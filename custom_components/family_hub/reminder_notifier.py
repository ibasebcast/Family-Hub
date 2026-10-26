"""Deliver scheduled Family Hub reminders to Home Assistant notifications.

Notifications use a stable ID so retries cannot flood the administrator with
duplicates. Reminder delivery state is saved only after Home Assistant accepts
the notification. Household data is left intact on errors.
"""

import logging
from copy import deepcopy

from .const import DOMAIN
from .reminders import due_reminders

_LOGGER = logging.getLogger(__name__)


async def async_notify_due_reminders(hass):
    """Issue overdue reminders once while holding the household mutation lock."""
    stores = hass.data.get(DOMAIN, {})
    if len(stores) != 1:
        return 0

    store = next(iter(stores.values()))
    lock = hass.data[DOMAIN + "_mutation_lock"]
    async with lock:
        snapshot = await store.snapshot()
        due = due_reminders(snapshot)
        if not due:
            return 0

        updated = deepcopy(snapshot)
        delivered = []
        for reminder in due:
            # Use a stable notification id across restarts/retries.
            await hass.services.async_call(
                "persistent_notification",
                "create",
                {
                    "title": "Family Hub Reminder",
                    "message": reminder["title"] +
                        ("\n\n" + reminder["message"] if reminder.get("message") else ""),
                    "notification_id": "family_hub_" + reminder["id"],
                },
                blocking=True,
            )
            delivered.append(reminder["id"])

        for reminder in updated["reminders"]:
            if reminder["id"] in delivered:
                reminder["notified"] = True
        await store.save(updated)
        return len(delivered)


async def async_notify_due_reminders_safely(hass):
    """Log delivery errors; never block household usage or discard reminders."""
    try:
        return await async_notify_due_reminders(hass)
    except Exception:
        _LOGGER.exception("Family Hub could not deliver due reminders")
        return 0
