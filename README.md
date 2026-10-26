# Family Hub for Home Assistant

Family Hub is an open-source HACS-ready custom integration for managing family
calendars, chores, rewards, routines, rotating schedules, shopping, meals and
per-member Home Assistant room controls.

> **Development status:** This is not yet a stable release. The first release
> remains gated on successful Home Assistant installation testing. Existing
> household data is preserved across updates.

## Built-in experiences

Family Hub creates these editable storage-mode Home Assistant dashboards when
its integration is configured. **You do not have to create or paste any YAML.**

- **Family Hub** (`/family-hub/`): An administrator dashboard with household
  overview, calendar, meals, shopping, routines, custody schedules, rewards,
  approvals, settings, room device assignments and household backup/restore.
- **Family Hub Display** (`/family-hub-wall/`): A read-only shared home
  overview and calendar for a wall tablet. Administrators explicitly authorize
  which Home Assistant accounts may see shared household information.
- **Individual member dashboards** (`/family-hub-member-…/`): My Day with
  chores, point balance, rewards, daily routine checklist and the member's
  rotation schedule, plus My Room for devices selected in Home Assistant.

New member dashboards are created when members are added or restored from
backup. Existing dashboards, including user-customized layouts, are never
overwritten by Family Hub during later integration loads.

## Setup and day-to-day use

After installing the custom repository through HACS, add **Family Hub** under
**Settings → Devices & Services → Add Integration**. Choose a household name.
The integration registers its cards and creates the missing dashboards
automatically. Open Family Hub in the sidebar to configure members and their
features.

On the dashboard's **Manage** tab, configure household members, optional Home
Assistant user links, chore recurrence, optional rotating assignees, reward
costs, calendar entity sources and customizable member room devices. Use the
**Dashboards** management tab only to repair any *missing* dashboards. A repair
never replaces existing layouts.

For a read-only tablet, create or choose a separate Home Assistant user for the
display, then add that user's ID in Family Hub's Settings tab. The wall dashboard
shows only intentionally shared records and calendar data. The wall account
cannot use the administrative mutation API. Its dashboard is hidden from the
sidebar by default but can be accessed at `/family-hub-wall/`.

Chore assignments support once, daily and weekly resets, optional adult approval,
Family Hub point balances and rewards. Rotating assignments switch between
selected members at the configured interval. Routines have independently
tracked daily checklist steps. Home/away status can be updated through a card.

Home Assistant calendar entities, including supported Google Calendar entities,
can appear beside locally created Family Hub events. Calendar access uses Home
Assistant's existing configured calendar integrations and does not require
separate Google credentials in Family Hub.

## Safety and compatibility

- Household data is stored in Home Assistant's private storage directory.
  Family Hub never includes household members or personal demo data in its
  distributed code, tests or documentation.
- A family display can be opened only by administrators or accounts explicitly
  approved for wall-display access. Member dashboards are scoped to the linked
  member through the authenticated WebSocket API.
- Dashboard creation uses Home Assistant's live Lovelace collection with
  listener notifications, not direct edits to `.storage`.
- Lovelace JavaScript modules register automatically with storage-managed
  resources. Installations that manage Lovelace resources through YAML must
  add those module URLs in the YAML resources configuration.
- HACS updates preserve saved Family Hub household data, settings and existing
  dashboard edits.
- Browser device actions remain subject to Home Assistant permissions.

## Quality gates

GitHub Actions audits every tracked file, runs Python tests, validates all
JavaScript syntax and exercises critical UI flows with Node tests. The
automatic-dashboard tests cover fresh setup, idempotent reloads, new members,
previously customized dashboards, rollback on failures and privacy boundaries.

Automated tests do **not** replace an end-to-end smoke test in a running Home
Assistant instance. No stable release is planned until that verification is
complete.
