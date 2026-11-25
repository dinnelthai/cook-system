import test from "node:test";
import assert from "node:assert/strict";
import {buildLocalServerEnvironment} from "../src/inner-market/local-server-env.mjs";
test("remote-localnet launcher keeps every money-moving capability disabled by default",()=>{
 const env=buildLocalServerEnvironment({PATH:"/usr/bin"},{port:4183});
 assert.equal(env.PORT,"4183");assert.equal(env.COOK_LOCAL_RPC_URL,"http://127.0.0.1:18899/");
 assert.equal(env.COOK_LOCAL_FAUCET,"0");assert.equal(env.COOK_LOCAL_TRANSFER,"0");assert.equal(env.COOK_LOCAL_TRADING,"0");
 assert.equal(env.PATH,"/usr/bin");
});
test("launcher forwards only independently and explicitly opted-in capabilities",()=>{
 const env=buildLocalServerEnvironment({COOK_LOCAL_FAUCET:"1",COOK_LOCAL_TRADING:"1"},{port:5000});
 assert.equal(env.COOK_LOCAL_FAUCET,"1");assert.equal(env.COOK_LOCAL_TRANSFER,"0");assert.equal(env.COOK_LOCAL_TRADING,"1");
});
test("launcher rejects non-loopback RPC targets and invalid ports",()=>{
 for(const rpcUrl of ["https://127.0.0.1:8899","http://192.168.1.10:8899","http://127.0.0.1:8899/?key=x"])assert.throws(()=>buildLocalServerEnvironment({}, {rpcUrl}),/INVALID_LOCAL_RPC_CONFIGURATION/);
 assert.throws(()=>buildLocalServerEnvironment({}, {port:0}),/INVALID_LOCAL_SERVER_PORT/);
});
