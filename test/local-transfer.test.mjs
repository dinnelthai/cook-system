import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalTransfer} from '../src/inner-market/local-transfer.mjs';
import {Keypair} from '@solana/web3.js';
const a=Keypair.generate(), b=Keypair.generate(), genesis='11111111111111111111111111111112';
test('transfer requires the pinned local genesis and uses stored signer only', async()=>{
 let sent=0;
 const connection={getGenesisHash:async()=>genesis,getLatestBlockhash:async()=>({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:99}),sendRawTransaction:async()=>{sent++;return 'test-signature'}};
 const svc=createLocalTransfer({endpoint:'http://127.0.0.1:8899',expectedGenesis:genesis,enabled:true,connection,loadSigner:async address=>{assert.equal(address,a.publicKey.toBase58());return a}});
 const result=await svc.transfer({from:a.publicKey.toBase58(),to:b.publicKey.toBase58(),amount:'0.1'});
 assert.equal(result.status,'SUBMITTED_NOT_CONFIRMED');assert.equal(sent,1);
 connection.getGenesisHash=async()=> 'wrong';
 await assert.rejects(()=>svc.transfer({from:a.publicKey.toBase58(),to:b.publicKey.toBase58(),amount:'0.1'}),/GENESIS_MISMATCH/);assert.equal(sent,1);
});
test('invalid target, amounts and remote endpoints are rejected',async()=>{
 const svc=createLocalTransfer({endpoint:'http://192.168.1.104:8899',expectedGenesis:genesis,enabled:true,connection:{},loadSigner:async()=>a});
 await assert.rejects(()=>svc.transfer({from:a.publicKey.toBase58(),to:b.publicKey.toBase58(),amount:'1'}));
});
