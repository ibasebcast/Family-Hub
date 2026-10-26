/** Personal room controls for configured Home Assistant entities. */
class FamilyHubRoomCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this.ha=null;this.data={};}
  setConfig(config){this.config=config;}
  set hass(value){if(!this.ha){this.ha=value;this.load();}else{this.ha=value;this.render();}}
  getCardSize(){return 4;}
  async load(){try{this.data=await this.ha.callWS({type:"family_hub/state"});}catch(error){this.data={};this.error=String(error.message||error);}this.render();}
  render(){
    this.shadowRoot.replaceChildren();
    const card=document.createElement("ha-card");card.header="Room controls";
    const body=document.createElement("div");body.style.padding="16px";
    if(this.error){const alert=document.createElement("p");alert.textContent=this.error;alert.setAttribute("role","alert");body.append(alert);}
    const member=this.data.members?.find(m=>m.id===this.config?.member_id)
      ||this.data.members?.[0];
    const ids=this.data.room_entities?.[member?.id]||[];
    for(const id of ids){
      const entity=this.ha?.states?.[id];if(!entity)continue;
      const row=document.createElement("div");row.style.padding="10px";
      const label=document.createElement("span");
      label.textContent=(entity.attributes.friendly_name||id)+" : "+entity.state+" ";
      row.append(label);
      const domain=id.split(".")[0];
      if(["light","switch","fan"].includes(domain)){
        const button=document.createElement("button");
        button.textContent=entity.state==="on"?"Turn off":"Turn on";
        button.onclick=()=>this.ha.callService(domain,
          entity.state==="on"?"turn_off":"turn_on",{entity_id:id});
        row.append(button);
      }
      body.append(row);
    }
    if(!ids.length&&!this.error)body.textContent="No room devices configured";
    card.append(body);this.shadowRoot.append(card);
  }
}
if(!customElements.get("family-hub-room-card"))
  customElements.define("family-hub-room-card",FamilyHubRoomCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"family-hub-room-card",name:"Family Hub Room",
  description:"Personal Home Assistant room devices"});
