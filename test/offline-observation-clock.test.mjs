import test from "node:test";
import assert from "node:assert/strict";
import {createOfflineObservationClock} from "../src/simulation/offline-observation-clock.mjs";
test("discrete clock orders irregular arrivals and ties deterministically",()=>{
 const clock=createOfflineObservationClock();
 for(const [time,index] of [[70,0],[4,1],[4,2],[15,3],[0,4]])clock.schedule(time,index);
 assert.deepEqual(clock.advanceTo(0).map(x=>x.index),[4]);
 assert.deepEqual(clock.advanceTo(14).map(x=>x.index),[1,2]);
 assert.deepEqual(clock.advanceTo(14),[]);
 assert.equal(clock.status().pending_count,2);
 assert.deepEqual(clock.advanceTo(70).map(x=>x.index),[3,0]);
 assert.equal(clock.status().pending_count,0);
});
test("clock bounds, duplicate indices and past scheduling are rejected",()=>{
 const clock=createOfflineObservationClock({maxEvents:2});
 clock.schedule(5,0);assert.throws(()=>clock.schedule(6,0),/DUPLICATE/);
 clock.advanceTo(5);
 assert.throws(()=>clock.schedule(5,1),/PAST_EVENT/);
 assert.throws(()=>clock.advanceTo(4),/REWIND/);
 clock.schedule(6,1);assert.throws(()=>clock.schedule(7,2),/CAPACITY/);
 assert.equal(clock.advanceTo(6).length,1);
});
test("heap output agrees with stable chronological sort",()=>{
 const clock=createOfflineObservationClock(),items=Array.from({length:500},(_,index)=>({index,time:(index*7919)%113}));
 items.forEach(x=>clock.schedule(x.time,x.index));
 assert.deepEqual(clock.advanceTo(112).map(x=>x.index),[...items].sort((a,b)=>a.time-b.time||a.index-b.index).map(x=>x.index));
});
