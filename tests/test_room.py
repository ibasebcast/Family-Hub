"""Room entity configuration must reject unexpected domains."""

import pytest
from custom_components.family_hub.room import set_room_entities


def test_room_entity_allowlist():
    data = {"members": [{"id": "member-1"}]}
    updated = set_room_entities(data, member_id="member-1",
                                entity_ids=["light.bedroom", "fan.ceiling"])
    assert updated["room_entities"]["member-1"] == ["light.bedroom", "fan.ceiling"]
    assert "room_entities" not in data
    with pytest.raises(ValueError):
        set_room_entities(data, member_id="member-1", entity_ids=["lock.front_door"])
