"""Member actions require an exact Home Assistant user association."""

from types import SimpleNamespace
from custom_components.family_hub.permissions import can_act_as_member


def test_linked_member_can_act_for_self_only():
    data = {"members": [
        {"id": "one", "ha_user_id": "user-one"},
        {"id": "two", "ha_user_id": "user-two"},
    ]}
    user = SimpleNamespace(id="user-one", is_admin=False)
    assert can_act_as_member(data, user, "one")
    assert not can_act_as_member(data, user, "two")


def test_admin_can_manage_any_member():
    data = {"members": []}
    admin = SimpleNamespace(id="admin", is_admin=True)
    assert can_act_as_member(data, admin, "any")
