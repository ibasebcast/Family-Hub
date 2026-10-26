# Family Hub for Home Assistant

Family Hub is a Home Assistant integration for household schedules, chores, rewards,
meal planning, shopping, and individual member room dashboards.

> **Status:** Active development. These changes are being validated before an
> initial installable release. Existing household storage is preserved on updates.

## What works in the current development version

- Configure household members, chores, rewards, and calendar sources in Home Assistant.
- Assign real Home Assistant lights, fans, switches, covers, climate entities, and
  sensors to each member through the **Rooms** tab of the management card.
- Use a member room card to view device states and control supported devices.
  Home Assistant service permissions still apply.
- Create **editable storage-mode dashboards** through the **Dashboards** tab.
  The templates provide a shared family dashboard plus a private-link dashboard
  for each member, with My Day and My Room views.
- Manage schedules, shopping, meals, announcements, approvals, and backups with
  the registered Family Hub cards.

## First-time dashboard setup

After the integration is configured and its Lovelace resources are available,
place a **Family Hub Management** card on an existing dashboard. The card type is:

```yaml
type: custom:family-hub-manage-card
```

Open the **Dashboards** tab and select **Create missing dashboards**. Family
Hub uses Home Assistant's dashboard create and configuration APIs, so the
resulting dashboards are fully editable in the Home Assistant dashboard editor.
It never replaces an existing dashboard with the same URL. Run the action
again after adding members to create any new individual dashboards.

The shared `/family-hub/` dashboard is administrator-only and shown in the
sidebar. Member dashboards use stable `/family-hub-member-…/` URLs, are
hidden from the sidebar by default, and display only records permitted by
the authenticated Family Hub API. An admin can copy a member's dashboard link
from the management card. A member must be linked to a Home Assistant user
to access personal data. Device controls remain subject to Home Assistant's
normal device permissions.

**Resource mode:** Static dashboard modules are registered automatically
when Home Assistant manages Lovelace resources in storage mode. If Lovelace
resources are managed using YAML, add the provided JavaScript module paths to
the YAML resources list instead. Dashboard creation itself uses Home Assistant
storage-mode dashboard APIs.

## Project principles

- **Data stays local.** Household data is held in Home Assistant's private
  storage, not shipped in sample files or committed to this repository.
- **UI-first controls.** Setup and everyday configuration are performed through
  Home Assistant cards and settings wherever possible.
- **Safe updates.** Dashboard creation is create-only, and existing customized
  dashboards are never overwritten by the installer.
- **Scoped access.** Administrators manage household settings; linked members
  can view and act on their own supported records.
- **Readable implementation.** Backend features are independent modules with
  focused tests, and frontend cards use standard browser APIs without CDNs.

## Development checks

GitHub Actions verifies repository contents and metadata, compiles Python
modules, runs `pytest`, parses JavaScript, and executes Node-based frontend
behavior tests. A green CI run verifies those automated checks; a real
Home Assistant installation should also be used for end-to-end testing.
