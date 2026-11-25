import test from "node:test";
import assert from "node:assert/strict";
import {appendProjectCommand,getProject} from "../web/project-client.mjs";
test("project client rejects a mismatched response scope and stale acknowledgement",async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let response={status:"APPLIED",aggregate:{project_id:"other",revision:2}};
 globalThis.fetch=async()=>({ok:true,json:async()=>response});
 const command={command_id:"qa",type:"UPDATE_PROFILE",payload:{profile:{name:"QA"}}};
 await assert.rejects(()=>appendProjectCommand("p",command,1),/PROJECT_API_INVALID_RESPONSE/);
 response={status:"APPLIED",aggregate:{project_id:"p",revision:1}};
 await assert.rejects(()=>appendProjectCommand("p",command,1),/PROJECT_API_INVALID_RESPONSE/);
 response={project:{project_id:"other"}};
 await assert.rejects(()=>getProject("p"),/PROJECT_API_INVALID_RESPONSE/);
 response={status:"APPLIED",aggregate:{project_id:"p",revision:2}};
 assert.equal((await appendProjectCommand("p",command,1)).aggregate.revision,2);
});
