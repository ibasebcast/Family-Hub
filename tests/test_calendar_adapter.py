"""Calendar aggregation should use the Home Assistant calendar service."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
import pytest

from custom_components.family_hub.calendar_adapter import collect_calendar_events


@pytest.mark.asyncio
async def test_collect_events():
    hass = MagicMock()
    hass.services.async_call = AsyncMock(return_value={
        "calendar.household": {"events": [
            {"summary": "Event", "start": "2026-10-26T12:00:00-04:00",
             "end": "2026-10-26T13:00:00-04:00"}
        ]}
    })
    events = await collect_calendar_events(hass, ["calendar.household"], days=7)
    assert len(events) == 1
    assert events[0]["title"] == "Event"
    assert events[0]["calendar_id"] == "calendar.household"
    assert hass.services.async_call.await_args.kwargs["return_response"] is True


@pytest.mark.asyncio
async def test_rejects_non_calendar_entity():
    with pytest.raises(ValueError):
        await collect_calendar_events(MagicMock(), ["light.kitchen"])


@pytest.mark.asyncio
async def test_empty_selection_avoids_service_call():
    hass = MagicMock()
    assert await collect_calendar_events(hass, []) == []
    hass.services.async_call.assert_not_called()
