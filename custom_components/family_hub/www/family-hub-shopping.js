/** Family Hub shopping card. Uses Home Assistant authenticated WebSocket calls. */
class FamilyHubShoppingCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._hass = null;
    this.items = [];
    this.error = "";
  }
  setConfig(config) { this.config = config; this.render(); }
  set hass(hass) {
    if (!this._hass) { this._hass = hass; this.refresh(); }
    else this._hass = hass;
  }
  getCardSize() { return 3; }
  async refresh() {
    try {
      const data = await this._hass.callWS({type:"family_hub/state"});
      this.items = data.shopping || [];
      this.error = "";
    } catch (error) { this.error = String(error.message || error); }
    this.render();
  }
  async send(type, args) {
    try {
      await this._hass.callWS({type:"family_hub/" + type, ...args});
      await this.refresh();
    } catch (error) {
      this.error = String(error.message || error);
      this.render();
    }
  }
  render() {
    const escape = value => String(value ?? "").replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    this.shadowRoot.innerHTML = `
      <style>
        article {padding:16px;border-radius:12px;background:var(--ha-card-background,var(--card-background-color,#fff))}
        label {display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--divider-color,#ddd)}
        form {display:flex;gap:8px} input[type=text] {flex:1;min-width:0}
        button,input {font:inherit;padding:8px} .error {color:var(--error-color,#c33)}
      </style>
      <article><h2>Shopping</h2>
      ${this.error ? `<p class="error">${escape(this.error)}</p>` : ""}
      <form id="add"><input type="text" name="title" placeholder="Add an item" required>
      <button>Add</button></form>
      ${this.items.map(item => `<label><input type="checkbox" data-id="${escape(item.id)}"
        ${item.checked?"checked":""}><span>${escape(item.title)}</span></label>`).join("")}
      </article>`;
    this.shadowRoot.querySelector("#add").onsubmit = event => {
      event.preventDefault();
      const title = event.target.elements.title.value.trim();
      if (title) this.send("add_shopping_item", {title});
    };
    this.shadowRoot.querySelectorAll("[data-id]").forEach(input => {
      input.onchange = () => this.send("set_shopping_checked",
        {item_id:input.dataset.id,checked:input.checked});
    });
  }
}
if (!customElements.get("family-hub-shopping-card"))
  customElements.define("family-hub-shopping-card",FamilyHubShoppingCard);
window.customCards=window.customCards||[];
if (!window.customCards.some(card=>card.type==="family-hub-shopping-card"))
  window.customCards.push({type:"family-hub-shopping-card",name:"Family Hub Shopping",
    description:"Shared shopping checklist"});
