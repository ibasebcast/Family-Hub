/** Family Hub chore approval queue with household member selection. */
(() => {
  const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  class FamilyHubApprovalsCard extends HTMLElement {
    constructor(){super();this.attachShadow({mode:"open"});this._hass=null;this.data={};this.error="";}
    setConfig(config){this.config=config;this.render();}
    set hass(value){const first=!this._hass;this._hass=value;if(first)this.refresh();}
    getCardSize(){return 4;}
    async refresh(){
      try{this.data=await this._hass.callWS({type:"family_hub/state"});this.error="";}
      catch(error){this.error=String(error.message||error);}
      this.render();
    }
    async review(completionId,approved){
      const approver=this.shadowRoot.querySelector("#approver")?.value;
      if(!approver){this.error="Choose an adult approver";this.render();return;}
      try{
        await this._hass.callWS({type:"family_hub/review_chore",
          completion_id:completionId,approver_id:approver,approved});
        await this.refresh();
      }catch(error){this.error=String(error.message||error);this.render();}
    }
    render(){
      if(!this.shadowRoot)return;
      const data=this.data||{};
      const adults=(data.members||[]).filter(member=>member.role==="adult");
      const pending=(data.completions||[]).filter(item=>item.status==="pending");
      const choreName=id=>(data.chores||[]).find(c=>c.id===id)?.title||"Unknown chore";
      const memberName=id=>(data.members||[]).find(m=>m.id===id)?.name||"Unknown member";
      this.shadowRoot.innerHTML=`<style>
        article{padding:18px;background:var(--ha-card-background,var(--card-background-color,#fff));
          border-radius:14px;color:var(--primary-text-color)}
        .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;
          border-bottom:1px solid var(--divider-color,#ddd)}
        .row span{flex:1;min-width:150px}.row small{display:block;opacity:.7}
        button,select{font:inherit;border-radius:8px;padding:8px}
        button{background:var(--primary-color,#2979ff);color:#fff;border:0;cursor:pointer}
        .error{color:var(--error-color,#c33)}
      </style><article><h2>Chore approvals</h2>
        ${this.error?`<p class="error" role="alert">${escape(this.error)}</p>`:""}
        <label>Approving adult <select id="approver">
          ${adults.map(member=>`<option value="${escape(member.id)}">
            ${escape(member.name)}</option>`).join("")}
        </select></label>
        ${pending.map(item=>`<div class="row"><span><strong>${escape(choreName(item.chore_id))}</strong>
          <small>${escape(memberName(item.member_id))} · ${escape(item.created_at)}</small>
          </span><button data-approve="${escape(item.id)}">Approve</button>
          <button data-reject="${escape(item.id)}">Reject</button></div>`).join("")}
        ${pending.length?"":"<p>No chores awaiting approval</p>"}
        <p><button id="refresh">Refresh</button></p></article>`;
      this.shadowRoot.querySelectorAll("[data-approve]").forEach(button=>{
        button.onclick=()=>this.review(button.dataset.approve,true);
      });
      this.shadowRoot.querySelectorAll("[data-reject]").forEach(button=>{
        button.onclick=()=>this.review(button.dataset.reject,false);
      });
      this.shadowRoot.querySelector("#refresh").onclick=()=>this.refresh();
    }
  }
  if(!customElements.get("family-hub-approvals-card"))
    customElements.define("family-hub-approvals-card",FamilyHubApprovalsCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(card=>card.type==="family-hub-approvals-card"))
    window.customCards.push({type:"family-hub-approvals-card",
      name:"Family Hub Approvals",description:"Review pending chore completions"});
})();
