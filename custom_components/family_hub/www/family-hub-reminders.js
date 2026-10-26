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
        article{padding:16px;border-radius:14px;background:var(--ha-card-background,
          var(--card-background-color,#fff));color:var(--primary-text-color)}
        .item{display:flex;align-items:center;gap:10px;padding:10px 0;
          border-bottom:1px solid var(--divider-color,#ddd)}
        .item span{flex:1}.item small{display:block;color:var(--secondary-text-color)}
        button,input,select{font:inherit;padding:8px;border-radius:8px}
        button{border:0;background:var(--primary-color,#2979ff);color:#fff;cursor:pointer}
        form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:10px;align-items:end}
        label{display:flex;flex-direction:column;gap:5px}input,select{min-width:0}
        .error{color:var(--error-color,#c33)}
      </style><article><h2>Reminders</h2>
        ${this.error ? `<p role="alert" class="error">${escape(this.error)}</p>` : ""}
        ${items || "<p>No reminders scheduled.</p>"}${form}
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
