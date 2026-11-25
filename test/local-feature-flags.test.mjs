import test from "node:test";
import assert from "node:assert/strict";
import {resolveLocalFeatureFlags} from "../src/core/local-feature-flags.mjs";
test("local capabilities default closed",()=>{
 assert.deepEqual(resolveLocalFeatureFlags({}),{faucet:false,transfer:false,trading:false});
});
test("enabling the faucet does not enable transfers or trading",()=>{
 assert.deepEqual(resolveLocalFeatureFlags({COOK_LOCAL_FAUCET:"1"}),{faucet:true,transfer:false,trading:false});
});
test("each local capability requires its own exact opt-in",()=>{
 assert.deepEqual(resolveLocalFeatureFlags({COOK_LOCAL_TRANSFER:"1"}),{faucet:false,transfer:true,trading:false});
 assert.deepEqual(resolveLocalFeatureFlags({COOK_LOCAL_TRADING:"1"}),{faucet:false,transfer:false,trading:true});
 assert.deepEqual(resolveLocalFeatureFlags({COOK_LOCAL_FAUCET:"true",COOK_LOCAL_TRANSFER:"yes",COOK_LOCAL_TRADING:"on"}),{faucet:false,transfer:false,trading:false});
});
