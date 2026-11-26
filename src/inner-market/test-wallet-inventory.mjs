import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
// Simulation identities only. IDs are deliberately not Solana addresses.
// This store has no private keys, signers, RPC clients or funding methods.
export function openTestWalletInventory({path=join(homedir(),".cook-system","test-wallet-inventory.sqlite")}={}){
 if(path!==":memory:")mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);
 db.exec("CREATE TABLE IF NOT EXISTS test_wallets (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL)");
 const insert=db.prepare("INSERT INTO test_wallets (id,created_at) VALUES (?,?)");
 const countRows=db.prepare("SELECT count(*) AS total FROM test_wallets");
 const recent=db.prepare("SELECT id,created_at FROM test_wallets ORDER BY seq DESC LIMIT ?");
 const list=()=>({total:countRows.get().total,wallets:recent.all(200),kind:"SIMULATION_ONLY"});
 function create(count){
  if(!Number.isSafeInteger(count)||count<1||count>100)throw Error("INVALID_BODY");
  db.exec("BEGIN IMMEDIATE");
  try{
   const wallets=[];for(let i=0;i<count;i++){const id="test-wallet-"+randomUUID(),created_at=new Date().toISOString();insert.run(id,created_at);wallets.push({id,created_at})}
   db.exec("COMMIT");return {status:"CREATED",requested:count,created_count:wallets.length,wallets,kind:"SIMULATION_ONLY"};
  }catch(error){db.exec("ROLLBACK");throw error}
 }
 return {create,list,close:()=>db.close()};
}
