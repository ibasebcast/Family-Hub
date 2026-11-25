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
  :host{display:block;color:var(--primary-text-color)}
  *,*::before,*::after{box-sizing:border-box}
  .wrap{background:var(--ha-card-background,var(--card-background-color,#fff));
    border-radius:var(--ha-card-border-radius,18px);padding:clamp(16px,3vw,24px);
    box-shadow:var(--ha-card-box-shadow,0 1px 4px #0002)}
  h2{margin:0;font-size:1.45rem;letter-spacing:-.03em}
  h3{font-size:1.03rem;letter-spacing:-.015em;margin:18px 0 10px}
  p{margin:8px 0}strong{font-weight:650}
  .muted,.eyebrow{color:var(--secondary-text-color,#888);font-size:.86rem}
  .eyebrow{text-transform:uppercase;font-size:.7rem;letter-spacing:.09em;font-weight:700}
  .hero{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
  .hero small{display:block;color:var(--secondary-text-color);font-size:.8rem;margin-top:5px}
  .date{background:var(--secondary-background-color,#8882);border-radius:18px;
    padding:7px 12px;color:var(--secondary-text-color);font-size:.83rem}
  .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:20px}
  .metric{background:var(--secondary-background-color,#8882);
    border:1px solid var(--divider-color,#8884);border-radius:14px;padding:12px}
  .metric b{display:block;font-size:1.45rem;line-height:1.3}
  .metric small{font-size:.75rem;color:var(--secondary-text-color)}
  .section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .count{font-size:.76rem;color:var(--secondary-text-color);border-radius:20px;
    background:var(--secondary-background-color,#8882);padding:3px 10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px}
  .tile{border:1px solid var(--divider-color,#8884);border-radius:16px;padding:14px;
    min-width:0;background:var(--secondary-background-color,#8881)}
  .person-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .avatar{width:42px;height:42px;flex-shrink:0;border-radius:14px;
    display:grid;place-items:center;font-weight:750;font-size:1.1rem;
    color:var(--member-color,#64748b);
    background:color-mix(in srgb,var(--member-color,#64748b) 18%,transparent)}
  .person-name{flex:1;min-width:0;overflow-wrap:anywhere}
  .person-name strong{display:block;font-size:1rem}
  .person-name small{color:var(--secondary-text-color);font-size:.76rem}
  .points{font-weight:750;font-size:1.1rem}
  .points small{font-size:.72rem;font-weight:400;color:var(--secondary-text-color)}
  .progress{height:7px;background:var(--divider-color,#8884);border-radius:10px;
    overflow:hidden;margin:10px 0 5px}
  .progress>span{display:block;height:100%;border-radius:10px;
    background:var(--member-color,var(--primary-color,#03a9f4))}
  .row{display:flex;justify-content:space-between;gap:10px;align-items:center}
  .item{display:flex;align-items:center;justify-content:space-between;gap:10px;
    padding:11px 0;border-bottom:1px solid var(--divider-color,#8884)}
  .item:last-child{border-bottom:0}
  .item strong{display:block}.item small{color:var(--secondary-text-color)}
  .summary{border:1px solid var(--divider-color,#8884);border-radius:14px;padding:2px 14px}
  .empty{font-size:.87rem;color:var(--secondary-text-color);padding:12px 0}
  button,select,input{font:inherit;padding:10px;border-radius:10px}
  button{cursor:pointer;border:1px solid transparent;background:var(--primary-color,#03a9f4);color:white}
  button:disabled{opacity:.55;cursor:not-allowed}
  .outline{border-color:var(--divider-color,#8884);background:var(--secondary-background-color,#8882);
    color:var(--primary-text-color)}
  .toolbar{display:flex;justify-content:flex-end;margin-top:14px}
  .danger{color:var(--error-color,#f55)}
  .notice{padding:12px;border-radius:10px;background:var(--secondary-background-color,#8882)}
  @media(max-width:430px){.metrics{gap:6px}.metric{padding:9px}
    .metric b{font-size:1.18rem}.date{padding:6px 8px;font-size:.76rem}}
`

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
    const chores = data.chores || [];
    const now = new Date();
    const dateKey = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
      String(d.getDate()).padStart(2,"0")].join("-");
    const day = dateKey(now);
    const monday = new Date(now);
    monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
    const week = dateKey(monday);
    const currency = escapeHtml(data.settings?.currency_name || "Points");
    const balances = (data.transactions || []).reduce((result, entry) => {
      result[entry.member_id] = (result[entry.member_id] || 0) + entry.amount;
      return result;
    }, {});
    const pending = (data.completions || []).filter(item => item.status === "pending");
    const openShopping = (data.shopping || []).filter(item => !item.checked);
    const tiles = members.map(member => {
      const assigned = chores.filter(chore =>
        (chore.assignee_ids || []).includes(member.id));
      const completed = assigned.filter(chore => (data.completions || []).some(c => {
        const period = chore.recurrence === "once" ? "once" :
          chore.recurrence === "weekly" ? week : day;
        return c.chore_id === chore.id && c.member_id === member.id &&
          c.period === period && c.status !== "rejected";
      })).length;
      const percentage = assigned.length ? Math.round(100*completed/assigned.length) : 0;
      const color = /^#[0-9a-fA-F]{6}$/.test(member.color || "")
        ? member.color : "#64748b";
      return `<section class="tile" style="--member-color:${color}">
        <div class="person-top">
          <div class="avatar">${escapeHtml((member.name || "?").slice(0,1).toUpperCase())}</div>
          <div class="person-name"><strong>${escapeHtml(member.name)}</strong>
            <small>${escapeHtml(member.role)} · ${data.presence?.[member.id] === false ? "Away" : "Home"}</small></div>
        </div>
        <div class="row"><span class="points">${balances[member.id] || 0}
          <small>${currency}</small></span><span class="muted">${percentage}%</span></div>
        <div class="progress" role="progressbar" aria-valuenow="${percentage}"
          aria-valuemin="0" aria-valuemax="100">
          <span style="width:${percentage}%"></span></div>
        <div class="row muted">${completed} of ${assigned.length} chores completed</div>
      </section>`;
    }).join("");
    const events = (data.events || []).filter(event =>
      Date.parse(event.starts_at) >= now.getTime())
      .slice().sort((a,b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0,4).map(event => `<div class="item"><div>
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(new Date(event.starts_at).toLocaleString())}</small>
      </div></div>`).join("");
    const shopping = openShopping.slice(0,5).map(item => `<div class="item">
      <span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.quantity || "1")}</small>
    </div>`).join("");
    const dateLabel = now.toLocaleDateString(undefined, {month:"short",day:"numeric",weekday:"short"});
    this.shadowRoot.innerHTML = this.shell(`
      <div class="hero"><div><span class="eyebrow">Your household at a glance</span>
        <h2>Family Hub</h2><small>People, tasks and plans in one place</small></div>
        <span class="date">${escapeHtml(dateLabel)}</span></div>
      <div class="metrics">
        <div class="metric"><b>${members.length}</b><small>Members</small></div>
        <div class="metric"><b>${pending.length}</b><small>Needs approval</small></div>
        <div class="metric"><b>${openShopping.length}</b><small>To buy</small></div>
      </div>
      <div class="section-head"><h3>Household progress</h3>
        <span class="count">${chores.length} chores</span></div>
      <div class="grid">${tiles || '<p class="empty">Add members from Manage to get started.</p>'}</div>
      <div class="section-head"><h3>Coming up</h3>
        <span class="count">${(data.events || []).length} events</span></div>
      <div class="summary">${events || '<p class="empty">No upcoming local events.</p>'}</div>
      <div class="section-head"><h3>Shopping list</h3>
        <span class="count">${openShopping.length} remaining</span></div>
      <div class="summary">${shopping || '<p class="empty">Nothing on your list right now.</p>'}</div>
      <div class="toolbar"><button class="outline" id="refresh">Refresh</button></div>`);
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
    let doneCount = 0;
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
      if (claimed) doneCount++;
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
    const percent = chores.length ? Math.round(100*doneCount/chores.length) : 0;
    const dateLabel = today.toLocaleDateString(undefined,{
      weekday:"long",month:"short",day:"numeric"
    });
    this.shadowRoot.innerHTML = this.shell(`
      <div class="hero"><div><span class="eyebrow">${escapeHtml(dateLabel)}</span>
        <h2>${escapeHtml(member.name)}'s day</h2>
        <small>${away ? "Away · chores paused" : "Ready for today's tasks"}</small>
      </div><span class="date">${away ? "Away" : "Home"}</span></div>
      <div class="metrics">
        <div class="metric"><b>${total}</b><small>${escapeHtml(data.settings?.currency_name || "Points")}</small></div>
        <div class="metric"><b>${doneCount}/${chores.length}</b><small>Chores claimed</small></div>
        <div class="metric"><b>${(data.rewards || []).length}</b><small>Available rewards</small></div>
      </div>
      <div class="section-head"><h3>Today's chores</h3><span class="count">${percent}% complete</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${percent}"
        aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div>
      <div class="summary">${rows || '<p class="empty">No chores assigned.</p>'}</div>
      <div class="section-head"><h3>Rewards</h3><span class="count">Spend points</span></div>
      <div class="summary">${rewards || '<p class="empty">No rewards available.</p>'}</div>
      <div class="toolbar"><button class="outline" id="refresh">Refresh</button></div>`);
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
