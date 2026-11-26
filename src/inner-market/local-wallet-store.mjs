import {generateKeyPairSync} from "node:crypto";
import {constants} from "node:fs";
import {Keypair} from "@solana/web3.js";
import {mkdir,readdir,lstat,open,unlink} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {publicKey} from "./local-faucet.mjs";
const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes){let n=BigInt("0x"+bytes.toString("hex")),s="";while(n){s=alphabet[Number(n%58n)]+s;n/=58n}let i=0;while(i<bytes.length&&bytes[i]===0)i++;return "1".repeat(i)+s}
/** Localnet wallet keyfiles; only address metadata crosses the HTTP boundary. */
export function createWalletStore({directory=join(homedir(),".cook-system","localnet-wallets")}={}){
 async function ready(){
  await mkdir(directory,{recursive:true,mode:0o700});const st=await lstat(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||(process.platform!=="win32"&&(st.mode&0o077)!==0))throw Error("WALLET_DIRECTORY_UNSAFE");
 }
 async function list(){
  await ready();const rows=[];
  for(const e of await readdir(directory,{withFileTypes:true})){
   if(!e.isFile()||!e.name.endsWith(".json"))continue;
   const address=e.name.slice(0,-5);try{publicKey(address)}catch{continue}
   const st=await lstat(join(directory,e.name));
   if(!st.isFile()||st.isSymbolicLink()||(process.platform!=="win32"&&(st.mode&0o077)!==0))continue;
   rows.push({address,created_at:st.mtime.toISOString()});
  }
  return rows.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.address.localeCompare(b.address));
 }
 let busy=false;
 async function createOne(){
   const pair=generateKeyPairSync("ed25519"),pub=pair.publicKey.export({format:"jwk"}),priv=pair.privateKey.export({format:"jwk"});
   const bytes=Buffer.from(pub.x,"base64url"),seed=Buffer.from(priv.d,"base64url");
   let file=null,path=null,complete=false;
   try{
    if(bytes.length!==32||seed.length!==32)throw Error("WALLET_KEY_INVALID");
    const address=base58(bytes);publicKey(address);
    path=join(directory,address+".json");file=await open(path,"wx",0o600);
    await file.writeFile(JSON.stringify([...seed,...bytes]));await file.sync();await file.close();complete=true;
    return {address};
   }finally{
    seed.fill(0);
    if(file&&!complete){try{await file.close()}catch{}try{await unlink(path)}catch{}}
   }
 }
 async function create(){
  if(busy)throw Error("WALLET_CREATE_BUSY");busy=true;
  try{await ready();return await createOne()}
  finally{busy=false}
 }
 // Local testing inventory only. No funding, project assignment or transaction submission.
 async function createBatch(count){
  if(!Number.isSafeInteger(count)||count<1)throw Error("INVALID_BODY");
  if(busy)throw Error("WALLET_CREATE_BUSY");busy=true;
  try{
   await ready();
   const created=[];
   try{for(let i=0;i<count;i++)created.push(await createOne())}
   catch{return {status:"PARTIAL",requested:count,created_count:created.length,wallets:created,code:"WALLET_CREATE_INCOMPLETE"}}
   return {status:"CREATED",requested:count,created_count:created.length,wallets:created};
  }finally{busy=false}
 }
 async function loadSigner(address){
  publicKey(address);await ready();
  const handle=await open(join(directory,address+".json"),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const st=await handle.stat();if(!st.isFile()||(process.platform!=="win32"&&(st.mode&0o077)!==0)||st.size>512)throw Error("WALLET_KEY_INVALID");
   const raw=JSON.parse(await handle.readFile("utf8"));
   if(!Array.isArray(raw)||raw.length!==64||raw.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error("WALLET_KEY_INVALID");
   const secret=Uint8Array.from(raw);raw.fill(0);
   try{const signer=Keypair.fromSeed(secret.subarray(0,32));if(!Buffer.from(signer.secretKey).equals(Buffer.from(secret))||signer.publicKey.toBase58()!==address)throw Error("WALLET_KEY_INVALID");return signer}finally{secret.fill(0)}
  }finally{await handle.close()}
 }
 async function exportKeys(addresses){
  if(!Array.isArray(addresses)||addresses.length<1||addresses.some(address=>typeof address!=="string"))throw Error("INVALID_BODY");
  const unique=[...new Set(addresses)];
  const wallets=[],missing=[];
  for(const address of unique){
   try{
    const signer=await loadSigner(address),secret=Array.from(signer.secretKey);
    signer.secretKey.fill(0);wallets.push({address,secret_key:secret});
   }catch(error){
    if(error?.code==="ENOENT"||error?.message==="ENOENT")missing.push(address);else throw error;
   }
  }
  return {requested:unique.length,wallets,missing};
 }
 function normalizedSecret(entry){
  const raw=Array.isArray(entry)?entry:entry&&typeof entry==="object"&&!Array.isArray(entry)?entry.secret_key??entry.secretKey:null;
  if(!Array.isArray(raw)||raw.length!==64||raw.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error("INVALID_KEYPAIR");
  const secret=Uint8Array.from(raw);
  try{
   const signer=Keypair.fromSeed(secret.subarray(0,32)),address=signer.publicKey.toBase58();
   if(!Buffer.from(signer.secretKey).equals(Buffer.from(secret)))throw Error("INVALID_KEYPAIR");
   if(entry&&!Array.isArray(entry)&&entry.address!==undefined&&entry.address!==address)throw Error("INVALID_KEYPAIR");
   return {address,raw:[...raw]};
  }catch(error){if(error?.message==="INVALID_KEYPAIR")throw error;throw Error("INVALID_KEYPAIR")}
  finally{secret.fill(0)}
 }
 async function importKeys(entries){
  if(!Array.isArray(entries)||entries.length<1)throw Error("INVALID_BODY");
  const normalized=entries.map(normalizedSecret),unique=[];
  for(const wallet of normalized)if(!unique.some(x=>x.address===wallet.address))unique.push(wallet);
  if(busy)throw Error("WALLET_CREATE_BUSY");busy=true;
  const written=[];
  try{
   await ready();const existing=new Set((await list()).map(wallet=>wallet.address)),toWrite=unique.filter(wallet=>!existing.has(wallet.address));
   try{
    for(const wallet of toWrite){const path=join(directory,wallet.address+".json"),file=await open(path,"wx",0o600);try{await file.writeFile(JSON.stringify(wallet.raw));await file.sync();written.push(path)}finally{await file.close()}}
   }catch(error){for(const path of written){try{await unlink(path)}catch{}}throw error}
   return {status:toWrite.length?"IMPORTED":"NOOP",requested:entries.length,imported:toWrite.map(wallet=>({address:wallet.address})),existing:unique.filter(wallet=>existing.has(wallet.address)).map(wallet=>({address:wallet.address}))};
  }finally{busy=false}
 }
 return {list,create,createBatch,loadSigner,exportKeys,importKeys};
}
