import {buildProjectFinancialCloseReview} from "./project-financial-close-review.mjs";
import {summarizeMathValidation} from "../simulation/math-validation-summary.mjs";
import {assessHistoricalCalibrationReadiness} from "../simulation/participant-calibration-readiness.mjs";
/** Joint offline mathematical QA report using canonical engines. No extra
 * quote or simulator engine. No predictions, policies or trading operations. */
export function buildMathReviewReport({financialInput,validationReport,historicalReports=[]}){
 const financial=buildProjectFinancialCloseReview(financialInput),validation=summarizeMathValidation(validationReport);
 const calibration=assessHistoricalCalibrationReadiness(historicalReports);
 const checks=[
  {id:"financial_identities",status:financial.mathematical_audit.status,counts:financial.mathematical_audit.counts},
  {id:"participant_regression",status:validation.status},
  {id:"declared_interval_coverage",status:calibration.interval_audit.status},
  {id:"historical_calibration",status:calibration.status}
 ];
 const conflict=financial.status==="REVIEW_REQUIRED"||financial.mathematical_audit.status==="REVIEW_REQUIRED"||
 validation.status!=="SYNTHETIC_REGRESSION_PASS"||calibration.interval_audit.status==="REVIEW_REQUIRED"||calibration.rows.some(r=>r.report_status==="REVIEW_REQUIRED");
 return {schema_version:"cook-math-review.1",status:conflict?"REVIEW_REQUIRED":"INTERNAL_CHECKS_COMPLETE_EXTERNAL_VALIDATION_PENDING",checks,
  financial:{scope:financial.scope,source_mode:financial.source_mode,status:financial.status,mathematical_audit:financial.mathematical_audit,nav_bridge:financial.nav_bridge},
  coverage:{financial_arithmetic:financial.mathematical_audit.status,synthetic_participant_regression:validation.status,
   historical_interval_coverage:calibration.interval_audit.status,empirical_calibration:"NOT_PERFORMED",
   independent_financial_parity:"NOT_VERIFIED",overall_model_validation:"NOT_ESTABLISHED"},
  validation,calibration,limitations:["No actual market behavioral calibration","No independent source authentication","No causal attribution from observed correlation","No protocol parity from simplified synthetic reserves"],
  real_market_validated:false,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false};
}
