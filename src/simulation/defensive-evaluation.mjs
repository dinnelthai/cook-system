import {analyzeMarketQuality} from "../core/market-quality-engine.mjs";
const market={chain_id:"solana",network:"synthetic",token_mint:"heldout-token",quote_mint:"synthetic-quote",curve_program_id:"synthetic-curve",market_phase:"bonding_curve"};
function makeEvent(seed,scenario,index,{actor=true,price="1",quality="valid"}={}){
 return {schema_version:"1.0.0",event_id:scenario+":"+seed+":"+index,provenance:"synthetic",event_kind:"CURVE_BUY_EXECUTED",
  market,event_time_ms:index+1,ordering:{event_sequence:index,ordering_confidence:"synthetic"},
  source:{source_type:"simulator",source_id:"heldout-defensive-eval.1"},
  payload:{...(actor?{actor_address:"wallet-"+index}:{}),signature:"sim-"+seed+"-"+index,token_amount_base_units:"100",
   quote_amount_base_units:"100",quote_mint:market.quote_mint,execution_price_decimal:price,fee_components:[]},
  quality:{is_complete:quality==="valid",validation_status:quality,warnings:quality==="valid"?[]:["INJECTED_TEST_WARNING"]},
  synthetic_metadata:{scenario_id:scenario+"-"+seed,random_seed:seed,generator_version:"defensive-eval.1"}};
}
function evaluateCase(seed,scenario,events,expectedType){
 const report=analyzeMarketQuality({events}),found=report.alerts.some(a=>a.alert_type===expectedType);
 return {scenario_id:scenario+"-"+seed,expected_alert:expectedType,detected:found,
  result:found?"TRUE_POSITIVE":"FALSE_NEGATIVE",alert_types:report.alerts.map(a=>a.alert_type),report_status:report.status};
}
/** Synthetic contract evaluation only. It is not a calibrated statistical benchmark. */
export function runHeldOutDefensiveEvaluation({seeds=[701,702,703,704,705]}={}){
 if(!Array.isArray(seeds)||!seeds.length||seeds.length>100||seeds.some(s=>!Number.isSafeInteger(s)||s<0)||new Set(seeds).size!==seeds.length)throw Error("INVALID_HELDOUT_SEEDS");
 const cases=[];
 for(const seed of seeds){
  const organic=[0,1,2,3,4].map(i=>makeEvent(seed,"organic-public-response",i,{price:["1","1.01","1.02","1.01","1.02"][i]}));
  const organicReport=analyzeMarketQuality({events:organic});
  cases.push({scenario_id:"organic-public-response-"+seed,expected_alert:null,
   detected:organicReport.alerts.some(a=>a.alert_type==="LOW_BREADTH_PRICE_SHOCK"),
   result:organicReport.alerts.some(a=>a.alert_type==="LOW_BREADTH_PRICE_SHOCK")?"FALSE_POSITIVE":"TRUE_NEGATIVE",
   alert_types:organicReport.alerts.map(a=>a.alert_type),report_status:organicReport.status});
  cases.push(evaluateCase(seed,"low-breadth-shock",[makeEvent(seed,"low-breadth-shock",0,{price:"1"}),makeEvent(seed,"low-breadth-shock",1,{price:"1.4"})],"LOW_BREADTH_PRICE_SHOCK"));
  cases.push(evaluateCase(seed,"data-quality-failure",[makeEvent(seed,"data-quality-failure",0,{quality:"warning"})],"CURVE_STATE_OR_DATA_MISMATCH"));
  cases.push(evaluateCase(seed,"unknown-attribution",[makeEvent(seed,"unknown-attribution",0,{actor:false})],"ATTRIBUTION_UNCERTAINTY"));
 }
 const categories=["LOW_BREADTH_PRICE_SHOCK","CURVE_STATE_OR_DATA_MISMATCH","ATTRIBUTION_UNCERTAINTY"],metrics={};
 for(const type of categories){
  const positive=cases.filter(c=>c.expected_alert===type),negative=cases.filter(c=>c.expected_alert!==type);
  const tp=positive.filter(c=>c.alert_types.includes(type)).length,fn=positive.length-tp;
  const fp=negative.filter(c=>c.alert_types.includes(type)).length,tn=negative.length-fp;
  metrics[type]={true_positive:tp,false_negative:fn,false_positive:fp,true_negative:tn,
   precision:tp+fp?tp/(tp+fp):null,recall:positive.length?tp/positive.length:null};
 }
 return {schema_version:"cook-heldout-defensive-evaluation.1",status:"SYNTHETIC_REGRESSION_ONLY",split:"HELD_OUT_SEEDS",
  seeds,case_count:cases.length,cases,metrics,template_count:4,independent_paths_claimed:false,real_market_accuracy_claimed:false,execution_enabled:false,
  limitation:"Synthetic rule-regression cases repeat four fixed templates with different seed labels. Repetitions are not independent market paths. Metrics do not estimate real-world precision, recall, calibration or causal validity."};
}
