import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home page loads the application module from the permitted web directory', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  const src = html.match(/<script\s+type="module"\s+src="([^"]+)"/)[1];
  assert.equal(new URL(src, 'http://127.0.0.1:4173/').pathname, '/web/app.mjs');
  assert.equal(new URL(src, 'http://127.0.0.1:4173/web/index.html').pathname, '/web/app.mjs');
});

test('terminal never mounts unbound Pump Lab trading or market adapters', async () => {
  const app = await readFile(new URL('../web/app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /mountLocalTrading|mountLocalMarket|mountWalletSelector/);
  assert.match(app, /terminal-project-context/);
  assert.match(app, /Execution: DISABLED/);
  assert.match(app, /不会调用 Pump Lab 默认 Mint/);
});

test('Project Setup writes through the canonical Project API, not the legacy browser registry', async () => {
  const view = await readFile(new URL('../web/project-setup-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /createProject\(/);
  assert.match(view, /UPDATE_DRAFT_CONFIGURATION/);
  assert.match(view, /appendProjectCommand/);
  assert.doesNotMatch(view, /projectRegistry\.saveDraft/);
});

test('selected Project keeps unrelated report hidden and inert', async () => {
  const app = await readFile(new URL('../web/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /terminal-report-area/);
  assert.match(app, /hidden inert style="display:none"/);
  assert.match(app, /open-data"\)\.disabled=Boolean\(activeProjectId\)/);
  assert.match(app, /独立离线报告/);
});

test("Project terminal mounts a scoped retrospective order review only",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/terminal-order-review/);assert.match(app,/mountOrderReview\(orderArea/);
 assert.match(app,/activeProjectId===selected.project_id/);
 const view=await readFile(new URL("../web/order-review-view.mjs",import.meta.url),"utf8");
 assert.match(view,/own!==ticket/);assert.match(view,/source_attestation:"UNKNOWN"/);
 assert.doesNotMatch(view,/sendTransaction|signTransaction/);
});

test("project context does not silently show an independent review dashboard",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/dashboard-return-project/);
 assert.match(app,/dashboard-open-independent/);
 assert.match(app,/terminal-scoped-placeholder/);
 assert.match(app,/project-show-risk/);
});

test("operator workspace exposes declared budget and keeps raw order evidence secondary",async()=>{
 const setup=await readFile(new URL("../web/project-setup-view.mjs",import.meta.url),"utf8");
 assert.match(setup,/project-budget-form/);assert.match(setup,/SET_BUDGET_LIMITS/);
 const order=await readFile(new URL("../web/order-review-view.mjs",import.meta.url),"utf8");
 assert.match(order,/order-summary/);assert.match(order,/原始复核证据 JSON/);
});

test("single wallet route separates scoped historical assets from local wallet tools",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.equal((app.match(/else if\(page==={0,1}"wallet"\)/g)||[]).length,1);
 assert.match(app,/mountProjectAssets\(assetHost/);assert.match(app,/独立 Localnet 钱包工具/);
 const assets=await readFile(new URL("../web/project-assets-view.mjs",import.meta.url),"utf8");
 assert.match(assets,/selectProjectRuntimeInterval\(projectId,project.revision,v.runtime_context_id,archiveId\)/);
 assert.doesNotMatch(assets,/mountLocalFaucet|sendTransaction|signTransaction/);
});

test("scoped review is reachable and independent from report buffer",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/mountScopedProjectReview\(reviewHost/);assert.match(app,/renderGlobalContext\(/);
 const view=await readFile(new URL("../web/project-review-dashboard.mjs",import.meta.url),"utf8");
 assert.match(view,/selectProjectRuntimeInterval\(projectId,project.revision,v.runtime_context_id,id\)/);
 assert.doesNotMatch(view,/sendTransaction|signTransaction/);
});

test("project operator workspace retains only selection and provides review navigation",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/readProjectSelection\(contextStorage\)/);assert.match(app,/clear-missing-project/);
 assert.match(app,/projectStageStrip\(model.stage\)/);assert.match(app,/projectReviewTasks\(v.runtime\)/);assert.match(app,/riskEvidenceRows\(gr.findings,riskFilter.value\)/);
});

test("project report area is gated by linked archive digest, not identity alone",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/linkedReportMatches\(v,digest,data.scope\)/);
 assert.match(app,/terminal-settle"\)\.onclick=\(\)=>\{if\(activeProjectId\)return/);
});

test("operator workspace groups historical assets separately from evidence and task navigation",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/class="operator-workspace"/);assert.match(app,/class="operator-treasury"/);assert.match(app,/class="operator-sidebar"/);assert.match(app,/class="operator-risk-counts"/);
 assert.match(app,/projectIntervalMetrics\(row\)/);
});

test("secondary views preserve their task entry points in structured workspaces",async()=>{
 const setup=await readFile(new URL("../web/project-setup-view.mjs",import.meta.url),"utf8");
 assert.match(setup,/setup-workspace/);assert.match(setup,/project-draft-form/);assert.match(setup,/project-budget-form/);assert.match(setup,/issuance-evidence-form/);
 const assets=await readFile(new URL("../web/project-assets-view.mjs",import.meta.url),"utf8");assert.match(assets,/secondary-workspace/);
 const review=await readFile(new URL("../web/project-review-dashboard.mjs",import.meta.url),"utf8");assert.match(review,/review-kpis/);assert.match(review,/review-risk-summary/);
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");assert.match(app,/archive-workspace/);assert.match(app,/archive-evidence/);
});

test("experiment and diagnostics pages expose primary tasks and accessible empty tables",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.match(app,/lab-workspace/);assert.match(app,/settings-workspace/);assert.match(app,/table-empty/);assert.match(app,/scope="col"/);
 assert.match(app,/seedInput\.checkValidity\(\)/);assert.match(app,/runsInput\.checkValidity\(\)/);
});
