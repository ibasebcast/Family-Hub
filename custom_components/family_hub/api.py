"""Authenticated WebSocket API for Family Hub.

Home Assistant already authenticates WebSocket sessions. Reads are restricted
to admins or linked members. Mutations require administrator privileges until
fine-grained child/approver permissions are implemented and tested.
"""

from datetime import date
import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback
from .const import DOMAIN
from .household import add_chore, add_member, add_reward, claim_chore, review_chore, redeem_reward
from .organizer import add_event, add_meal, add_shopping_item, set_shopping_checked
from .routines import add_routine, complete_routine_step, set_presence
from .exports import export_household
from .room import set_room_entities
from .announcements import add_announcement, remove_announcement
from .settings import update_settings
from .editing import edit_record, delete_record

COMMANDS = {
    "edit_record": (edit_record, {vol.Required("collection"): str, vol.Required("record_id"): str, vol.Required("changes"): dict}),
    "delete_record": (delete_record, {vol.Required("collection"): str, vol.Required("record_id"): str}),
    "add_announcement": (add_announcement, {
        vol.Required("title"): str, vol.Required("message"): str,
        vol.Optional("expires_at"): str,
    }),
    "remove_announcement": (remove_announcement, {
        vol.Required("announcement_id"): str,
    }),
    "update_settings": (update_settings, {
        vol.Optional("currency_name"): str,
        vol.Optional("calendar_entities"): [str],
    }),
    "set_room_entities": (set_room_entities, {
        vol.Required("member_id"): str,
        vol.Required("entity_ids"): [str],
    }),
    "add_routine": (add_routine, {
        vol.Required("title"): str, vol.Required("member_ids"): [str],
        vol.Required("steps"): [str],
    }),
    "complete_routine_step": (complete_routine_step, {
        vol.Required("routine_id"): str, vol.Required("step_id"): str,
        vol.Required("member_id"): str, vol.Required("day"): str,
    }),
    "set_presence": (set_presence, {
        vol.Required("member_id"): str, vol.Required("present"): bool,
    }),
    "add_shopping_item": (add_shopping_item, {
        vol.Required("title"): str,
        vol.Optional("quantity", default="1"): str,
        vol.Optional("category", default="General"): str,
    }),
    "set_shopping_checked": (set_shopping_checked, {
        vol.Required("item_id"): str, vol.Required("checked"): bool,
    }),
    "add_meal": (add_meal, {
        vol.Required("day"): str, vol.Required("title"): str,
        vol.Optional("meal_type", default="dinner"): vol.In(["breakfast", "lunch", "dinner", "snack"]),
        vol.Optional("notes", default=""): str,
    }),
    "add_event": (add_event, {
        vol.Required("title"): str, vol.Required("starts_at"): str,
        vol.Required("ends_at"): str,
        vol.Optional("member_ids", default=[]): [str],
        vol.Optional("notes", default=""): str,
    }),
    "add_member": (add_member, {
        vol.Required("name"): str,
        vol.Optional("role", default="child"): vol.In(["child", "adult"]),
        vol.Optional("ha_user_id"): str,
        vol.Optional("color", default="#64748b"): str,
    }),
    "add_chore": (add_chore, {
        vol.Required("title"): str,
        vol.Required("assignee_ids"): [str],
        vol.Optional("points", default=0): vol.All(int, vol.Range(min=0, max=100000)),
        vol.Optional("recurrence", default="daily"): vol.In(["once", "daily", "weekly"]),
        vol.Optional("approval_required", default=False): bool,
        vol.Optional("description", default=""): str,
    }),
    "add_reward": (add_reward, {
        vol.Required("title"): str,
        vol.Required("cost"): vol.All(int, vol.Range(min=0)),
        vol.Optional("description", default=""): str,
    }),
    "claim_chore": (claim_chore, {
        vol.Required("chore_id"): str, vol.Required("member_id"): str,
    }),
    "review_chore": (review_chore, {
        vol.Required("completion_id"): str, vol.Required("approver_id"): str,
        vol.Required("approved"): bool,
    }),
    "redeem_reward": (redeem_reward, {
        vol.Required("member_id"): str, vol.Required("reward_id"): str,
    }),
}


def _store(hass):
    """Return the configured household's persistent storage."""
    entries = hass.data.get(DOMAIN, {})
    if len(entries) != 1:
        raise ValueError("Exactly one configured household is required")
    return next(iter(entries.values()))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/state"})
@websocket_api.async_response
async def websocket_state(hass, connection, msg):
    """Return the household state, filtered to a linked child's own records."""
    try:
        data = await _store(hass).snapshot()
        if connection.user.is_admin:
            connection.send_result(msg["id"], data)
            return
        member = next((m for m in data["members"]
                       if m.get("ha_user_id") == connection.user.id), None)
        if member is None:
            connection.send_error(msg["id"], "unauthorized", "No linked household member")
            return
        # Do not expose other members' points or private records.
        allowed = member["id"]
        data["members"] = [member]
        data["chores"] = [c for c in data["chores"] if allowed in c["assignee_ids"]]
        data["completions"] = [c for c in data["completions"] if c["member_id"] == allowed]
        data["transactions"] = [t for t in data["transactions"] if t["member_id"] == allowed]
        data["redemptions"] = [r for r in data.get("redemptions", []) if r["member_id"] == allowed]
        data["room_entities"] = {allowed: data.get("room_entities", {}).get(allowed, [])}
        # Hide records without a defined member-level access model.
        for section in ("events", "meals", "shopping", "routines"):
            data[section] = []
        connection.send_result(msg["id"], data)
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_state", str(exc))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/export"})
@websocket_api.async_response
async def websocket_export(hass, connection, msg):
    """Let administrators download a complete snapshot without modifying it."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator required")
        return
    try:
        data = await _store(hass).snapshot()
        connection.send_result(msg["id"], export_household(data))
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_state", str(exc))


def register_api(hass):
    """Register commands once during integration setup."""
    websocket_api.async_register_command(hass, websocket_state)
    websocket_api.async_register_command(hass, websocket_export)
    for action, (operation, fields) in COMMANDS.items():
        # Freeze loop variables in this factory to avoid late binding bugs.
        def make_handler(name, function, schema_fields):
            @websocket_api.websocket_command({
                vol.Required("type"): f"family_hub/{name}", **schema_fields
            })
            @websocket_api.async_response
            async def handler(hass, connection, msg):
                if not connection.user.is_admin:
                    connection.send_error(msg["id"], "unauthorized", "Administrator required")
                    return
                try:
                    store = _store(hass)
                    # Serialize read/modify/write at the application layer.
                    async with hass.data[DOMAIN + "_mutation_lock"]:
                        snapshot = await store.snapshot()
                        kwargs = {k: v for k, v in msg.items() if k not in ("id", "type")}
                        if name == "claim_chore":
                            kwargs["day"] = date.today()
                        updated = function(snapshot, **kwargs)
                        await store.save(updated)
                    connection.send_result(msg["id"], {"success": True})
                except (ValueError, TypeError, KeyError) as exc:
                    connection.send_error(msg["id"], "invalid_request", str(exc))
            return handler
        websocket_api.async_register_command(hass, make_handler(action, operation, fields))
