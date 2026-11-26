import test from "node:test";
import assert from "node:assert/strict";
import {currentTerminalProject} from "../web/current-terminal-view.mjs";
import {readFile} from "node:fs/promises";
test("terminal projects expose current identity rather than historical accounting",()=>{const p={project_id:"p",profile:{name:"Example",symbol:"EX"},token:{mint:"m"},network:{cluster:"localnet"},lifecycle:{stage:"LAUNCHED"},historical:{pnl:"999"}};assert.deepEqual(currentTerminalProject(p),{project_id:"p",name:"Example",symbol:"EX",mint:"m",network:"localnet",stage:"LAUNCHED"});assert.equal(currentTerminalProject(null),null)});
test("launch wizard uses the existing draft form and does not add issuance execution",async()=>{const setup=await readFile(new URL("../web/project-setup-view.mjs",import.meta.url),"utf8");assert.ok(setup.includes('["Token","Socials","Wallet"]'));assert.ok(setup.includes("new FormData(event.currentTarget)"));assert.ok(setup.includes("if(terminalMode)mountLaunchSteps"));});
