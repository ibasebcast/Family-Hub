/** Mobile-friendly Family Hub shopping list with safe inline record editing. */
class FamilyHubShoppingCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._hass = null;
    this.items = [];
    this.error = "";
    this.editing = null;
  }

  setConfig(config) { this.config = config || {}; this.render(); }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.refresh();
  }
  getCardSize() { return 4; }

  async refresh() {
    if (!this._hass) return;
    try {
      const data = await this._hass.callWS({type:"family_hub/state"});
      this.items = data.shopping || [];
      this.error = "";
    } catch (error) {
      this.error = String(error.message || error);
    }
    this.render();
  }

  async send(type, args) {
    try {
      await this._hass.callWS({type:"family_hub/" + type, ...args});
      this.editing = null;
      await this.refresh();
    } catch (error) {
      this.error = String(error.message || error);
      this.render();
    }
  }

  async remove(item) {
    if (window.confirm(`Remove "${item.title}" from the shopping list?`)) {
      await this.send("delete_record", {collection:"shopping", record_id:item.id});
    }
  }

  render() {
    if (!this.shadowRoot) return;
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const items = [...this.items].sort((a,b)=> Number(a.checked)-Number(b.checked));
    const remaining = items.filter(item=>!item.checked).length;
    const editor = this.editing ? items.find(item=>item.id === this.editing) : null;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color)}
      *,*::before,*::after{box-sizing:border-box}
      article{padding:clamp(15px,3vw,22px);border-radius:var(--ha-card-border-radius,18px);
        background:var(--ha-card-background,var(--card-background-color,#fff))}
      header{display:flex;justify-content:space-between;gap:10px;align-items:center;
        margin-bottom:14px}h2{margin:0;font-size:1.2rem;letter-spacing:-.02em}
      .pill{background:var(--secondary-background-color,#8882);padding:4px 10px;
        border-radius:30px;font-size:.8rem;color:var(--secondary-text-color)}
      .items{border:1px solid var(--divider-color,#8884);border-radius:13px;overflow:hidden}
      .item{display:flex;align-items:center;gap:10px;padding:11px 12px;
        border-bottom:1px solid var(--divider-color,#8884)}
      .item:last-child{border-bottom:0}
      .item input[type=checkbox]{width:20px;height:20px;accent-color:var(--primary-color,#03a9f4)}
      .title{min-width:0;flex:1;overflow-wrap:anywhere}
      .title strong{display:block}.title small{display:block;
        color:var(--secondary-text-color);font-size:.77rem;margin-top:3px}
      .done strong{text-decoration:line-through;opacity:.55}
      .actions{display:flex;gap:5px}
      button{font:inherit;border-radius:9px;cursor:pointer;min-height:36px;
        padding:7px 12px;border:1px solid transparent}
      .primary{background:var(--primary-color,#03a9f4);color:#fff}
      .subtle{background:var(--secondary-background-color,#8882);
        color:var(--primary-text-color);border-color:var(--divider-color,#8884)}
      .danger{color:var(--error-color,#f55)}
      form{display:grid;grid-template-columns:minmax(0,1fr) 92px 100px auto;
        align-items:end;gap:8px;margin:14px 0}
      form label{min-width:0;display:flex;flex-direction:column;gap:5px;font-size:.8rem}
      input:not([type=checkbox]){font:inherit;max-width:100%;min-width:0;width:100%;
        color:var(--primary-text-color);background:var(--input-fill,var(--card-background-color,#fff));
        border:1px solid var(--divider-color,#8886);border-radius:9px;padding:9px}
      .edit{padding:12px;background:var(--secondary-background-color,#8881);
        border-radius:12px;margin:12px 0}
      .edit form{grid-template-columns:repeat(3,minmax(0,1fr))}
      .form-actions{grid-column:1/-1;display:flex;gap:8px}
      .empty{font-size:.87rem;color:var(--secondary-text-color);padding:14px}
      .error{color:var(--error-color,#f55)}
      @media(max-width:540px){
        form{grid-template-columns:repeat(2,minmax(0,1fr))}
        form .wide{grid-column:1/-1}
        .edit form{grid-template-columns:repeat(2,minmax(0,1fr))}
        .item{flex-wrap:wrap}.actions{margin-left:30px}
      }
    </style><article>
      <header><h2>Shopping list</h2><span class="pill">${remaining} to buy</span></header>
      ${this.error ? `<p role="alert" class="error">${esc(this.error)}</p>` : ""}
      <div class="items">
        ${items.map(item => `<div class="item ${item.checked ? "done" : ""}">
          <input type="checkbox" data-check="${esc(item.id)}"
            aria-label="Purchased ${esc(item.title)}" ${item.checked ? "checked" : ""}>
          <div class="title"><strong>${esc(item.title)}</strong>
            <small>${esc(item.quantity || "1")} · ${esc(item.category || "General")}</small></div>
          <div class="actions">
            <button class="subtle" type="button" data-edit="${esc(item.id)}">Edit</button>
            <button class="subtle danger" type="button"
              data-remove="${esc(item.id)}">Remove</button>
          </div>
        </div>`).join("") || '<p class="empty">Nothing to buy right now.</p>'}
      </div>
      ${editor ? `<div class="edit"><strong>Edit item</strong>
        <form id="edit-item">
          <label class="wide">Item<input name="title" required value="${esc(editor.title)}"></label>
          <label>Quantity<input name="quantity" value="${esc(editor.quantity || "1")}"></label>
          <label>Category<input name="category" value="${esc(editor.category || "General")}"></label>
          <div class="form-actions"><button class="primary" type="submit">Save changes</button>
            <button type="button" class="subtle" id="cancel">Cancel</button></div>
        </form></div>` : ""}
      <form id="add">
        <label class="wide">New item<input name="title" placeholder="Add something…" required></label>
        <label>Quantity<input name="quantity" value="1"></label>
        <label>Category<input name="category" value="General"></label>
        <button class="primary" type="submit">Add</button>
      </form>
    </article>`;
    const root = this.shadowRoot;
    root.querySelector("#add").onsubmit = event => {
      event.preventDefault();
      const f=event.target.elements;
      this.send("add_shopping_item",{
        title:f.namedItem("title").value.trim(),
        quantity:f.namedItem("quantity").value.trim(),
        category:f.namedItem("category").value.trim(),
      });
    };
    root.querySelectorAll("[data-check]").forEach(input => {
      input.onchange=()=>this.send("set_shopping_checked",{
        item_id:input.dataset.check,checked:input.checked,
      });
    });
    root.querySelectorAll("[data-edit]").forEach(button => {
      button.onclick=()=>{this.editing=button.dataset.edit;this.render();};
    });
    root.querySelectorAll("[data-remove]").forEach(button => {
      button.onclick=()=>{
        const item=this.items.find(item=>item.id===button.dataset.remove);
        if(item)this.remove(item);
      };
    });
    const form=root.querySelector("#edit-item");
    if(form && editor) form.onsubmit=event=>{
      event.preventDefault();
      const f=form.elements;
      this.send("edit_record",{
        collection:"shopping",record_id:editor.id,
        changes:{
          title:f.namedItem("title").value.trim(),
          quantity:f.namedItem("quantity").value.trim(),
          category:f.namedItem("category").value.trim(),
        },
      });
    };
    const cancel=root.querySelector("#cancel");
    if(cancel)cancel.onclick=()=>{this.editing=null;this.render();};
  }
}
if(!customElements.get("family-hub-shopping-card"))
  customElements.define("family-hub-shopping-card",FamilyHubShoppingCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==="family-hub-shopping-card"))
  window.customCards.push({type:"family-hub-shopping-card",name:"Family Hub Shopping",
    description:"Shared shopping checklist and item editor"});
