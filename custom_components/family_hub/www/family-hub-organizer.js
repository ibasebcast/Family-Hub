/** Family Hub household organizer cards for meals and announcements. */
(() => {
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const style=`
    :host{display:block;color:var(--primary-text-color)}
    *,*::before,*::after{box-sizing:border-box}
    article{background:var(--ha-card-background,var(--card-background-color,#fff));
      padding:clamp(15px,3vw,22px);border-radius:var(--ha-card-border-radius,18px)}
    h2{margin:0 0 16px;font-size:1.22rem;letter-spacing:-.025em}
    .item{display:flex;align-items:center;gap:12px;padding:12px 0;
      border-bottom:1px solid var(--divider-color,#8884)}
    .item span{min-width:0;flex:1;overflow-wrap:anywhere}
    .item small{display:block;color:var(--secondary-text-color);font-size:.8rem;margin-top:4px}
    form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;align-items:end;margin:16px 0}
    input,select,textarea{font:inherit;width:100%;max-width:100%;min-width:0;
      padding:10px;color:var(--primary-text-color);
      background:var(--input-fill,var(--card-background-color,#fff));
      border:1px solid var(--divider-color,#8886);border-radius:10px}
    button{font:inherit;padding:9px 12px;border:0;border-radius:10px;
      background:var(--primary-color,#03a9f4);color:#fff;cursor:pointer;min-height:38px}
    button[data-delete],button[data-remove],#refresh{background:var(--secondary-background-color,#8882);
      color:var(--primary-text-color);border:1px solid var(--divider-color,#8884)}
    .error{color:var(--error-color,#f55)}
    .footer{font-size:.8rem;color:var(--secondary-text-color);margin:16px 0 12px}
    .footer a{color:var(--primary-color,#03a9f4)}
    @media(max-width:520px){form{grid-template-columns:minmax(0,1fr)}
      .item{flex-wrap:wrap}.item button{margin-left:auto}}
  `;
  class OrganizerCard extends HTMLElement {
    constructor(){super();this.attachShadow({mode:"open"});this._hass=null;this.data={};this.error="";}
    setConfig(config){this.config=config;this.render();}
    set hass(value){const initial=!this._hass;this._hass=value;if(initial)this.refresh();}
    getCardSize(){return 4;}
    async refresh(){
      try{this.data=await this._hass.callWS({type:"family_hub/state"});this.error="";}
      catch(error){this.error=String(error.message||error);}
      this.render();
    }
    async send(type,fields){
      try{await this._hass.callWS({type:"family_hub/"+type,...fields});await this.refresh();}
      catch(error){this.error=String(error.message||error);this.render();}
    }
    show(title,body){
      this.shadowRoot.innerHTML=`<style>${style}</style><article>
        <h2>${esc(title)}</h2>${this.error?`<p class="error" role="alert">${esc(this.error)}</p>`:""}
        ${body}<p class="footer">Edit existing records under <a href="/family-hub/manage">Manage → Organizer</a>.</p><button id="refresh">Refresh</button></article>`;
      this.shadowRoot.querySelector("#refresh").onclick=()=>this.refresh();
    }
  }
  class FamilyHubMealsCard extends OrganizerCard {
    render(){
      if(!this.shadowRoot)return;
      const meals=(this.data.meals||[]).slice().sort((a,b)=>a.day.localeCompare(b.day));
      this.show("Meal planner",`<form id="new-meal">
        <input name="day" type="date" aria-label="Date" required>
        <input name="title" placeholder="Meal" aria-label="Meal" required>
        <select name="meal_type" aria-label="Meal type"><option>dinner</option>
          <option>breakfast</option><option>lunch</option><option>snack</option></select>
        <button>Add</button></form>
        ${meals.map(meal=>`<div class="item"><span><strong>${esc(meal.title)}</strong>
          <small>${esc(meal.day)} · ${esc(meal.meal_type)}</small></span>
          <button data-delete="${esc(meal.id)}">Remove</button></div>`).join("")}
        ${meals.length?"":"<p>No meals planned</p>"}`);
      this.shadowRoot.querySelector("#new-meal").onsubmit=event=>{
        event.preventDefault();const f=event.target.elements;
        this.send("add_meal",{day:f.day.value,title:f.title.value,meal_type:f.meal_type.value});
      };
      this.shadowRoot.querySelectorAll("[data-delete]").forEach(button=>{
        button.onclick=()=>this.send("delete_record",{collection:"meals",record_id:button.dataset.delete});
      });
    }
  }
  class FamilyHubAnnouncementsCard extends OrganizerCard {
    render(){
      if(!this.shadowRoot)return;
      const now=Date.now();
      const items=(this.data.announcements||[]).filter(item=>
        !item.expires_at||Date.parse(item.expires_at)>now);
      this.show("Announcements",`<form id="new-notice">
        <input name="title" placeholder="Title" required>
        <input name="message" placeholder="Message" required>
        <button>Post</button></form>
        ${items.map(item=>`<div class="item"><span><strong>${esc(item.title)}</strong>
          <small>${esc(item.message)}</small></span>
          <button data-remove="${esc(item.id)}">Remove</button></div>`).join("")}
        ${items.length?"":"<p>No announcements</p>"}`);
      this.shadowRoot.querySelector("#new-notice").onsubmit=event=>{
        event.preventDefault();const f=event.target.elements;
        this.send("add_announcement",{title:f.title.value,message:f.message.value});
      };
      this.shadowRoot.querySelectorAll("[data-remove]").forEach(button=>{
        button.onclick=()=>this.send("remove_announcement",{announcement_id:button.dataset.remove});
      });
    }
  }
  const definitions=[
    ["family-hub-meals-card",FamilyHubMealsCard,"Family Hub Meals"],
    ["family-hub-announcements-card",FamilyHubAnnouncementsCard,"Family Hub Announcements"]
  ];
  window.customCards=window.customCards||[];
  for(const [type,klass,name] of definitions){
    if(!customElements.get(type))customElements.define(type,klass);
    if(!window.customCards.some(card=>card.type===type))
      window.customCards.push({type,name,description:"Family Hub organizer"});
  }
})();
