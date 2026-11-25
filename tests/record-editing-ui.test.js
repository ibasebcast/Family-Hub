/** Regression tests for the actual management card editing workflow.
 * No test fixtures include real household names or other private information.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../custom_components/family_hub/www/family-hub-manage.js"),
  "utf8"
);

function createCard() {
  const elements = new Map();
  class FakeElement {
    attachShadow() {
      return this.shadowRoot = {
        innerHTML:"",
        querySelector: () => ({onclick:null,onsubmit:null,oninput:null,onchange:null}),
        querySelectorAll: () => [],
      };
    }
  }
  const context = {
    HTMLElement:FakeElement,
    window:{customCards:[],confirm:()=>true},
    customElements:{
      get:name=>elements.get(name),
      define:(name,klass)=>elements.set(name,klass),
    },
    Date,
  };
  vm.runInNewContext(source,context);
  const card = new (elements.get("family-hub-manage-card"))();
  return card;
}

function form(values, selections = {}, checks = {}) {
  return {elements:{
    namedItem(name) {
      if (Object.hasOwn(selections,name)) return {
        selectedOptions: selections[name].map(value=>({value}))
      };
      if (Object.hasOwn(checks,name)) return {checked:checks[name]};
      return {value:values[name] ?? "", selectedOptions:[]};
    },
  }};
}

test("management UI renders Edit/Delete controls and mobile-friendly navigation",()=>{
  const card=createCard();
  card.tab="chores";
  card.data={
    members:[{id:"member",name:"Generic Member",role:"child",color:"#123456"}],
    chores:[{id:"chore",title:"Generic task",points:10,
      recurrence:"daily",assignee_ids:["member"]}],
  };
  card.render();
  const html=card.shadowRoot.innerHTML;
  assert.match(html,/data-edit-id="chore"/);
  assert.match(html,/data-delete-id="chore"/);
  assert.match(html,/data-tab="organizer"/);
  assert.match(html,/data-tab="schedules"/);
  assert.match(html,/@media\(max-width:520px\)/);
  assert.doesNotMatch(html,/Uncaught error/);
});

test("edit flow sends persistent ID and selected changes to backend",async()=>{
  const card=createCard();
  const requests=[];
  const task={id:"chore",title:"Original task",points:10,recurrence:"daily",
    assignee_ids:["member"],description:"",approval_required:false};
  card.data={
    members:[{id:"member",name:"Generic Member",role:"child"}],
    chores:[task],
  };
  card._hass={callWS:async message=>{
    requests.push(message);
    if(message.type==="family_hub/state")return card.data;
    return {success:true};
  }};
  const editor=form({
    title:"Updated task",points:"25",recurrence:"weekly",
    description:"Carefully",rotation_days:"7",rotation_start:"2026-11-24"
  },{assignee_ids:["member"]},{approval_required:true,rotating:false});
  await card.saveEditor("chores","chore",editor);
  const msg=requests.find(x=>x.type==="family_hub/edit_record");
  assert.ok(msg);
  assert.equal(msg.collection,"chores");
  assert.equal(msg.record_id,"chore");
  assert.equal(msg.changes.title,"Updated task");
  assert.equal(msg.changes.points,25);
  assert.equal(msg.changes.recurrence,"weekly");
  assert.deepEqual(Array.from(msg.changes.assignee_ids),["member"]);
  assert.equal(msg.changes.approval_required,true);
  assert.equal(msg.changes.rotation_days,null);
  assert.equal(card.error,"");
});

test("routine editing retains stable step IDs",()=>{
  const card=createCard();
  const original={
    steps:[{id:"step-1",title:"First"},{id:"step-2",title:"Second"}],
  };
  const values={title:"Evening",steps:"Revised first\nSecond\nNew step"};
  const result=card.collectFields("routines",form(values,{
    member_ids:["generic-id"],
  }),original);
  assert.equal(result.steps[0].id,"step-1");
  assert.equal(result.steps[1].id,"step-2");
  assert.equal(result.steps[2].id,undefined);
  assert.deepEqual(Array.from(result.member_ids),["generic-id"]);
});

test("Google shared calendar appears as friendly selectable HA entity",()=>{
  const card=createCard();
  card.data={
    calendar_entities:["calendar.shared_family","calendar.missing"],
  };
  card._hass={
    states:{
      "calendar.shared_family":{attributes:{friendly_name:"Shared Family"}},
      "calendar.school":{attributes:{friendly_name:"School & Activities"}},
      "switch.not_calendar":{attributes:{friendly_name:"Not a calendar"}},
    },
    entities:{
      "calendar.shared_family":{platform:"google"},
      "calendar.school":{platform:"remote_calendar"},
    },
  };
  const html=card.calendarPicker();
  assert.match(html,/Shared Family/);
  assert.match(html,/Google Calendar/);
  assert.match(html,/School &amp; Activities/);
  assert.match(html,/Remote calendar/);
  assert.match(html,/calendar\.missing/);
  assert.match(html,/Not currently available/);
  assert.doesNotMatch(html,/switch\.not_calendar/);
  assert.equal((html.match(/checked/g)||[]).length,2);
  assert.match(html,/home-assistant.io\/integrations\/google/);
  assert.match(html,/Home Assistant Integrations/);
});

test("settings panel renders picker instead of free text calendar IDs",()=>{
  const card=createCard();
  card.tab="settings";
  card.data={calendar_entities:[],settings:{currency_name:"Points",display_user_ids:[]}};
  card._hass={states:{"calendar.one":{attributes:{friendly_name:"Shared calendar"}}}};
  card.render();
  assert.match(card.shadowRoot.innerHTML,/data-calendar-id="calendar.one"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML,/comma separated\).*Calendars/);
});


test("calendar settings persist selected Google calendar IDs through settings API",async()=>{
  const card=createCard();
  const sent=[];
  card._hass={
    states:{
      "calendar.shared_google":{attributes:{friendly_name:"Shared calendar"}},
      "calendar.local":{attributes:{friendly_name:"Local"}},
    },
    callWS:async message=>{
      sent.push(message);
      if(message.type==="family_hub/state")return card.data;
      return {};
    },
  };
  card.data={calendar_entities:[],settings:{currency_name:"Points",display_user_ids:[]}};
  card.tab="settings";
  let submitted;
  const fakeSettings={
    elements:{namedItem(name){
      return {value:{
        currency_name:"Points",display_user_ids:"",calendar_entities:""
      }[name]||""};
    }},
    querySelectorAll(selector){
      assert.equal(selector,"[data-calendar-id]:checked");
      return [
        {dataset:{calendarId:"calendar.shared_google"}},
        {dataset:{calendarId:"calendar.local"}},
      ];
    },
  };
  card.shadowRoot.querySelector=(selector)=>{
    if(selector==="#settings-form")return fakeSettings;
    return {onclick:null,onsubmit:null};
  };
  card.render();
  fakeSettings.onsubmit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  submitted=sent.find(item=>item.type==="family_hub/update_settings");
  assert.ok(submitted);
  assert.deepEqual(Array.from(submitted.calendar_entities),[
    "calendar.shared_google","calendar.local",
  ]);
});

test("delete confirmation protects records until explicitly accepted",async()=>{
  const card=createCard();
  const sent=[];
  card.data={rewards:[{id:"reward",title:"Generic reward",cost:5}]};
  card._hass={callWS:async message=>{sent.push(message);return card.data;}};
  card.render=()=>{};
  await card.deleteRecord("rewards","reward");
  assert.equal(sent[0].type,"family_hub/delete_record");
  assert.equal(sent[0].record_id,"reward");
});


test("removing a routine step never adopts the deleted step's identity",()=>{
  const card=createCard();
  const original={
    steps:[{id:"step-one",title:"First"},{id:"step-two",title:"Second"}],
  };
  const result=card.collectFields("routines",form({
    title:"Evening routine",steps:"Second"
  },{member_ids:["generic-id"]}),original);
  assert.equal(result.steps.length,1);
  assert.equal(result.steps[0].id,"step-two");
  assert.equal(result.steps[0].title,"Second");
});

test("reordering routine steps preserves their original completion identities",()=>{
  const card=createCard();
  const original={
    steps:[{id:"step-one",title:"First"},{id:"step-two",title:"Second"}],
  };
  const result=card.collectFields("routines",form({
    title:"Evening routine",steps:"Second\nFirst"
  },{member_ids:["generic-id"]}),original);
  assert.deepEqual(Array.from(result.steps,x=>x.id),["step-two","step-one"]);
});
