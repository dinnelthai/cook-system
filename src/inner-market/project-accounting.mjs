import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";

const CREDIT = new Set(["CAPITAL_IN", "TRADE_NET_RECEIPT", "CREATOR_FEE_RECEIVED", "OTHER_INCOME"]);
const DEBIT = new Set(["CAPITAL_OUT", "TRADE_CASH_COST", "ISSUANCE_EXPENSE", "OPERATING_EXPENSE", "FAILED_TX_EXPENSE", "OTHER_EXPENSE"]);
const EXPENSE = new Set(["ISSUANCE_EXPENSE", "OPERATING_EXPENSE", "FAILED_TX_EXPENSE", "OTHER_EXPENSE"]);
const amount = (value, name) => parseBaseUnits(value, { name, max: U128_MAX });
function signed(value, name) {
  if (typeof value !== "string" || !/^(0|-?[1-9][0-9]*)$/.test(value)) throw new TypeError(name + " must be a signed integer string");
  const negative=value.startsWith("-");
  const magnitude=amount(negative?value.slice(1):value,name);
  return negative?-magnitude:magnitude;
}

/**
 * Independent historical cash ledger for a single project and quote asset.
 * Inputs are finalized, externally reconciled accounting entries, not orders.
 * Trade cash amounts are net of attributable fees. Those fees must not
 * also be registered as project expenses. Opening balance includes opening capital.
 * Each entry ID refers to one economic posting, not necessarily one signature.
 */
export function reconcileProjectCash({
  projectId, quoteAsset, openingCashBaseUnits = "0", entries,
  observedClosingCashBaseUnits = null, historyComplete = false,
}) {
  if (typeof projectId !== "string" || !projectId.trim() ||
      typeof quoteAsset !== "string" || !quoteAsset.trim()) throw new TypeError("projectId and quoteAsset required");
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array");
  if (typeof historyComplete !== "boolean") throw new TypeError("historyComplete must be boolean");
  const opening = amount(openingCashBaseUnits, "opening cash");
  const totals = Object.fromEntries([...CREDIT, ...DEBIT].map(k => [k, 0n]));
  const seen = new Set(), orderedPostings=[];
  let pending = 0;
  let invalid = 0;
  for (const e of entries) {
    if (!e || typeof e.id !== "string" || !e.id.trim()) throw new TypeError("posting id required");
    if (seen.has(e.id)) throw new Error("duplicate cash posting: " + e.id);
    seen.add(e.id);
    if (e.projectId !== projectId || e.quoteAsset !== quoteAsset) throw new Error("posting scope mismatch");
    if (!CREDIT.has(e.kind) && !DEBIT.has(e.kind)) throw new TypeError("unsupported cash posting kind");
    if (e.status === "PENDING" || e.status === "FAILED") { pending += Number(e.status === "PENDING"); continue; }
    if (e.status !== "FINALIZED" || e.reconciliation !== "PASS") { invalid++; continue; }
    const n = amount(e.amountBaseUnits, "posting amount");
    if (n === 0n) throw new RangeError("posting amount must be positive");
    totals[e.kind] += n;
    orderedPostings.push({id:e.id,sequence:e.cashSequence,delta:CREDIT.has(e.kind)?n:-n});
  }
  const capitalNet = totals.CAPITAL_IN - totals.CAPITAL_OUT;
  const expense = [...EXPENSE].reduce((s,k) => s + totals[k], 0n);
  const otherIncome = totals.CREATOR_FEE_RECEIVED + totals.OTHER_INCOME;
  const operatingNet = totals.TRADE_NET_RECEIPT - totals.TRADE_CASH_COST + otherIncome - expense;
  const expected = opening + capitalNet + operatingNet;
  const observed = observedClosingCashBaseUnits === null ? null : amount(observedClosingCashBaseUnits, "observed closing cash");
  const flags = [];
  if (!historyComplete) flags.push("HISTORY_INCOMPLETE");
  if (invalid) flags.push("UNVERIFIED_POSTINGS");
  if (pending) flags.push("PENDING_POSTINGS");
  if (expected < 0n) flags.push("NEGATIVE_EXPECTED_CASH");
  if (observed === null) flags.push("CASH_SNAPSHOT_MISSING");
  else if (observed !== expected) flags.push("CASH_MISMATCH");
  // Legacy records lack a declared total cash-posting order. Never infer
  // historical order from input array position or unrelated trade sequences.
  let intermediate_balance_audit={status:"ORDER_UNAVAILABLE",checked_posting_count:0,first_negative_posting_id:null};
  if(orderedPostings.some(p=>p.sequence!==undefined)){
    const valid=orderedPostings.every(p=>Number.isSafeInteger(p.sequence)&&p.sequence>=0);
    const unique=new Set(orderedPostings.map(p=>p.sequence)).size===orderedPostings.length;
    if(orderedPostings.some(p=>p.sequence!==undefined&&(!Number.isSafeInteger(p.sequence)||p.sequence<0))||
       new Set(orderedPostings.filter(p=>p.sequence!==undefined).map(p=>p.sequence)).size!==orderedPostings.filter(p=>p.sequence!==undefined).length){
      flags.push("CASH_POSTING_ORDER_INVALID");intermediate_balance_audit.status="REVIEW_REQUIRED";
    }else if(valid&&unique&&historyComplete&&!pending&&!invalid){
      let running=opening,checked=0,firstNegative=null;
      for(const p of [...orderedPostings].sort((a,b)=>a.sequence-b.sequence)){
        running+=p.delta;checked++;
        if(running<0n&&firstNegative===null)firstNegative=p.id;
      }
      if(firstNegative!==null)flags.push("NEGATIVE_INTERMEDIATE_CASH");
      intermediate_balance_audit={status:firstNegative===null?"DECLARED_ORDER_REPLAY_MATCH":"REVIEW_REQUIRED",checked_posting_count:checked,first_negative_posting_id:firstNegative};
    }
  }
  const complete = flags.length === 0;
  return {
    project_id: projectId, quote_asset: quoteAsset,
    status: complete ? "RECONCILED" : "REVIEW_REQUIRED", flags,
    opening_cash_base_units: opening.toString(),
    capital_net_flow_base_units: capitalNet.toString(),
    operating_net_cash_flow_base_units: operatingNet.toString(),
    expected_closing_cash_base_units: expected.toString(),
    observed_closing_cash_base_units: observed?.toString() ?? null,
    cash_difference_base_units: observed === null ? null : (observed - expected).toString(),
    confirmed_postings_by_kind: Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v.toString()])),
    confirmed_expenses_base_units: expense.toString(),
    confirmed_nontrade_income_base_units: otherIncome.toString(),
    pending_count: pending, unverified_count: invalid, intermediate_balance_audit,
  };
}

