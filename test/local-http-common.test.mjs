import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {readRequestJson,sendJson} from "../src/inner-market/local-http-common.mjs";
test("shared body reader enforces byte limits and UTF-8 before parsing",async()=>{
 assert.equal(await readRequestJson(Readable.from([Buffer.from("界")]),3),"界");
 await assert.rejects(()=>readRequestJson(Readable.from([Buffer.from("界"),Buffer.from("a")]),3),/BODY_TOO_LARGE/);
 await assert.rejects(()=>readRequestJson(Readable.from([Buffer.from([0xff])]),3),/INVALID_BODY_ENCODING/);
});
test("shared response does not send headers before serialization succeeds",()=>{
 let headers=null,body=null;const res={writeHead:(status,fields)=>{headers={status,fields};},end:value=>{body=value;}};
 assert.throws(()=>sendJson(res,200,{invalid:1n}),TypeError);assert.equal(headers,null);
 sendJson(res,200,{ok:true});assert.equal(headers.status,200);assert.equal(headers.fields["Cache-Control"],"no-store");assert.deepEqual(JSON.parse(body),{ok:true});
});
