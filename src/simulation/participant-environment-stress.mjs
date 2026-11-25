import {buildTerminalState} from "../inner-market/terminal-state.mjs";
import {buildParticipantStressInput} from "../inner-market/participant-stress-lab.mjs";
import {assessObservationFreshness} from "../inner-market/historical-risk.mjs";
import {analyzeMarketQuality} from "../core/market-quality-engine.mjs";
import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
import {runParticipantSimulation} from "./participant-simulator.mjs";
import {reviewParticipantObservationCoverage} from "./participant-observation-model.mjs";
import {stressParticipantObservation} from "./participant-observation-stress.mjs";
const isTrade=e=>["CURVE_BUY_EXECUTED","CURVE_SELL_EXECUTED"].includes(e.event_kind);
const good=s=>s==="REPORT_READY";
const output=(id,checks,observations)=>({case_id:id,passed:checks.every(c=>c.passed),checks,observations,execution_enabled:false});
const check=(id,passed)=>({id,passed:Boolean(passed)});
/** Fixed synthetic environment QA. No changes to participant decision rules,
 * no fitted distributions, future quotes, or market intervention.
 * The accounting fixture and generated event fixture are separate samples. */
export function runParticipantEnvironmentSuite({base,seeds=[701,702,703,704,705],steps=240}={}){
 if(base?.sourceMode!=="SYNTHETIC"||!Array.isArray(seeds)||!seeds.length||seeds.length>50||
 new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isSafeInteger(s))||
 !Number.isSafeInteger(steps)||steps<120||steps>1000)throw Error("INVALID_ENVIRONMENT_SUITE_CONFIG");
 const baseline=buildTerminalState(base);
 if(!good(baseline.status)||baseline.execution_enabled!==false)throw Error("INVALID_ENVIRONMENT_ACCOUNTING_FIXTURE");
 const cases=[];
 cases.push(output("BASELINE_ACCOUNTING",[check("historical_report_ready",good(baseline.status)),check("execution_disabled",baseline.execution_enabled===false)],{status:baseline.status}));
 // A missing real reserve is unknown, never zero or executable depth.
 const missing=structuredClone(base);delete missing.market.snapshot.realQuoteReservesBaseUnits;
 const missingState=buildTerminalState(missing);
 cases.push(output("RESERVE_EVIDENCE_MISSING",[
 check("review_required",missingState.status==="REVIEW_REQUIRED"),
 check("accounting_suppressed",Object.values(missingState.treasury).every(x=>x===null)),
 check("real_reserve_unknown",missingState.market_state.snapshot.real_quote_reserves_base_units===null),
 check("live_liquidity_not_assessed",missingState.risk.live_risk_assessed===false)
 ],{status:missingState.status,issues:missingState.issues}));
 // A supplied valuation shock does not imply that cash or trade receipts changed.
 const impairment=buildTerminalState(buildParticipantStressInput(base,"holder-impairment"));
 cases.push(output("HISTORICAL_VALUATION_IMPAIRMENT",[
 check("valid_accounting",good(impairment.status)),
 check("cash_unchanged",impairment.treasury.closing_cash_base_units===baseline.treasury.closing_cash_base_units),
 check("drawdown_increased",BigInt(impairment.treasury.max_observed_drawdown_bps)>BigInt(baseline.treasury.max_observed_drawdown_bps)),
 check("execution_disabled",impairment.execution_enabled===false)
 ],{status:impairment.status,drawdown_bps:impairment.treasury.max_observed_drawdown_bps}));
 const compound=buildParticipantStressInput(base,"holder-impairment");
 compound.market.historyComplete=false;compound.market.snapshot.reconciliation="UNKNOWN";
 const cs=buildTerminalState(compound);
 cases.push(output("COMPOUND_ACCOUNTING_AND_COVERAGE_STRESS",[
 check("review_required",cs.status==="REVIEW_REQUIRED"),check("risk_review_required",cs.risk.status==="REVIEW_REQUIRED"),
 check("no_settlement",cs.settlement_allowed===false),check("no_financial_metrics",Object.values(cs.treasury).every(x=>x===null))
 ],{status:cs.status,risk_status:cs.risk.status,issues:cs.issues}));
 const empty=analyzeMarketQuality({events:[],coverageStatus:"UNKNOWN"});
 cases.push(output("NO_EXECUTION_EVIDENCE",[
 check("no_executions",empty.status==="NO_EXECUTIONS"),check("metrics_unavailable",empty.metrics===null),
 check("no_fabricated_candles",empty.candles.length===0),check("not_a_signal",empty.is_trading_signal===false)
 ],{status:empty.status,coverage_attestation:"UNKNOWN"}));
 for(const seed of seeds){
  const report=runParticipantSimulation({scenarioId:"environment-qa-"+seed,seed,steps});
  const events=report.detector_input.events;
  if(!events.some(isTrade)||buildUnifiedSyntheticReview(report).status!=="INTERNALLY_CONSISTENT")throw Error("INVALID_GENERATED_ENVIRONMENT_FIXTURE");
  const end=events.at(-1).event_time_ms;
  const freshness=assessObservationFreshness({observedAtMs:end,nowMs:end+60000,maxAgeMs:5000});
  const unknown=assessObservationFreshness({observedAtMs:null,nowMs:end+60000,maxAgeMs:5000});
  cases.push(output("QUIET_OR_STALE_FEED:"+seed,[check("last_record_stale",freshness.status==="STALE"),
    check("missing_timestamp_unknown",unknown.status==="UNKNOWN")],{seed,last_observation_status:freshness.status,no_observation_status:unknown.status}));
  const profiles=report.agent_states.map(a=>({agent_id:a.agent_id,observation_latency_ms:5000,missing_record_bps:0}));
  const recovery=reviewParticipantObservationCoverage(report,{seed,profiles,checkpoints:[end,end+5000]});
  cases.push(output("DELAYED_FEED_RECOVERY:"+seed,[check("pending_at_close",recovery.observers.every(o=>o.samples[0].status==="DELAYED")),
    check("caught_up",recovery.observers.every(o=>o.samples[1].status==="MATCHED_TEST_ORACLE")),
    check("no_future_feedback",recovery.observation_feedback_to_behavior===false)],{seed,observer_count:recovery.observer_count}));
  const outage=reviewParticipantObservationCoverage(report,{seed,profiles:profiles.map(a=>({...a,missing_record_bps:10000})),checkpoints:[end+5000]});
  cases.push(output("TOTAL_OBSERVATION_OUTAGE:"+seed,[check("not_confused_with_no_market_activity",outage.observers.every(o=>o.samples[0].status==="INCOMPLETE"&&o.samples[0].received_record_count===0&&o.samples[0].missing_after_due_count===events.length)),
    check("age_unknown",outage.observers.every(o=>o.samples[0].latest_observed_event_age_ms===null))],{seed,observer_count:outage.observer_count}));
  const conflict=stressParticipantObservation(report,{seed,profile:"CONFLICTING_DUPLICATE"});
  cases.push(output("CONFLICT_ON_RECOVERY:"+seed,[check("conflicting_replay_rejected",conflict.status==="REVIEW_REQUIRED"&&conflict.normalized_event_count===null)],{seed,status:conflict.status,issues:conflict.issues}));
 }
 const passed=cases.filter(c=>c.passed).length;
 return {schema_version:"cook-participant-environment-suite.1",status:passed===cases.length?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",seeds:[...seeds],steps,
  case_count:cases.length,passed_count:passed,cases,oracle_test_only:true,real_market_validated:false,execution_enabled:false,
  limitation:"Fixed accounting perturbations and generated synthetic observation paths are separate fixtures. Staleness and outage do not establish low actual market activity; reserve fields do not establish executable depth."};
}
