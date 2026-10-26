/** Family Hub household organizer cards for meals and announcements. */
(() => {
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const style=`
    article{background:var(--ha-card-background,var(--card-background-color,#fff));
      color:var(--primary-text-color);padding:18px;border-radius:14px}
    .item{display:flex;align-items:center;gap:12px;padding:10px 0;
      border-bottom:1px solid var(--divider-color,#ddd)}
    .item span{flex:1} .item small{display:block;opacity:.7}
    form{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    input,select{font:inherit;min-width:0;padding:8px;border-radius:8px;flex:1}
    button{font:inherit;padding:8px 12px;border:0;border-radius:8px;
      background:var(--primary-color,#2979ff);color:white;cursor:pointer}
    .error{color:var(--error-color,#c33)}
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
        ${body}<button id="refresh">Refresh</button></article>`;
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
