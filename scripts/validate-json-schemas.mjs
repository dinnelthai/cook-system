import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {loadSchemaRegistry,inspectSchemaContract} from "../src/core/json-schema-validator.mjs";
const root=join(dirname(fileURLToPath(import.meta.url)),"..","schemas");
try{
 const registry=await loadSchemaRegistry(root);
 for(const [name,schema] of registry){const result=inspectSchemaContract(schema,registry);if(!result.valid)throw Error(name+": "+JSON.stringify(result.errors));}
 console.log(JSON.stringify({status:"SCHEMA_REGISTRY_VALID",schema_count:registry.size,schemas:[...registry.keys()]},null,2));
}catch(error){console.error("Schema validation failed:",error.message);process.exitCode=1;}
