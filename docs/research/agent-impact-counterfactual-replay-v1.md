# Agent Impact Attribution & Counterfactual Replay — V1

- Status: Research specification
- Version: 0.1
- Scope: Offline multi-agent bonding-curve simulation
- Purpose: Attribute simulated market outcomes to participant classes while accounting for nonlinear curve interactions
- Related: multi-agent-inner-market-game-model-v1.md

## 1. Why event attribution is difficult

A bonding curve is nonlinear and path-dependent. The price impact of an execution depends on the curve state immediately before that execution. Therefore:

- the same notional can have different impact at different reserve states;
- changing event order changes intermediate prices and later execution prices;
- a participant's effect depends on which other participants are present;
- the last trade in a candle is not necessarily the main cause of the candle's total move.

Historical OHLCV alone cannot identify the causal contribution or intent of a particular participant. On-chain records support descriptive facts; causal attribution requires a counterfactual model with explicit assumptions.

## 2. Counterfactual replay

For a fixed scenario seed, preserve all exogenous inputs:

- initial curve state;
- agent traits and random streams;
- public information events;
- external reference-price paths;
- network congestion regime;
- program adapter version;
- fee and rounding configuration.

Run a baseline simulation with all modeled participant classes.

Then replay the same exogenous inputs while excluding one participant class or a defined event family. All remaining agents keep the same random streams and policy parameters. Their decisions may still differ because their observations and market states differ; this is part of the modeled interaction effect.

For participant class i and outcome metric m:

Impact_i(m,H) = m(Full,H) - m(Without_i,H)

For price return, use log returns:

Impact_i^price(H) =
ln(P_full,H / P_0) - ln(P_without_i,H / P_0)

This is a simulator-based counterfactual estimate, not proof that a real-world wallet caused a historical price move.

## 3. Outcome metrics

Do not attribute price alone. Compute participant-class effects on:

### Price and execution
- log return over multiple horizons;
- maximum adverse / favorable excursion;
- price-impact persistence;
- user execution slippage;
- event-order sensitivity.

### Volume and demand
- gross quote turnover;
- net token accumulation;
- net quote flow;
- buyer / seller effective breadth;
- gross-to-net divergence.

### Inventory and concentration
- holder HHI;
- effective holder count;
- cohort inventory changes;
- confirmed market sells;
- transfer volume, separately;
- potential overhang estimate and uncertainty.

### Curve and data integrity
- virtual and actual reserve changes;
- curve progress;
- supply reconciliation;
- event completeness;
- adapter replay error.

A participant class may increase gross volume while reducing independent-demand breadth, or may change short-horizon price while having little effect on longer-horizon price. The output must preserve these distinctions.

## 4. Interaction effects

The total market outcome is not generally the sum of independent participant contributions:

m(N) ≠ Σ_i Impact_i

For example, one class may create a price change that alters the behavior of another class. The combined effect includes interaction terms.

Use Shapley attribution for simulation analysis when the number of participant classes is manageable.

Let v(S) be an outcome metric when only participant classes in subset S are active, while exogenous inputs and random streams remain fixed.

The Shapley contribution of class i is:

φ_i(v) = Σ_{S ⊆ N\{i}} [ |S|! (|N|-|S|-1)! / |N|! ] × [v(S ∪ {i}) - v(S)]

Properties:
- contributions sum to the full modeled difference relative to the chosen baseline;
- interaction effects are shared across participating classes according to the Shapley allocation;
- results depend on the chosen participant classes, baseline, metric, and simulation assumptions.

For larger agent sets, estimate Shapley values with sampled participant-class permutations and report sampling error. Do not present an approximate value as exact.

## 5. Event-level versus class-level attribution

Use three levels:

1. **Event description:** exact confirmed execution facts, including signature, order, amount, fee, and execution price.
2. **Participant-class counterfactual:** difference between matched simulation runs with and without a class.
3. **Interaction attribution:** Shapley or other documented allocation of combined class effects.

Never infer a real wallet's intent from its event-level price impact. Never convert simulation ground truth into a real-world accusation.

## 6. Transaction-order counterfactuals

For a fixed set of simulated intents, compare controlled ordering regimes:

- observed / baseline event order;
- arrival-order replay;
- stochastic inclusion under congestion;
- priority-class replay.

Measure differences in:
- realized execution price;
- slippage relative to intent-time reference;
- price impact by event;
- short-horizon OHLCV;
- user-level execution outcomes.

This is an execution-quality study. Do not implement sandwich construction, victim selection, or exploit optimization.

## 7. Candle-level explanation

For each candle, produce a structured explanation:

- raw open / high / low / close;
- gross quote volume and token volume;
- event count;
- buyer and seller breadth;
- largest participant / evidence-cluster share;
- net token accumulation;
- reserve state at candle open and close;
- data completeness;
- simulated counterfactual effects, if the candle comes from a synthetic run.

For historical mainnet candles, do not display simulated causal estimates as if they were observed facts. A historical candle may receive descriptive integrity annotations, but counterfactual attribution must be explicitly labeled as a model estimate and must not imply verified intent.

## 8. Robustness and uncertainty

Run paired simulations across multiple seeds. Report:
- mean and median counterfactual effect;
- confidence interval;
- sensitivity to agent parameter distributions;
- sensitivity to event ordering;
- sensitivity to curve adapter version;
- uncertainty from missing or delayed observations.

Use held-out scenarios to validate whether the attribution method recovers known synthetic contributions.

If the sign of an estimated effect changes across reasonable assumptions, report the result as unstable rather than selecting the most dramatic estimate.

## 9. Acceptance criteria

- [ ] Counterfactual runs preserve the same exogenous seed inputs.
- [ ] The baseline and exclusion conditions are fully documented.
- [ ] Agent policies and market transition code are separate.
- [ ] Outcome metrics include price, volume, inventory, breadth, and execution quality.
- [ ] Interaction effects are not assumed to be additive.
- [ ] Shapley estimates include method, sampling error, and baseline definition.
- [ ] Historical chain facts remain separate from simulated causal estimates.
- [ ] No wallet intent or ownership claim is inferred from price impact alone.
- [ ] No live manipulation or transaction execution policy is produced.
