import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {loadSchemaRegistry} from "../src/core/json-schema-validator.mjs";
const root=join(dirname(fileURLToPath(import.meta.url)),"..","schemas");
try{
 const registry=await loadSchemaRegistry(root);
 for(const [name,schema] of registry)for(const ref of JSON.stringify(schema).matchAll(/"\$ref":"([^"]+)"/g))if(!registry.has(ref[1]))throw Error(name+" has unresolved ref "+ref[1]);
 console.log(JSON.stringify({status:"SCHEMA_REGISTRY_VALID",schema_count:registry.size,schemas:[...registry.keys()]},null,2));
}catch(error){console.error("Schema validation failed:",error.message);process.exitCode=1;}
