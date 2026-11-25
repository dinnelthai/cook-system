import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalTransfer} from '../src/inner-market/local-transfer.mjs';
import {Keypair} from '@solana/web3.js';
const a=Keypair.generate(),b=Keypair.generate(),genesis='11111111111111111111111111111112';
const base=()=>({getGenesisHash:async()=>genesis,getLatestBlockhash:async()=>({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:99}),sendRawTransaction:async()=>'1'.repeat(64),getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'confirmed',confirmations:1}]}),getBlockHeight:async()=>1});
const make=(connection,extra={})=>createLocalTransfer({endpoint:'http://127.0.0.1:8899',expectedGenesis:genesis,enabled:true,connection,loadSigner:async address=>{assert.equal(address,a.publicKey.toBase58());return a},pollIntervalMs:0,...extra});
const args=()=>({from:a.publicKey.toBase58(),to:b.publicKey.toBase58(),amount:'0.1'});
test('transfer confirms the returned signature against the pinned local genesis',async()=>{
 let sent=0;const connection=base();connection.sendRawTransaction=async()=>{sent++;return '1'.repeat(64)};
 const result=await make(connection).transfer(args());
 assert.equal(result.status,'CONFIRMED');assert.equal(result.signature,'1'.repeat(64));assert.equal(sent,1);
 connection.getGenesisHash=async()=>'wrong';
 await assert.rejects(()=>make(connection).transfer(args()),/GENESIS_MISMATCH/);assert.equal(sent,1);
});
test('ambiguous submission and confirmation timeout return UNKNOWN, never a retry instruction',async()=>{
 const sendFailure=base();sendFailure.sendRawTransaction=async()=>{throw Error('connection dropped after submit')};
 const a1=await make(sendFailure).transfer(args());assert.equal(a1.status,'UNKNOWN');assert.equal(a1.reason,'SUBMISSION_OR_CONFIRMATION_UNCERTAIN');
 const timeout=base();timeout.getSignatureStatuses=async()=>({value:[null]});timeout.getBlockHeight=async()=>1;
 const a2=await make(timeout,{confirmationPolls:2}).transfer(args());assert.equal(a2.status,'UNKNOWN');assert.equal(a2.reason,'CONFIRMATION_TIMEOUT');
});
test('confirmed transaction error is FAILED and expired blockhash remains UNKNOWN',async()=>{
 const failed=base();failed.getSignatureStatuses=async()=>({value:[{err:{InstructionError:[0,'Custom']},confirmationStatus:'confirmed'}]});
 assert.equal((await make(failed).transfer(args())).status,'FAILED');
 const expired=base();expired.getSignatureStatuses=async()=>({value:[null]});expired.getBlockHeight=async()=>100;
 const result=await make(expired).transfer(args());assert.equal(result.status,'UNKNOWN');assert.equal(result.reason,'BLOCKHASH_EXPIRED');
});
test('invalid target, amounts, unsafe endpoints and invalid confirmation policy are rejected',async()=>{
 const svc=make(base());await assert.rejects(()=>svc.transfer({...args(),amount:'0'}));
 const remote=make(base(),{endpoint:'http://192.168.1.104:8899'});await assert.rejects(()=>remote.transfer(args()));
 assert.throws(()=>make(base(),{confirmationPolls:0}),/INVALID_CONFIRMATION_POLICY/);
});
