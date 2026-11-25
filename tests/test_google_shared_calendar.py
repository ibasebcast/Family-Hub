"""Google shared calendar access uses HA's own OAuth/calendar entities.

Family Hub does not store Google credentials or modify shared external events.
Home Assistant owns authentication and returns standard calendar.get_events data.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.family_hub.calendar_adapter import collect_calendar_events
from custom_components.family_hub.settings import update_settings
from custom_components.family_hub.storage import empty_household


@pytest.mark.asyncio
async def test_google_shared_calendar_events_are_included_with_other_calendars():
    hass = MagicMock()
    hass.services.async_call = AsyncMock(return_value={
        "calendar.shared_google": {
            "events": [
                {
                    "summary": "Shared event",
                    "start": "2026-12-03T14:00:00-05:00",
                    "end": "2026-12-03T15:00:00-05:00",
                    "description": "From a Google calendar shared with HA",
                },
                {
                    "summary": "All day",
                    "start": "2026-12-04",
                    "end": "2026-12-05",
                },
            ]
        },
        "calendar.local": {
            "events": [{
                "summary": "Local event",
                "start": "2026-12-03T10:00:00-05:00",
                "end": "2026-12-03T11:00:00-05:00",
            }]
        }
    })
    selected = ["calendar.shared_google", "calendar.local"]
    calendar = await collect_calendar_events(hass, selected, days=30)
    assert len(calendar) == 3
    assert {event["calendar_id"] for event in calendar} == set(selected)
    assert any(event["starts_at"] == "2026-12-04" for event in calendar)
    assert any(event["title"] == "Shared event" for event in calendar)
    assert hass.services.async_call.await_args.kwargs["return_response"] is True
    call = hass.services.async_call.await_args
    assert call.args[:2] == ("calendar", "get_events")
    assert call.args[2]["entity_id"] == selected


def test_calendar_settings_preserve_selected_google_entity_ids():
    original = empty_household()
    stored = update_settings(
        original,
        calendar_entities=["calendar.shared_google", "calendar.local"],
    )
    assert stored["calendar_entities"] == [
        "calendar.shared_google", "calendar.local"
    ]
    assert original["calendar_entities"] == []


def test_calendar_selection_rejects_duplicate_and_non_calendar_entities():
    data = empty_household()
    with pytest.raises(ValueError, match="Duplicate"):
        update_settings(
            data, calendar_entities=[
                "calendar.shared_google", "calendar.shared_google"
            ]
        )
    with pytest.raises(ValueError, match="calendar"):
        update_settings(
            data, calendar_entities=["switch.some_entity"]
        )
