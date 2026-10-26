/** Display a configured Home Assistant weather entity. */
class FamilyHubWeatherCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._hass=null;}
  setConfig(config){this.config=config;this.render();}
  set hass(value){this._hass=value;this.render();}
  getCardSize(){return 3;}
  render(){
    if(!this.shadowRoot)return;
    const entity=this._hass?.states?.[this.config?.entity];
    this.shadowRoot.replaceChildren();
    const card=document.createElement("ha-card");card.header="Weather";
    const content=document.createElement("div");content.style.padding="18px";
    if(!entity){content.textContent="Select a weather entity in card settings.";}
    else{
      const condition=document.createElement("h3");condition.textContent=entity.state;
      const temp=document.createElement("p");
      temp.textContent=String(entity.attributes.temperature??"")+
        " "+String(entity.attributes.temperature_unit??"");
      content.append(condition,temp);
      if(entity.attributes.humidity!=null){
        const humidity=document.createElement("p");
        humidity.textContent="Humidity: "+entity.attributes.humidity+"%";
        content.append(humidity);
      }
    }
    card.append(content);this.shadowRoot.append(card);
  }
}
if(!customElements.get("family-hub-weather-card"))
  customElements.define("family-hub-weather-card",FamilyHubWeatherCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"family-hub-weather-card",name:"Family Hub Weather",
  description:"Weather from a Home Assistant entity"});
