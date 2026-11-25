/** Read-only presentation of the already computed historical audit.
 * No inference, wallet attribution, current-market estimate or trade controls. */
export function historicalReviewRows(state){
 return {
  alerts:state.risk.alerts.map(a=>[a.severity,a.label,a.reason]),
  checks:state.checks.map(c=>[c.id,c.status,c.evidence.map(e=>typeof e==="string"?e:JSON.stringify(e)).join(" / ")||"—"])
 };
}
