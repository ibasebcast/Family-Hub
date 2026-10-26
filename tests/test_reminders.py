"""Scheduled reminder validation, one-time delivery and privacy tests."""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.family_hub.const import DOMAIN
from custom_components.family_hub.household import add_member
from custom_components.family_hub.reminders import (
    add_reminder, complete_reminder, due_reminders,
)
from custom_components.family_hub.reminder_notifier import (
    async_notify_due_reminders,
)
from custom_components.family_hub.storage import empty_household


class FakeStore:
    def __init__(self, data):
        self.data = deepcopy(data)
        self.save_count = 0

    async def snapshot(self):
        return deepcopy(self.data)

    async def save(self, data):
        self.data = deepcopy(data)
        self.save_count += 1


def household():
    data = empty_household()
    data = add_member(data, name="Member A")
    data = add_member(data, name="Member B")
    return data


def test_reminder_requires_aware_date_and_valid_members():
    data = household()
    a, b = [member["id"] for member in data["members"]]
    with pytest.raises(ValueError):
        add_reminder(data, title="Task", due_at="2026-10-26T12:00:00",
                     member_ids=[a])
    with pytest.raises(ValueError):
        add_reminder(data, title="Task",
                     due_at="2026-10-26T12:00:00+00:00", member_ids=["missing"])
    created = add_reminder(
        data, title=" Schedule example ", message="Details",
        due_at="2020-01-01T12:00:00+00:00", member_ids=[a],
    )
    assert created["reminders"][0]["title"] == "Schedule example"
    assert data["reminders"] == []
    assert due_reminders(created, datetime(2026, 10, 26, tzinfo=timezone.utc))


def test_assigned_member_can_complete_reminder_but_other_member_cannot():
    data = household()
    a, b = [member["id"] for member in data["members"]]
    data = add_reminder(data, title="Task",
                        due_at="2020-01-01T12:00:00+00:00", member_ids=[a])
    reminder_id = data["reminders"][0]["id"]
    with pytest.raises(ValueError):
        complete_reminder(data, reminder_id=reminder_id, member_id=b)
    done = complete_reminder(data, reminder_id=reminder_id, member_id=a)
    assert done["reminders"][0]["completed"] is True
    assert not due_reminders(done)
    assert data["reminders"][0]["completed"] is False


@pytest.mark.asyncio
async def test_reminders_notify_once_and_survive_repeat_checks():
    data = household()
    data = add_reminder(data, title="Generic test task",
                        due_at="2020-01-01T12:00:00+00:00")
    store = FakeStore(data)
    notifier = AsyncMock()
    hass = SimpleNamespace(
        data={DOMAIN: {"entry": store}, DOMAIN + "_mutation_lock": asyncio.Lock()},
        services=SimpleNamespace(async_call=notifier),
    )
    assert await async_notify_due_reminders(hass) == 1
    assert store.save_count == 1
    assert store.data["reminders"][0]["notified"] is True
    notifier.assert_awaited_once()
    service_call = notifier.await_args
    assert service_call.args[:2] == ("persistent_notification", "create")
    assert service_call.args[2]["notification_id"] == (
        "family_hub_" + data["reminders"][0]["id"]
    )
    assert await async_notify_due_reminders(hass) == 0
    notifier.assert_awaited_once()
    assert store.save_count == 1


@pytest.mark.asyncio
async def test_notification_failure_keeps_reminder_pending_for_retry():
    data = add_reminder(household(), title="Generic test task",
                        due_at="2020-01-01T12:00:00+00:00")
    store = FakeStore(data)
    notifier = AsyncMock(side_effect=RuntimeError("notification unavailable"))
    hass = SimpleNamespace(
        data={DOMAIN: {"entry": store}, DOMAIN + "_mutation_lock": asyncio.Lock()},
        services=SimpleNamespace(async_call=notifier),
    )
    with pytest.raises(RuntimeError):
        await async_notify_due_reminders(hass)
    assert store.save_count == 0
    assert store.data["reminders"][0]["notified"] is False
