/**
 * Family Hub management.
 *
 * All household changes go through authenticated WebSocket commands. Dashboard
 * creation uses Home Assistant's normal storage-mode Lovelace APIs, so users
 * can edit the result in the UI and existing dashboards are never overwritten.
 */
(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ROOM_DOMAINS = new Set([
    "light", "switch", "fan", "cover", "climate", "sensor", "binary_sensor"
  ]);

  class FamilyHubManageCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:"open"});
      this._hass = null;
      this.data = null;
      this.error = "";
      this.notice = "";
      this.tab = "members";
      this.editing = null;
      this.roomMemberId = null;
      this.roomSelected = new Set();
      this.installing = false;
      this.dashboardLinks = [];
    }

    setConfig(config) { this.config = config; this.render(); }
    set hass(value) {
      const initial = !this._hass;
      this._hass = value;
      if (initial) this.refresh();
    }
    getCardSize() { return 8; }

    async refresh() {
      try {
        this.data = await this._hass.callWS({type:"family_hub/state"});
        this.error = "";
        const members = this.data.members || [];
        if (!members.some(member => member.id === this.roomMemberId)) {
          this.roomMemberId = members[0]?.id || null;
        }
        // Reflect the persisted device selection after a successful save.
        this.roomSelected = new Set(
          this.data.room_entities?.[this.roomMemberId] || []
        );
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.render();
    }

    async command(type, fields) {
      try {
        await this._hass.callWS({type:"family_hub/" + type, ...fields});
        await this.refresh();
      } catch (error) {
        this.error = String(error.message || error);
        this.render();
      }
    }

    /** Build the room picker from real entities, not hard-coded sample devices. */
    roomEditor(members) {
      if (!members.length) return "<p>Add a household member before assigning room devices.</p>";
      const memberId = this.roomMemberId || members[0].id;
      const selected = this.roomSelected;
      const states = this._hass?.states || {};
      const entityIds = new Set([
        ...Object.keys(states).filter(id => ROOM_DOMAINS.has(id.split(".")[0])),
        ...selected
      ]);
      const rows = [...entityIds].sort((a, b) =>
        (states[a]?.attributes?.friendly_name || a).localeCompare(
          states[b]?.attributes?.friendly_name || b
        )
      ).map(id => {
        const state = states[id];
        const name = state?.attributes?.friendly_name || id;
        return `<label class="device" data-room-label="${esc((name+" "+id).toLowerCase())}">
          <input type="checkbox" data-room-entity="${esc(id)}"
            ${selected.has(id) ? "checked" : ""}>
          <span>${esc(name)}<small>${esc(id)}${state ? "" : " (unavailable)"}</small></span>
        </label>`;
      }).join("");
      return `<form id="room-form">
        <h3>Room devices</h3>
        <p>Choose a member, then select the Home Assistant entities available
          on their room dashboard. Device permissions remain controlled by Home Assistant.</p>
        <label>Member<select id="room-member">
          ${members.map(member => `<option value="${esc(member.id)}"
            ${member.id === memberId ? "selected" : ""}>${esc(member.name)}</option>`).join("")}
        </select></label>
        <label>Find devices<input id="room-search" type="search"
          placeholder="Search by name or entity ID" autocomplete="off"></label>
        <div class="device-list">${rows || "<p>No supported entities available.</p>"}</div>
        <button type="submit">Save room devices</button>
      </form>`;
    }

    /**
     * Make new editable dashboards, never replacing dashboards already owned
     * by Home Assistant. The family dashboard is private to administrators;
     * individual dashboards use backend-permission-scoped member cards.
     */
    async installDashboards() {
      if (this.installing) return;
      this.installing = true;
      this.error = "";
      this.notice = "";
      this.render();
      try {
        const templates = await this._hass.callWS({type:"family_hub/dashboard_templates"});
        const existing = await this._hass.callWS({type:"lovelace/dashboards/list"});
        const paths = new Set(existing.map(item => item.url_path));
        const requested = [templates.family, templates.wall, ...templates.members];
        let created = 0;
        let skipped = 0;
        for (const item of requested) {
          if (paths.has(item.url_path)) {
            skipped++;
            continue;
          }
          const isFamily = item.url_path === "family-hub";
          await this._hass.callWS({
            type:"lovelace/dashboards/create",
            url_path:item.url_path,
            title:item.title,
            icon:item.icon,
            require_admin:isFamily,
            show_in_sidebar:isFamily
          });
          // Only populate a dashboard we just created; never replace edits.
          await this._hass.callWS({
            type:"lovelace/config/save",
            url_path:item.url_path,
            config:item.config
          });
          paths.add(item.url_path);
          created++;
        }
        this.dashboardLinks = requested.map(item => ({
          title:item.title, path:item.url_path
        }));
        this.notice = `Created ${created} dashboard(s); skipped ${skipped} existing dashboard(s).`;
      } catch (error) {
        this.error = String(error.message || error);
      } finally {
        this.installing = false;
        this.render();
      }
    }

    dashboardsEditor() {
      return `<section>
        <h3>Editable Home Assistant dashboards</h3>
        <p>Family Hub creates an administrator dashboard, an optional read-only
          wall-tablet display, and a personal dashboard for every member.
          Authorize display accounts under Settings. Existing dashboards
          retain all user edits.</p>
        <button id="create-dashboards" type="button" ${this.installing ? "disabled" : ""}>
          ${this.installing ? "Creating dashboards…" : "Repair missing dashboards"}
        </button>
        ${this.dashboardLinks.length ? `<ul class="dashboard-links">${this.dashboardLinks.map(
          item => `<li><a href="/${esc(item.path)}/">${esc(item.title)}</a></li>`
        ).join("")}</ul>` : ""}
      </section>`;
    }


    /** A selected record becomes an inline form, never a separate popup. */
    editRecord(collection, recordId) {
      this.editing = {collection, recordId};
      this.error = "";
      this.notice = "";
      this.render();
    }

    async deleteRecord(collection, recordId) {
      const record = (this.data?.[collection] || [])
        .find(item => item.id === recordId);
      if (!record) return;
      const name = record.title || record.name || collection;
      if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
      if (this.editing?.recordId === recordId) this.editing = null;
      await this.command("delete_record", {collection, record_id: recordId});
    }

    /** Render the editable fields for each persisted record collection. */
    editorFields(collection, record = {}) {
      const members = this.data?.members || [];
      const field = (name, label, value = "", type = "text", required = false) =>
        `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}"
          value="${esc(value ?? "")}" ${required ? "required" : ""}></label>`;
      const pick = (name, label, choices, selected = []) =>
        `<label>${esc(label)}<select name="${esc(name)}" multiple size="4">
          ${choices.map(option => `<option value="${esc(option.id)}"
            ${selected.includes(option.id) ? "selected" : ""}>
            ${esc(option.name)}</option>`).join("")}</select></label>`;
      const textarea = (name, label, value = "") =>
        `<label class="wide">${esc(label)}
          <textarea name="${esc(name)}" rows="3">${esc(value)}</textarea></label>`;
      const options = (name, label, choices, current) =>
        `<label>${esc(label)}<select name="${esc(name)}">
          ${choices.map(value => `<option value="${esc(value)}"
            ${value === current ? "selected" : ""}>${esc(value)}</option>`).join("")}
          </select></label>`;
      const memberOptions = (name, label, values) =>
        pick(name, label, members, values || []);
      const dateTime = value => {
        if (!value) return "";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        const two = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
      };

      if (collection === "members") return [
        field("name", "Name", record.name, "text", true),
        options("role", "Role", ["child", "adult"], record.role || "child"),
        field("color", "Color", record.color || "#64748b", "color"),
        field("ha_user_id", "Home Assistant user ID (optional)", record.ha_user_id || ""),
      ].join("");
      if (collection === "chores") return [
        field("title", "Chore", record.title, "text", true),
        field("points", "Points", record.points ?? 0, "number", true),
        options("recurrence", "Repeat", ["daily", "weekly", "once"], record.recurrence || "daily"),
        memberOptions("assignee_ids", "Assign to", record.assignee_ids),
        textarea("description", "Instructions (optional)", record.description || ""),
        `<label class="check"><input type="checkbox" name="approval_required"
          ${record.approval_required ? "checked" : ""}>Requires approval</label>`,
        `<label class="check"><input type="checkbox" name="rotating"
          ${record.rotation_days ? "checked" : ""}>Rotate between selected members</label>`,
        field("rotation_days", "Days per rotation", record.rotation_days || 7, "number"),
        field("rotation_start", "Rotation start", record.rotation_start || this.todayKey(), "date"),
      ].join("");
      if (collection === "rewards") return [
        field("title", "Reward", record.title, "text", true),
        field("cost", "Point cost", record.cost ?? 0, "number", true),
        textarea("description", "Description", record.description || ""),
      ].join("");
      if (collection === "shopping") return [
        field("title", "Item", record.title, "text", true),
        field("quantity", "Quantity", record.quantity || "1"),
        field("category", "Category", record.category || "General"),
        `<label class="check"><input type="checkbox" name="checked"
          ${record.checked ? "checked" : ""}>Purchased</label>`,
      ].join("");
      if (collection === "meals") return [
        field("title", "Meal", record.title, "text", true),
        field("day", "Date", record.day || this.todayKey(), "date", true),
        options("meal_type", "Meal type", ["breakfast", "lunch", "dinner", "snack"],
          record.meal_type || "dinner"),
        textarea("notes", "Notes", record.notes || ""),
      ].join("");
      if (collection === "events") return [
        field("title", "Event", record.title, "text", true),
        field("starts_at", "Starts", dateTime(record.starts_at), "datetime-local", true),
        field("ends_at", "Ends", dateTime(record.ends_at), "datetime-local", true),
        memberOptions("member_ids", "Members (optional)", record.member_ids),
        textarea("notes", "Notes", record.notes || ""),
      ].join("");
      if (collection === "announcements") return [
        field("title", "Title", record.title, "text", true),
        textarea("message", "Message", record.message || ""),
      ].join("");
      if (collection === "reminders") return [
        field("title", "Reminder", record.title, "text", true),
        field("due_at", "When", dateTime(record.due_at), "datetime-local", true),
        memberOptions("member_ids", "Members (none means everyone)", record.member_ids),
        textarea("message", "Details", record.message || ""),
      ].join("");
      if (collection === "routines") return [
        field("title", "Routine", record.title, "text", true),
        memberOptions("member_ids", "Assigned members", record.member_ids),
        textarea("steps", "Checklist steps, one per line",
          (record.steps || []).map(step => step.title).join("\\n")),
      ].join("");
      if (collection === "rotations") return [
        field("starts_on", "Start date", record.starts_on, "date", true),
        field("days_per_block", "Days per household", record.days_per_block || 7, "number", true),
        memberOptions("member_ids", "Assigned members", record.member_ids),
        textarea("households", "Households, one per line",
          (record.households || []).join("\\n")),
      ].join("");
      return "";
    }

    todayKey() {
      const today = new Date();
      const two = n => String(n).padStart(2, "0");
      return `${today.getFullYear()}-${two(today.getMonth()+1)}-${two(today.getDate())}`;
    }

    /** Convert current form fields to the backend's validated edit schema. */
    collectFields(collection, form, original = {}) {
      const f = form.elements;
      const value = name => f.namedItem(name)?.value || "";
      const selected = name => [...(f.namedItem(name)?.selectedOptions || [])]
        .map(option => option.value);
      const checked = name => Boolean(f.namedItem(name)?.checked);
      const iso = name => {
        const time = new Date(value(name));
        if (Number.isNaN(time.getTime())) throw new Error("Choose a valid date and time");
        return time.toISOString();
      };
      if (collection === "members") return {
        name:value("name").trim(), role:value("role"),
        color:value("color"), ha_user_id:value("ha_user_id").trim() || null,
      };
      if (collection === "chores") return {
        title:value("title").trim(), points:Number(value("points")),
        recurrence:value("recurrence"), description:value("description"),
        assignee_ids:selected("assignee_ids"),
        approval_required:checked("approval_required"),
        rotation_days:checked("rotating") ? Number(value("rotation_days")) : null,
        rotation_start:checked("rotating") ? value("rotation_start") : null,
      };
      if (collection === "rewards") return {
        title:value("title").trim(), cost:Number(value("cost")),
        description:value("description"),
      };
      if (collection === "shopping") return {
        title:value("title").trim(), quantity:value("quantity"),
        category:value("category"), checked:checked("checked"),
      };
      if (collection === "meals") return {
        title:value("title").trim(), day:value("day"),
        meal_type:value("meal_type"), notes:value("notes"),
      };
      if (collection === "events") return {
        title:value("title").trim(), starts_at:iso("starts_at"),
        ends_at:iso("ends_at"), member_ids:selected("member_ids"),
        notes:value("notes"),
      };
      if (collection === "announcements") return {
        title:value("title").trim(), message:value("message"),
      };
      if (collection === "reminders") return {
        title:value("title").trim(), due_at:iso("due_at"),
        member_ids:selected("member_ids"), message:value("message"),
      };
      if (collection === "routines") {
        const steps = value("steps").split("\\n").map(x => x.trim()).filter(Boolean);
        return {
          title:value("title").trim(),
          member_ids:selected("member_ids"),
          steps:steps.map((title, i) => ({
            ...(original.steps?.[i]?.id ? {id:original.steps[i].id} : {}),
            title,
          })),
        };
      }
      if (collection === "rotations") return {
        starts_on:value("starts_on"), days_per_block:Number(value("days_per_block")),
        member_ids:selected("member_ids"),
        households:value("households").split("\\n").map(x => x.trim()).filter(Boolean),
      };
      throw new Error("Unsupported editing collection");
    }

    async saveEditor(collection, recordId, form) {
      try {
        const original = (this.data?.[collection] || []).find(item => item.id === recordId);
        if (!original) throw new Error("Record not found");
        const changes = this.collectFields(collection, form, original);
        await this._hass.callWS({
          type:"family_hub/edit_record", collection, record_id:recordId, changes
        });
        this.editing = null;
        this.notice = "Changes saved";
        await this.refresh();
      } catch (error) {
        this.error = String(error.message || error);
        this.render();
      }
    }

    render() {
      if (!this.shadowRoot) return;
      const data = this.data || {};
      const members = data.members || [], chores = data.chores || [],
        rewards = data.rewards || [];
      const tabs = ["members", "chores", "rewards", "rooms", "dashboards", "settings"];
      const field = (name, label, type = "text", required = true, value = "") =>
        `<label>${esc(label)}<input name="${name}" type="${type}"
          value="${esc(value)}" ${required ? "required" : ""}></label>`;
      let form = "", list = "";
      if (this.tab === "members") {
        form = field("name", "Name") + `<label>Role<select name="role">
          <option value="child">Child</option><option value="adult">Adult</option></select></label>`
          + field("color", "Color", "color", false, "#64748b")
          + field("ha_user_id", "Home Assistant user ID (optional)", "text", false);
        list = members.map(m => `<div class="line"><span class="dot"
          style="background:${/^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : "#64748b"}"></span>
          <strong>${esc(m.name)}</strong><small>${esc(m.role)}</small></div>`).join("");
      } else if (this.tab === "chores") {
        form = field("title", "Chore") + field("points", "Points", "number")
          + `<label>Repeat<select name="recurrence"><option>daily</option>
          <option>weekly</option><option>once</option></select></label>
          <label>Assign to<select name="assignee_ids" multiple required size="4">
          ${members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}
          </select></label><label class="checkbox-line"><input type="checkbox"
          name="approval_required">Requires approval</label>
          <label class="checkbox-line"><input type="checkbox"
          name="rotating">Rotate assignment between selected members</label>
          <label>Days per rotation<input type="number" name="rotation_days"
            value="7" min="1" max="365"></label>
          <label>Rotation start date<input type="date" name="rotation_start"
            value="${[new Date().getFullYear(),
              String(new Date().getMonth()+1).padStart(2,"0"),
              String(new Date().getDate()).padStart(2,"0")].join("-")}"></label>`;
        list = chores.map(c => `<div class="line"><strong>${esc(c.title)}</strong>
          <small>${Number(c.points) || 0} points · ${esc(c.recurrence)}</small></div>`).join("");
      } else if (this.tab === "rewards") {
        form = field("title", "Reward") + field("cost", "Cost", "number");
        list = rewards.map(r => `<div class="line"><strong>${esc(r.title)}</strong>
          <small>${Number(r.cost) || 0} points</small></div>`).join("");
      } else if (this.tab === "settings") {
        form = field("currency_name", "Points currency name", "text", true,
          data.settings?.currency_name || "Points")
          + `<label>Calendar entities (comma separated)<input name="calendar_entities"
          value="${esc((data.calendar_entities || []).join(", "))}"></label>
          <label>Home Assistant user IDs allowed to view the read-only wall display
            (comma separated)<input name="display_user_ids"
            value="${esc((data.settings?.display_user_ids || []).join(", "))}"></label>`;
        list = "<p>Choose Home Assistant calendar entities to show beside local family events.</p>";
      } else if (this.tab === "rooms") {
        list = this.roomEditor(members);
      } else if (this.tab === "dashboards") {
        list = this.dashboardsEditor();
      }

      const ordinary = !["rooms", "dashboards"].includes(this.tab);
      this.shadowRoot.innerHTML = `<style>
        article{background:var(--ha-card-background,var(--card-background-color,#fff));
          color:var(--primary-text-color);border-radius:14px;padding:18px}
        nav{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
        button{background:var(--primary-color,#2979ff);color:#fff;border:0;
          border-radius:8px;padding:9px 12px;cursor:pointer}
        button:disabled{opacity:.5;cursor:not-allowed}
        button[aria-current="true"]{outline:2px solid var(--primary-text-color)}
        form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
        label{display:flex;flex-direction:column;gap:5px;font-size:.9rem}
        input,select{font:inherit;min-width:0;padding:8px;border-radius:8px}
        .checkbox-line{flex-direction:row;align-items:center}
        .line{display:flex;gap:10px;align-items:center;padding:9px 0;
          border-bottom:1px solid var(--divider-color,#ddd)}
        .line strong{flex:1}.dot{width:14px;height:14px;border-radius:50%}
        .error{color:var(--error-color,#c33)}.success{color:var(--primary-text-color)}
        #room-form{display:flex;flex-direction:column;align-items:stretch}
        .device-list{max-height:350px;overflow:auto;border:1px solid var(--divider-color,#ddd);
          border-radius:8px;padding:6px}
        .device{display:flex;align-items:center;flex-direction:row;gap:12px;
          padding:7px;border-bottom:1px solid var(--divider-color,#ddd)}
        .device[hidden]{display:none}.device span{flex:1}.device small{display:block;opacity:.7}
        .dashboard-links li{margin:7px 0}
      </style><article><h2>Manage Family Hub</h2>
      <nav>${tabs.map(t => `<button data-tab="${t}" aria-current="${this.tab === t}">
        ${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join("")}</nav>
      ${this.error ? `<p class="error" role="alert">${esc(this.error)}</p>` : ""}
      ${this.notice ? `<p class="success" role="status">${esc(this.notice)}</p>` : ""}
      <section>${list || (ordinary ? "<p>Nothing here yet.</p>" : "")}</section>
      ${ordinary ? `<h3>${this.tab === "settings" ? "Preferences" : "Add " + this.tab.slice(0,-1)}</h3>
        <form id="entry">${form}<button type="submit">Save</button></form>` : ""}
      <p><button id="refresh" type="button">Refresh</button></p></article>`;

      const root = this.shadowRoot;
      root.querySelectorAll("[data-tab]").forEach(button => {
        button.onclick = () => {
          this.tab = button.dataset.tab;
          this.notice = "";
          this.render();
        };
      });
      root.querySelector("#refresh").onclick = () => this.refresh();

      if (this.tab === "dashboards") {
        root.querySelector("#create-dashboards").onclick = () => this.installDashboards();
        return;
      }
      if (this.tab === "rooms") {
        const memberControl = root.querySelector("#room-member");
        if (!memberControl) return;
        memberControl.onchange = () => {
          this.roomMemberId = memberControl.value;
          this.roomSelected = new Set(
            this.data?.room_entities?.[this.roomMemberId] || []
          );
          this.render();
        };
        root.querySelector("#room-search").oninput = event => {
          const query = event.target.value.toLowerCase().trim();
          root.querySelectorAll("[data-room-label]").forEach(row => {
            row.hidden = !row.dataset.roomLabel.includes(query);
          });
        };
        root.querySelectorAll("[data-room-entity]").forEach(box => {
          box.onchange = () => {
            if (box.checked) this.roomSelected.add(box.dataset.roomEntity);
            else this.roomSelected.delete(box.dataset.roomEntity);
          };
        });
        root.querySelector("#room-form").onsubmit = event => {
          event.preventDefault();
          this.command("set_room_entities", {
            member_id:this.roomMemberId,
            entity_ids:[...this.roomSelected]
          });
        };
        return;
      }

      const entry = root.querySelector("#entry");
      if (!entry) return;
      entry.onsubmit = event => {
        event.preventDefault();
        const f = event.target.elements;
        const value = name => f.namedItem(name).value;
        if (this.tab === "members") return this.command("add_member", {
          name:value("name"),role:value("role"),
          color:value("color") || "#64748b",
          ...(value("ha_user_id").trim() ? {ha_user_id:value("ha_user_id").trim()} : {})
        });
        if (this.tab === "chores") return this.command("add_chore", {
          title:value("title"),points:Number(value("points")),
          recurrence:value("recurrence"),
          approval_required:f.namedItem("approval_required").checked,
          assignee_ids:[...f.namedItem("assignee_ids").selectedOptions].map(o => o.value),
          ...(f.namedItem("rotating").checked ? {
            rotation_days:Number(value("rotation_days")),
            rotation_start:value("rotation_start")
          } : {})
        });
        if (this.tab === "rewards") return this.command("add_reward", {
          title:value("title"),cost:Number(value("cost"))
        });
        if (this.tab === "settings") return this.command("update_settings", {
          currency_name:value("currency_name"),
          calendar_entities:value("calendar_entities").split(",")
            .map(s => s.trim()).filter(Boolean),
          display_user_ids:value("display_user_ids").split(",")
            .map(s => s.trim()).filter(Boolean)
        });
      };
    }
  }

  if (!customElements.get("family-hub-manage-card"))
    customElements.define("family-hub-manage-card", FamilyHubManageCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === "family-hub-manage-card"))
    window.customCards.push({type:"family-hub-manage-card",
      name:"Family Hub Management",
      description:"Configure the household, room controls and editable dashboards"});
})();
