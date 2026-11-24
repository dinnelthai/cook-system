import {publicKey} from './local-faucet.mjs';
export function validateForwardConfig({rpc,ws,genesis}){
 let a,b;try{a=new URL(rpc);b=new URL(ws);publicKey(genesis)}catch{throw Error('INVALID_FORWARD_CONFIGURATION')}
 const parts=a.hostname.split('.').map(Number),privateIp=parts.length===4&&parts.every(x=>Number.isInteger(x)&&x>=0&&x<=255)&&(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168));
 if(!privateIp||a.protocol!=='http:'||b.protocol!=='ws:'||a.hostname!==b.hostname||!a.port||!b.port||a.username||a.password||b.username||b.password||a.pathname!=='/'||b.pathname!=='/'||a.search||b.search||a.hash||b.hash||/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/.test(genesis))throw Error('INVALID_FORWARD_CONFIGURATION');
 return {host:a.hostname,rpcPort:Number(a.port),wsPort:Number(b.port),rpcUrl:a.href,genesis};
}
