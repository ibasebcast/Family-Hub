/** Family Hub backup management. Export and restore use authenticated HA APIs. */
(() => {
  class FamilyHubBackupCard extends HTMLElement {
    constructor(){super();this.attachShadow({mode:"open"});this._hass=null;this.message="";}
    setConfig(config){this.config=config;this.render();}
    set hass(value){this._hass=value;this.render();}
    getCardSize(){return 3;}
    async exportBackup(){
      try{
        const data=await this._hass.callWS({type:"family_hub/export"});
        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
        const url=URL.createObjectURL(blob);
        const link=document.createElement("a");
        link.href=url;
        link.download="family-hub-backup-"+new Date().toISOString().slice(0,10)+".json";
        link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        this.message="Backup exported";
      }catch(error){this.message=String(error.message||error);}
      this.render();
    }
    async restoreBackup(file){
      if(!file)return;
      try{
        const backup=JSON.parse(await file.text());
        const confirmed=window.confirm(
          "Replace all Family Hub household data with this backup? This cannot be undone."
        );
        if(!confirmed)return;
        await this._hass.callWS({
          type:"family_hub/import",backup,confirm_replace:true
        });
        this.message="Household backup restored";
      }catch(error){this.message=String(error.message||error);}
      this.render();
    }
    render(){
      if(!this.shadowRoot)return;
      const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
      this.shadowRoot.innerHTML=`<style>
        article{padding:18px;background:var(--ha-card-background,var(--card-background-color,#fff));
          border-radius:14px;color:var(--primary-text-color)}
        button{font:inherit;background:var(--primary-color,#2979ff);color:#fff;
          border:0;padding:10px;border-radius:8px;cursor:pointer}
        label{display:block;margin:12px 0}
        input{max-width:100%}p{color:var(--secondary-text-color)}
      </style><article><h2>Household backup</h2>
        <p>Export a complete household snapshot or restore a saved JSON backup.</p>
        <button id="export">Export backup</button>
        <label>Restore backup file <input id="restore" type="file"
          accept=".json,application/json"></label>
        <p role="status">${escape(this.message)}</p></article>`;
      this.shadowRoot.querySelector("#export").onclick=()=>this.exportBackup();
      this.shadowRoot.querySelector("#restore").onchange=event=>
        this.restoreBackup(event.target.files?.[0]);
    }
  }
  if(!customElements.get("family-hub-backup-card"))
    customElements.define("family-hub-backup-card",FamilyHubBackupCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(card=>card.type==="family-hub-backup-card"))
    window.customCards.push({type:"family-hub-backup-card",
      name:"Family Hub Backup",description:"Export and restore household data"});
})();
