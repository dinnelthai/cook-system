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
