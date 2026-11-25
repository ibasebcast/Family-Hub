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
      const members = data.members || [];
      const chores = data.chores || [];
      const nav = [
        ["members","Members"], ["chores","Chores"], ["rewards","Rewards"],
        ["organizer","Organizer"], ["schedules","Schedules"],
        ["rooms","Rooms"], ["dashboards","Dashboards"], ["settings","Settings"],
      ];
      const groups = this.tab === "organizer"
        ? [["shopping","Shopping"], ["meals","Meals"], ["events","Events"],
           ["announcements","Announcements"], ["reminders","Reminders"]]
        : this.tab === "schedules"
          ? [["routines","Routines"], ["rotations","Household rotations"]]
          : [["members","Members"],["chores","Chores"],["rewards","Rewards"]]
            .filter(([key]) => this.tab === key);
      const names = new Map(members.map(item => [item.id, item.name]));
      const subtitle = (collection, item) => {
        if (collection === "members") return item.role + (item.ha_user_id ? " · HA linked" : "");
        if (collection === "chores") {
          const people = (item.assignee_ids || []).map(id => names.get(id) || "Member").join(", ");
          return `${item.points || 0} points · ${item.recurrence} · ${people}${item.rotation_days ? " · rotating" : ""}`;
        }
        if (collection === "rewards") return `${item.cost} points`;
        if (collection === "meals") return `${item.day} · ${item.meal_type}`;
        if (collection === "events") return new Date(item.starts_at).toLocaleString();
        if (collection === "reminders") return new Date(item.due_at).toLocaleString();
        if (collection === "shopping") return `${item.quantity || "1"} · ${item.category || "General"}`;
        if (collection === "routines") return `${(item.steps || []).length} steps`;
        if (collection === "rotations") return `${item.days_per_block} days per household`;
        if (collection === "announcements") return item.message || "";
        return "";
      };
      const headline = (collection, item) => item.name || item.title
        || (collection === "rotations" ? (item.households || []).join(" / ") : collection);
      const records = groups.map(([collection, label]) => {
        const list = data[collection] || [];
        return `<section class="record-section">
          <div class="section-heading"><h3>${esc(label)}</h3>
            <span class="count">${list.length}</span></div>
          <div class="records">${list.map(item => `<div class="record">
            ${collection === "members" ? `<span class="avatar"
              style="--member-color:${/^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#64748b"}">
              ${esc((item.name || "?").slice(0,1).toUpperCase())}</span>` : ""}
            <div class="record-main">
              <strong>${esc(headline(collection,item))}</strong>
              <small>${esc(subtitle(collection,item))}</small>
            </div>
            <div class="record-actions">
              <button type="button" class="subtle" data-edit-section="${esc(collection)}"
                data-edit-id="${esc(item.id)}" aria-label="Edit ${esc(headline(collection,item))}">Edit</button>
              <button type="button" class="subtle danger" data-delete-section="${esc(collection)}"
                data-delete-id="${esc(item.id)}" aria-label="Delete ${esc(headline(collection,item))}">Delete</button>
            </div>
          </div>`).join("") || '<p class="empty">Nothing here yet. Use the form below or the Planning dashboard to add items.</p>'}</div>
        </section>`;
      }).join("");
      const selected = this.editing
        ? (data[this.editing.collection] || [])
          .find(item => item.id === this.editing.recordId) : null;
      const editor = selected ? `<section class="editor" id="edit-area">
        <div class="section-heading"><h3>Edit ${esc(headline(this.editing.collection,selected))}</h3>
          <span class="hint">Changes save without recreating the item</span></div>
        <form id="record-editor" class="fields">
          ${this.editorFields(this.editing.collection,selected)}
          <div class="form-actions wide">
            <button type="submit" class="primary">Save changes</button>
            <button type="button" class="subtle" id="cancel-edit">Cancel</button>
          </div>
        </form></section>` : "";
      const canCreate = ["members","chores","rewards"].includes(this.tab);
      const create = canCreate && !selected ? `<section class="editor">
        <div class="section-heading"><h3>Add ${this.tab === "members" ? "member" :
          this.tab === "chores" ? "chore" : "reward"}</h3></div>
        <form id="entry" class="fields">${this.editorFields(this.tab,{})}
          <div class="form-actions wide"><button class="primary" type="submit">
            Add ${this.tab === "members" ? "member" : this.tab === "chores" ? "chore" : "reward"}
          </button></div>
        </form></section>` : "";
      const content = this.tab === "rooms" ? this.roomEditor(members)
        : this.tab === "dashboards" ? this.dashboardsEditor()
        : this.tab === "settings" ? `<section class="editor">
          <h3>Household preferences</h3>
          <form id="settings-form" class="fields">
            <label>Points currency<input name="currency_name" required
              value="${esc(data.settings?.currency_name || "Points")}"></label>
            <label class="wide">Calendars (entity IDs, comma separated)
              <input name="calendar_entities"
                value="${esc((data.calendar_entities || []).join(", "))}"></label>
            <label class="wide">Authorized display account IDs
              <input name="display_user_ids"
                value="${esc((data.settings?.display_user_ids || []).join(", "))}"></label>
            <div class="form-actions wide"><button type="submit" class="primary">Save settings</button></div>
          </form>
        </section>`
        : `${records}${editor}${create}`;

      this.shadowRoot.innerHTML = `<style>
        :host{display:block;color:var(--primary-text-color)}
        *,*::before,*::after{box-sizing:border-box}
        article{background:var(--ha-card-background,var(--card-background-color,#fff));
          border-radius:var(--ha-card-border-radius,18px);padding:clamp(14px,3vw,24px)}
        h2,h3,p{margin-top:0}h2{font-size:1.35rem;letter-spacing:-.025em}
        h3{font-size:1.04rem}small,.hint,.empty{color:var(--secondary-text-color)}
        .intro{display:flex;justify-content:space-between;align-items:start;gap:12px;
          margin-bottom:14px}.intro p{color:var(--secondary-text-color);font-size:.88rem;margin:0}
        .intro strong{display:block;font-size:1.45rem;letter-spacing:-.03em}
        .overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
          gap:8px;margin-bottom:16px}
        .metric{border:1px solid var(--divider-color,#4444);border-radius:12px;
          padding:10px 12px;background:var(--secondary-background-color,#8881)}
        .metric b{font-size:1.35rem;display:block}.metric small{font-size:.75rem}
        nav{display:flex;gap:7px;flex-wrap:wrap;margin:4px 0 18px;padding-bottom:12px;
          border-bottom:1px solid var(--divider-color,#8884)}
        button{font:inherit;border-radius:10px;min-height:38px;padding:8px 12px;
          cursor:pointer;border:1px solid transparent}
        nav button,.subtle{background:var(--secondary-background-color,#8882);
          color:var(--primary-text-color);border-color:var(--divider-color,#8884)}
        nav button[aria-current="true"]{background:var(--primary-color,#03a9f4);
          color:#fff;border-color:var(--primary-color,#03a9f4)}
        .primary,#room-form button[type=submit],#create-dashboards,#refresh{background:var(--primary-color,#03a9f4);
          color:#fff;border-color:var(--primary-color,#03a9f4)}
        .danger{color:var(--error-color,#f66)}
        button:disabled{opacity:.5;cursor:not-allowed}
        .section-heading{display:flex;align-items:baseline;justify-content:space-between;
          gap:8px;margin:8px 0 10px}.section-heading h3{margin:0}
        .count{padding:3px 9px;border-radius:30px;background:var(--secondary-background-color,#8882);
          font-size:.8rem;color:var(--secondary-text-color)}
        .record-section{margin-bottom:18px}
        .records{border:1px solid var(--divider-color,#8884);border-radius:14px;
          overflow:hidden}.record{display:flex;align-items:center;gap:10px;padding:12px 14px;
          border-bottom:1px solid var(--divider-color,#8883)}
        .record:last-child{border-bottom:0}
        .record-main{flex:1;min-width:0}
        .record-main strong{display:block;overflow-wrap:anywhere}
        .record-main small{display:block;font-size:.81rem;margin-top:3px;overflow-wrap:anywhere}
        .record-actions{display:flex;gap:6px;flex-wrap:wrap}
        .record-actions button{min-height:33px;font-size:.83rem;padding:6px 10px}
        .avatar{--member-color:#64748b;background:color-mix(in srgb,var(--member-color) 18%,transparent);
          color:var(--member-color);width:38px;height:38px;flex-shrink:0;border-radius:13px;
          display:grid;place-items:center;font-weight:800}
        .empty{padding:15px;font-size:.86rem;margin:0}
        .editor{padding:16px;border:1px solid var(--divider-color,#8884);
          border-radius:14px;background:var(--secondary-background-color,#8881);margin:14px 0}
        .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        label{display:flex;flex-direction:column;gap:6px;font-size:.89rem}
        input,select,textarea{font:inherit;width:100%;min-width:0;max-width:100%;
          background:var(--input-fill,var(--card-background-color,#fff));
          color:var(--primary-text-color);
          border:1px solid var(--divider-color,#8886);border-radius:10px;padding:10px}
        input[type=checkbox]{width:18px;height:18px;flex-shrink:0}
        input[type=color]{height:43px;padding:3px}
        select[multiple]{min-height:88px}textarea{resize:vertical}
        label.wide,.wide{grid-column:1/-1}
        label.check{flex-direction:row;align-items:center}
        .form-actions{display:flex;gap:8px;flex-wrap:wrap}
        .error{color:var(--error-color,#f55)}.success{color:var(--success-color,#4caf50)}
        #room-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
          align-items:end;gap:14px}
        #room-form h3,#room-form p,#room-form .device-list,#room-form button{grid-column:1/-1}
        .device-list{max-height:330px;overflow:auto;border:1px solid var(--divider-color,#8884);
          border-radius:12px;padding:4px}
        .device{display:flex;align-items:center;flex-direction:row;gap:10px;
          padding:9px;border-bottom:1px solid var(--divider-color,#8883)}
        .device span{flex:1;min-width:0;overflow-wrap:anywhere}
        .device small{display:block;opacity:.7}.device[hidden]{display:none}
        .dashboard-links li{margin:8px 0}
        .footer{display:flex;justify-content:flex-end;margin-top:16px}
        @media(max-width:520px){
          .fields,#room-form{grid-template-columns:minmax(0,1fr)}
          .record{flex-wrap:wrap}.record-main{min-width:60%}
          .record-actions{width:100%;padding-left:48px}
          .overview{gap:5px}.metric{padding:9px}.metric b{font-size:1.16rem}
          nav button{flex:1 0 auto}
        }
      </style><article>
        <div class="intro"><div><strong>Manage Family Hub</strong>
          <p>People, schedules and household settings</p></div></div>
        <div class="overview">
          <div class="metric"><b>${members.length}</b><small>Members</small></div>
          <div class="metric"><b>${chores.length}</b><small>Chores</small></div>
          <div class="metric"><b>${(data.completions || []).filter(item => item.status === "pending").length}</b>
            <small>Awaiting approval</small></div>
        </div>
        <nav aria-label="Family Hub sections">
          ${nav.map(([key,label]) => `<button type="button" data-tab="${key}"
            aria-current="${this.tab === key}">${label}</button>`).join("")}
        </nav>
        ${this.error ? `<p class="error" role="alert">${esc(this.error)}</p>` : ""}
        ${this.notice ? `<p class="success" role="status">${esc(this.notice)}</p>` : ""}
        ${content}
        <div class="footer"><button id="refresh" type="button">Refresh data</button></div>
      </article>`;

      const root = this.shadowRoot;
      root.querySelectorAll("[data-tab]").forEach(button => {
        button.onclick = () => {
          this.tab = button.dataset.tab;
          this.editing = null;
          this.error = "";
          this.notice = "";
          this.render();
        };
      });
      root.querySelector("#refresh").onclick = () => this.refresh();
      root.querySelectorAll("[data-edit-section]").forEach(button => {
        button.onclick = () => this.editRecord(
          button.dataset.editSection, button.dataset.editId
        );
      });
      root.querySelectorAll("[data-delete-section]").forEach(button => {
        button.onclick = () => this.deleteRecord(
          button.dataset.deleteSection, button.dataset.deleteId
        );
      });
      const editorForm = root.querySelector("#record-editor");
      if (editorForm) editorForm.onsubmit = event => {
        event.preventDefault();
        this.saveEditor(this.editing.collection, this.editing.recordId, editorForm);
      };
      const cancel = root.querySelector("#cancel-edit");
      if (cancel) cancel.onclick = () => {
        this.editing = null; this.error = ""; this.render();
      };
      if (this.tab === "dashboards") {
        root.querySelector("#create-dashboards").onclick = () => this.installDashboards();
      }
      if (this.tab === "rooms") {
        const memberControl = root.querySelector("#room-member");
        if (memberControl) {
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
        }
      }
      const settings = root.querySelector("#settings-form");
      if (settings) settings.onsubmit = event => {
        event.preventDefault();
        const fields = settings.elements;
        const list = name => fields.namedItem(name).value.split(",")
          .map(item => item.trim()).filter(Boolean);
        this.command("update_settings", {
          currency_name:fields.namedItem("currency_name").value.trim(),
          calendar_entities:list("calendar_entities"),
          display_user_ids:list("display_user_ids"),
        });
      };
      const entry = root.querySelector("#entry");
      if (entry) entry.onsubmit = event => {
        event.preventDefault();
        try {
          const payload = this.collectFields(this.tab, entry);
          if (this.tab === "members" && !payload.ha_user_id) delete payload.ha_user_id;
          if (this.tab === "chores" && !payload.rotation_days) {
            delete payload.rotation_days;
            delete payload.rotation_start;
          }
          const commands = {members:"add_member", chores:"add_chore", rewards:"add_reward"};
          this.command(commands[this.tab], payload);
        } catch (error) {
          this.error = String(error.message || error);
          this.render();
        }
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
