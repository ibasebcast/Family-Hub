"""Read-only aggregation of Home Assistant calendar entities.

External calendar entities, including Google Calendar, remain authoritative.
Family Hub does not copy them into its local event storage.
"""

from datetime import datetime, timedelta
from homeassistant.components.calendar import DOMAIN as CALENDAR_DOMAIN
from homeassistant.util import dt as dt_util


async def collect_calendar_events(hass, entity_ids, *, days=14):
    """Return normalized upcoming events from configured calendar entities."""
    if not 1 <= days <= 366:
        raise ValueError("Calendar range must be between 1 and 366 days")
    start = dt_util.now()
    end = start + timedelta(days=days)
    results = []
    for entity_id in entity_ids:
        if not entity_id.startswith("calendar."):
            raise ValueError("Only calendar entities may be queried")
        component = hass.data.get(CALENDAR_DOMAIN)
        if component is None:
            continue
        entity = component.get_entity(entity_id)
        if entity is None:
            continue
        events = await entity.async_get_events(hass, start, end)
        for event in events:
            results.append({
                "calendar_id": entity_id,
                "title": event.summary,
                "starts_at": event.start.isoformat() if hasattr(event.start, "isoformat") else str(event.start),
                "ends_at": event.end.isoformat() if hasattr(event.end, "isoformat") else str(event.end),
                "description": event.description or "",
                "location": event.location or "",
            })
    return sorted(results, key=lambda item: item["starts_at"])
