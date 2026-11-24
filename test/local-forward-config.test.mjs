import test from 'node:test';import assert from 'node:assert/strict';import {validateForwardConfig} from '../src/inner-market/local-forward-config.mjs';
const good={rpc:'http://192.168.1.104:8899',ws:'ws://192.168.1.104:8900',genesis:'11111111111111111111111111111112'};
test('forwarder requires literal private address, matching host and a non-public pinned genesis',()=>{
 assert.equal(validateForwardConfig(good).host,'192.168.1.104');
 for(const patch of [{rpc:'http://8.8.8.8:8899'},{rpc:'http://example.com:8899'},{ws:'ws://192.168.1.105:8900'},{rpc:'http://u:p@192.168.1.104:8899'},{genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'}])assert.throws(()=>validateForwardConfig({...good,...patch}));
});
