import test from "node:test";
import assert from "node:assert/strict";
import {mountWalletSelector} from "../web/local-faucet.mjs";
test("header wallet selector changes active wallet without depending on wallet-management DOM",async t=>{
 const previousFetch=globalThis.fetch,previousOption=globalThis.Option,previousStorage=globalThis.localStorage;
 let stored="",added=[];
 globalThis.localStorage={getItem:()=>stored,setItem:(_k,v)=>{stored=v}};
 globalThis.Option=class{constructor(label,value){this.label=label;this.value=value}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({wallets:[{address:"11111111111111111111111111111111"},{address:"11111111111111111111111111111112"}]})});
 t.after(()=>{globalThis.fetch=previousFetch;if(previousOption===undefined)delete globalThis.Option;else globalThis.Option=previousOption;if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
 const select={disabled:false,value:"",options:[],replaceChildren(){this.options=[]},add(option){this.options.push(option);added.push(option)}};
 const state={textContent:""},button={};
 const host={innerHTML:"",querySelector(selector){return selector==="select"?select:selector==="[data-state]"?state:button}};
 await mountWalletSelector(host,()=>{});
 assert.equal(select.options.length,2);assert.equal(select.value,"11111111111111111111111111111111");
 select.value="11111111111111111111111111111112";select.onchange();
 assert.equal(stored,"11111111111111111111111111111112");assert.equal(state.textContent,"当前钱包已切换");
 assert.equal(added.length,2);
});
