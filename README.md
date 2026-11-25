# Family Hub for Home Assistant

Family Hub is an open-source HACS-ready custom integration for managing family
calendars, chores, rewards, routines, rotating schedules, shopping, meals and
per-member Home Assistant room controls and scheduled reminders.

> **Development status:** This is not yet a stable release. The first release
> remains gated on successful Home Assistant installation testing. Existing
> household data is preserved across updates.

## Built-in experiences

Family Hub creates these editable storage-mode Home Assistant dashboards when
its integration is configured. **You do not have to create or paste any YAML.**

- **Family Hub** (`/family-hub/`): An administrator dashboard with household
  overview, calendar, meals, shopping, scheduled reminders, routines,
  custody schedules, rewards,
  approvals, settings, room device assignments and household backup/restore.
- **Family Hub Display** (`/family-hub-wall/`): A read-only shared home
  overview and calendar for a wall tablet. Administrators explicitly authorize
  which Home Assistant accounts may see shared household information.
- **Individual member dashboards** (`/family-hub-member-…/`): My Day with
  chores, point balance, rewards, assigned reminders, daily routine checklist and the member's
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
tracked daily checklist steps. Home/away status can be updated through a card;
while a member is away, their chore claims and point awards are paused.

Administrators can schedule reminders for the household or individual members.
A native Home Assistant background timer checks due dates and creates
persistent notifications. Stable notification IDs avoid duplicate alerts,
and missed reminders are recovered after Home Assistant restarts.
Linked members can complete reminders assigned to them.

The calendar offers day, week, month and agenda views. Home Assistant calendar
entities, including supported Google Calendar entities, can appear beside
locally created Family Hub events. Calendar access uses Home
Assistant's existing configured calendar integrations and does not require
separate Google credentials in Family Hub.

## Editing existing household items

The redesigned **Manage** dashboard provides item lists with **Edit** and
**Delete** controls. Choose **Save changes** to update a record in place or
**Cancel** to leave it unchanged. Member profiles, chores, rewards, shopping,
meals, local calendar events, announcements, reminders, routines and household
rotations can be modified without deleting and recreating them.

The backend preserves original record IDs, existing point transactions and
chore-completion history. Deletion is blocked if it would orphan financial
or completion records. Routine steps with completed history cannot be removed.
The shopping card also supports quick inline editing.

Updated member profiles and task summaries are optimized for small phones,
while Family Hub uses native Home Assistant colors for light and dark themes.

## Connect a Google shared calendar

1. In **Home Assistant → Settings → Devices & services**, configure
   [Google Calendar](https://www.home-assistant.io/integrations/google/)
   for the account that has access to the shared calendar.
2. Make sure the calendar is visible in Google Calendar and has a
   `calendar.*` entity in Home Assistant. A shared calendar may need to be
   added to **My Calendars** and the Google integration reloaded. Home Assistant
   manages the Google login, permissions and synchronization.
3. Open **Family Hub → Manage → Settings → Connected calendars**. Tick the
   shared calendar and save the settings. You may select several calendars.
4. Open the Family Hub Planning view to see Google/shared events alongside
   locally created Family Hub events, with their source calendar names.

A public/shared Google iCal feed may alternatively be connected through
Home Assistant's [Remote Calendar](https://www.home-assistant.io/integrations/remote_calendar)
integration, which exposes another selectable calendar entity.

**Important:** Family Hub reads connected Google and remote calendar events,
but does not modify them or store Google account credentials. You can edit
Family Hub-created calendar events under **Manage → Organizer**. External
calendar edits happen in Google Calendar or the connected provider.
Calendar sharing must grant the Home Assistant account permission to see the
event details; free/busy-only sharing cannot reveal event titles.

## Safety and compatibility

- Household data is stored in Home Assistant's private storage directory.
  Family Hub never includes household members or personal demo data in its
  distributed code, tests or documentation.
- A family display can be opened only by administrators or accounts explicitly
  approved for wall-display access. Member dashboards are scoped to the linked
  member through the authenticated WebSocket API.
- Dashboard creation uses Home Assistant's live Lovelace collection with
  listener notifications, not direct edits to `.storage`.
- Family Hub serves every bundled JavaScript card and reconciles the Lovelace
  resource list both during integration setup and when its config entry loads.
  Each module URL includes a source-content version to avoid stale browser files.
  On YAML-managed resource installations, Family Hub registers its modules with
  Home Assistant's frontend instead of modifying the read-only YAML resource list.
- HACS updates preserve saved Family Hub household data, settings and existing
  dashboard edits.
- Browser device actions remain subject to Home Assistant permissions.

## If a card says "Custom element doesn't exist"

This means the dashboard was created, but the browser did not load its
JavaScript resource. Update Family Hub from HACS to the latest development
revision, restart Home Assistant so its Python integration is reloaded, then
hard-refresh the browser (Ctrl+Shift+R). No dashboard deletion is needed.

For storage-managed resources, open **Settings → Dashboards → Resources**
and confirm that the `/family_hub_static/` JavaScript modules are listed.
For example, `/family_hub_static/family-hub-manage.js?v=…` and
`/family_hub_static/family-hub-backup.js?v=…` should be registered as
**JavaScript modules**. On YAML-managed resources, integration-owned modules
are loaded through the frontend; there is no automatic YAML file edit.

If the problem persists, check Home Assistant's logs for
`Family Hub Lovelace resources` and confirm that
`/family_hub_static/family-hub-manage.js` returns JavaScript rather than a
404. A missing module is a frontend registration problem, not a reason to
recreate or erase the household.

## Quality gates

GitHub Actions audits every tracked file, runs Python tests, validates all
JavaScript syntax and exercises critical UI flows with Node tests. The
automatic-dashboard tests cover fresh setup, idempotent reloads, new members,
previously customized dashboards, rollback on failures and privacy boundaries.

Automated tests do **not** replace an end-to-end smoke test in a running Home
Assistant instance. No stable release is planned until that verification is
complete.
