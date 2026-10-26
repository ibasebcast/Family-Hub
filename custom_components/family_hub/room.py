"""Per-member room configuration with explicit entity allowlists.

Room controls are a view preference, not an authorization grant. The backend
must separately enforce Home Assistant permissions on actual device actions.
"""

from copy import deepcopy


ALLOWED_DOMAINS = {"light", "fan", "cover", "climate", "switch", "sensor", "binary_sensor"}


def set_room_entities(data, *, member_id, entity_ids):
    """Save an ordered list of eligible room entities for one member."""
    if member_id not in {member["id"] for member in data["members"]}:
        raise ValueError("Unknown household member")
    if len(entity_ids) != len(set(entity_ids)):
        raise ValueError("Duplicate room entities are not allowed")
    if any(entity_id.split(".", 1)[0] not in ALLOWED_DOMAINS or "." not in entity_id
           for entity_id in entity_ids):
        raise ValueError("Unsupported room entity domain")
    result = deepcopy(data)
    result.setdefault("room_entities", {})[member_id] = list(entity_ids)
    return result
