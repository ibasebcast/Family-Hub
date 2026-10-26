"""Backend authorization helpers.

These helpers never rely on hidden frontend controls as a security boundary.
Child accounts must be explicitly linked to a household member.
"""


def linked_member(data, user_id):
    """Find the unique member associated with an authenticated HA user."""
    return next((m for m in data["members"] if m.get("ha_user_id") == user_id), None)


def can_act_as_member(data, user, member_id):
    """Allow administrators or a user linked to this exact member."""
    if user.is_admin:
        return True
    member = linked_member(data, user.id)
    return member is not None and member["id"] == member_id


def can_approve(data, user):
    """Restrict approvals to admins until adult delegation is configured."""
    return bool(user.is_admin)
