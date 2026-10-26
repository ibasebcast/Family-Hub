"""Access decisions must not be based on UI visibility."""

from types import SimpleNamespace
from custom_components.family_hub.permissions import linked_member, can_act_as_member, can_approve


def test_child_only_acts_as_self():
    data = {"members": [
        {"id": "one", "ha_user_id": "user-one", "role": "child"},
        {"id": "two", "ha_user_id": "user-two", "role": "child"},
    ]}
    child = SimpleNamespace(id="user-one", is_admin=False)
    admin = SimpleNamespace(id="admin", is_admin=True)
    assert linked_member(data, child.id)["id"] == "one"
    assert can_act_as_member(data, child, "one")
    assert not can_act_as_member(data, child, "two")
    assert can_act_as_member(data, admin, "two")
    assert not can_approve(data, child)
    assert can_approve(data, admin)
