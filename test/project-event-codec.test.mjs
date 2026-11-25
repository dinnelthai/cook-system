import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {canonicalJson} from "../src/core/canonical-json.mjs";
import {eventHash,decodeEvent} from "../src/inner-market/project-event-codec.mjs";
test("extracted event codec preserves v1 digest and ignores the stored hash field",()=>{
 const core={event_id:"e",project_id:"p",revision:1,event_type:"PROJECT_CREATED",occurred_at_ms:1,actor_id:"operator",source:"application",payload:{aggregate:{z:1,a:2}},request_digest:"digest",previous_hash:null};
 const expected=createHash("sha256").update(canonicalJson(core),"utf8").digest("hex");
 assert.equal(eventHash({...core,event_hash:"ignored"}),expected);
 const {payload,...row}=core;
 assert.deepEqual(decodeEvent({...row,payload_json:JSON.stringify(payload),event_hash:expected}),{...core,event_hash:expected});
 assert.throws(()=>decodeEvent({...row,payload_json:"{"}),/PROJECT_EVENT_PAYLOAD_CORRUPT/);
});
