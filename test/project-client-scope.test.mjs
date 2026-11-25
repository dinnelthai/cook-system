import test from "node:test";
import assert from "node:assert/strict";
import {appendProjectCommand,getProject,listProjects,getProjectDirectory,listProjectArchive} from "../web/project-client.mjs";
const p=(id,revision)=>({project_id:id,revision,execution_policy:{mode:"DISABLED",enabled:false},source_attestation:"UNKNOWN"});
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
 response={status:"APPLIED",aggregate:p("p",2)};
 assert.equal((await appendProjectCommand("p",command,1)).aggregate.revision,2);
});

test("project directory and metadata fail closed on duplicate IDs, permission and attestation mismatches",async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 let response={projects:[p("p",1)],directory:{schema_version:"cook-project-directory.1",execution_enabled:false,project_count:1}};
 globalThis.fetch=async()=>({ok:true,json:async()=>response});
 assert.equal((await getProjectDirectory()).projects.length,1);
 response={...response,projects:[p("p",1),p("p",2)],directory:{...response.directory,project_count:2}};
 await assert.rejects(listProjects,/PROJECT_API_INVALID_RESPONSE/);
 await assert.rejects(getProjectDirectory,/PROJECT_API_INVALID_RESPONSE/);
 response={project:{...p("p",1),execution_policy:{mode:"DISABLED",enabled:true}}};
 await assert.rejects(()=>getProject("p"),/PROJECT_API_INVALID_RESPONSE/);
 response={project:{...p("p",1),source_attestation:"VERIFIED"}};
 await assert.rejects(()=>getProject("p"),/PROJECT_API_INVALID_RESPONSE/);
 response={records:[{project_id:"other"}],execution_enabled:false};
 await assert.rejects(()=>listProjectArchive("p"),/PROJECT_API_INVALID_RESPONSE/);
});
