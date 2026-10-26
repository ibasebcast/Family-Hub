/**
 * Family Hub Lovelace cards.
 *
 * Plain JavaScript and Web Components, with no build tooling or external CDN.
 * Every card uses the authenticated Home Assistant WebSocket API. Only Home
 * Backend permissions govern each action, including linked member self-service.
 */

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

/** Shared styling for the two custom cards. */
const style = `
  :host { display:block; color:var(--primary-text-color); }
  .wrap { background:var(--ha-card-background,var(--card-background-color,#fff));
    border-radius:var(--ha-card-border-radius,14px); padding:18px;
    box-shadow:var(--ha-card-box-shadow,0 1px 4px #0002); }
  h2 { margin:0 0 14px; font-size:1.3rem; }
  h3 { margin:18px 0 8px; font-size:1rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; }
  .tile { padding:12px; border:1px solid var(--divider-color,#ddd); border-radius:12px; }
  .muted { color:var(--secondary-text-color,#666); font-size:.85rem; }
  .item { display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:9px 0; border-bottom:1px solid var(--divider-color,#ddd); }
  button,select,input { font:inherit; padding:8px; border-radius:8px; }
  button { cursor:pointer; border:0; background:var(--primary-color,#2979ff); color:white; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .danger { color:var(--error-color,#c33); }
  .notice { padding:12px; border-radius:8px; background:var(--secondary-background-color,#eee); }
`;

