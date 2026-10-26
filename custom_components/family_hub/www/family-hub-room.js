/** Room dashboard displaying only entities approved for the current member. */
class FamilyHubRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._hass = null;
    this.config = {};
    this.data = null;
    this.error = "";
  }

  setConfig(config) {
    this.config = config || {};
    this.render();
  }

  set hass(value) {
    const initial = !this._hass;
    this._hass = value;
    if (initial) this.refresh();
    else this.render(); // Keep device states current without extra WebSocket reads.
  }

  getCardSize() { return 4; }

  async refresh() {
    if (!this._hass) return;
    try {
      this.data = await this._hass.callWS({type:"family_hub/state"});
      this.error = "";
    } catch (error) {
      this.error = String(error.message || error);
    }
    this.render();
  }

  async control(domain, action, entityId) {
    try {
      await this._hass.callService(domain, action, {entity_id:entityId});
      this.error = "";
    } catch (error) {
      this.error = String(error.message || error);
    }
    this.render();
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.replaceChildren();

    const card = document.createElement("ha-card");
    card.header = "Room controls";
    const body = document.createElement("div");
    body.style.padding = "16px";

    const message = (text, alert = false) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      if (alert) paragraph.setAttribute("role", "alert");
      body.append(paragraph);
    };

    if (this.error) message(this.error, true);
    if (!this.data) {
      if (!this.error) message("Loading room devices…");
      card.append(body);
      this.shadowRoot.append(card);
      return;
    }

    const members = this.data.members || [];
    // An explicit member_id is never silently replaced with another member.
    // Non-admin users receive only their linked member from the backend.
    const member = this.config.member_id
      ? members.find(item => item.id === this.config.member_id)
      : members[0];
    if (!member) {
      message(this.config.member_id
        ? "This room dashboard is not available to your account."
        : "Configure a household member to view room controls.");
      card.append(body);
      this.shadowRoot.append(card);
      return;
    }

    const ids = this.data.room_entities?.[member.id] || [];
    if (!ids.length) message("No room devices configured yet.");

    for (const id of ids) {
      const entity = this._hass?.states?.[id];
      const domain = id.split(".")[0];
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;"
        + "gap:10px;padding:10px 0;border-bottom:1px solid var(--divider-color,#ddd)";
      const label = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = entity?.attributes?.friendly_name || id;
      const state = document.createElement("div");
      state.style.cssText = "color:var(--secondary-text-color);font-size:.85rem";
      state.textContent = entity ? String(entity.state) : "Entity unavailable";
      label.append(name, state);
      row.append(label);

      // Native service permissions still apply; the room allowlist is not a
      // way around Home Assistant's restrictions on controlling devices.
      let action = null;
      let labelText = null;
      if (entity && ["light","switch","fan","climate"].includes(domain)) {
        const on = entity.state !== "off";
        action = on ? "turn_off" : "turn_on";
        labelText = on ? "Turn off" : "Turn on";
      } else if (entity && domain === "cover") {
        const open = ["open","opening"].includes(entity.state);
        action = open ? "close_cover" : "open_cover";
        labelText = open ? "Close" : "Open";
      }
      if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = labelText;
        button.style.cssText = "padding:8px 12px;border:0;border-radius:8px;"
          + "background:var(--primary-color,#2979ff);color:#fff;cursor:pointer";
        button.onclick = () => this.control(domain, action, id);
        row.append(button);
      }
      body.append(row);
    }

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = "Refresh room";
    refresh.style.marginTop = "12px";
    refresh.onclick = () => this.refresh();
    body.append(refresh);

    card.append(body);
    this.shadowRoot.append(card);
  }
}

if (!customElements.get("family-hub-room-card"))
  customElements.define("family-hub-room-card", FamilyHubRoomCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === "family-hub-room-card"))
  window.customCards.push({
    type:"family-hub-room-card",
    name:"Family Hub Room",
    description:"Personal device controls, covers, climate and sensors"
  });
