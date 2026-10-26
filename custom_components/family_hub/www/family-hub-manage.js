/** Household administration card with UI-driven member, chore and reward setup. */
(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  class FamilyHubManageCard extends HTMLElement {
    constructor(){
      super();this.attachShadow({mode:"open"});
      this._hass=null;this.data=null;this.error="";this.tab="members";
    }
    setConfig(config){this.config=config;this.render();}
    set hass(value){const first=!this._hass;this._hass=value;if(first)this.refresh();}
    getCardSize(){return 7;}
    async refresh(){
      try{this.data=await this._hass.callWS({type:"family_hub/state"});this.error="";}
      catch(error){this.error=String(error.message||error);}
      this.render();
    }
    async command(type,fields){
      try{await this._hass.callWS({type:"family_hub/"+type,...fields});await this.refresh();}
      catch(error){this.error=String(error.message||error);this.render();}
    }
    render(){
      if(!this.shadowRoot)return;
      const data=this.data||{};
      const members=data.members||[],chores=data.chores||[],rewards=data.rewards||[];
      const tabs=["members","chores","rewards","settings"];
      const field=(name,label,type="text",required=true)=>
        `<label>${esc(label)}<input name="${name}" type="${type}" ${required?"required":""}></label>`;
      let form="",list="";
      if(this.tab==="members"){
        form=field("name","Name")+`<label>Role<select name="role">
          <option value="child">Child</option><option value="adult">Adult</option></select></label>`
          +field("color","Color","color",false)
          +field("ha_user_id","Home Assistant user ID (optional)","text",false);
        list=members.map(m=>`<div class="line"><span class="dot"
          style="background:${/^#[0-9a-fA-F]{6}$/.test(m.color)?m.color:"#64748b"}"></span>
          <strong>${esc(m.name)}</strong><small>${esc(m.role)}</small></div>`).join("");
      }
      if(this.tab==="chores"){
        form=field("title","Chore")+field("points","Points","number")
          +`<label>Repeat<select name="recurrence"><option>daily</option>
          <option>weekly</option><option>once</option></select></label>
          <label>Assign to<select name="assignee_ids" multiple required size="4">
          ${members.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}
          </select></label><label><input type="checkbox" name="approval_required">
          Requires approval</label>`;
        list=chores.map(c=>`<div class="line"><strong>${esc(c.title)}</strong>
          <small>${Number(c.points)||0} points · ${esc(c.recurrence)}</small></div>`).join("");
      }
      if(this.tab==="rewards"){
        form=field("title","Reward")+field("cost","Cost","number");
        list=rewards.map(r=>`<div class="line"><strong>${esc(r.title)}</strong>
          <small>${Number(r.cost)||0} points</small></div>`).join("");
      }
      if(this.tab==="settings"){
        form=field("currency_name","Points currency name")+
          `<label>Calendar entities (comma separated)<input name="calendar_entities"
          value="${esc((data.calendar_entities||[]).join(", "))}"></label>`;
        list="<p>Choose Home Assistant calendar entities to show alongside local family events.</p>";
      }
      this.shadowRoot.innerHTML=`<style>
        article{background:var(--ha-card-background,var(--card-background-color,#fff));
          color:var(--primary-text-color);border-radius:14px;padding:18px}
        nav{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
        button{background:var(--primary-color,#2979ff);color:#fff;border:0;
          border-radius:8px;padding:9px 12px;cursor:pointer}
        button[aria-current="true"]{outline:2px solid var(--primary-text-color)}
        form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
        label{display:flex;flex-direction:column;gap:5px;font-size:.9rem}
        input,select{font:inherit;min-width:0;padding:8px;border-radius:8px}
        .line{display:flex;gap:10px;align-items:center;padding:9px 0;
          border-bottom:1px solid var(--divider-color,#ddd)}
        .line strong{flex:1}.dot{width:14px;height:14px;border-radius:50%}
        .error{color:var(--error-color,#c33)}
      </style><article><h2>Manage Family Hub</h2>
      <nav>${tabs.map(t=>`<button data-tab="${t}" aria-current="${this.tab===t}">
        ${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join("")}</nav>
      ${this.error?`<p class="error" role="alert">${esc(this.error)}</p>`:""}
      <section>${list||"<p>Nothing here yet.</p>"}</section>
      <h3>${this.tab==="settings"?"Preferences":"Add "+this.tab.slice(0,-1)}</h3>
      <form id="entry">${form}<button type="submit">Save</button></form>
      <p><button id="refresh">Refresh</button></p></article>`;
      const root=this.shadowRoot;
      root.querySelectorAll("[data-tab]").forEach(button=>{
        button.onclick=()=>{this.tab=button.dataset.tab;this.render();};
      });
      root.querySelector("#refresh").onclick=()=>this.refresh();
      root.querySelector("#entry").onsubmit=event=>{
        event.preventDefault();
        const f=event.target.elements;
        if(this.tab==="members")return this.command("add_member",{
          name:f.name.value,role:f.role.value,
          color:f.color.value||"#64748b",
          ...(f.ha_user_id.value.trim()?{ha_user_id:f.ha_user_id.value.trim()}:{})
        });
        if(this.tab==="chores")return this.command("add_chore",{
          title:f.title.value,points:Number(f.points.value),
          recurrence:f.recurrence.value,approval_required:f.approval_required.checked,
          assignee_ids:[...f.assignee_ids.selectedOptions].map(option=>option.value)
        });
        if(this.tab==="rewards")return this.command("add_reward",{
          title:f.title.value,cost:Number(f.cost.value)
        });
        if(this.tab==="settings")return this.command("update_settings",{
          currency_name:f.currency_name.value,
          calendar_entities:f.calendar_entities.value.split(",").map(s=>s.trim()).filter(Boolean)
        });
      };
    }
  }
  if(!customElements.get("family-hub-manage-card"))
    customElements.define("family-hub-manage-card",FamilyHubManageCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type==="family-hub-manage-card"))
    window.customCards.push({type:"family-hub-manage-card",
      name:"Family Hub Management",description:"Configure members, chores, rewards and calendars"});
})();
