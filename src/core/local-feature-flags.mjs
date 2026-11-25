/** Separate local-only capabilities. Every capability is opt-in and defaults off. */
export function resolveLocalFeatureFlags(env=process.env){
 return Object.freeze({
  faucet:env.COOK_LOCAL_FAUCET==="1",
  transfer:env.COOK_LOCAL_TRANSFER==="1",
  trading:env.COOK_LOCAL_TRADING==="1"
 });
}
