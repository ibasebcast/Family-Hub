/**
 * Shared and personal reminders with automatic Home Assistant notifications.
 *
 * Only administrators create reminders. Linked household members can dismiss
 * a reminder assigned to them; the backend always checks permissions.
 */
(() => {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const localDateTime = value => new Date(value).toLocaleString();

  class FamilyHubRemindersCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this.config = {};
      this._hass = null;
      this.data = null;
      this.error = "";
    }
    setConfig(value) { this.config = value || {}; this.render(); }
    set hass(value) {
      const initial = !this._hass;
      this._hass = value;
      if (initial) this.refresh();
    }
    getCardSize() { return 5; }

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

    async send(type, fields) {
      try {
        await this._hass.callWS({type:"family_hub/" + type, ...fields});
        await this.refresh();
      } catch (error) {
        this.error = String(error.message || error);
        this.render();
      }
    }

    render() {
      if (!this.shadowRoot) return;
      const data = this.data || {};
      const members = data.members || [];
      const admin = Boolean(this._hass?.user?.is_admin);
      const memberId = this.config.member_id || (admin ? null : members[0]?.id);
      const reminders = (data.reminders || [])
        .filter(item => !memberId || !item.member_ids?.length ||
          item.member_ids.includes(memberId))
        .slice().sort((a,b) => a.due_at.localeCompare(b.due_at));
      const now = Date.now();
      const items = reminders.map(item => {
        const overdue = Date.parse(item.due_at) <= now && !item.completed;
        const status = item.completed ? "Complete" :
          overdue ? "Due now" : "Upcoming";
        return `<div class="item">
          <span><strong>${escape(item.title)}</strong>
            <small>${escape(localDateTime(item.due_at))} · ${escape(status)}</small>
            ${item.message ? `<small>${escape(item.message)}</small>` : ""}
          </span>
          ${item.completed ? "" : `<button data-complete="${escape(item.id)}">
            Mark done</button>`}
        </div>`;
      }).join("");
      const form = admin ? `<h3>Schedule reminder</h3>
        <form id="new-reminder">
          <label>Reminder title<input name="title" required></label>
          <label>When<input type="datetime-local" name="due_at" required></label>
          <label>Details (optional)<input name="message"></label>
          <label>For members (leave empty for household)
            <select name="member_ids" multiple size="3">
              ${members.map(member => `<option value="${escape(member.id)}">
                ${escape(member.name)}</option>`).join("")}
            </select>
          </label><button>Add reminder</button>
        </form>` : "";
      this.shadowRoot.innerHTML = `<style>
        :host{display:block;color:var(--primary-text-color)}
        *,*::before,*::after{box-sizing:border-box}
        article{padding:clamp(15px,3vw,22px);border-radius:var(--ha-card-border-radius,18px);
          background:var(--ha-card-background,var(--card-background-color,#fff))}
        h2{margin:0 0 16px;font-size:1.22rem;letter-spacing:-.025em}
        h3{margin:18px 0 10px;font-size:1rem}
        .item{display:flex;align-items:center;gap:10px;padding:12px 0;
          border-bottom:1px solid var(--divider-color,#8884)}
        .item span{flex:1;min-width:0;overflow-wrap:anywhere}
        .item small{display:block;color:var(--secondary-text-color);margin-top:4px}
        button{font:inherit;min-height:38px;border-radius:10px;border:1px solid transparent;
          padding:8px 13px;background:var(--primary-color,#03a9f4);color:#fff;cursor:pointer}
        #refresh{background:var(--secondary-background-color,#8882);
          color:var(--primary-text-color);border-color:var(--divider-color,#8884)}
        form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;align-items:end;padding:14px;border-radius:14px;
          background:var(--secondary-background-color,#8881)}
        label{display:flex;flex-direction:column;gap:6px;font-size:.87rem;min-width:0}
        input,select{font:inherit;box-sizing:border-box;width:100%;min-width:0;max-width:100%;
          padding:10px;border:1px solid var(--divider-color,#8886);border-radius:10px;
          color:var(--primary-text-color);
          background:var(--input-fill,var(--card-background-color,#fff))}
        select[multiple]{min-height:88px}
        .error{color:var(--error-color,#f55)}
        .edit-hint{font-size:.82rem;color:var(--secondary-text-color);margin:14px 0}
        .edit-hint a{color:var(--primary-color,#03a9f4)}
        @media(max-width:540px){form{grid-template-columns:minmax(0,1fr)}
          .item{flex-wrap:wrap}.item button{margin-left:auto}}
      </style><article><h2>Reminders</h2>
        ${this.error ? `<p role="alert" class="error">${escape(this.error)}</p>` : ""}
        ${items || "<p>No reminders scheduled.</p>"}${form}
        ${admin ? '<p class="edit-hint">Change or delete reminders under <a href="/family-hub/manage">Manage → Organizer</a>.</p>' : ""}
        <p><button id="refresh">Refresh</button></p>
      </article>`;

      this.shadowRoot.querySelector("#refresh").onclick = () => this.refresh();
      this.shadowRoot.querySelectorAll("[data-complete]").forEach(button => {
        button.onclick = () => this.send("complete_reminder", {
          reminder_id:button.dataset.complete,
          ...(memberId ? {member_id:memberId} : {}),
          completed:true
        });
      });
      const editor = this.shadowRoot.querySelector("#new-reminder");
      if (editor) editor.onsubmit = event => {
        event.preventDefault();
        const fields = event.target.elements;
        const due = new Date(fields.namedItem("due_at").value);
        if (Number.isNaN(due.getTime())) {
          this.error = "Choose a valid date and time";
          this.render();
          return;
        }
        this.send("add_reminder", {
          title:fields.namedItem("title").value,
          due_at:due.toISOString(),
          message:fields.namedItem("message").value,
          member_ids:[...fields.namedItem("member_ids").selectedOptions]
            .map(option => option.value)
        });
      };
    }
  }

  if (!customElements.get("family-hub-reminders-card"))
    customElements.define("family-hub-reminders-card", FamilyHubRemindersCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === "family-hub-reminders-card"))
    window.customCards.push({
      type:"family-hub-reminders-card",
      name:"Family Hub Reminders",
      description:"Scheduled reminders and one-time Home Assistant notifications"
    });
})();
