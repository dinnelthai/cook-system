import { parseBaseUnits } from "../core/integer.mjs";

const BPS = 10_000n;

/** Budget inputs must all be denominated in the same quote asset and base-unit scale. */
export function calculateLaunchBudget({
  creationAndNetworkCostsBaseUnits = "0",
  treasuryReserveBaseUnits = "0",
  operatingReserveBaseUnits = "0",
  contingencyBps = "0",
}) {
  const creation = parseBaseUnits(creationAndNetworkCostsBaseUnits, { name: "creationAndNetworkCostsBaseUnits" });
  const treasury = parseBaseUnits(treasuryReserveBaseUnits, { name: "treasuryReserveBaseUnits" });
  const operating = parseBaseUnits(operatingReserveBaseUnits, { name: "operatingReserveBaseUnits" });
  const bps = parseBaseUnits(contingencyBps, { name: "contingencyBps", max: BPS });
  const subtotal = creation + treasury + operating;
  const contingency = subtotal === 0n ? 0n : (subtotal * bps + BPS - 1n) / BPS;
  return {
    creation_and_network_costs_base_units: creation.toString(),
    treasury_reserve_base_units: treasury.toString(),
    operating_reserve_base_units: operating.toString(),
    subtotal_base_units: subtotal.toString(),
    contingency_bps: bps.toString(),
    contingency_base_units: contingency.toString(),
    total_budget_base_units: (subtotal + contingency).toString(),
    note: "All components must use the same quote asset. This is a funding plan, not a target-market-cap buy budget.",
  };
}

/** Exact supply allocation; basis points must total 10,000. */
export function allocateTokenSupply(totalSupplyBaseUnits, categories) {
  const total = parseBaseUnits(totalSupplyBaseUnits, { name: "totalSupplyBaseUnits" });
  if (!Array.isArray(categories) || categories.length === 0) throw new TypeError("categories must be a non-empty array");
  const normalized = categories.map((category, index) => {
    if (!category || typeof category.name !== "string" || category.name.trim() === "") {
      throw new TypeError("category " + index + " requires a non-empty name");
    }
    return { name: category.name, bps: parseBaseUnits(category.bps, { name: "categories[" + index + "].bps", max: BPS }) };
  });
  const sum = normalized.reduce((acc, item) => acc + item.bps, 0n);
  if (sum !== BPS) throw new RangeError("category basis points must sum to 10000");
  let assigned = 0n;
  return normalized.map((item, index) => {
    const amount = index === normalized.length - 1 ? total - assigned : (total * item.bps) / BPS;
    assigned += amount;
    return { name: item.name, bps: item.bps.toString(), token_amount_base_units: amount.toString() };
  });
}