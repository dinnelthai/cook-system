import {resolveLocalFeatureFlags} from "../core/local-feature-flags.mjs";
export function buildLocalServerEnvironment(env=process.env,{port=4183,rpcUrl="http://127.0.0.1:18899"}={}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("INVALID_LOCAL_SERVER_PORT");
 let rpc;try{rpc=new URL(rpcUrl)}catch{throw Error("INVALID_LOCAL_RPC_CONFIGURATION")}
 if(rpc.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(rpc.hostname)||rpc.username||rpc.password||rpc.pathname!=="/"||rpc.search||rpc.hash)throw Error("INVALID_LOCAL_RPC_CONFIGURATION");
 const flags=resolveLocalFeatureFlags(env);
 return {...env,PORT:String(port),COOK_LOCAL_RPC_URL:rpc.href,COOK_LOCAL_FAUCET:flags.faucet?"1":"0",COOK_LOCAL_TRANSFER:flags.transfer?"1":"0",COOK_LOCAL_TRADING:flags.trading?"1":"0"};
}
