"""Editable household display preferences and calendar selection."""

from copy import deepcopy


def update_settings(data, *, currency_name=None, calendar_entities=None, display_user_ids=None):
    """Update only supplied settings; preserve all unrelated preferences."""
    result = deepcopy(data)
    if currency_name is not None:
        if not isinstance(currency_name, str) or not currency_name.strip():
            raise ValueError("Currency name is required")
        if len(currency_name) > 40:
            raise ValueError("Currency name is too long")
        result.setdefault("settings", {})["currency_name"] = currency_name.strip()
    if calendar_entities is not None:
        if len(calendar_entities) != len(set(calendar_entities)):
            raise ValueError("Duplicate calendar entities")
        if any(not isinstance(entity, str) or not entity.startswith("calendar.")
               for entity in calendar_entities):
            raise ValueError("Calendar entities must start with calendar.")
        result["calendar_entities"] = list(calendar_entities)
    if display_user_ids is not None:
        # A display account receives a deliberately reduced read-only
        # household state. It must be explicitly authorized by an admin.
        if (not isinstance(display_user_ids, list)
                or any(not isinstance(user_id, str) or not user_id.strip()
                       for user_id in display_user_ids)):
            raise ValueError("Display account IDs must be non-empty strings")
        if len(display_user_ids) != len(set(display_user_ids)):
            raise ValueError("Duplicate display account IDs")
        result.setdefault("settings", {})["display_user_ids"] = list(display_user_ids)
    return result
