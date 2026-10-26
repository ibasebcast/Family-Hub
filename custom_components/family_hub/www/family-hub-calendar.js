/** Family Hub calendar: month, week and agenda with local and HA events. */
(() => {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dayKey = value => String(value || "").slice(0,10);
  const asDate = value => new Date(value.length===10 ? value+"T12:00:00" : value);
  class FamilyHubCalendarCard extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:"open"});
      this._hass=null; this.local=[]; this.external=[];
      this.view="month"; this.cursor=new Date(); this.error="";
    }
    setConfig(config) {
      this.config=config;
      this.view=config.default_view||"month";
      this.render();
    }
    set hass(value) {
      const initial=!this._hass;this._hass=value;
      if(initial)this.refresh();
    }
    getCardSize(){return 8;}
    async refresh(){
      if(!this._hass)return;
      try {
        const state=await this._hass.callWS({type:"family_hub/state"});
        this.local=state.events||[];
        this.external=[];
        this.error="";
        try {
          this.external=await this._hass.callWS({type:"family_hub/calendar",days:366});
        } catch(error) {
          this.error="External calendar: "+String(error.message||error);
        }

      } catch(error){this.error=String(error.message||error);}
      this.render();
    }
    events(){
      return [...this.local.map(event=>({...event,source:"Family"})),
        ...this.external.map(event=>({...event,source:event.calendar_id||"Calendar"}))]
        .filter(event=>event.starts_at)
        .sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
    }
    shift(delta){
      const date=new Date(this.cursor);
      if(this.view==="month")date.setMonth(date.getMonth()+delta);
      else date.setDate(date.getDate()+delta*(this.view==="week"?7:1));
      this.cursor=date;this.render();
    }
    render(){
      if(!this.shadowRoot)return;
      const cursor=this.cursor;
      const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
      const title=this.view==="month"
        ? cursor.toLocaleDateString(undefined,{month:"long",year:"numeric"})
        : cursor.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric",year:"numeric"});
      const events=this.events();
      const dayEvents=day=>events.filter(event=>dayKey(event.starts_at)===day);
      let body="";
      if(this.view==="month"||this.view==="week"){
        let start;
        let count;
        if(this.view==="month"){
          start=new Date(first);start.setDate(1-start.getDay());count=42;
        }else{
          start=new Date(cursor);start.setDate(cursor.getDate()-cursor.getDay());count=7;
        }
        body='<div class="calendar">'+["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
          .map(name=>`<strong class="weekday">${name}</strong>`).join("");
        for(let index=0;index<count;index++){
          const date=new Date(start);date.setDate(start.getDate()+index);
          const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),
            String(date.getDate()).padStart(2,"0")].join("-");
          const outside=this.view==="month"&&date.getMonth()!==cursor.getMonth();
          body+=`<div class="day ${outside?"outside":""}">
            <b>${date.getDate()}</b>
            ${dayEvents(key).slice(0,4).map(event=>`<div class="event"
              title="${escape(event.source)}">${escape(event.title)}</div>`).join("")}
            ${dayEvents(key).length>4?`<small>+${dayEvents(key).length-4} more</small>`:""}
          </div>`;
        }
        body+="</div>";
      }else{
        const today=new Date(cursor);today.setHours(0,0,0,0);
        const horizon=new Date(today);horizon.setDate(today.getDate()+30);
        const selected=events.filter(event=>{
          const date=asDate(event.starts_at);return date>=today&&date<horizon;
        });
        body=selected.map(event=>`<div class="agenda"><b>${escape(dayKey(event.starts_at))}</b>
          <span>${escape(event.title)}<small>${escape(event.source)}</small></span></div>`).join("")
          ||'<p>No upcoming events</p>';
      }
      this.shadowRoot.innerHTML=`<style>
        article{background:var(--ha-card-background,var(--card-background-color,#fff));
          border-radius:14px;padding:16px;color:var(--primary-text-color)}
        header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
        h2{flex:1;margin:0;font-size:1.25rem}
        button,select,input{font:inherit;padding:8px;border-radius:8px}
        button{border:0;background:var(--primary-color,#2979ff);color:white;cursor:pointer}
        .calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
        .weekday{text-align:center;padding:8px 0;font-size:.8rem}
        .day{border:1px solid var(--divider-color,#ddd);min-height:90px;
          padding:5px;min-width:0;border-radius:5px}
        .outside{opacity:.45}.event{background:var(--secondary-background-color,#eee);
          border-radius:4px;padding:3px;margin-top:3px;font-size:.76rem;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .agenda{display:flex;gap:15px;padding:10px 0;border-bottom:1px solid var(--divider-color,#ddd)}
        .agenda span{flex:1}.agenda small{display:block;opacity:.65}
        .error{color:var(--error-color,#c33)}
        form{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
        form input{min-width:0;flex:1}
        @media(max-width:600px){.day{min-height:58px;padding:2px}
          .event{font-size:.65rem}.weekday{font-size:.7rem}}
      </style><article>
        <header><h2>${escape(title)}</h2>
        <button id="prev" aria-label="Previous">‹</button>
        <button id="today">Today</button>
        <button id="next" aria-label="Next">›</button>
        <select id="view" aria-label="Calendar view">
          ${["month","week","agenda"].map(view=>`<option value="${view}"
            ${this.view===view?"selected":""}>${view}</option>`).join("")}
        </select><button id="refresh">Refresh</button></header>
        ${this.error?`<p class="error" role="alert">${escape(this.error)}</p>`:""}
        ${body}
        ${this.config?.read_only ? "" : `<form id="add">
          <input name="title" placeholder="New event" required>
          <input type="datetime-local" name="start" required>
          <input type="datetime-local" name="end" required>
          <button>Add event</button></form>`}
      </article>`;
      const root=this.shadowRoot;
      root.querySelector("#prev").onclick=()=>this.shift(-1);
      root.querySelector("#next").onclick=()=>this.shift(1);
      root.querySelector("#today").onclick=()=>{this.cursor=new Date();this.render();};
      root.querySelector("#refresh").onclick=()=>this.refresh();
      root.querySelector("#view").onchange=event=>{
        this.view=event.target.value;this.render();
      };
      if (!this.config?.read_only) root.querySelector("#add").onsubmit=async event=>{
        event.preventDefault();
        const form=event.target.elements;
        const start=new Date(form.start.value),end=new Date(form.end.value);
        if(end<=start){this.error="End must be after start";this.render();return;}
        try{
          await this._hass.callWS({type:"family_hub/add_event",title:form.title.value,
            starts_at:start.toISOString(),ends_at:end.toISOString()});
          await this.refresh();
        }catch(error){this.error=String(error.message||error);this.render();}
      };
    }
  }
  if(!customElements.get("family-hub-calendar-card"))
    customElements.define("family-hub-calendar-card",FamilyHubCalendarCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(card=>card.type==="family-hub-calendar-card"))
    window.customCards.push({type:"family-hub-calendar-card",
      name:"Family Hub Calendar",description:"Month, week and agenda family calendar"});
})();
