import {generateKeyPairSync} from "node:crypto";
import {mkdir,readdir,lstat,open} from "node:fs/promises";
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
 async function create(){
  if(busy)throw Error("WALLET_CREATE_BUSY");busy=true;
  try{
   await ready();if((await list()).length>=20)throw Error("WALLET_LIMIT");
   const pair=generateKeyPairSync("ed25519"),pub=pair.publicKey.export({format:"jwk"}),priv=pair.privateKey.export({format:"jwk"});
   const bytes=Buffer.from(pub.x,"base64url"),seed=Buffer.from(priv.d,"base64url");
   if(bytes.length!==32||seed.length!==32)throw Error("WALLET_KEY_INVALID");
   const address=base58(bytes);publicKey(address);
   const file=await open(join(directory,address+".json"),"wx",0o600);
   try{await file.writeFile(JSON.stringify([...seed,...bytes]));await file.sync()}finally{await file.close();seed.fill(0)}
   return {address};
  }finally{busy=false}
 }
 return {list,create};
}
