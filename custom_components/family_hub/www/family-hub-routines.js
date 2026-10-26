/**
 * Routines and rotating household schedules for shared and personal dashboards.
 *
 * Administrators can create routines/rotations. Linked members can tick their
 * own routine steps and report home/away presence. Each day is calculated in
 * the local browser timezone, matching the display's calendar date.
 */
(() => {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  const todayKey = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth()+1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")].join("-");
  };

  /** Shared authenticated WebSocket behavior for both cards. */
  class FamilyHubScheduleBase extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this._hass = null;
      this.data = null;
      this.error = "";
      this.loading = false;
      this.config = {};
    }

    setConfig(config) { this.config = config || {}; this.render(); }
    set hass(value) {
      const first = !this._hass;
      this._hass = value;
      if (first) this.refresh();
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

    async send(type, fields) {
      try {
        await this._hass.callWS({type:"family_hub/" + type, ...fields});
        await this.refresh();
      } catch (error) {
        this.error = String(error.message || error);
        this.render();
      }
    }

    /** Explicitly scoped personal cards never fall back to another member. */
    member() {
      const members = this.data?.members || [];
      return this.config.member_id
        ? members.find(member => member.id === this.config.member_id)
        : members[0];
    }

    layout(title, inner) {
      this.shadowRoot.innerHTML = `<style>
        article{border-radius:14px;padding:16px;background:var(--ha-card-background,
          var(--card-background-color,#fff));color:var(--primary-text-color)}
        .row{display:flex;align-items:center;gap:10px;padding:9px 0;
          border-bottom:1px solid var(--divider-color,#ddd)}
        .row span{flex:1}.row small{display:block;color:var(--secondary-text-color)}
        button,input,select,textarea{font:inherit;padding:8px;border-radius:7px}
        button{border:0;background:var(--primary-color,#2979ff);color:white;cursor:pointer}
        button:disabled{opacity:.55;cursor:not-allowed}
        form{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:end}
        label{display:flex;flex-direction:column;gap:4px;min-width:130px;flex:1}
        input,textarea,select{min-width:0;max-width:100%}
        textarea{min-height:54px}
        .error{color:var(--error-color,#c33)}
        .muted{color:var(--secondary-text-color)}
      </style><article><h2>${escape(title)}</h2>
        ${this.error ? `<p role="alert" class="error">${escape(this.error)}</p>` : ""}
        ${inner}
        <p><button id="refresh">Refresh</button></p></article>`;
      this.shadowRoot.querySelector("#refresh").onclick = () => this.refresh();
    }
  }

  class FamilyHubRoutinesCard extends FamilyHubScheduleBase {
    constructor() {
      super();
      this.activeMemberId = null;
    }

    member() {
      // Shared administrator views can switch members; personal views stay
      // hard-scoped to their configured member ID.
      if (this.config.member_id) return super.member();
      const members = this.data?.members || [];
      return members.find(item => item.id === this.activeMemberId) || members[0];
    }

    render() {
      if (!this.shadowRoot) return;
      const data = this.data || {};
      const member = this.member();
      const members = data.members || [];
      const day = todayKey();
      const routines = (data.routines || []).filter(
        routine => !member || routine.member_ids.includes(member.id)
      );
      const completed = new Set((data.routine_completions || [])
        .filter(item => item.day === day && (!member || item.member_id === member.id))
        .map(item => item.routine_id + ":" + item.step_id + ":" + item.member_id));
      const selectedMember = member?.id;
      const entries = routines.map(routine => {
        const steps = (routine.steps || []).map(step => {
          const done = completed.has(routine.id + ":" + step.id + ":" + selectedMember);
          return `<div class="row"><span>${escape(step.title)}</span>
            <button data-routine="${escape(routine.id)}" data-step="${escape(step.id)}"
              ${done || !selectedMember ? "disabled" : ""}>
              ${done ? "Done" : "Complete"}</button></div>`;
        }).join("");
        return `<section><h3>${escape(routine.title)}</h3>${steps}</section>`;
      }).join("");
      const admin = Boolean(this._hass?.user?.is_admin);
      const memberPicker = admin && !this.config.member_id && members.length
        ? `<label>Viewing member<select id="view-member">
          ${members.map(person => `<option value="${escape(person.id)}"
            ${person.id === selectedMember ? "selected" : ""}>
            ${escape(person.name)}</option>`).join("")}
          </select></label>`
        : "";
      const adminForm = admin ? `<h3>Create routine</h3>
        <form id="new-routine">
          <label>Name<input name="title" required placeholder="Morning routine"></label>
          <label>Checklist steps<textarea name="steps" required
            placeholder="One step per line"></textarea></label>
          <label>Assign to<select name="member_ids" multiple required size="3">
            ${members.map(person => `<option value="${escape(person.id)}">
              ${escape(person.name)}</option>`).join("")}</select></label>
          <button>Add routine</button>
        </form>` : "";
      const presence = member ? `<p><strong>${escape(member.name)}</strong>
        · ${data.presence?.[member.id] === false ? "Away" : "Home"}
        <button id="presence">${data.presence?.[member.id] === false
          ? "Mark home" : "Mark away"}</button></p>` : "";
      const description = member ? "" :
        "<p class=\"muted\">Add a household member to see their daily routine.</p>";

      this.layout("Daily routines", `${description}${memberPicker}${presence}
        ${entries || "<p>No routines assigned yet.</p>"}${adminForm}`);
      const picker = this.shadowRoot.querySelector("#view-member");
      if (picker) picker.onchange = () => {
        this.activeMemberId = picker.value;
        this.render();
      };

      this.shadowRoot.querySelectorAll("[data-routine]").forEach(button => {
        button.onclick = () => this.send("complete_routine_step", {
          routine_id: button.dataset.routine,
          step_id: button.dataset.step,
          member_id: selectedMember,
          day
        });
      });
      const presenceButton = this.shadowRoot.querySelector("#presence");
      if (presenceButton && member) {
        presenceButton.onclick = () => this.send("set_presence", {
          member_id: member.id,
          present: data.presence?.[member.id] === false
        });
      }
      const form = this.shadowRoot.querySelector("#new-routine");
      if (form) {
        form.onsubmit = event => {
          event.preventDefault();
          const fields = event.target.elements;
          this.send("add_routine", {
            title: fields.namedItem("title").value.trim(),
            member_ids: [...fields.namedItem("member_ids").selectedOptions]
              .map(option => option.value),
            steps: fields.namedItem("steps").value.split("\n").map(s => s.trim())
              .filter(Boolean)
          });
        };
      }
    }
  }

  class FamilyHubCustodyCard extends FamilyHubScheduleBase {
    constructor() {
      super();
      this.schedule = [];
    }

    async refresh() {
      await super.refresh();
      if (!this._hass || !this.data) return;
      await this.loadSchedule();
    }

    async loadSchedule() {
      try {
        this.schedule = await this._hass.callWS({
          type:"family_hub/rotation_schedule", starts_on:todayKey(), days:21
        });
        this.error = "";
      } catch (error) {
        this.schedule = [];
        this.error = String(error.message || error);
      }
      this.render();
    }

    render() {
      if (!this.shadowRoot) return;
      const member = this.member();
      const members = this.data?.members || [];
      const admin = Boolean(this._hass?.user?.is_admin);
      const schedule = this.schedule.filter(row => !this.config.member_id
        || row.member_ids.includes(this.config.member_id));
      const names = new Map(members.map(item => [item.id, item.name]));
      const rows = schedule.map(row => `<div class="row">
        <span><strong>${escape(row.day)}</strong>
          <small>${row.member_ids.map(id => escape(names.get(id) || "Member"))
            .join(", ")}</small></span>
        <strong>${escape(row.household)}</strong>
      </div>`).join("");
      const editor = admin ? `<h3>Add a repeating schedule</h3>
        <form id="new-rotation">
          <label>Start date<input type="date" name="starts_on"
            value="${todayKey()}" required></label>
          <label>Days per home<input type="number" name="days_per_block"
            value="7" min="1" max="365" required></label>
          <label>Households<textarea name="households" required
            placeholder="One home label per line"></textarea></label>
          <label>Members<select name="member_ids" multiple required size="3">
            ${members.map(person => `<option value="${escape(person.id)}">
              ${escape(person.name)}</option>`).join("")}</select></label>
          <button>Add schedule</button>
        </form>` : "";
      this.layout("Household rotation", `<p class="muted">Upcoming 21 days</p>
        ${rows || "<p>No household rotation is configured.</p>"}${editor}`);
      const form = this.shadowRoot.querySelector("#new-rotation");
      if (form) form.onsubmit = event => {
        event.preventDefault();
        const fields = event.target.elements;
        const households = fields.namedItem("households").value.split("\n")
          .map(name => name.trim()).filter(Boolean);
        if (households.length < 2) {
          this.error = "Enter at least two household labels";
          this.render();
          return;
        }
        this.send("add_rotation", {
          member_ids: [...fields.namedItem("member_ids").selectedOptions]
            .map(option => option.value),
          starts_on:fields.namedItem("starts_on").value,
          households,
          days_per_block:Number(fields.namedItem("days_per_block").value)
        }).then(() => this.loadSchedule());
      };
    }
  }

  const cards = [
    ["family-hub-routines-card", FamilyHubRoutinesCard,
      "Family Hub Routines", "Daily step checklists and member presence"],
    ["family-hub-custody-card", FamilyHubCustodyCard,
      "Family Hub Household Rotation", "Recurring household schedules"]
  ];
  window.customCards = window.customCards || [];
  for (const [type, ctor, name, description] of cards) {
    if (!customElements.get(type)) customElements.define(type, ctor);
    if (!window.customCards.some(card => card.type === type))
      window.customCards.push({type, name, description});
  }
})();
