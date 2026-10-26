"""Read-only aggregation of Home Assistant calendars.

Google Calendar and other providers are accessed through Home Assistant's
calendar.get_events service. External events are never copied into storage.
"""

from datetime import timedelta
from homeassistant.util import dt as dt_util


async def collect_calendar_events(hass, entity_ids, *, days=14):
    """Fetch normalized upcoming events from configured calendar entities."""
    if type(days) is not int or not 1 <= days <= 366:
        raise ValueError("Calendar range must be between 1 and 366 days")
    if not isinstance(entity_ids, list):
        raise ValueError("Calendar selection must be a list")
    if not entity_ids:
        return []
    if any(not isinstance(e, str) or not e.startswith("calendar.") for e in entity_ids):
        raise ValueError("Only calendar entities can be queried")
    start = dt_util.now()
    end = start + timedelta(days=days)
    response = await hass.services.async_call(
        "calendar", "get_events",
        {"entity_id": entity_ids, "start_date_time": start.isoformat(),
         "end_date_time": end.isoformat()},
        blocking=True, return_response=True,
    )
    results = []
    for entity_id in entity_ids:
        for event in (response or {}).get(entity_id, {}).get("events", []):
            results.append({
                "calendar_id": entity_id,
                "title": event.get("summary", ""),
                "starts_at": event.get("start", ""),
                "ends_at": event.get("end", ""),
                "description": event.get("description", ""),
                "location": event.get("location", ""),
            })
    return sorted(results, key=lambda event: event["starts_at"])
