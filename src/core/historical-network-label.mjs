// Local labels are aliases only at an explicit read-only input boundary.
// Never rewrite persisted event scopes or infer network identity from labels.
export function isLocalHistoricalNetwork(network){
 return network==="localnet"||network==="local_sim";
}
