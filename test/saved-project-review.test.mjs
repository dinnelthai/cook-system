import test from "node:test";
import assert from "node:assert/strict";
import {mountSavedProjectReview} from "../web/saved-project-review.mjs";
// Small DOM contract double: no actual browser or visual acceptance claimed.
function dom(){
 const doc={createElement:tag=>({tag,ownerDocument:doc,children:[],textContent:"",value:"",disabled:false,isConnected:true,append(el){this.children.push(el);},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;}})};
 const root=doc.createElement("div");const all=(el=root)=>[el,...el.children.flatMap(e=>all(e))];return {root,all};
}
const response=(q,extra)=>({revision:q.revision,digest:"d",...extra});
test("saved view isolates a fixed revision and ignores superseded project responses",async()=>{
 const {root,all}=dom();let resolveA;const calls=[];
 const query=async q=>{calls.push(q);if(q.kind==="projects")return response(q,{projects:[{key:"a",project_id:"A"},{key:"b",project_id:"B"}]});if(q.projectKey==="a")return new Promise(resolve=>{resolveA=resolve;});return response(q,{project:{key:"b"},records:[{key:"b-1",openingCutoff:"B start",closingCutoff:"B end"}]});};
 mountSavedProjectReview(root,{query,revision:4});
 await all().find(e=>e.tag==="button").onclick();
 const [p,r]=all().filter(e=>e.tag==="select");p.value="0";const first=p.onchange();p.value="1";await p.onchange();resolveA(response({revision:4},{project:{key:"a"},records:[{key:"a-1",openingCutoff:"A start"}]}));await first;
 assert.ok(r.children.some(e=>e.textContent.includes("B start")));assert.ok(!r.children.some(e=>e.textContent.includes("A start")));assert.ok(calls.every(q=>q.revision===4));
});
test("view without loaded revision issues no requests",()=>{
 const {root,all}=dom();let calls=0;mountSavedProjectReview(root,{revision:null,query:()=>{calls++;}});assert.equal(calls,0);assert.equal(all().filter(e=>e.tag==="button").length,0);
});
