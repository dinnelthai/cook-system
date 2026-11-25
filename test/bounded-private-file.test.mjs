import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
test("bounded file read accepts empty and exact-limit regular files",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-bounded-"));
 try{const p=join(dir,"data");await writeFile(p,"");assert.equal((await readBoundedRegularFile(p,4)).length,0);
  await writeFile(p,"abcd");assert.equal((await readBoundedRegularFile(p,4)).toString(),"abcd");
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("bounded file read rejects oversized files, directories and invalid limits",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-bounded-"));
 try{const p=join(dir,"data");await writeFile(p,"abcde");await assert.rejects(()=>readBoundedRegularFile(p,4),/FILE_INVALID_OR_TOO_LARGE/);
  await assert.rejects(()=>readBoundedRegularFile(dir,4),/FILE_INVALID_OR_TOO_LARGE/);
  await assert.rejects(()=>readBoundedRegularFile(p,0),/INVALID_FILE_READ_INPUT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("bounded reader rejects leaf symbolic links",{skip:process.platform==="win32"},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-bounded-"));
 try{const p=join(dir,"data"),l=join(dir,"link");await writeFile(p,"safe");await symlink(p,l);
  await assert.rejects(()=>readBoundedRegularFile(l,4),/FILE_INVALID_OR_TOO_LARGE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
