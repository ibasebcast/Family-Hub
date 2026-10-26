/**
 * Browser-free tests for the dashboard installer and room entity picker.
 *
 * A small custom-element stub is enough to exercise the user-facing methods
 * without coupling this project to a particular frontend test framework.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../custom_components/family_hub/www/family-hub-manage.js"),
  "utf8"
);

function createCard() {
  const elements = new Map();
  class FakeElement {
    attachShadow() {
      this.shadowRoot = {};
    }
  }
  const context = {
    HTMLElement: FakeElement,
    window: {customCards: []},
    customElements: {
      get: name => elements.get(name),
      define: (name, element) => elements.set(name, element)
    }
  };
  vm.runInNewContext(source, context);
  const Card = elements.get("family-hub-manage-card");
  assert.ok(Card);
  const card = new Card();
  // The tests verify the API calls, not the browser's DOM rendering.
  card.render = () => {};
  return card;
}

const templates = {
  family: {
    url_path:"family-hub",
    title:"Family Hub",
    icon:"mdi:home-heart",
    config:{views:[{title:"Home", cards:[]}]}
  },
  wall: {
    url_path:"family-hub-wall",
    title:"Family Hub Display",
    icon:"mdi:monitor-dashboard",
    config:{views:[{title:"Today", cards:[]}]}
  },
  members: [{
    url_path:"family-hub-member-abc123",
    title:"Family Hub: Member",
    icon:"mdi:account-heart",
    config:{views:[{title:"My Day", cards:[]}]}
  }]
};

test("installer creates only missing dashboards, and fills their configuration", async () => {
  const card = createCard();
  const messages = [];
  card._hass = {callWS: async message => {
    messages.push(message);
    if (message.type === "family_hub/dashboard_templates") return templates;
    if (message.type === "lovelace/dashboards/list") return [
      {url_path:"family-hub"}
    ];
    return null;
  }};
  await card.installDashboards();
  const created = messages.filter(m => m.type === "lovelace/dashboards/create");
  const saved = messages.filter(m => m.type === "lovelace/config/save");
  assert.equal(created.length, 2);
  assert.equal(saved.length, 2);
  assert.equal(created[0].url_path, "family-hub-wall");
  assert.equal(created[1].url_path, "family-hub-member-abc123");
  assert.equal(created[0].require_admin, false);
  assert.equal(created[0].show_in_sidebar, false);
  assert.equal(saved[0].url_path, "family-hub-wall");
  assert.equal(saved[1].url_path, "family-hub-member-abc123");
  assert.match(card.notice, /Created 2 dashboard\(s\); skipped 1 existing/);
});

test("installer never overwrites existing dashboard configurations", async () => {
  const card = createCard();
  const messages = [];
  card._hass = {callWS: async message => {
    messages.push(message);
    if (message.type === "family_hub/dashboard_templates") return templates;
    if (message.type === "lovelace/dashboards/list") return [
      {url_path:"family-hub"}, {url_path:"family-hub-wall"}, {url_path:"family-hub-member-abc123"}
    ];
    return null;
  }};
  await card.installDashboards();
  assert.equal(messages.filter(m => m.type === "lovelace/dashboards/create").length, 0);
  assert.equal(messages.filter(m => m.type === "lovelace/config/save").length, 0);
  assert.match(card.notice, /skipped 3 existing/);
});

test("installer reports failed API calls without claiming success", async () => {
  const card = createCard();
  card._hass = {callWS: async message => {
    if (message.type === "family_hub/dashboard_templates") return templates;
    if (message.type === "lovelace/dashboards/list") return [];
    if (message.type === "lovelace/dashboards/create") throw new Error("Access denied");
    return null;
  }};
  await card.installDashboards();
  assert.match(card.error, /Access denied/);
  assert.equal(card.notice, "");
  assert.equal(card.installing, false);
});

test("room picker lists supported entities and retains selected missing devices", () => {
  const card = createCard();
  card.roomMemberId = "member-a";
  card.roomSelected = new Set(["light.bedroom", "sensor.unavailable"]);
  card._hass = {states: {
    "light.bedroom": {attributes: {friendly_name:"Bedroom <light>"}},
    "lock.front_door": {attributes: {friendly_name:"Front door"}},
  }};
  const html = card.roomEditor([{id:"member-a", name:"Member A"}]);
  assert.match(html, /Bedroom &lt;light&gt;/);
  assert.match(html, /sensor\.unavailable/);
  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /lock\.front_door/);
  assert.equal((html.match(/checked/g) || []).length, 2);
});
