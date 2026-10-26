"""Editable Lovelace dashboard starter layouts.

Templates are built from generic card definitions. Household names and member
IDs enter the configuration only at runtime and are never bundled as samples.
Once installed, Home Assistant owns the dashboards and users may edit them.
"""

from hashlib import sha256


def family_dashboard():
    """Return the administrator's shared-family dashboard configuration."""
    return {
        "title": "Family Hub",
        "views": [
            {
                "title": "Home",
                "path": "home",
                "icon": "mdi:home-heart",
                "cards": [
                    {"type": "custom:family-hub-overview-card"},
                    {"type": "custom:family-hub-announcements-card"},
                    {"type": "custom:family-hub-weather-card"},
                ],
            },
            {
                "title": "Planning",
                "path": "planning",
                "icon": "mdi:calendar-month",
                "cards": [
                    {"type": "custom:family-hub-calendar-card"},
                    {"type": "custom:family-hub-meals-card"},
                    {"type": "custom:family-hub-shopping-card"},
                ],
            },
            {
                "title": "Approvals",
                "path": "approvals",
                "icon": "mdi:check-decagram",
                "cards": [
                    {"type": "custom:family-hub-approvals-card"},
                    {"type": "custom:family-hub-rewards-queue-card"},
                ],
            },
            {
                "title": "Manage",
                "path": "manage",
                "icon": "mdi:cog-outline",
                "cards": [
                    {"type": "custom:family-hub-manage-card"},
                    {"type": "custom:family-hub-backup-card"},
                ],
            },
        ],
    }


def member_dashboard(member):
    """Return an individual dashboard with an explicitly scoped member ID."""
    member_id = member["id"]
    return {
        "title": "My Family Hub",
        "views": [
            {
                "title": "My Day",
                "path": "my-day",
                "icon": "mdi:checkbox-marked-circle-outline",
                "cards": [
                    {"type": "custom:family-hub-member-card", "member_id": member_id},
                ],
            },
            {
                "title": "My Room",
                "path": "my-room",
                "icon": "mdi:bed-outline",
                "cards": [
                    {"type": "custom:family-hub-room-card", "member_id": member_id},
                ],
            },
        ],
    }


def templates_for_members(members):
    """Prepare stable, collision-resistant dashboard paths for stored members."""
    dashboards = []
    for member in members:
        # The member ID may be user-provided. Hash it to make a safe URL suffix
        # without revealing the raw stored identifier in the dashboard URL.
        suffix = sha256(member["id"].encode("utf-8")).hexdigest()[:16]
        dashboards.append({
            "url_path": f"family-hub-member-{suffix}",
            "title": f"Family Hub: {member['name']}",
            "icon": "mdi:account-heart",
            "config": member_dashboard(member),
        })
    return {
        "family": {
            "url_path": "family-hub",
            "title": "Family Hub",
            "icon": "mdi:home-heart",
            "config": family_dashboard(),
        },
        "members": dashboards,
    }