/** Common data-loading and error-handling behavior. */
class FamilyHubBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this.data = null;
    this.error = "";
    this.loading = false;
    this._hass = null;
    this.config = {};
  }

  setConfig(config) { this.config = config; this.render(); }

  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    // Fetch once per card mount, not on every Home Assistant state update.
    if (!previous && hass) this.refresh();
  }

  getCardSize() { return 5; }

  async refresh() {
    if (!this._hass || this.loading) return;
    this.loading = true;
    try {
      this.data = await this._hass.callWS({type:"family_hub/state"});
      this.error = "";
    } catch (error) {
      this.error = String(error.message || error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async mutate(action, payload) {
    try {
      await this._hass.callWS({type:`family_hub/${action}`, ...payload});
      await this.refresh();
    } catch (error) {
      this.error = String(error.message || error);
      this.render();
    }
  }

  shell(body) {
    return `<style>${style}</style><section class="wrap">
      ${this.error ? `<p class="danger" role="alert">${escapeHtml(this.error)}</p>` : ""}
      ${body}</section>`;
  }
}

/** Shared family overview: member totals, assigned chores, and shopping. */
class FamilyHubOverviewCard extends FamilyHubBase {
  render() {
    if (!this.shadowRoot) return;
    if (!this.data) {
      this.shadowRoot.innerHTML = this.shell("<h2>Family Hub</h2><p>Loading household…</p>");
      return;
    }
    const data = this.data;
    const members = data.members || [];
    const balances = (data.transactions || []).reduce((result, entry) => {
      result[entry.member_id] = (result[entry.member_id] || 0) + entry.amount;
      return result;
    }, {});
    const currency = escapeHtml(data.settings?.currency_name || "Points");
    const tiles = members.map(member => `<div class="tile">
      <strong>${escapeHtml(member.name)}</strong>
      <p class="muted">${escapeHtml(member.role)}</p>
      <div>${balances[member.id] || 0} ${currency}</div>
      <div class="muted">${(data.chores || []).filter(chore =>
        chore.assignee_ids.includes(member.id)).length} assigned chores</div>
    </div>`).join("");
    const shopping = (data.shopping || []).map(item => `<div class="item">
      <span>${item.checked ? "✓ " : ""}${escapeHtml(item.title)}</span>
      <span class="muted">${escapeHtml(item.quantity)}</span></div>`).join("");
    const events = (data.events || []).slice().sort((a,b) =>
      a.starts_at.localeCompare(b.starts_at)).slice(0,8).map(event =>
      `<div class="item"><span>${escapeHtml(event.title)}</span>
      <span class="muted">${escapeHtml(event.starts_at.slice(0,16).replace("T"," "))}</span></div>`).join("");
    this.shadowRoot.innerHTML = this.shell(`<h2>Family Hub</h2>
      <div class="grid">${tiles || '<p class="muted">Add household members to get started.</p>'}</div>
      <h3>Upcoming events</h3>${events || '<p class="muted">No local events yet.</p>'}
      <h3>Shopping</h3>${shopping || '<p class="muted">Shopping list is empty.</p>'}
      <p><button id="refresh">Refresh</button></p>`);
    this.shadowRoot.getElementById("refresh").addEventListener("click", () => this.refresh());
  }
}

/** Member card: chores and rewards for a configured member. */
class FamilyHubMemberCard extends FamilyHubBase {
  render() {
    if (!this.shadowRoot) return;
    if (!this.data) {
      this.shadowRoot.innerHTML = this.shell("<h2>Family member</h2><p>Loading…</p>");
      return;
    }
    const data = this.data;
    const member = this.config.member_id
      ? (data.members || []).find(item => item.id === this.config.member_id)
      : (data.members || [])[0];
    if (!member) {
      this.shadowRoot.innerHTML = this.shell(
        '<h2>Family member</h2><p class="notice">This member is not available to your account or is not configured.</p>');
      return;
    }
    const chores = (data.chores || []).filter(chore => chore.assignee_ids.includes(member.id));
    const today = new Date();
    const dateKey = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"),
      String(d.getDate()).padStart(2,"0")].join("-");
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
    // Calculate rotation by UTC day numbers to avoid DST changing whose
    // turn it is. Display and claim requests use the local calendar day.
    const utcDay = key => Math.floor(Date.parse(key + "T00:00:00Z") / 86400000);
    const away = data.presence?.[member.id] === false;
    const rows = chores.map(chore => {
      const rotating = Boolean(chore.rotation_days && chore.rotation_start);
      const dayIndex = rotating
        ? Math.floor((utcDay(dateKey(today)) - utcDay(chore.rotation_start))
          / chore.rotation_days)
        : 0;
      const owner = rotating
        ? chore.assignee_ids[((dayIndex % chore.assignee_ids.length)
          + chore.assignee_ids.length) % chore.assignee_ids.length]
        : null;
      const inactive = rotating && owner !== member.id;
      const period = chore.recurrence === "once" ? "once" :
        chore.recurrence === "weekly" ? dateKey(monday) : dateKey(today);
      const claimed = (data.completions || []).find(c => c.chore_id === chore.id &&
        c.member_id === member.id && c.period === period && c.status !== "rejected");
      return `<div class="item">
      <div><strong>${escapeHtml(chore.title)}</strong>
      <div class="muted">${escapeHtml(chore.recurrence)} · ${chore.points} points</div></div>
      <button data-chore="${escapeHtml(chore.id)}"
        ${claimed || inactive || away ? "disabled" : ""}>${away ? "Paused while away"
          : inactive ? "Not your turn"
          : claimed ? escapeHtml(claimed.status) : "Claim"}</button>
    </div>`; }).join("");
    const total = (data.transactions || []).filter(t => t.member_id === member.id)
      .reduce((sum,t) => sum + t.amount,0);
    const rewards = (data.rewards || []).map(reward => `<div class="item">
      <span>${escapeHtml(reward.title)} · ${reward.cost} points</span>
      <button data-reward="${escapeHtml(reward.id)}" ${total < reward.cost ? "disabled" : ""}>
      Redeem</button></div>`).join("");
    this.shadowRoot.innerHTML = this.shell(`<h2>${escapeHtml(member.name)}</h2>
      <div class="tile"><strong>${total}</strong>
      ${escapeHtml(data.settings?.currency_name || "Points")}</div>
      <h3>Chores</h3>${rows || '<p class="muted">No assigned chores.</p>'}
      <h3>Rewards</h3>${rewards || '<p class="muted">No rewards available.</p>'}
      <button id="refresh">Refresh</button>`);
    this.shadowRoot.querySelectorAll("[data-chore]").forEach(button =>
      button.addEventListener("click", () => this.mutate("claim_chore", {
        chore_id:button.dataset.chore, member_id:member.id
      })));
    this.shadowRoot.querySelectorAll("[data-reward]").forEach(button =>
      button.addEventListener("click", () => this.mutate("redeem_reward", {
        reward_id:button.dataset.reward, member_id:member.id
      })));
    this.shadowRoot.getElementById("refresh").addEventListener("click", () => this.refresh());
  }
}

if (!customElements.get("family-hub-overview-card")) {
  customElements.define("family-hub-overview-card", FamilyHubOverviewCard);
}
if (!customElements.get("family-hub-member-card")) {
  customElements.define("family-hub-member-card", FamilyHubMemberCard);
}
window.customCards = window.customCards || [];
for (const card of [
  {type:"family-hub-overview-card",name:"Family Hub Overview",description:"Shared household summary"},
  {type:"family-hub-member-card",name:"Family Hub Member",description:"Individual chores and rewards"}
]) {
  if (!window.customCards.some(existing => existing.type === card.type)) {
    window.customCards.push(card);
  }
}
