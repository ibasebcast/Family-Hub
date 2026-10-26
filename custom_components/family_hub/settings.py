"""Editable household display preferences and calendar selection."""

from copy import deepcopy


def update_settings(data, *, currency_name=None, calendar_entities=None):
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
    return result
