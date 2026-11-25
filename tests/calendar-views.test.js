/** Test the actual calendar card's local-day filtering and view controls. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../custom_components/family_hub/www/family-hub-calendar.js"),
  "utf8"
);

function calendar() {
  const registered = new Map();
  class FakeElement {
    attachShadow() {
      this.shadowRoot = {
        innerHTML: "",
        querySelector() { return {onclick:null,onchange:null,onsubmit:null}; }
      };
    }
  }
  const sandbox = {
    HTMLElement: FakeElement,
    customElements: {
      get: key => registered.get(key),
      define: (key, ctor) => registered.set(key, ctor)
    },
    window: {customCards: []},
    Date,
  };
  vm.runInNewContext(source, sandbox);
  const Card = registered.get("family-hub-calendar-card");
  assert.ok(Card);
  const card = new Card();
  card.config = {read_only:true};
  return card;
}

test("calendar includes day, week, month and agenda controls", () => {
  const card = calendar();
  card.view = "day";
  card.cursor = new Date(2026, 9, 26);
  card.render();
  const html = card.shadowRoot.innerHTML;
  for (const value of ["day", "week", "month", "agenda"]) {
    assert.ok(html.includes('value="' + value + '"'), value);
  }
  assert.doesNotMatch(html, /<form id="add">/);
});

test("day view shows events on the local calendar day, including UTC timestamps", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const card = calendar();
    card.view = "day";
    card.cursor = new Date(2026, 9, 26);
    card.local = [
      {title:"Evening event", starts_at:"2026-10-27T01:00:00Z"},
      {title:"Next day event", starts_at:"2026-10-27T10:00:00Z"},
    ];
    card.render();
    assert.match(card.shadowRoot.innerHTML, /Evening event/);
    assert.doesNotMatch(card.shadowRoot.innerHTML, /Next day event/);
    card.shift(1);
    assert.match(card.shadowRoot.innerHTML, /Next day event/);
    assert.doesNotMatch(card.shadowRoot.innerHTML, /Evening event/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});


test("Google shared calendar events retain provider name and local dates",()=>{
  const oldTZ=process.env.TZ;
  try {
    process.env.TZ="America/New_York";
    const card=calendar();
    card.view="day";
    card.cursor=new Date(2026,10,24);
    card._hass={states:{
      "calendar.shared_family":{attributes:{friendly_name:"Family Shared Google"}},
    }};
    card.external=[
      {title:"Shared calendar dinner",
       calendar_id:"calendar.shared_family",
       starts_at:"2026-11-24T23:30:00Z"},
      {title:"All-day event",
       calendar_id:"calendar.shared_family",
       starts_at:"2026-11-24"},
      {title:"Tomorrow",
       calendar_id:"calendar.shared_family",
       starts_at:"2026-11-25T14:00:00Z"},
    ];
    card.render();
    const html=card.shadowRoot.innerHTML;
    assert.match(html,/Shared calendar dinner/);
    assert.match(html,/Family Shared Google/);
    assert.match(html,/All-day event/);
    assert.match(html,/All day/);
    assert.doesNotMatch(html,/Tomorrow/);
    assert.doesNotMatch(html,/family_hub\/edit_record/);
  } finally {
    if(oldTZ===undefined)delete process.env.TZ;
    else process.env.TZ=oldTZ;
  }
});