/**
 * Cash-basis management report. No forecasts, execution or trading policy.
 * Trade realized PnL already accounts for acquisition and disposal costs.
 * Only separately recorded, non-trade expenses are deducted here.
 */
export function summarizeProjectRealizedPnl({ cashReport, tradeRealizedPnlBaseUnits = null, tradeHistoryComplete = false }) {
  if (!cashReport || !cashReport.confirmed_postings_by_kind) throw new TypeError("cash report required");
  if (typeof tradeHistoryComplete !== "boolean") throw new TypeError("tradeHistoryComplete must be boolean");
  const ready = cashReport.status === "RECONCILED" && tradeHistoryComplete && tradeRealizedPnlBaseUnits !== null;
  const trade = tradeRealizedPnlBaseUnits === null ? null : signed(tradeRealizedPnlBaseUnits, "trade realized PnL");
  const income = amount(cashReport.confirmed_nontrade_income_base_units, "nontrade income");
  const expense = amount(cashReport.confirmed_expenses_base_units, "expenses");
  return {
    project_id: cashReport.project_id, quote_asset: cashReport.quote_asset,
    status: ready ? "COMPLETE" : "INCOMPLETE",
    trade_realized_pnl_base_units: trade?.toString() ?? null,
    creator_fee_cash_received_base_units: cashReport.confirmed_postings_by_kind.CREATOR_FEE_RECEIVED,
    nontrade_cash_income_base_units: income.toString(),
    project_expenses_base_units: expense.toString(),
    project_realized_net_pnl_base_units: ready ? (trade + income - expense).toString() : null,
    note: "Cash-basis management accounting only. Capital flows and unrealized inventory values are excluded from realized profit."
  };
}
