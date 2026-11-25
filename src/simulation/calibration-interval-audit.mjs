// Shared declared-interval arithmetic; retain the original calibration limit and API.
import {auditDeclaredHistoricalIntervals} from "../core/declared-historical-intervals.mjs";
export {calibrationNetworkKey} from "../core/declared-historical-intervals.mjs";
export function auditCalibrationIntervals(scopes){return auditDeclaredHistoricalIntervals(scopes);}
