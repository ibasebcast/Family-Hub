/** Reward requests review and fulfillment. */
class FamilyHubRewardsQueueCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this.ha=null;this.data={};}
  setConfig(config){this.config=config;}
  set hass(value){if(!this.ha){this.ha=value;this.load();}else this.ha=value;}
  getCardSize(){return 4;}
  async load(){this.data=await this.ha.callWS({type:"family_hub/state"});this.render();}
  render(){
    this.shadowRoot.replaceChildren();
    const card=document.createElement("ha-card");card.header="Reward requests";
    const body=document.createElement("div");body.style.padding="16px";
    const requests=(this.data.redemptions||[]).filter(r=>
      r.status==="requested"||r.status==="approved");
    for(const request of requests){
      const reward=(this.data.rewards||[]).find(r=>r.id===request.reward_id);
      const member=(this.data.members||[]).find(m=>m.id===request.member_id);
      const row=document.createElement("div");row.style.padding="10px";
      const label=document.createElement("span");
      label.textContent=(member?.name||"Member")+" : "+(reward?.title||"Reward")+
        " ("+request.status+") ";
      row.append(label);
      const statuses=request.status==="requested"
        ?["approved","declined"]:["fulfilled","declined"];
      for(const status of statuses){
        const button=document.createElement("button");button.textContent=status;
        button.onclick=async()=>{
          await this.ha.callWS({type:"family_hub/review_redemption",
            redemption_id:request.id,status});
          await this.load();
        };
        row.append(button);
      }
      body.append(row);
    }
    if(!requests.length)body.textContent="No pending reward requests";
    card.append(body);this.shadowRoot.append(card);
  }
}
if(!customElements.get("family-hub-rewards-queue-card"))
  customElements.define("family-hub-rewards-queue-card",FamilyHubRewardsQueueCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"family-hub-rewards-queue-card",
  name:"Family Hub Reward Requests",description:"Approve and fulfill reward requests"});
