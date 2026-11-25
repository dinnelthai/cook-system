import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("right hand snapshot is project scoped and retains existing asset interval handler",async()=>{
 const a=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 for(const term of ["memeDesk.pending()","memeDesk.unavailable()","memeDesk.showReview(v,model,businessArea.querySelector", "v.project_id!==selected.project_id||v.project_revision!==selected.revision","intervalDetail=businessArea.querySelector","detail=intervalDetail","seq!==intervalTicket","!detail.isConnected","非当前余额","实时风险"])assert.ok(a.includes(term),term);
 assert.ok(a.includes('summary.hidden=!["assets","risk"].includes(tabState.value)'));
});
