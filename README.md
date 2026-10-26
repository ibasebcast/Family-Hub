# Family Hub for Home Assistant

Family Hub is an open-source Home Assistant project for family calendars, chores, routines, rewards, meal planning, shopping lists, and customizable wall-tablet and personal dashboards.

> **Status:** Early development. No installable release is available yet.

## Project principles

- **Simple setup:** Add the integration, name the household, and configure features later through the UI.
- **Privacy first:** No real household names, personal schedules, or user-specific sample data in the repository.
- **Readable source:** Small, clearly named modules with comments explaining responsibilities and non-obvious logic.
- **Native Home Assistant:** HACS distribution, Home Assistant authentication and permissions, reusable Lovelace cards, and editable dashboards.
- **Multiple screens:** Shared family kiosk, individual member dashboards, and optional room controls for authorized Home Assistant entities.
- **Optional features:** Badges, streaks, and advanced rewards must never block initial setup.

## Planned features

- Shared family calendar with Google Calendar and Home Assistant calendar support
- Individual and shared chores, recurrence, approvals, and point balances
- Rewards and optional achievements
- Routines and custody-aware schedules
- Meal planning and shopping lists
- Wall-tablet and mobile-friendly layouts
- Automatically registered Lovelace cards and prebuilt editable dashboard views
- Role-based permissions for children and adults

## Development

The integration is under active design. Installation instructions will be published after an initial tested build is available.

## Privacy

Family Hub is intended to run inside Home Assistant. No personal demo data is included in source code, documentation, or tests.
