# Family Hub dashboard cards

Family Hub registers its JavaScript resources automatically for Home Assistant
storage-mode dashboards. The cards can be added in the dashboard editor.

## Shared family display

Use these cards together on a wall-mounted tablet:

```yaml
type: custom:family-hub-calendar-card
default_view: month
```

```yaml
type: custom:family-hub-overview-card
```

```yaml
type: custom:family-hub-shopping-card
```

```yaml
type: custom:family-hub-meals-card
```

```yaml
type: custom:family-hub-announcements-card
```

Calendar views include month, week and agenda. Local family events can be
added directly on the calendar card. Home Assistant calendar entities can be
selected in Family Hub Management and are displayed alongside local events.

## Household administration

```yaml
type: custom:family-hub-manage-card
```

Management has tabs for household members, chores, rewards, currency name and
external calendar selection. Editing existing records is supported through
the authenticated API, with more dashboard editing controls planned.

## Chore approvals and backup

```yaml
type: custom:family-hub-approvals-card
```

```yaml
type: custom:family-hub-backup-card
```

The approvals card lets an administrator review pending chore completions.
The backup card exports household JSON and restores a selected backup after
explicit confirmation. Restore replaces the active household dataset.

## Individual member

```yaml
type: custom:family-hub-member-card
member_id: REPLACE_WITH_MEMBER_ID
```

When member_id is omitted, the first visible member is displayed.

## YAML-mode dashboard resources

Add each of these paths as a JavaScript module in Home Assistant's dashboard
resource configuration:

```text
/family_hub_static/family-hub.js
/family_hub_static/family-hub-shopping.js
/family_hub_static/family-hub-calendar.js
/family_hub_static/family-hub-manage.js
/family_hub_static/family-hub-organizer.js
/family_hub_static/family-hub-backup.js
/family_hub_static/family-hub-approvals.js
```

## Permissions

Household modifications currently require an administrator. Personal member
views are restricted to the linked Home Assistant account. Child self-service
and room-specific access delegation remain in development.
