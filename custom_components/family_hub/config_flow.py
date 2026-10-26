"""Minimal onboarding: the household name is the only required input."""

import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN


class FamilyHubConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a single household without requiring chores or badges."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Show one setup form and save the household name."""
        await self.async_set_unique_id("primary_household")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("name", default="Home"): str}),
        )
