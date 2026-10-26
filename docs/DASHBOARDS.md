# Family Hub dashboard cards

The integration serves its cards from `/family_hub_static/family-hub.js`.
Storage-mode Lovelace resources are registered automatically where supported.
For YAML-mode dashboards, add this JavaScript module resource manually.

## Family overview

```yaml
type: custom:family-hub-overview-card
```

## Individual member

```yaml
type: custom:family-hub-member-card
member_id: REPLACE_WITH_MEMBER_ID
```

Until the dashboard editor and member selector are built, the member ID is
configured manually. If omitted, the card displays the first visible member.

## Current limitations

These are early functional cards, not the finished wall display. Mutations are
restricted to Home Assistant administrators. The member card does not yet have
a routine UI, bedroom device controls, or fine-grained access delegation.
