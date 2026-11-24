import { PublicKey, AccountInfo, Connection, TransactionInstruction } from '@solana/web3.js';
import { Buffer as Buffer$1 } from 'buffer';
import BN from 'bn.js';
import { TransferFeeConfig, RawAccount, RawMint } from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import { P as PumpAmm } from '../pump_amm-FTAU0jGh.mjs';

declare const PUMP_PROGRAM_ID: PublicKey;
declare const PUMP_AMM_PROGRAM_ID: PublicKey;
declare const PUMP_FEE_PROGRAM_ID: PublicKey;
declare const PUMP_MINT: PublicKey;
declare const CANONICAL_POOL_INDEX = 0;
declare function pumpPda(seeds: (Buffer$1 | Uint8Array)[]): PublicKey;
declare function pumpAmmPda(seeds: (Buffer$1 | Uint8Array)[]): PublicKey;
declare function pumpFeePda(seeds: (Buffer$1 | Uint8Array)[]): PublicKey;
declare const GLOBAL_CONFIG_PDA: PublicKey;
declare const PUMP_AMM_EVENT_AUTHORITY_PDA: PublicKey;
declare const GLOBAL_VOLUME_ACCUMULATOR_PDA: PublicKey;
declare const PUMP_AMM_FEE_CONFIG_PDA: PublicKey;
/** pump's `Global` (`["global"]`), passed to `multi_hop_swap` for its curve hops. */
declare const PUMP_GLOBAL_PDA: PublicKey;
declare const PUMP_EVENT_AUTHORITY_PDA: PublicKey;
/** pump-fees' `FeeConfig` for the pump program (the curves' fee schedule). */
declare const PUMP_FEE_CONFIG_PDA: PublicKey;
declare function poolPda(index: number, owner: PublicKey, baseMint: PublicKey, quoteMint: PublicKey): PublicKey;
declare function lpMintPda(pool: PublicKey): PublicKey;
declare function lpMintAta(lpMint: PublicKey, owner: PublicKey): PublicKey;
declare function pumpPoolAuthorityPda(mint: PublicKey): PublicKey;
/**
 * The pump holder-rewards PDA of `mint` (`["holder-rewards", mint]` under the pump program): the
 * `coinCreator` of a holder-reward coin's canonical pool (`Pool.isHolderReward`). Its coin-creator
 * vault (`coinCreatorVaultAtaPda(coinCreatorVaultAuthorityPda(holderRewardsPda(mint)), ...)`)
 * accrues the pool's creator fees; the pump program pays them out to holders.
 */
declare function holderRewardsPda(mint: PublicKey): PublicKey;
declare const MPL_TOKEN_METADATA_PROGRAM_ID: PublicKey;
/** The pump bonding curve of `mint` (`["bonding-curve", mint]` under the pump program). */
declare function bondingCurvePda(mint: PublicKey): PublicKey;
/**
 * The Metaplex token metadata of `mint` (`["metadata", token metadata program, mint]` under that
 * program). `set_coin_creator` reads a canonical pool's coin creator from it.
 */
declare function metadataPda(mint: PublicKey): PublicKey;
/**
 * The quote mint a canonical pump pool is keyed by, given a bonding curve's `quote_mint`: SOL
 * curves store the zero key, but the pool they graduate into is quoted in legacy WSOL.
 */
declare function canonicalPoolQuoteMint(bondingCurveQuoteMint: PublicKey): PublicKey;
/**
 * The canonical pump pool of `mint`. `quoteMint` may be the pool's quote mint or the bonding
 * curve's `quote_mint` (the zero key for SOL curves); both name the same pool.
 */
declare function canonicalPumpPoolPda(mint: PublicKey, quoteMint?: PublicKey): PublicKey;
declare function userVolumeAccumulatorPda(user: PublicKey): PublicKey;
declare function coinCreatorVaultAuthorityPda(coinCreator: PublicKey): PublicKey;
declare function coinCreatorVaultAtaPda(coinCreatorVaultAuthority: PublicKey, quoteMint: PublicKey, quoteTokenProgram: PublicKey): PublicKey;
/**
 * The pump-fees `SharingConfig` of `mint` (`["sharing-config", mint]` under the fee program). It is
 * the coin creator of a pool whose creator fees are shared.
 */
declare function feeSharingConfigPda(mint: PublicKey): PublicKey;
declare function poolV2Pda(baseMint: PublicKey): PublicKey;
declare function boostVaultAuthorityPda(pool: PublicKey): PublicKey;
declare function boostVaultAta(boostVaultAuthority: PublicKey, quoteMint: PublicKey, quoteTokenProgram: PublicKey): PublicKey;

/**
 * The Token-2022 transfer fee a quote mint charges this epoch. `null` is no fee: a legacy SPL
 * Token mint (WSOL, USDC) or a Token-2022 mint without `TransferFeeConfig`.
 *
 * Token-2022 withholds the fee from the *receiver* of every transfer. The programs gross up what
 * must land in a pool's quote vault (so the pool books exactly its share) and send every payout
 * as it is (so the receiver bears the fee); the schedule's fees stay basis points of the pool
 * amounts. Buy caps bind on the taxed debit, sell / withdraw floors on what lands.
 *
 * rust reference: pump-amm utils/transfer_fee.rs QuoteTransferFee, pump-mint-extensions TransferFee
 */
interface QuoteTransferFee {
    basisPoints: number;
    maximumFee: BN;
}
/** `quoteMint`'s `TransferFeeConfig`, or `null` when the mint is not Token-2022 or has none. */
declare function parseTransferFeeConfig(quoteMint: PublicKey, quoteMintAccountInfo: AccountInfo<Buffer>): TransferFeeConfig | null;
/** The schedule entry in force at `epoch` (the newer one once its epoch has arrived). */
declare function transferFeeAt(config: TransferFeeConfig, epoch: number | bigint): QuoteTransferFee;
/** What Token-2022 keeps back from the receiver when `amount` is sent (spl `calculate_fee`). */
declare function transferFeeOn(fee: QuoteTransferFee | null | undefined, amount: BN): BN;
/** What lands when `amount` is sent. */
declare function netOfTransferFee(fee: QuoteTransferFee | null | undefined, amount: BN): BN;
/**
 * The amount to send so that at least `net` lands (spl `calculate_pre_fee_amount`; at most one
 * unit more than needed, which stays in the receiving account).
 */
declare function grossForTransferFee(fee: QuoteTransferFee | null | undefined, net: BN): BN;

interface DepositBaseResult {
    /** What the deposit debits from the wallet: the pool's share grossed up for a quote transfer fee. */
    quote: BN;
    lpToken: BN;
    maxBase: BN;
    maxQuote: BN;
}
interface DepositQuoteAndLpTokenFromBaseResult {
    quote: BN;
    lpToken: BN;
}
interface DepositQuoteResult {
    base: BN;
    lpToken: BN;
    maxBase: BN;
    maxQuote: BN;
}
interface DepositBaseAndLpTokenFromQuoteResult {
    base: BN;
    lpToken: BN;
}
interface DepositResult {
    token1: BN;
    lpToken: BN;
    maxToken0: BN;
    maxToken1: BN;
}
interface DepositLpTokenResult {
    maxBase: BN;
    maxQuote: BN;
}
interface WithdrawResult {
    base: BN;
    quote: BN;
    minBase: BN;
    minQuote: BN;
}
interface WithdrawAutocompleteResult {
    base: BN;
    quote: BN;
}
interface BuyBaseInputResult {
    internalQuoteAmount: BN;
    /**
     * The total amount of quote tokens required to buy `base` tokens,
     * including LP fee and protocol fee.
     */
    uiQuote: BN;
    /**
     * The maximum quote tokens that you are willing to pay,
     * given the specified slippage tolerance.
     */
    maxQuote: BN;
}
interface BuyQuoteInputResult {
    /**
     * The amount of base tokens received after fees.
     */
    base: BN;
    internalQuoteWithoutFees: BN;
    /**
     * The maximum quote tokens that you are willing to pay,
     * given the specified slippage tolerance.
     */
    maxQuote: BN;
}
interface SellBaseInputResult {
    /**
     * The final amount of quote tokens the user receives (after subtracting LP and protocol fees).
     */
    uiQuote: BN;
    /**
     * The minimum quote tokens the user is willing to receive,
     * given their slippage tolerance.
     */
    minQuote: BN;
    internalQuoteAmountOut: BN;
}
interface SellQuoteInputResult {
    internalRawQuote: BN;
    base: BN;
    minQuote: BN;
}
interface Pool {
    poolBump: number;
    index: number;
    creator: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    lpMint: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    lpSupply: BN;
    coinCreator: PublicKey;
    isMayhemMode: boolean;
    isCashbackCoin: boolean;
    virtualQuoteReserves: BN;
    /**
     * Per-pool creator fee rate in basis points; 0 means "not configured" and trades pay the
     * pump-fees schedule's creator rate. Read only while `GlobalConfig.creatorFeeConfigurable` is
     * on. Carried over from the bonding curve at migration and changed afterwards only by a CTO
     * (pump `admin_cto` -> `admin_cto_pool`). Always 0 on accounts shorter than 270 bytes (written
     * before the field existed).
     */
    creatorFeeBps: BN;
    /**
     * Retired: nothing sets or reads it any more (the one-shot creator setter and the admin flip
     * that granted it were removed; a rate changes only through a CTO). Always false on accounts
     * the current program wrote.
     */
    canEditCreatorFee: boolean;
    /**
     * Whether the pool belongs to a holder-reward coin: its `coinCreator` is the coin's pump
     * holder-rewards PDA, so the creator fee of every trade accrues to that PDA's coin-creator
     * vault and is paid out to holders by the pump program. Set from the bonding curve at
     * migration or by a CTO; permanent once set. Always false on accounts shorter than 271 bytes
     * (written before the field existed).
     */
    isHolderReward: boolean;
    /**
     * Fees the v2 trades (`buy_v2`, `buy_exact_quote_in_v2`, `sell_v2`) left in the pool's quote
     * vault, paid out by `sweep_protocol_fee` / `sweep_creator_fee`: the protocol fee net of its
     * buyback slice (paid in the trade), and the coin-creator fee. Each accrual is also subtracted
     * from `virtualQuoteReserves`, so `vault balance + virtualQuoteReserves` still prices the pool,
     * but only `vault balance - protocolFees - creatorFees` is liquidity (what sells, deposits and
     * withdrawals draw on), and the boost sigma is `virtualQuoteReserves + protocolFees +
     * creatorFees`. Always 0 on accounts shorter than `POOL_SIZE` bytes.
     */
    protocolFees: BN;
    creatorFees: BN;
}
interface GlobalConfig {
    admin: PublicKey;
    lpFeeBasisPoints: BN;
    protocolFeeBasisPoints: BN;
    disableFlags: number;
    protocolFeeRecipients: PublicKey[];
    coinCreatorFeeBasisPoints: BN;
    adminSetCoinCreatorAuthority: PublicKey;
    whitelistPda: PublicKey;
    reservedFeeRecipient: PublicKey;
    mayhemModeEnabled: boolean;
    reservedFeeRecipients: PublicKey[];
    isCashbackEnabled: boolean;
    buybackFeeRecipients: PublicKey[];
    buybackBasisPoints: BN;
    boostAuthority: PublicKey;
    boostEnabled: boolean;
    /**
     * Feature gate for per-pool creator fees: while false, `Pool.creatorFeeBps` is neither
     * accepted by a CTO nor read by trades. False on accounts shorter than
     * `GLOBAL_CONFIG_SIZE` bytes.
     */
    creatorFeeConfigurable: boolean;
    /** Inclusive upper bound a CTO (`admin_cto_pool`) accepts; 0 on pre-upgrade accounts. */
    maxConfigurableCreatorFeeBps: BN;
}
interface GlobalVolumeAccumulator {
    startTime: BN;
    endTime: BN;
    secondsInADay: BN;
    mint: PublicKey;
    totalTokenSupply: BN[];
    solVolumes: BN[];
}
interface UserVolumeAccumulator {
    user: PublicKey;
    needsClaim: boolean;
    totalUnclaimedTokens: BN;
    totalClaimedTokens: BN;
    currentSolVolume: BN;
    lastUpdateTimestamp: BN;
}
interface SwapAccounts {
    pool: PublicKey;
    globalConfig: PublicKey;
    user: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    userBaseTokenAccount: PublicKey;
    userQuoteTokenAccount: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    protocolFeeRecipient: PublicKey;
    protocolFeeRecipientTokenAccount: PublicKey;
    buybackFeeRecipient: PublicKey;
    buybackFeeRecipientTokenAccount: PublicKey;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    systemProgram: PublicKey;
    associatedTokenProgram: PublicKey;
    eventAuthority: PublicKey;
    program: PublicKey;
    coinCreatorVaultAta: PublicKey;
    coinCreatorVaultAuthority: PublicKey;
}
interface LiquidityAccounts {
    pool: PublicKey;
    globalConfig: PublicKey;
    user: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    lpMint: PublicKey;
    userBaseTokenAccount: PublicKey;
    userQuoteTokenAccount: PublicKey;
    userPoolTokenAccount: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    tokenProgram: PublicKey;
    token2022Program: PublicKey;
    eventAuthority: PublicKey;
    program: PublicKey;
}
interface CommonSolanaState {
    poolKey: PublicKey;
    poolAccountInfo: AccountInfo<Buffer> | null;
    user: PublicKey;
}
interface CreatePoolSolanaState {
    index: number;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    creator: PublicKey;
    globalConfig: GlobalConfig;
    poolKey: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    userBaseTokenAccount: PublicKey;
    userQuoteTokenAccount: PublicKey;
    userBaseAccountInfo: AccountInfo<Buffer> | null;
    userQuoteAccountInfo: AccountInfo<Buffer> | null;
    poolBaseAccountInfo: AccountInfo<Buffer> | null;
    poolQuoteAccountInfo: AccountInfo<Buffer> | null;
}
interface SwapSolanaState {
    globalConfig: GlobalConfig;
    feeConfig: FeeConfig | null;
    poolKey: PublicKey;
    poolAccountInfo: AccountInfo<Buffer> | null;
    pool: Pool;
    poolBaseAmount: BN;
    poolQuoteAmount: BN;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    baseMint: PublicKey;
    baseMintAccount: RawMint;
    user: PublicKey;
    userBaseTokenAccount: PublicKey;
    userQuoteTokenAccount: PublicKey;
    userBaseAccountInfo: AccountInfo<Buffer> | null;
    userQuoteAccountInfo: AccountInfo<Buffer> | null;
    /**
     * The quote mint's Token-2022 transfer fee this epoch, `null` on an untaxed quote (WSOL, USDC,
     * a Token-2022 mint without `TransferFeeConfig`). The builders price buys on the taxed debit
     * and sells on what lands. Omitted (undefined) means untaxed.
     */
    quoteTransferFee?: QuoteTransferFee | null;
}
interface LiquiditySolanaState {
    globalConfig: GlobalConfig;
    poolKey: PublicKey;
    poolAccountInfo: AccountInfo<Buffer>;
    pool: Pool;
    poolBaseTokenAccount: RawAccount;
    poolQuoteTokenAccount: RawAccount;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    user: PublicKey;
    userBaseTokenAccount: PublicKey;
    userQuoteTokenAccount: PublicKey;
    userPoolTokenAccount: PublicKey;
    userBaseAccountInfo: AccountInfo<Buffer> | null;
    userQuoteAccountInfo: AccountInfo<Buffer> | null;
    userPoolAccountInfo: AccountInfo<Buffer> | null;
    /** As `SwapSolanaState.quoteTransferFee`: deposits are grossed up, withdrawals land less it. */
    quoteTransferFee?: QuoteTransferFee | null;
}
interface CollectCoinCreatorFeeSolanaState {
    coinCreator: PublicKey;
    quoteMint: PublicKey;
    quoteTokenProgram: PublicKey;
    coinCreatorVaultAuthority: PublicKey;
    coinCreatorVaultAta: PublicKey;
    coinCreatorTokenAccount: PublicKey;
    coinCreatorVaultAtaAccountInfo: AccountInfo<Buffer> | null;
    coinCreatorTokenAccountInfo: AccountInfo<Buffer> | null;
}
interface FeeConfig {
    admin: PublicKey;
    flatFees: Fees;
    feeTiers: FeeTier[];
    /**
     * Fee tiers for canonical pump pools quoted in a listed stable (USDC).
     * Empty on accounts written before the field existed (< FEE_CONFIG_SIZE_POST_STABLE bytes).
     */
    stableFeeTiers: FeeTier[];
    /**
     * Flat fees for canonical pump pools whose quote is neither SOL-like nor a listed stable.
     * All-zero means unset (the program then charges `flatFees`); always zero on accounts
     * shorter than FEE_CONFIG_SIZE_POST_EXOTIC bytes.
     */
    exoticFlatFees: Fees;
}
interface FeeTier {
    marketCapLamportsThreshold: BN;
    fees: Fees;
}
interface Fees {
    lpFeeBps: BN;
    protocolFeeBps: BN;
    creatorFeeBps: BN;
}

declare class PumpAmmAdminSdk {
    private readonly connection;
    private readonly program;
    constructor(connection: Connection);
    /**
     * Decoded through `PumpAmmSdk.decodeGlobalConfig`, which zero-pads shorter (pre-upgrade)
     * accounts: Anchor's own `fetch` throws on the live 940-byte account once the IDL carries the
     * creator-fee fields.
     */
    fetchGlobalConfigAccount(): Promise<GlobalConfig>;
    createConfig(lpFeeBasisPoints: BN, protocolFeeBasisPoints: BN, protocolFeeRecipients: PublicKey[], coinCreatorFeeBasisPoints: BN, admin: PublicKey, adminSetCoinCreatorAuthority: PublicKey): Promise<TransactionInstruction>;
    disable(disableCreatePool: boolean, disableDeposit: boolean, disableWithdraw: boolean, disableBuy: boolean, disableSell: boolean, admin: PublicKey): Promise<TransactionInstruction>;
    updateAdmin(admin: PublicKey, newAdmin: PublicKey): Promise<TransactionInstruction>;
    updateFeeConfig(lpFeeBasisPoints: BN, protocolFeeBasisPoints: BN, protocolFeeRecipients: PublicKey[], coinCreatorFeeBasisPoints: BN, admin: PublicKey, adminSetCoinCreatorAuthority: PublicKey): Promise<TransactionInstruction>;
    /**
     * Turns per-pool creator fees on or off and sets the ceiling a CTO (pump `admin_cto`, which
     * drives `admin_cto_pool`) accepts. Signed by `GlobalConfig.admin` (read from the account), who also pays the rent that
     * grows a pre-upgrade 940-byte GlobalConfig to `GLOBAL_CONFIG_SIZE` bytes, so it is the first
     * instruction to run after the program upgrade. While the gate is off, stored per-pool rates are
     * neither accepted by a CTO nor read by trades. The coin creator of a canonical pool changes only
     * through pump's `admin_cto`: pump-amm's `admin_cto_pool` accepts pump's pool-authority PDA as
     * its only caller, so this SDK has no builder for it.
     */
    updateCreatorFeeConfig(creatorFeeConfigurable: boolean, maxConfigurableCreatorFeeBps: BN): Promise<TransactionInstruction>;
    adminUpdateTokenIncentives(startTime: BN, endTime: BN, dayNumber: BN, tokenSupplyPerDay: BN, secondsInADay?: BN, mint?: PublicKey, tokenProgram?: PublicKey): Promise<TransactionInstruction>;
}

/** A canonical, non-mayhem pump pool hop of a `multi_hop_swap` route. */
interface MultiHopPoolVenue {
    kind: "pool";
    poolKey: PublicKey;
    pool: Pool;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
}
/**
 * A pump bonding-curve hop of a `multi_hop_swap` route, traded by pump through
 * `multi_hop_curve_swap`. Token-quoted and SOL curves alike: a SOL curve (quote mint the zero key
 * pump stores, or WSOL) is routed with the native mint and the curve's WSOL ATA in its group, and
 * can only be a route's user end (the first hop of a buy, the last of a sell), where pump moves
 * the user's SOL as lamports.
 */
interface MultiHopCurveVenue {
    kind: "curve";
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
}
type MultiHopVenue = MultiHopPoolVenue | MultiHopCurveVenue;
/**
 * The fee components one hop charges, from its place in the route (pump-amm `HopFees`). `lp` is
 * never set on a curve hop: a bonding curve has no LP fee.
 */
interface MultiHopLegFees {
    protocol: boolean;
    creator: boolean;
    lp: boolean;
}
interface MultiHopRoute {
    /** Every hop buys (walks a quote chain up) or every hop sells (walks it down). */
    isBuy: boolean;
    /** The running mint: `mints[0]` is the input, `mints[i + 1]` what hop `i` pays out. */
    mints: PublicKey[];
    legs: MultiHopLegFees[];
}
/**
 * Route lengths the programs' 32 KiB heap holds: up to six hops, but a six-hop route with four or
 * more pool hops runs out of memory.
 */
declare const MULTI_HOP_MAX_HOPS = 6;
/**
 * Walks `venues` from `inMint` and refuses what `multi_hop_swap` refuses before anything moves:
 * an empty route, a hop not trading the running mint (`MultiHopDiscontinuousPath`), a route
 * mixing buys and sells (`MultiHopMixedDirection`), a pool hop that is not a canonical,
 * non-mayhem pump pool (`OnlyPumpPools` / `MayhemPoolNotSupported`; v2 trades accept those,
 * routes do not), a cashback pool on a hop charging the creator fee
 * (`CashbackCoinNotSupported`), and a route longer than the programs' heap
 * holds (`MULTI_HOP_MAX_HOPS`).
 */
declare function resolveMultiHopRoute(inMint: PublicKey, venues: MultiHopVenue[]): MultiHopRoute;
/** A pool hop with the state `multiHopSwapQuote` prices it from. */
interface MultiHopPoolQuoteHop extends MultiHopPoolVenue {
    poolBaseAmount: BN;
    poolQuoteAmount: BN;
    baseMintSupply: BN;
    /**
     * The quote mint's Token-2022 transfer fee this epoch (`multiHopPoolHops` reads it). Only the
     * user's own currency can carry one: a buy hop prices what lands of its input, a sell hop pays
     * out what lands of the pool's payout.
     */
    quoteTransferFee?: QuoteTransferFee | null;
}
/**
 * A curve hop priced by the caller. `quote` must return the hop's output as pump's
 * `multi_hop_curve_swap` computes it: only the components `legs` names are charged (never an LP
 * fee), and a buy spends its whole input (a buy past the remaining supply completes the curve and
 * buys on from the pool-to-be). A full-fee v3 quote over-charges every hop that is not both legs,
 * so it under-quotes the route and loosens `minAmountOut`; for an exact figure on a route with
 * curves, simulate the built transaction. On a curve quoted in a Token-2022 transfer-fee mint,
 * `quote` must price what lands of `amountIn` on a buy and return what lands of the payout on a
 * sell (`netOfTransferFee`).
 */
interface MultiHopCurveQuoteHop extends MultiHopCurveVenue {
    quote: (amountIn: BN, hop: {
        isBuy: boolean;
        legs: MultiHopLegFees;
    }) => BN;
}
type MultiHopQuoteHop = MultiHopPoolQuoteHop | MultiHopCurveQuoteHop;
/**
 * The output of a `multi_hop_swap` route spending `amountIn` of `inMint`, hop by hop, and the
 * `minAmountOut` to build it with. Each hop is priced from its state before the route; a pool
 * traded twice in one route is not re-priced in between.
 */
declare function multiHopSwapQuote({ inMint, hops, amountIn, slippage, globalConfig, feeConfig, }: {
    inMint: PublicKey;
    hops: MultiHopQuoteHop[];
    amountIn: BN;
    slippage: number;
    globalConfig: GlobalConfig;
    feeConfig: FeeConfig | null;
}): {
    amountOut: BN;
    minAmountOut: BN;
    hopAmountsOut: BN[];
};

declare class OnlinePumpAmmSdk {
    readonly connection: Connection;
    private readonly program;
    constructor(connection: Connection);
    fetchGlobalConfigAccount(): Promise<GlobalConfig>;
    fetchFeeConfigAccount(): Promise<FeeConfig>;
    fetchPool(pool: PublicKey): Promise<Pool>;
    fetchGlobalVolumeAccumulator(): Promise<GlobalVolumeAccumulator>;
    fetchUserVolumeAccumulator(user: PublicKey): Promise<UserVolumeAccumulator | null>;
    createPoolSolanaState(index: number, creator: PublicKey, baseMint: PublicKey, quoteMint: PublicKey, userBaseTokenAccount?: PublicKey | undefined, userQuoteTokenAccount?: PublicKey | undefined): Promise<CreatePoolSolanaState>;
    swapSolanaState(poolKey: PublicKey, user: PublicKey, userBaseTokenAccount?: PublicKey | undefined, userQuoteTokenAccount?: PublicKey | undefined): Promise<SwapSolanaState>;
    swapSolanaStateNoPool(poolKey: PublicKey, user: PublicKey, userBaseTokenAccount?: PublicKey | undefined, userQuoteTokenAccount?: PublicKey | undefined): Promise<SwapSolanaState>;
    liquiditySolanaState(poolKey: PublicKey, user: PublicKey, userBaseTokenAccount?: PublicKey | undefined, userQuoteTokenAccount?: PublicKey | undefined, userPoolTokenAccount?: PublicKey | undefined): Promise<LiquiditySolanaState>;
    /**
     * The Token-2022 transfer fee `quoteMint` charges this epoch, or `null` (no RPC call unless
     * the mint carries `TransferFeeConfig`).
     */
    private quoteTransferFee;
    /**
     * The quote mint a creator vault is keyed by and the token program owning it. A bonding
     * curve's zero key (a SOL coin's `quote_mint`) is normalized to legacy WSOL, as
     * `canonicalPumpPoolPda` does. The program is `quoteTokenProgram` when given, SPL Token for
     * WSOL (no fetch), otherwise the mint account's owner, which must be SPL Token or Token-2022
     * (what the on-chain `quote_token_program` interface accepts), so an existing non-mint account
     * such as a wallet or the System Program can never be mistaken for a token program.
     */
    private resolveQuote;
    /**
     * Everything `PumpAmmSdk.collectCoinCreatorFee` needs to pay out the creator's AMM fees quoted
     * in `quoteMint` (WSOL by default; a bonding curve's zero key is accepted for SOL coins).
     * `quoteTokenProgram` is resolved from the mint when omitted. `coinCreatorTokenAccount`
     * defaults to the creator's ATA for the quote, the only destination the builder creates when
     * it is missing; any other destination must already exist.
     */
    collectCoinCreatorFeeSolanaState(coinCreator: PublicKey, coinCreatorTokenAccount?: PublicKey | undefined, quoteMint?: PublicKey, quoteTokenProgram?: PublicKey | undefined): Promise<CollectCoinCreatorFeeSolanaState>;
    /**
     * The creator's uncollected AMM fees quoted in `quoteMint` (WSOL by default; a bonding curve's
     * zero key is accepted for SOL coins): the balance of the creator vault ATA, or zero when it
     * does not exist. `quoteTokenProgram` is resolved from the mint when omitted.
     */
    getCoinCreatorVaultBalance(coinCreator: PublicKey, quoteMint?: PublicKey, quoteTokenProgram?: PublicKey | undefined): Promise<BN>;
    /**
     * The creator's uncollected AMM fees for every quote in `quotes`, keyed by the quote mint
     * (base58), in one account fetch per 100 quotes. Callers enumerating every quote mint a vault
     * may hold (the Global whitelist plus the QuoteControl list, plus WSOL) pass each mint with its
     * owner token program; a missing vault ATA reads as zero. Mints are used as given (no zero-key
     * normalization), so every entry lands under its own key.
     */
    getCoinCreatorVaultBalances(coinCreator: PublicKey, quotes: {
        mint: PublicKey;
        tokenProgram: PublicKey;
    }[]): Promise<Map<string, BN>>;
    /**
     * Token balance of a fetched vault ATA; zero when the account does not exist. `unpackAccount`
     * accepts the extension-bearing (170-182 byte) accounts Token-2022 quotes produce.
     */
    private vaultAtaBalance;
    /**
     * `PumpAmmSdk.transferCreatorFeesToPumpV2Instruction` with the quote token program resolved
     * from the mint account's owner; a bonding curve's zero key is accepted for SOL coins.
     */
    transferCreatorFeesToPumpV2Instruction(payer: PublicKey, coinCreator: PublicKey, quoteMint: PublicKey): Promise<TransactionInstruction>;
    /**
     * `PumpAmmSdk.setCoinCreator` for `poolKey`, with `metadata` and `bonding_curve` derived from
     * the pool's base mint (read with `decodePool`, so a pre-upgrade 261-byte pool works) and
     * preceded by `extend_account` (rent paid by `payer`) when the pool is shorter than
     * `POOL_ACCOUNT_NEW_SIZE`: the program writes the whole `Pool` back, which fails on an
     * un-grown account.
     */
    setCoinCreatorInstructions(poolKey: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]>;
    /**
     * `PumpAmmSdk.sweepCreatorFeeInstruction` for `poolKey`, with the pool and its quote token
     * program read from chain: what a CTO, a fee-sharing config creation or an `update_fee_shares`
     * for the pool's coin must carry before it, in the same transaction.
     */
    sweepCreatorFeeInstruction(poolKey: PublicKey, payer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Canonical pools as `multi_hop_swap` hops, in `poolKeys` order, with the state
     * `multiHopSwapQuote` prices them from (the pool, its mints' token programs, its vault balances,
     * the base mint supply) and the GlobalConfig / FeeConfig it needs. Two RPC round trips for any
     * route length; each hop is usable as a `PumpAmmSdk.multiHopSwapInstructions` venue as is.
     */
    multiHopPoolHops(poolKeys: PublicKey[]): Promise<{
        globalConfig: GlobalConfig;
        feeConfig: FeeConfig | null;
        hops: MultiHopPoolQuoteHop[];
    }>;
    boostBuyAndBurnInstruction(poolKey: PublicKey, authority: PublicKey, quoteAmountIn: BN, minBaseAmountBurned: BN): Promise<TransactionInstruction>;
    claimTokenIncentives(user: PublicKey, payer: PublicKey): Promise<TransactionInstruction[]>;
    getTotalUnclaimedTokens(user: PublicKey): Promise<BN>;
    getCurrentDayTokens(user: PublicKey): Promise<BN>;
}

declare const POOL_ACCOUNT_NEW_SIZE = 300;
/**
 * Serialized sizes of the current `Pool` and `GlobalConfig` layouts, discriminator included
 * (`Pool::SIZE`, `GlobalConfig::SIZE`). Older accounts are shorter (a pool is 211 / 243 / 244 /
 * 245 / 261 / 270 / 271 bytes, a GlobalConfig 907 / 940) and lack the trailing fields, which the
 * program's versioned readers return as 0 / false; `decodePool` and `decodeGlobalConfig` zero-pad
 * to these sizes so such accounts decode the same way. A pool grown by `extend_account` is
 * `POOL_ACCOUNT_NEW_SIZE`+ bytes and decodes unchanged.
 */
declare const POOL_SIZE = 287;
declare const GLOBAL_CONFIG_SIZE = 949;
/**
 * pump-fees `FeeConfig` account lengths, one per layout version. Every version is a prefix of
 * the next and the account length selects the version: a shorter account simply lacks the
 * trailing fields, which read as empty / zero (mirrors `FeeConfig::deserialize_versioned`).
 */
declare const FEE_CONFIG_SIZE_PRE_STABLE = 2512;
declare const FEE_CONFIG_SIZE_POST_STABLE = 4073;
declare const FEE_CONFIG_SIZE_POST_EXOTIC = 4097;
interface TradeOptions {
    /**
     * Build `buy_v2` / `sell_v2` instead of `buy` / `sell` when the pool `supportsTradeV2`; other
     * pools keep the v1 instruction. Same pricing and limits either way. Defaults to false.
     */
    v2?: boolean;
}
declare const OFFLINE_PUMP_AMM_PROGRAM: Program<PumpAmm>;
declare class PumpAmmSdk {
    private readonly offlineProgram;
    constructor();
    decodeGlobalConfig(globalConfigAccountInfo: AccountInfo<Buffer>): GlobalConfig;
    decodeFeeConfig(feeConfigAccountInfo: AccountInfo<Buffer>): FeeConfig;
    decodePool(poolAccountInfo: AccountInfo<Buffer>): Pool;
    decodePoolNullable(poolAccountInfo: AccountInfo<Buffer>): Pool | null;
    decodeGlobalVolumeAccumulator(globalVolumeAccumulatorAccountInfo: AccountInfo<Buffer>): GlobalVolumeAccumulator;
    decodeUserVolumeAccumulator(userVolumeAccumulatorAccountInfo: AccountInfo<Buffer>): UserVolumeAccumulator;
    decodeUserVolumeAccumulatorNullable(userVolumeAccumulatorAccountInfo: AccountInfo<Buffer>): UserVolumeAccumulator | null;
    /**
     * Builds `create_pool` (plus the pool ATA creates and wSOL wrapping it needs) for a
     * permissionless pool: `coin_creator` is the default key and `creator` is a wallet signer (a
     * canonical pump pool's creator is pump's pool-authority PDA, which signs only through pump's
     * `migrate` / `migrate_v2` CPI). `creatorFeeBps`, `canEditCreatorFee` and `isHolderReward` are
     * the instruction's three trailing arguments, always encoded (0 / false when unset), so
     * `create_pool` data is 10 bytes longer than before they existed; the program ignores trailing
     * bytes it does not read. The program stores the values for canonical pools only: a nonzero /
     * true `creatorFeeBps` / `canEditCreatorFee` on a permissionless pool fails with
     * `OnlyCanonicalPumpPoolsCanHaveCoinCreator`, and `isHolderReward` is stored as false on one.
     * The options exist to keep the encoding aligned with the IDL; canonical pools receive the
     * bonding curve's values from `migrate` / `migrate_v2`.
     */
    createPoolInstructions(createPoolSolanaState: CreatePoolSolanaState, baseIn: BN, quoteIn: BN, { creatorFeeBps, canEditCreatorFee, isHolderReward, }?: {
        creatorFeeBps?: BN;
        canEditCreatorFee?: boolean;
        isHolderReward?: boolean;
    }): Promise<TransactionInstruction[]>;
    depositInstructionsInternal(liquiditySolanaState: LiquiditySolanaState, lpToken: BN, maxBase: BN, maxQuote: BN): Promise<TransactionInstruction[]>;
    private withWsolAccounts;
    /**
     * Creates `ata` (the associated token account of `owner` for `mint` under `tokenProgram`) when
     * it does not exist yet; any mint and either token program.
     */
    private ensureAtaInstructions;
    /**
     * Runs `block` with the wSOL handling a legacy-WSOL leg needs: the user's wSOL ATA is created
     * when missing, funded with `amount` lamports and closed again afterwards to unwrap. For any
     * other mint `block` runs alone; that ATA holds the user's own tokens and is left as is.
     */
    private withWsolAccount;
    private accountExists;
    depositBaseInput(liquiditySolanaState: LiquiditySolanaState, base: BN, slippage: number): DepositBaseResult;
    depositQuoteInput(liquiditySolanaState: LiquiditySolanaState, quote: BN, slippage: number): DepositQuoteResult;
    withdrawInstructionsInternal(liquiditySolanaState: LiquiditySolanaState, lpTokenAmountIn: BN, minBaseAmountOut: BN, minQuoteAmountOut: BN): Promise<TransactionInstruction[]>;
    withdrawInputs(liquiditySolanaState: LiquiditySolanaState, lpAmount: BN, slippage: number): WithdrawResult;
    /**
     * The pool's quote liquidity: the vault balance less the fee buckets v2 trades left in it,
     * which deposits and withdrawals never touch (pump-amm `real_quote_reserves`).
     */
    private realQuoteReserves;
    private liquidityAccounts;
    buyInstructions(swapSolanaState: SwapSolanaState, baseOut: BN, maxQuoteIn: BN): Promise<TransactionInstruction[]>;
    buyInstructionsNoPool(swapSolanaState: SwapSolanaState, baseOut: BN, maxQuoteIn: BN): Promise<TransactionInstruction[]>;
    /** The buy instruction `swap` with its user-side setup: quote in, base out. */
    private withBuyAccounts;
    /**
     * The user-side setup around a swap instruction: a legacy-WSOL input is wrapped (`input.amount`
     * lamports; the account is closed again afterwards), the output account is created when it is
     * the user's ATA and `accountInfo` does not show it, and a legacy-WSOL output is closed to
     * unwrap. A custom (non-ATA) account is never created: it must already exist.
     */
    private withSwapUserAccounts;
    buyBaseInput(swapSolanaState: SwapSolanaState, base: BN, slippage: number, options?: TradeOptions): Promise<TransactionInstruction[]>;
    buyQuoteInput(swapSolanaState: SwapSolanaState, quote: BN, slippage: number, options?: TradeOptions): Promise<TransactionInstruction[]>;
    sellInstructions(swapSolanaState: SwapSolanaState, baseAmountIn: BN, minQuoteAmountOut: BN): Promise<TransactionInstruction[]>;
    private withFixPoolInstructions;
    sellInstructionsNoPool(swapSolanaState: SwapSolanaState, baseAmountIn: BN, minQuoteAmountOut: BN): Promise<TransactionInstruction[]>;
    /** The sell instruction `swap` with its user-side setup: base in, quote out. */
    private withSellAccounts;
    sellBaseInput(swapSolanaState: SwapSolanaState, base: BN, slippage: number, options?: TradeOptions): Promise<TransactionInstruction[]>;
    sellQuoteInput(swapSolanaState: SwapSolanaState, quote: BN, slippage: number, options?: TradeOptions): Promise<TransactionInstruction[]>;
    private routedBuyInstructions;
    private routedSellInstructions;
    extendAccount(account: PublicKey, user: PublicKey): Promise<TransactionInstruction>;
    boostBuyAndBurnInstruction(poolKey: PublicKey, pool: Pool, authority: PublicKey, quoteAmountIn: BN, minBaseAmountBurned: BN, baseTokenProgram: PublicKey, quoteTokenProgram: PublicKey): Promise<TransactionInstruction>;
    /**
     * Moves the creator's accumulated AMM fees, quoted in the state's `quoteMint`, from the creator
     * vault ATA to `coinCreatorTokenAccount`. The program transfers between two existing token
     * accounts and creates neither, so the vault ATA and, when it is the destination, the creator's
     * ATA are created here (rent paid by `payer`) when missing, under the quote mint's token
     * program. The program accepts any token account the creator owns as the destination, but
     * only an ATA can be created idempotently, so a custom `coinCreatorTokenAccount` must already
     * exist (an error is thrown otherwise). A wSOL payout is unwrapped by closing the creator's
     * ATA, but only when the creator pays for the transaction themselves.
     */
    collectCoinCreatorFee(collectCoinCreatorFeeSolanaState: CollectCoinCreatorFeeSolanaState, payer?: PublicKey | undefined): Promise<TransactionInstruction[]>;
    /**
     * Moves a coin creator's accumulated AMM fees, quoted in `quoteMint`, into their pump creator
     * vault (the `creator-vault` PDA of the pump program), for coins whose creator fees are paid
     * out through that vault. The program unwraps a wSOL vault into the PDA itself and moves any
     * other quote into the PDA's quote ATA, which it creates (rent paid by `payer`) when missing;
     * `pump_creator_vault_ata` is part of the account list even for wSOL. `quoteTokenProgram`
     * must be the quote mint's owner program, SPL Token or Token-2022; every quote-side ATA is
     * derived under it.
     */
    transferCreatorFeesToPumpV2Instruction({ payer, coinCreator, quoteMint, quoteTokenProgram, }: {
        payer: PublicKey;
        coinCreator: PublicKey;
        quoteMint: PublicKey;
        quoteTokenProgram: PublicKey;
    }): Promise<TransactionInstruction>;
    /**
     * Builds `set_coin_creator`, the permissionless instruction that fills in a canonical pool's
     * coin creator from the base mint's Metaplex metadata (its first creator) or, when the metadata
     * lists none, from the bonding curve's creator; a no-op once the pool has one. With `baseMint`
     * the `metadata` and `bonding_curve` accounts are derived here (`metadataPda`,
     * `bondingCurvePda`). Without it they are left to Anchor's account resolver, which reads the
     * pool through the provider's connection (the offline program has none) and, with this IDL,
     * cannot decode a pre-upgrade 261-byte pool, so pass `baseMint` or use
     * `OnlinePumpAmmSdk.setCoinCreatorInstructions`. The program writes the whole `Pool` back, so a
     * pre-upgrade pool must be grown by `extend_account` first.
     */
    setCoinCreator(pool: PublicKey, baseMint?: PublicKey): Promise<TransactionInstruction>;
    /**
     * `buy_v2`: buys exactly `baseOut` for at most `maxQuoteIn` (fees included) on a pool
     * `supportsTradeV2` accepts, with the same user-side accounts as `buyInstructions`. The protocol
     * and coin-creator fees stay in the pool's quote vault (`Pool.protocolFees` /
     * `Pool.creatorFees`, paid out by the sweeps); only the buyback slice of the protocol fee is paid
     * in the trade (none on a mayhem pool), to a listed buyback fee recipient's quote ATA, which
     * must already exist (v2 never creates it, and checks it even when the slice is 0). No
     * `extend_account` is prepended: the program grows a pre-upgrade pool itself.
     */
    buyV2Instructions(swapSolanaState: SwapSolanaState, baseOut: BN, maxQuoteIn: BN): Promise<TransactionInstruction[]>;
    /**
     * `buy_exact_quote_in_v2`: spends at most `spendableQuoteIn` (fees included) for at least
     * `minBaseOut`, which must be nonzero. Accounts and fee handling as `buyV2Instructions`.
     */
    buyExactQuoteInV2Instructions(swapSolanaState: SwapSolanaState, spendableQuoteIn: BN, minBaseOut: BN): Promise<TransactionInstruction[]>;
    /**
     * `sell_v2`: sells exactly `baseIn` for at least `minQuoteOut` (fees deducted), with the same
     * user-side accounts as `sellInstructions`. Fee handling as `buyV2Instructions`; the buyback
     * slice leaves the pool vault.
     */
    sellV2Instructions(swapSolanaState: SwapSolanaState, baseIn: BN, minQuoteOut: BN): Promise<TransactionInstruction[]>;
    /**
     * `multi_hop_swap`: spends exactly `amountIn` of `inMint` along `venues` (canonical, non-mayhem
     * pump pools and pump bonding curves, every hop buying or every hop selling) and pays at
     * least `minAmountOut` of the final mint into the user's account (`multiHopSwapQuote` prices
     * it). The route is checked as the program checks it before anything is built
     * (`resolveMultiHopRoute`).
     *
     * `buybackFeeRecipient` is the buyback recipient *wallet* the route's protocol leg (first hop of
     * a buy route, last of a sell route) pays the buyback slice to, through its ATA for that hop's
     * quote mint, which must exist. It must be listed by the venue holding the leg: a pool leg
     * defaults to a `globalConfig.buybackFeeRecipients` entry (picked at random, as the v1 and v2
     * trades do, so every listed recipient needs that ATA); a curve leg checks pump's
     * `Global.buybackFeeRecipients`, which this SDK does not read, so it must be passed.
     *
     * The user's token accounts default to their ATAs; a custom account must exist. A legacy-WSOL
     * input is wrapped (and the account closed afterwards), except on a buy starting on a SOL
     * bonding curve: pump takes `amountIn` from the wallet as lamports, so the user's WSOL ATA is
     * only created when missing (it must exist) and the wallet needs `amountIn` plus rent in SOL.
     * A sell ending on a SOL curve pays into the user's WSOL ATA, which is likewise created and then
     * closed to unwrap. On a SOL protocol leg the buyback slice goes to the recipient's WSOL ATA. the output ATA is created when
     * `userOutAccountInfo` does not show it, and a legacy-WSOL output is closed to unwrap. No
     * compute-budget instruction is added: set a limit of about 50k CU per hop (the 200k default
     * does not cover four hops).
     */
    multiHopSwapInstructions({ user, inMint, venues, amountIn, minAmountOut, globalConfig, buybackFeeRecipient, userInTokenAccount, userOutTokenAccount, userInAccountInfo, userOutAccountInfo, }: {
        user: PublicKey;
        inMint: PublicKey;
        venues: MultiHopVenue[];
        amountIn: BN;
        minAmountOut: BN;
        globalConfig: GlobalConfig;
        buybackFeeRecipient?: PublicKey;
        userInTokenAccount?: PublicKey;
        userOutTokenAccount?: PublicKey;
        userInAccountInfo?: AccountInfo<Buffer> | null;
        userOutAccountInfo?: AccountInfo<Buffer> | null;
    }): Promise<TransactionInstruction[]>;
    /**
     * `sweep_protocol_fee`: pays a pool's `protocolFees` out of its quote vault to a protocol fee
     * recipient's quote ATA (a reserved one on a mayhem pool; created when missing).
     * Permissionless: `payer` signs and pays that ATA's rent and a pre-upgrade pool's realloc. A
     * no-op when the bucket is empty. `quoteTokenProgram` is the owner of `pool.quoteMint`.
     */
    sweepProtocolFeeInstruction({ payer, poolKey, pool, quoteTokenProgram, globalConfig, }: {
        payer: PublicKey;
        poolKey: PublicKey;
        pool: Pool;
        quoteTokenProgram: PublicKey;
        globalConfig: GlobalConfig;
    }): Promise<TransactionInstruction>;
    /**
     * `sweep_creator_fee`: pays a pool's `creatorFees` into the coin-creator vault of
     * `pool.coinCreator` (the vault `collectCoinCreatorFee` pays out from), otherwise as
     * `sweepProtocolFeeInstruction`. The programs refuse to change a coin creator or its fee shares
     * while the bucket is nonzero (pump-amm `CreatorFeesNotSwept`, pump-fees
     * `PoolCreatorFeesNotSwept`), so a CTO, a fee-sharing config creation or an `update_fee_shares`
     * on a coin with v2 volume must carry this instruction before it, in the same transaction.
     */
    sweepCreatorFeeInstruction({ payer, poolKey, pool, quoteTokenProgram, }: {
        payer: PublicKey;
        poolKey: PublicKey;
        pool: Pool;
        quoteTokenProgram: PublicKey;
    }): Promise<TransactionInstruction>;
    private sweepFeeAccounts;
    /** The 17 accounts of `buy_v2` / `buy_exact_quote_in_v2` / `sell_v2`, in IDL order. */
    private tradeV2Accounts;
    private swapAccounts;
    syncUserVolumeAccumulator(user: PublicKey): Promise<TransactionInstruction>;
    initUserVolumeAccumulator({ payer, user, }: {
        payer: PublicKey;
        user: PublicKey;
    }): Promise<TransactionInstruction>;
    closeUserVolumeAccumulator(user: PublicKey): Promise<TransactionInstruction>;
    createAutocompleteInitialPoolPrice(initialBase: BN, initialQuote: BN): Promise<BN>;
    depositInstructions(liquiditySolanaState: LiquiditySolanaState, lpToken: BN, slippage: number): Promise<TransactionInstruction[]>;
    depositAutocompleteQuoteAndLpTokenFromBase(liquiditySolanaState: LiquiditySolanaState, base: BN, slippage: number): DepositQuoteAndLpTokenFromBaseResult;
    depositAutocompleteBaseAndLpTokenFromQuote(liquiditySolanaState: LiquiditySolanaState, quote: BN, slippage: number): DepositBaseAndLpTokenFromQuoteResult;
    withdrawInstructions(liquiditySolanaState: LiquiditySolanaState, lpToken: BN, slippage: number): Promise<TransactionInstruction[]>;
    withdrawAutoCompleteBaseAndQuoteFromLpToken(liquiditySolanaState: LiquiditySolanaState, lpAmount: BN, slippage: number): WithdrawAutocompleteResult;
}
declare const PUMP_AMM_SDK: PumpAmmSdk;

/**
 * Everything that leaves the buyer's account for a buy the pool books at
 * `quoteAmountIn + lpFee + protocolFee + coinCreatorFee`, the quote's Token-2022 transfer fee
 * included (nothing more on an untaxed quote). What goes to the vault is grossed up so the pool
 * books exactly its share once the fee is withheld; what goes to a fee recipient is sent as it is.
 * The v1 `buy` sends the vault `quoteAmountIn + lpFee`; a v2 trade sends it everything but the
 * buyback slice of the protocol fee (floor of `buybackBasisPoints`; none on a mayhem pool).
 *
 * rust reference: pump-amm buy() `vault_gross`, trade_v2 BuyLeg::user_debit()
 */
declare function buyDebit({ quoteAmountIn, lpFee, protocolFee, coinCreatorFee, quoteTransferFee, tradeV2, globalConfig, isMayhemMode, }: {
    quoteAmountIn: BN;
    lpFee: BN;
    protocolFee: BN;
    coinCreatorFee: BN;
    quoteTransferFee?: QuoteTransferFee | null;
    tradeV2?: boolean;
    globalConfig: GlobalConfig;
    isMayhemMode?: boolean;
}): BN;
declare function buyBaseInput({ base, slippage, baseReserve, quoteReserve, virtualQuoteReserves, globalConfig, baseMintAccount, baseMint, coinCreator, creator, feeConfig, quoteMint, isMayhemMode, creatorFeeBps, quoteTransferFee, tradeV2, }: {
    base: BN;
    slippage: number;
    baseReserve: BN;
    quoteReserve: BN;
    virtualQuoteReserves?: BN;
    globalConfig: GlobalConfig;
    baseMintAccount: RawMint;
    baseMint: PublicKey;
    coinCreator: PublicKey;
    creator: PublicKey;
    feeConfig: FeeConfig | null;
    /**
     * `Pool.quoteMint`; selects the fee schedule (SOL-like -> feeTiers, USDC -> stableFeeTiers,
     * anything else -> exoticFlatFees, or flatFees while the exotic schedule is unset). Defaults to
     * WSOL: omitting it on a non-SOL pool prices with the SOL schedule.
     */
    quoteMint?: PublicKey;
    /** `Pool.isMayhemMode`; defaults to false. */
    isMayhemMode?: boolean;
    /**
     * `Pool.creatorFeeBps`; replaces the schedule's creator rate while
     * `globalConfig.creatorFeeConfigurable` is on and it is nonzero. Omitting it (or 0) prices with
     * the schedule, as before.
     */
    creatorFeeBps?: BN;
    /**
     * The quote mint's Token-2022 transfer fee this epoch (`SwapSolanaState.quoteTransferFee`);
     * omitting it on a taxed quote under-prices the debit. `uiQuote` and `maxQuote` include it.
     */
    quoteTransferFee?: QuoteTransferFee | null;
    /** Price the debit as `buy_v2` charges it (the buyback slice is not grossed up); v1 by default. */
    tradeV2?: boolean;
}): BuyBaseInputResult;
declare function buyQuoteInput({ quote, slippage, baseReserve, quoteReserve, virtualQuoteReserves, globalConfig, baseMintAccount, baseMint, coinCreator, creator, feeConfig, quoteMint, isMayhemMode, creatorFeeBps, quoteTransferFee, tradeV2, }: {
    quote: BN;
    slippage: number;
    baseReserve: BN;
    quoteReserve: BN;
    virtualQuoteReserves?: BN;
    globalConfig: GlobalConfig;
    baseMintAccount: RawMint;
    baseMint: PublicKey;
    coinCreator: PublicKey;
    creator: PublicKey;
    feeConfig: FeeConfig | null;
    /**
     * `Pool.quoteMint`; selects the fee schedule (SOL-like -> feeTiers, USDC -> stableFeeTiers,
     * anything else -> exoticFlatFees, or flatFees while the exotic schedule is unset). Defaults to
     * WSOL: omitting it on a non-SOL pool prices with the SOL schedule.
     */
    quoteMint?: PublicKey;
    /** `Pool.isMayhemMode`; defaults to false. */
    isMayhemMode?: boolean;
    /**
     * `Pool.creatorFeeBps`; replaces the schedule's creator rate while
     * `globalConfig.creatorFeeConfigurable` is on and it is nonzero. Omitting it (or 0) prices with
     * the schedule, as before.
     */
    creatorFeeBps?: BN;
    /**
     * The quote mint's Token-2022 transfer fee this epoch (`SwapSolanaState.quoteTransferFee`).
     * `quote` is what leaves the wallet, the fee included, as the program's exact-in budget is.
     */
    quoteTransferFee?: QuoteTransferFee | null;
    /** Fit the debit as `buy_exact_quote_in_v2` does (the buyback slice is not grossed up). */
    tradeV2?: boolean;
}): BuyQuoteInputResult;

declare function sellBaseInput({ base, slippage, baseReserve, quoteReserve, virtualQuoteReserves, feeBucketsTotal, globalConfig, baseMintAccount, baseMint, coinCreator, creator, feeConfig, quoteMint, isMayhemMode, creatorFeeBps, quoteTransferFee, }: {
    base: BN;
    slippage: number;
    baseReserve: BN;
    quoteReserve: BN;
    virtualQuoteReserves?: BN;
    /**
     * `Pool.protocolFees + Pool.creatorFees`: fees v2 trades left in the quote vault. The program
     * pays sells only from `quoteReserve - feeBucketsTotal` (`real_quote_reserves`). Defaults to 0
     * (no fees accrued).
     */
    feeBucketsTotal?: BN;
    globalConfig: GlobalConfig;
    baseMintAccount: RawMint;
    baseMint: PublicKey;
    coinCreator: PublicKey;
    creator: PublicKey;
    feeConfig: FeeConfig | null;
    /**
     * `Pool.quoteMint`; selects the fee schedule (SOL-like -> feeTiers, USDC -> stableFeeTiers,
     * anything else -> exoticFlatFees, or flatFees while the exotic schedule is unset). Defaults to
     * WSOL: omitting it on a non-SOL pool prices with the SOL schedule.
     */
    quoteMint?: PublicKey;
    /** `Pool.isMayhemMode`; defaults to false. */
    isMayhemMode?: boolean;
    /**
     * `Pool.creatorFeeBps`; replaces the schedule's creator rate while
     * `globalConfig.creatorFeeConfigurable` is on and it is nonzero. Omitting it (or 0) prices with
     * the schedule, as before.
     */
    creatorFeeBps?: BN;
    /**
     * The quote mint's Token-2022 transfer fee this epoch (`SwapSolanaState.quoteTransferFee`).
     * The pool pays out as it is; `uiQuote` and `minQuote` are what lands in the wallet.
     */
    quoteTransferFee?: QuoteTransferFee | null;
}): SellBaseInputResult;
declare function sellQuoteInput({ quote, slippage, baseReserve, quoteReserve, virtualQuoteReserves, feeBucketsTotal, globalConfig, baseMintAccount, baseMint, coinCreator, creator, feeConfig, quoteMint, isMayhemMode, creatorFeeBps, quoteTransferFee, }: {
    quote: BN;
    slippage: number;
    baseReserve: BN;
    quoteReserve: BN;
    virtualQuoteReserves?: BN;
    /**
     * `Pool.protocolFees + Pool.creatorFees`: fees v2 trades left in the quote vault. The program
     * pays sells only from `quoteReserve - feeBucketsTotal` (`real_quote_reserves`). Defaults to 0
     * (no fees accrued).
     */
    feeBucketsTotal?: BN;
    globalConfig: GlobalConfig;
    baseMintAccount: RawMint;
    baseMint: PublicKey;
    coinCreator: PublicKey;
    creator: PublicKey;
    feeConfig: FeeConfig | null;
    /**
     * `Pool.quoteMint`; selects the fee schedule (SOL-like -> feeTiers, USDC -> stableFeeTiers,
     * anything else -> exoticFlatFees, or flatFees while the exotic schedule is unset). Defaults to
     * WSOL: omitting it on a non-SOL pool prices with the SOL schedule.
     */
    quoteMint?: PublicKey;
    /** `Pool.isMayhemMode`; defaults to false. */
    isMayhemMode?: boolean;
    /**
     * `Pool.creatorFeeBps`; replaces the schedule's creator rate while
     * `globalConfig.creatorFeeConfigurable` is on and it is nonzero. Omitting it (or 0) prices with
     * the schedule, as before.
     */
    creatorFeeBps?: BN;
    /**
     * The quote mint's Token-2022 transfer fee this epoch (`SwapSolanaState.quoteTransferFee`).
     * `quote` is what should land in the wallet once the fee is withheld from the payout.
     */
    quoteTransferFee?: QuoteTransferFee | null;
}): SellQuoteInputResult;

declare const USDC_MINT: PublicKey;
/**
 * Quote mints that select `stableFeeTiers` on a canonical pump pool. Mirrors the constant
 * pump-fees hardcodes (`STABLE_QUOTE_MINTS`), so widening it is a program upgrade. Devnet USDC
 * (`4zMMC9…`) is deliberately absent: after the quote-control upgrade a devnet USDC-quoted canonical
 * pool pays exotic/flat fees. Until that upgrade is deployed to devnet, the devnet program still
 * charges such pools stable tiers, so this SDK and devnet disagree on them in that window.
 */
declare const STABLE_QUOTE_MINTS: readonly PublicKey[];
/**
 * Quote mints that select `feeTiers`: the zero key legacy bonding curves store for SOL, legacy
 * WSOL and the Token-2022 native mint (pump-fees `is_sol_like_quote_mint`).
 */
declare const SOL_LIKE_QUOTE_MINTS: readonly PublicKey[];
declare function isSolLikeQuoteMint(quoteMint: PublicKey): boolean;
declare function isStableQuoteMint(quoteMint: PublicKey): boolean;
/** All-zero `Fees` is how pump-fees marks `exoticFlatFees` as unset. */
declare function isZeroFees(fees: Fees): boolean;
declare function computeFeesBps({ globalConfig, feeConfig, creator, baseMintSupply, baseMint, baseReserve, quoteReserve, quoteMint, isMayhemMode, creatorFeeBps, }: {
    globalConfig: GlobalConfig;
    feeConfig: FeeConfig | null;
    creator: PublicKey;
    baseMintSupply: BN;
    baseMint: PublicKey;
    baseReserve: BN;
    quoteReserve: BN;
    /**
     * Not used: pump-fees tiers by market cap only (the on-chain `get_fees` argument of the same
     * name is ignored too). Kept so existing call sites keep compiling.
     */
    tradeSize?: BN;
    /**
     * `Pool.quoteMint`; selects the fee schedule (see `feesForQuoteMint`). Defaults to WSOL, so
     * callers that omit it get the SOL schedule they always got.
     */
    quoteMint?: PublicKey;
    /** `Pool.isMayhemMode`; mayhem pools use a fixed total supply as the market-cap basis. */
    isMayhemMode?: boolean;
    /**
     * `Pool.creatorFeeBps`, the per-pool creator fee rate. While `globalConfig.creatorFeeConfigurable`
     * is on and it is nonzero it replaces the schedule's creator rate; 0 or omitted means "not
     * configured", so callers that omit it price exactly as before. Applied only with a `feeConfig`,
     * as on-chain (the GlobalConfig fallback below is unreachable there: pump-fees is mandatory).
     */
    creatorFeeBps?: BN;
}): Fees;
/**
 * The schedule a trade pays, selected by who created the pool and what it is quoted in: non-pump
 * pools pay `flatFees`; canonical pump pools pay `feeTiers` for SOL-like quotes, `stableFeeTiers`
 * for listed stables and `exoticFlatFees` for everything else, falling back to `flatFees` while
 * the exotic schedule is unset (all-zero).
 *
 * rust reference: pump-fees FeeConfig::fees_for_quote_mint()
 */
declare function feesForQuoteMint({ feeConfig, isPumpPool, marketCap, quoteMint, }: {
    feeConfig: FeeConfig;
    isPumpPool: boolean;
    marketCap: BN;
    quoteMint: PublicKey;
}): Fees;
declare function calculateFeeTier({ feeTiers, marketCap, }: {
    feeTiers: FeeTier[];
    marketCap: BN;
}): Fees;
declare function getFeeRecipient(globalConfig: GlobalConfig, isMayhemMode: boolean): PublicKey;
declare function getBuybackFeeRecipient(globalConfig: GlobalConfig): PublicKey;

declare function depositLpToken(lpToken: BN, slippage: number, baseReserve: BN, quoteReserve: BN, totalLpTokens: BN, 
/**
 * The quote mint's Token-2022 transfer fee (`LiquiditySolanaState.quoteTransferFee`): the
 * deposit is grossed up so the pool receives its share, and `maxQuote` caps that debit.
 */
quoteTransferFee?: QuoteTransferFee | null): DepositLpTokenResult;

declare function withdraw(lpAmount: BN, slippage: number, baseReserve: BN, quoteReserve: BN, totalLpTokens: BN, 
/**
 * The quote mint's Token-2022 transfer fee (`LiquiditySolanaState.quoteTransferFee`): the
 * pool pays its share as it is, and `quote` / `minQuote` are what lands in the wallet.
 */
quoteTransferFee?: QuoteTransferFee | null): WithdrawResult;

declare function getPumpAmmProgram(connection: Connection): Program<PumpAmm>;
declare function isPumpPool(baseMint: PublicKey, poolCreator: PublicKey): boolean;
/**
 * Whether `buy_v2` / `buy_exact_quote_in_v2` / `sell_v2` accept `pool`: every pool but a cashback
 * coin's, whose creator fee is the buyer's cashback, which v2 never pays (it keeps trading
 * through v1).
 *
 * rust reference: pump-amm check_pool_supported()
 */
declare function supportsTradeV2(pool: Pool): boolean;
/**
 * pump-amm `TOTAL_TOKEN_SUPPLY`: the circulating supply the program uses as the market-cap basis
 * for mayhem-mode pools instead of the live base mint supply (`Pool::market_cap`).
 */
declare const PUMP_AMM_TOTAL_TOKEN_SUPPLY: BN;
declare function poolMarketCap({ baseMintSupply, baseReserve, quoteReserve, isMayhemMode, }: {
    baseMintSupply: BN;
    baseReserve: BN;
    quoteReserve: BN;
    isMayhemMode?: boolean;
}): BN;

declare function totalUnclaimedTokens(globalVolumeAccumulator: GlobalVolumeAccumulator, userVolumeAccumulator: UserVolumeAccumulator, currentTimestamp?: number): BN;
declare function currentDayTokens(globalVolumeAccumulator: GlobalVolumeAccumulator, userVolumeAccumulator: UserVolumeAccumulator, currentTimestamp?: number): BN;

var address = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
var metadata = {
	name: "pump_amm",
	version: "0.1.0",
	spec: "0.1.0",
	description: "Created with Anchor"
};
var instructions = [
	{
		name: "admin_cto_pool",
		discriminator: [
			45,
			61,
			165,
			151,
			104,
			0,
			49,
			189
		],
		accounts: [
			{
				name: "payer",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "pool",
				writable: true
			},
			{
				name: "pool_authority",
				signer: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								112,
								111,
								111,
								108,
								45,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						},
						{
							kind: "account",
							path: "pool.base_mint",
							account: "Pool"
						}
					],
					program: {
						kind: "const",
						value: [
							1,
							86,
							224,
							246,
							147,
							102,
							90,
							207,
							68,
							219,
							21,
							104,
							191,
							23,
							91,
							170,
							81,
							137,
							203,
							151,
							245,
							210,
							255,
							59,
							101,
							93,
							43,
							182,
							253,
							109,
							24,
							176
						]
					}
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "coin_creator",
				type: "pubkey"
			},
			{
				name: "is_holder_reward",
				type: "bool"
			},
			{
				name: "creator_fee_bps",
				type: {
					option: "u64"
				}
			}
		]
	},
	{
		name: "admin_update_token_incentives",
		discriminator: [
			209,
			11,
			115,
			87,
			213,
			23,
			124,
			204
		],
		accounts: [
			{
				name: "admin",
				writable: true,
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "global_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						}
					]
				}
			},
			{
				name: "mint"
			},
			{
				name: "global_incentive_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "global_volume_accumulator"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "token_program"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "start_time",
				type: "i64"
			},
			{
				name: "end_time",
				type: "i64"
			},
			{
				name: "seconds_in_a_day",
				type: "i64"
			},
			{
				name: "day_number",
				type: "u64"
			},
			{
				name: "token_supply_per_day",
				type: "u64"
			}
		]
	},
	{
		name: "boost_buy_and_burn",
		discriminator: [
			105,
			68,
			6,
			175,
			0,
			7,
			35,
			162
		],
		accounts: [
			{
				name: "pool"
			},
			{
				name: "authority",
				writable: true,
				signer: true
			},
			{
				name: "global_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "base_mint",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "boost_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								98,
								111,
								111,
								115,
								116,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "pool"
						}
					]
				}
			},
			{
				name: "boost_vault",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "boost_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "quote_amount_in",
				type: "u64"
			},
			{
				name: "min_base_amount_burned",
				type: "u64"
			}
		]
	},
	{
		name: "buy",
		docs: [
			"For cashback coins, optionally pass user_volume_accumulator_wsol_ata as remaining_accounts[0].",
			"If provided and valid, the ATA will be initialized if needed."
		],
		discriminator: [
			102,
			6,
			61,
			18,
			1,
			218,
			235,
			234
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "protocol_fee_recipient"
			},
			{
				name: "protocol_fee_recipient_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "protocol_fee_recipient"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "coin_creator_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "pool.coin_creator",
							account: "Pool"
						}
					]
				}
			},
			{
				name: "global_volume_accumulator",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						}
					]
				}
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "account",
						path: "fee_program"
					}
				}
			},
			{
				name: "fee_program",
				address: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
			}
		],
		args: [
			{
				name: "base_amount_out",
				type: "u64"
			},
			{
				name: "max_quote_amount_in",
				type: "u64"
			},
			{
				name: "track_volume",
				type: {
					defined: {
						name: "OptionBool"
					}
				}
			}
		]
	},
	{
		name: "buy_exact_quote_in",
		docs: [
			"Given a budget of spendable_quote_in, buy at least min_base_amount_out",
			"Fees will be deducted from spendable_quote_in",
			"",
			"f(quote) = tokens, where tokens >= min_base_amount_out",
			"",
			"Make sure the payer has enough SOL to cover creation of the following accounts (unless already created):",
			"- protocol_fee_recipient_token_account: rent.minimum_balance(TokenAccount::LEN)",
			"- coin_creator_vault_ata: rent.minimum_balance(TokenAccount::LEN)",
			"- user_volume_accumulator: rent.minimum_balance(UserVolumeAccumulator::LEN)",
			"",
			"For cashback coins, optionally pass user_volume_accumulator_wsol_ata as remaining_accounts[0].",
			"If provided and valid, the ATA will be initialized if needed."
		],
		discriminator: [
			198,
			46,
			21,
			82,
			180,
			217,
			232,
			112
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "protocol_fee_recipient"
			},
			{
				name: "protocol_fee_recipient_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "protocol_fee_recipient"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "coin_creator_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "pool.coin_creator",
							account: "Pool"
						}
					]
				}
			},
			{
				name: "global_volume_accumulator",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						}
					]
				}
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "account",
						path: "fee_program"
					}
				}
			},
			{
				name: "fee_program",
				address: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
			}
		],
		args: [
			{
				name: "spendable_quote_in",
				type: "u64"
			},
			{
				name: "min_base_amount_out",
				type: "u64"
			},
			{
				name: "track_volume",
				type: {
					defined: {
						name: "OptionBool"
					}
				}
			}
		]
	},
	{
		name: "buy_exact_quote_in_v2",
		discriminator: [
			194,
			171,
			28,
			70,
			104,
			77,
			91,
			47
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "const",
						value: [
							12,
							53,
							255,
							169,
							5,
							90,
							142,
							86,
							141,
							168,
							247,
							188,
							7,
							86,
							21,
							39,
							76,
							241,
							201,
							44,
							164,
							31,
							64,
							0,
							156,
							81,
							106,
							164,
							20,
							194,
							124,
							112
						]
					}
				}
			},
			{
				name: "buyback_fee_recipient",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			}
		],
		args: [
			{
				name: "spendable_quote_in",
				type: "u64"
			},
			{
				name: "min_base_amount_out",
				type: "u64"
			}
		]
	},
	{
		name: "buy_v2",
		discriminator: [
			184,
			23,
			238,
			97,
			103,
			197,
			211,
			61
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "const",
						value: [
							12,
							53,
							255,
							169,
							5,
							90,
							142,
							86,
							141,
							168,
							247,
							188,
							7,
							86,
							21,
							39,
							76,
							241,
							201,
							44,
							164,
							31,
							64,
							0,
							156,
							81,
							106,
							164,
							20,
							194,
							124,
							112
						]
					}
				}
			},
			{
				name: "buyback_fee_recipient",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			}
		],
		args: [
			{
				name: "base_amount_out",
				type: "u64"
			},
			{
				name: "max_quote_amount_in",
				type: "u64"
			}
		]
	},
	{
		name: "claim_cashback",
		docs: [
			"Pays out the user's accrued cashback. `user_wsol_token_account` may be any token account",
			"of `quote_mint` owned by `user`, not only the associated one."
		],
		discriminator: [
			37,
			58,
			35,
			126,
			190,
			53,
			228,
			197
		],
		accounts: [
			{
				name: "user",
				writable: true
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "quote_mint"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "user_volume_accumulator_wsol_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "user_volume_accumulator"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "user_wsol_token_account",
				writable: true
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			}
		],
		args: [
		]
	},
	{
		name: "claim_token_incentives",
		discriminator: [
			16,
			4,
			71,
			28,
			204,
			1,
			40,
			27
		],
		accounts: [
			{
				name: "user"
			},
			{
				name: "user_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "user"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "global_volume_accumulator",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						}
					]
				}
			},
			{
				name: "global_incentive_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "global_volume_accumulator"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "mint",
				relations: [
					"global_volume_accumulator"
				]
			},
			{
				name: "token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			},
			{
				name: "payer",
				writable: true,
				signer: true
			}
		],
		args: [
		]
	},
	{
		name: "close_user_volume_accumulator",
		discriminator: [
			249,
			69,
			164,
			218,
			150,
			103,
			84,
			138
		],
		accounts: [
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "collect_coin_creator_fee",
		discriminator: [
			160,
			57,
			89,
			42,
			181,
			139,
			43,
			66
		],
		accounts: [
			{
				name: "quote_mint"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "coin_creator"
			},
			{
				name: "coin_creator_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "coin_creator"
						}
					]
				}
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "coin_creator_token_account",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "create_config",
		discriminator: [
			201,
			207,
			243,
			114,
			75,
			111,
			47,
			189
		],
		accounts: [
			{
				name: "admin",
				writable: true,
				signer: true,
				address: "8LWu7QM2dGR1G8nKDHthckea57bkCzXyBTAKPJUBDHo8"
			},
			{
				name: "global_config",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "lp_fee_basis_points",
				type: "u64"
			},
			{
				name: "protocol_fee_basis_points",
				type: "u64"
			},
			{
				name: "protocol_fee_recipients",
				type: {
					array: [
						"pubkey",
						8
					]
				}
			},
			{
				name: "coin_creator_fee_basis_points",
				type: "u64"
			},
			{
				name: "admin_set_coin_creator_authority",
				type: "pubkey"
			}
		]
	},
	{
		name: "create_pool",
		discriminator: [
			233,
			146,
			209,
			142,
			207,
			104,
			64,
			188
		],
		accounts: [
			{
				name: "pool",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								112,
								111,
								111,
								108
							]
						},
						{
							kind: "arg",
							path: "index"
						},
						{
							kind: "account",
							path: "creator"
						},
						{
							kind: "account",
							path: "base_mint"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					]
				}
			},
			{
				name: "global_config"
			},
			{
				name: "creator",
				writable: true,
				signer: true
			},
			{
				name: "base_mint"
			},
			{
				name: "quote_mint"
			},
			{
				name: "lp_mint",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								112,
								111,
								111,
								108,
								95,
								108,
								112,
								95,
								109,
								105,
								110,
								116
							]
						},
						{
							kind: "account",
							path: "pool"
						}
					]
				}
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "user_pool_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "creator"
						},
						{
							kind: "account",
							path: "token_2022_program"
						},
						{
							kind: "account",
							path: "lp_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "pool_base_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "pool"
						},
						{
							kind: "account",
							path: "base_token_program"
						},
						{
							kind: "account",
							path: "base_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "pool"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "token_2022_program",
				address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "index",
				type: "u16"
			},
			{
				name: "base_amount_in",
				type: "u64"
			},
			{
				name: "quote_amount_in",
				type: "u64"
			},
			{
				name: "coin_creator",
				type: "pubkey"
			},
			{
				name: "is_mayhem_mode",
				type: "bool"
			},
			{
				name: "is_cashback_coin",
				type: {
					defined: {
						name: "OptionBool"
					}
				}
			},
			{
				name: "creator_fee_bps",
				type: {
					defined: {
						name: "OptionU64"
					}
				}
			},
			{
				name: "can_edit_creator_fee",
				type: {
					defined: {
						name: "OptionBool"
					}
				}
			},
			{
				name: "is_holder_reward",
				type: {
					defined: {
						name: "OptionBool"
					}
				}
			}
		]
	},
	{
		name: "deposit",
		discriminator: [
			242,
			35,
			198,
			137,
			82,
			225,
			242,
			182
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "global_config"
			},
			{
				name: "user",
				signer: true
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "lp_mint",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "user_pool_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "token_program",
				address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
			},
			{
				name: "token_2022_program",
				address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "lp_token_amount_out",
				type: "u64"
			},
			{
				name: "max_base_amount_in",
				type: "u64"
			},
			{
				name: "max_quote_amount_in",
				type: "u64"
			}
		]
	},
	{
		name: "disable",
		discriminator: [
			185,
			173,
			187,
			90,
			216,
			15,
			238,
			233
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "disable_create_pool",
				type: "bool"
			},
			{
				name: "disable_deposit",
				type: "bool"
			},
			{
				name: "disable_withdraw",
				type: "bool"
			},
			{
				name: "disable_buy",
				type: "bool"
			},
			{
				name: "disable_sell",
				type: "bool"
			}
		]
	},
	{
		name: "extend_account",
		discriminator: [
			234,
			102,
			194,
			203,
			150,
			72,
			62,
			229
		],
		accounts: [
			{
				name: "account",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "init_boost",
		discriminator: [
			140,
			233,
			33,
			94,
			132,
			90,
			194,
			143
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "global_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "creator",
				writable: true,
				signer: true
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "pool_base_token_account",
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "boost_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								98,
								111,
								111,
								115,
								116,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "pool"
						}
					]
				}
			},
			{
				name: "boost_vault",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "boost_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "init_user_volume_accumulator",
		discriminator: [
			94,
			6,
			202,
			115,
			255,
			96,
			232,
			183
		],
		accounts: [
			{
				name: "payer",
				writable: true,
				signer: true
			},
			{
				name: "user"
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "migrate_pool_coin_creator",
		docs: [
			"Migrate Pool Coin Creator to Sharing Config"
		],
		discriminator: [
			208,
			8,
			159,
			4,
			74,
			175,
			16,
			58
		],
		accounts: [
			{
				name: "pool",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								112,
								111,
								111,
								108
							]
						},
						{
							kind: "account",
							path: "pool.index",
							account: "Pool"
						},
						{
							kind: "account",
							path: "pool.creator",
							account: "Pool"
						},
						{
							kind: "account",
							path: "pool.base_mint",
							account: "Pool"
						},
						{
							kind: "account",
							path: "pool.quote_mint",
							account: "Pool"
						}
					]
				}
			},
			{
				name: "sharing_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								115,
								104,
								97,
								114,
								105,
								110,
								103,
								45,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "account",
							path: "pool.base_mint",
							account: "Pool"
						}
					],
					program: {
						kind: "const",
						value: [
							12,
							53,
							255,
							169,
							5,
							90,
							142,
							86,
							141,
							168,
							247,
							188,
							7,
							86,
							21,
							39,
							76,
							241,
							201,
							44,
							164,
							31,
							64,
							0,
							156,
							81,
							106,
							164,
							20,
							194,
							124,
							112
						]
					}
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "multi_hop_swap",
		discriminator: [
			43,
			100,
			73,
			19,
			233,
			246,
			111,
			148
		],
		accounts: [
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "user_in_token_account",
				writable: true
			},
			{
				name: "user_out_token_account",
				writable: true
			},
			{
				name: "global_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "const",
						value: [
							12,
							53,
							255,
							169,
							5,
							90,
							142,
							86,
							141,
							168,
							247,
							188,
							7,
							86,
							21,
							39,
							76,
							241,
							201,
							44,
							164,
							31,
							64,
							0,
							156,
							81,
							106,
							164,
							20,
							194,
							124,
							112
						]
					}
				}
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "buyback_fee_recipient",
				writable: true
			},
			{
				name: "token_program",
				address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
			},
			{
				name: "token_2022_program",
				address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			},
			{
				name: "pump_program",
				address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
			},
			{
				name: "pump_global"
			},
			{
				name: "pump_fee_config"
			},
			{
				name: "pump_event_authority"
			}
		],
		args: [
			{
				name: "amount_in",
				type: "u64"
			},
			{
				name: "min_amount_out",
				type: "u64"
			}
		]
	},
	{
		name: "sell",
		discriminator: [
			51,
			230,
			133,
			164,
			1,
			127,
			131,
			173
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "protocol_fee_recipient"
			},
			{
				name: "protocol_fee_recipient_token_account",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "protocol_fee_recipient"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "coin_creator_vault_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "pool.coin_creator",
							account: "Pool"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "account",
						path: "fee_program"
					}
				}
			},
			{
				name: "fee_program",
				address: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
			}
		],
		args: [
			{
				name: "base_amount_in",
				type: "u64"
			},
			{
				name: "min_quote_amount_out",
				type: "u64"
			}
		]
	},
	{
		name: "sell_v2",
		discriminator: [
			93,
			246,
			130,
			60,
			231,
			233,
			64,
			178
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "user",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "base_token_program"
			},
			{
				name: "quote_token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "fee_config",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								102,
								101,
								101,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						},
						{
							kind: "const",
							value: [
								12,
								20,
								222,
								252,
								130,
								94,
								198,
								118,
								148,
								37,
								8,
								24,
								187,
								101,
								64,
								101,
								244,
								41,
								141,
								49,
								86,
								213,
								113,
								180,
								212,
								248,
								9,
								12,
								24,
								233,
								168,
								99
							]
						}
					],
					program: {
						kind: "const",
						value: [
							12,
							53,
							255,
							169,
							5,
							90,
							142,
							86,
							141,
							168,
							247,
							188,
							7,
							86,
							21,
							39,
							76,
							241,
							201,
							44,
							164,
							31,
							64,
							0,
							156,
							81,
							106,
							164,
							20,
							194,
							124,
							112
						]
					}
				}
			},
			{
				name: "buyback_fee_recipient",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program",
				address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
			}
		],
		args: [
			{
				name: "base_amount_in",
				type: "u64"
			},
			{
				name: "min_quote_amount_out",
				type: "u64"
			}
		]
	},
	{
		name: "set_boost_authority",
		discriminator: [
			227,
			149,
			76,
			42,
			130,
			39,
			234,
			205
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "boost_authority"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "set_coin_creator",
		docs: [
			"Sets Pool::coin_creator from Metaplex metadata creator or BondingCurve::creator"
		],
		discriminator: [
			210,
			149,
			128,
			45,
			188,
			58,
			78,
			175
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "metadata",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								109,
								101,
								116,
								97,
								100,
								97,
								116,
								97
							]
						},
						{
							kind: "const",
							value: [
								11,
								112,
								101,
								177,
								227,
								209,
								124,
								69,
								56,
								157,
								82,
								127,
								107,
								4,
								195,
								205,
								88,
								184,
								108,
								115,
								26,
								160,
								253,
								181,
								73,
								182,
								209,
								188,
								3,
								248,
								41,
								70
							]
						},
						{
							kind: "account",
							path: "pool.base_mint",
							account: "Pool"
						}
					],
					program: {
						kind: "const",
						value: [
							11,
							112,
							101,
							177,
							227,
							209,
							124,
							69,
							56,
							157,
							82,
							127,
							107,
							4,
							195,
							205,
							88,
							184,
							108,
							115,
							26,
							160,
							253,
							181,
							73,
							182,
							209,
							188,
							3,
							248,
							41,
							70
						]
					}
				}
			},
			{
				name: "bonding_curve",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								98,
								111,
								110,
								100,
								105,
								110,
								103,
								45,
								99,
								117,
								114,
								118,
								101
							]
						},
						{
							kind: "account",
							path: "pool.base_mint",
							account: "Pool"
						}
					],
					program: {
						kind: "const",
						value: [
							1,
							86,
							224,
							246,
							147,
							102,
							90,
							207,
							68,
							219,
							21,
							104,
							191,
							23,
							91,
							170,
							81,
							137,
							203,
							151,
							245,
							210,
							255,
							59,
							101,
							93,
							43,
							182,
							253,
							109,
							24,
							176
						]
					}
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "set_reserved_fee_recipients",
		discriminator: [
			111,
			172,
			162,
			232,
			114,
			89,
			213,
			142
		],
		accounts: [
			{
				name: "global_config",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								99,
								111,
								110,
								102,
								105,
								103
							]
						}
					]
				}
			},
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "whitelist_pda",
				type: "pubkey"
			}
		]
	},
	{
		name: "sweep_creator_fee",
		discriminator: [
			32,
			246,
			191,
			52,
			8,
			201,
			73,
			186
		],
		accounts: [
			{
				name: "payer",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "pool",
				writable: true
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_token_program"
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "recipient",
				docs: [
					"protocol fee recipient (`check_protocol_fee_recipient`) or the coin-creator vault",
					"authority PDA of `pool.coin_creator`."
				]
			},
			{
				name: "recipient_token_account",
				docs: [
					"idempotently when missing (the payer pays)."
				],
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "recipient"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "sweep_protocol_fee",
		discriminator: [
			8,
			48,
			190,
			7,
			182,
			68,
			183,
			229
		],
		accounts: [
			{
				name: "payer",
				writable: true,
				signer: true
			},
			{
				name: "global_config"
			},
			{
				name: "pool",
				writable: true
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_token_program"
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "recipient",
				docs: [
					"protocol fee recipient (`check_protocol_fee_recipient`) or the coin-creator vault",
					"authority PDA of `pool.coin_creator`."
				]
			},
			{
				name: "recipient_token_account",
				docs: [
					"idempotently when missing (the payer pays)."
				],
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "recipient"
						},
						{
							kind: "account",
							path: "quote_token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "sync_user_volume_accumulator",
		discriminator: [
			86,
			31,
			192,
			87,
			163,
			87,
			79,
			238
		],
		accounts: [
			{
				name: "user"
			},
			{
				name: "global_volume_accumulator",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								103,
								108,
								111,
								98,
								97,
								108,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						}
					]
				}
			},
			{
				name: "user_volume_accumulator",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								117,
								115,
								101,
								114,
								95,
								118,
								111,
								108,
								117,
								109,
								101,
								95,
								97,
								99,
								99,
								117,
								109,
								117,
								108,
								97,
								116,
								111,
								114
							]
						},
						{
							kind: "account",
							path: "user"
						}
					]
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "toggle_boost",
		discriminator: [
			117,
			161,
			160,
			74,
			223,
			137,
			118,
			99
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			}
		],
		args: [
			{
				name: "enabled",
				type: "bool"
			}
		]
	},
	{
		name: "toggle_cashback_enabled",
		discriminator: [
			115,
			103,
			224,
			255,
			189,
			89,
			86,
			195
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "enabled",
				type: "bool"
			}
		]
	},
	{
		name: "toggle_mayhem_mode",
		discriminator: [
			1,
			9,
			111,
			208,
			100,
			31,
			255,
			163
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "enabled",
				type: "bool"
			}
		]
	},
	{
		name: "transfer_creator_fees_to_pump",
		docs: [
			"Transfer creator fees to pump creator vault",
			"If coin creator fees are currently below rent.minimum_balance(TokenAccount::LEN)",
			"The transfer will be skipped"
		],
		discriminator: [
			139,
			52,
			134,
			85,
			228,
			229,
			108,
			241
		],
		accounts: [
			{
				name: "wsol_mint",
				docs: [
					"Pump Canonical Pool are quoted in wSOL"
				]
			},
			{
				name: "token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "coin_creator"
			},
			{
				name: "coin_creator_vault_authority",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "coin_creator"
						}
					]
				}
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "wsol_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "pump_creator_vault",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								45,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "coin_creator"
						}
					],
					program: {
						kind: "const",
						value: [
							1,
							86,
							224,
							246,
							147,
							102,
							90,
							207,
							68,
							219,
							21,
							104,
							191,
							23,
							91,
							170,
							81,
							137,
							203,
							151,
							245,
							210,
							255,
							59,
							101,
							93,
							43,
							182,
							253,
							109,
							24,
							176
						]
					}
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "transfer_creator_fees_to_pump_v2",
		discriminator: [
			1,
			33,
			78,
			185,
			33,
			67,
			44,
			92
		],
		accounts: [
			{
				name: "payer",
				writable: true,
				signer: true
			},
			{
				name: "quote_mint"
			},
			{
				name: "token_program"
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "associated_token_program",
				address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
			},
			{
				name: "coin_creator"
			},
			{
				name: "coin_creator_vault_authority",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								95,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "coin_creator"
						}
					]
				}
			},
			{
				name: "coin_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "coin_creator_vault_authority"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "const",
						value: [
							140,
							151,
							37,
							143,
							78,
							36,
							137,
							241,
							187,
							61,
							16,
							41,
							20,
							142,
							13,
							131,
							11,
							90,
							19,
							153,
							218,
							255,
							16,
							132,
							4,
							142,
							123,
							216,
							219,
							233,
							248,
							89
						]
					}
				}
			},
			{
				name: "pump_creator_vault",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								99,
								114,
								101,
								97,
								116,
								111,
								114,
								45,
								118,
								97,
								117,
								108,
								116
							]
						},
						{
							kind: "account",
							path: "coin_creator"
						}
					],
					program: {
						kind: "const",
						value: [
							1,
							86,
							224,
							246,
							147,
							102,
							90,
							207,
							68,
							219,
							21,
							104,
							191,
							23,
							91,
							170,
							81,
							137,
							203,
							151,
							245,
							210,
							255,
							59,
							101,
							93,
							43,
							182,
							253,
							109,
							24,
							176
						]
					}
				}
			},
			{
				name: "pump_creator_vault_ata",
				writable: true,
				pda: {
					seeds: [
						{
							kind: "account",
							path: "pump_creator_vault"
						},
						{
							kind: "account",
							path: "token_program"
						},
						{
							kind: "account",
							path: "quote_mint"
						}
					],
					program: {
						kind: "account",
						path: "associated_token_program"
					}
				}
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "update_admin",
		discriminator: [
			161,
			176,
			40,
			213,
			60,
			184,
			179,
			228
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "new_admin"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
		]
	},
	{
		name: "update_buyback_config",
		discriminator: [
			251,
			224,
			171,
			146,
			160,
			26,
			113,
			233
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "buyback_basis_points",
				type: {
					option: "u64"
				}
			}
		]
	},
	{
		name: "update_creator_fee_config",
		discriminator: [
			61,
			175,
			160,
			249,
			66,
			66,
			136,
			175
		],
		accounts: [
			{
				name: "admin",
				writable: true,
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "system_program",
				address: "11111111111111111111111111111111"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "creator_fee_configurable",
				type: "bool"
			},
			{
				name: "max_configurable_creator_fee_bps",
				type: "u64"
			}
		]
	},
	{
		name: "update_fee_config",
		discriminator: [
			104,
			184,
			103,
			242,
			88,
			151,
			107,
			20
		],
		accounts: [
			{
				name: "admin",
				signer: true,
				relations: [
					"global_config"
				]
			},
			{
				name: "global_config",
				writable: true
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "lp_fee_basis_points",
				type: "u64"
			},
			{
				name: "protocol_fee_basis_points",
				type: "u64"
			},
			{
				name: "protocol_fee_recipients",
				type: {
					array: [
						"pubkey",
						8
					]
				}
			},
			{
				name: "coin_creator_fee_basis_points",
				type: "u64"
			},
			{
				name: "admin_set_coin_creator_authority",
				type: "pubkey"
			}
		]
	},
	{
		name: "withdraw",
		discriminator: [
			183,
			18,
			70,
			156,
			148,
			109,
			161,
			34
		],
		accounts: [
			{
				name: "pool",
				writable: true
			},
			{
				name: "global_config"
			},
			{
				name: "user",
				signer: true
			},
			{
				name: "base_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "quote_mint",
				relations: [
					"pool"
				]
			},
			{
				name: "lp_mint",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "user_base_token_account",
				writable: true
			},
			{
				name: "user_quote_token_account",
				writable: true
			},
			{
				name: "user_pool_token_account",
				writable: true
			},
			{
				name: "pool_base_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "pool_quote_token_account",
				writable: true,
				relations: [
					"pool"
				]
			},
			{
				name: "token_program",
				address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
			},
			{
				name: "token_2022_program",
				address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
			},
			{
				name: "event_authority",
				pda: {
					seeds: [
						{
							kind: "const",
							value: [
								95,
								95,
								101,
								118,
								101,
								110,
								116,
								95,
								97,
								117,
								116,
								104,
								111,
								114,
								105,
								116,
								121
							]
						}
					]
				}
			},
			{
				name: "program"
			}
		],
		args: [
			{
				name: "lp_token_amount_in",
				type: "u64"
			},
			{
				name: "min_base_amount_out",
				type: "u64"
			},
			{
				name: "min_quote_amount_out",
				type: "u64"
			}
		]
	}
];
var accounts = [
	{
		name: "BondingCurve",
		discriminator: [
			23,
			183,
			248,
			55,
			96,
			216,
			172,
			96
		]
	},
	{
		name: "FeeConfig",
		discriminator: [
			143,
			52,
			146,
			187,
			219,
			123,
			76,
			155
		]
	},
	{
		name: "GlobalConfig",
		discriminator: [
			149,
			8,
			156,
			202,
			160,
			252,
			176,
			217
		]
	},
	{
		name: "GlobalVolumeAccumulator",
		discriminator: [
			202,
			42,
			246,
			43,
			142,
			190,
			30,
			255
		]
	},
	{
		name: "Pool",
		discriminator: [
			241,
			154,
			109,
			4,
			17,
			177,
			109,
			188
		]
	},
	{
		name: "SharingConfig",
		discriminator: [
			216,
			74,
			9,
			0,
			56,
			140,
			93,
			75
		]
	},
	{
		name: "UserVolumeAccumulator",
		discriminator: [
			86,
			255,
			112,
			14,
			102,
			53,
			154,
			250
		]
	}
];
var events = [
	{
		name: "AdminCtoPoolEvent",
		discriminator: [
			47,
			35,
			163,
			249,
			150,
			157,
			147,
			122
		]
	},
	{
		name: "AdminUpdateTokenIncentivesEvent",
		discriminator: [
			147,
			250,
			108,
			120,
			247,
			29,
			67,
			222
		]
	},
	{
		name: "BoostBuyAndBurnEvent",
		discriminator: [
			63,
			69,
			28,
			22,
			48,
			92,
			194,
			185
		]
	},
	{
		name: "BuyEvent",
		discriminator: [
			103,
			244,
			82,
			31,
			44,
			245,
			119,
			119
		]
	},
	{
		name: "ClaimCashbackEvent",
		discriminator: [
			226,
			214,
			246,
			33,
			7,
			242,
			147,
			229
		]
	},
	{
		name: "ClaimTokenIncentivesEvent",
		discriminator: [
			79,
			172,
			246,
			49,
			205,
			91,
			206,
			232
		]
	},
	{
		name: "CloseUserVolumeAccumulatorEvent",
		discriminator: [
			146,
			159,
			189,
			172,
			146,
			88,
			56,
			244
		]
	},
	{
		name: "CollectCoinCreatorFeeEvent",
		discriminator: [
			232,
			245,
			194,
			238,
			234,
			218,
			58,
			89
		]
	},
	{
		name: "CreateConfigEvent",
		discriminator: [
			107,
			52,
			89,
			129,
			55,
			226,
			81,
			22
		]
	},
	{
		name: "CreatePoolEvent",
		discriminator: [
			177,
			49,
			12,
			210,
			160,
			118,
			167,
			116
		]
	},
	{
		name: "DepositEvent",
		discriminator: [
			120,
			248,
			61,
			83,
			31,
			142,
			107,
			144
		]
	},
	{
		name: "DisableEvent",
		discriminator: [
			107,
			253,
			193,
			76,
			228,
			202,
			27,
			104
		]
	},
	{
		name: "ExtendAccountEvent",
		discriminator: [
			97,
			97,
			215,
			144,
			93,
			146,
			22,
			124
		]
	},
	{
		name: "InitBoostEvent",
		discriminator: [
			174,
			124,
			74,
			249,
			4,
			81,
			246,
			17
		]
	},
	{
		name: "InitUserVolumeAccumulatorEvent",
		discriminator: [
			134,
			36,
			13,
			72,
			232,
			101,
			130,
			216
		]
	},
	{
		name: "MigratePoolCoinCreatorEvent",
		discriminator: [
			170,
			221,
			82,
			199,
			147,
			165,
			247,
			46
		]
	},
	{
		name: "ReservedFeeRecipientsEvent",
		discriminator: [
			43,
			188,
			250,
			18,
			221,
			75,
			187,
			95
		]
	},
	{
		name: "SellEvent",
		discriminator: [
			62,
			47,
			55,
			10,
			165,
			3,
			220,
			42
		]
	},
	{
		name: "SetBondingCurveCoinCreatorEvent",
		discriminator: [
			242,
			231,
			235,
			102,
			65,
			99,
			189,
			211
		]
	},
	{
		name: "SetBoostAuthorityEvent",
		discriminator: [
			89,
			128,
			240,
			141,
			91,
			202,
			71,
			105
		]
	},
	{
		name: "SetMetaplexCoinCreatorEvent",
		discriminator: [
			150,
			107,
			199,
			123,
			124,
			207,
			102,
			228
		]
	},
	{
		name: "SweepPoolFeeEvent",
		discriminator: [
			130,
			164,
			36,
			97,
			228,
			130,
			135,
			165
		]
	},
	{
		name: "SyncUserVolumeAccumulatorEvent",
		discriminator: [
			197,
			122,
			167,
			124,
			116,
			81,
			91,
			255
		]
	},
	{
		name: "UpdateAdminEvent",
		discriminator: [
			225,
			152,
			171,
			87,
			246,
			63,
			66,
			234
		]
	},
	{
		name: "UpdateCreatorFeeConfigEvent",
		discriminator: [
			152,
			198,
			124,
			124,
			106,
			246,
			127,
			191
		]
	},
	{
		name: "UpdateFeeConfigEvent",
		discriminator: [
			90,
			23,
			65,
			35,
			62,
			244,
			188,
			208
		]
	},
	{
		name: "WithdrawEvent",
		discriminator: [
			22,
			9,
			133,
			26,
			160,
			44,
			71,
			192
		]
	}
];
var errors = [
	{
		code: 6000,
		name: "FeeBasisPointsExceedsMaximum"
	},
	{
		code: 6001,
		name: "ZeroBaseAmount"
	},
	{
		code: 6002,
		name: "ZeroQuoteAmount"
	},
	{
		code: 6003,
		name: "TooLittlePoolTokenLiquidity"
	},
	{
		code: 6004,
		name: "ExceededSlippage"
	},
	{
		code: 6005,
		name: "InvalidAdmin"
	},
	{
		code: 6006,
		name: "UnsupportedBaseMint"
	},
	{
		code: 6007,
		name: "UnsupportedQuoteMint"
	},
	{
		code: 6008,
		name: "InvalidBaseMint"
	},
	{
		code: 6009,
		name: "InvalidQuoteMint"
	},
	{
		code: 6010,
		name: "InvalidLpMint"
	},
	{
		code: 6011,
		name: "AllProtocolFeeRecipientsShouldBeNonZero"
	},
	{
		code: 6012,
		name: "UnsortedNotUniqueProtocolFeeRecipients"
	},
	{
		code: 6013,
		name: "InvalidProtocolFeeRecipient"
	},
	{
		code: 6014,
		name: "InvalidPoolBaseTokenAccount"
	},
	{
		code: 6015,
		name: "InvalidPoolQuoteTokenAccount"
	},
	{
		code: 6016,
		name: "BuyMoreBaseAmountThanPoolReserves"
	},
	{
		code: 6017,
		name: "DisabledCreatePool"
	},
	{
		code: 6018,
		name: "DisabledDeposit"
	},
	{
		code: 6019,
		name: "DisabledWithdraw"
	},
	{
		code: 6020,
		name: "DisabledBuy"
	},
	{
		code: 6021,
		name: "DisabledSell"
	},
	{
		code: 6022,
		name: "SameMint"
	},
	{
		code: 6023,
		name: "Overflow"
	},
	{
		code: 6024,
		name: "Truncation"
	},
	{
		code: 6025,
		name: "DivisionByZero"
	},
	{
		code: 6026,
		name: "NewSizeLessThanCurrentSize"
	},
	{
		code: 6027,
		name: "AccountTypeNotSupported"
	},
	{
		code: 6028,
		name: "OnlyCanonicalPumpPoolsCanHaveCoinCreator"
	},
	{
		code: 6029,
		name: "InvalidAdminSetCoinCreatorAuthority"
	},
	{
		code: 6030,
		name: "StartTimeInThePast"
	},
	{
		code: 6031,
		name: "EndTimeInThePast"
	},
	{
		code: 6032,
		name: "EndTimeBeforeStartTime"
	},
	{
		code: 6033,
		name: "TimeRangeTooLarge"
	},
	{
		code: 6034,
		name: "EndTimeBeforeCurrentDay"
	},
	{
		code: 6035,
		name: "SupplyUpdateForFinishedRange"
	},
	{
		code: 6036,
		name: "DayIndexAfterEndIndex"
	},
	{
		code: 6037,
		name: "DayInActiveRange"
	},
	{
		code: 6038,
		name: "InvalidIncentiveMint"
	},
	{
		code: 6039,
		name: "BuyNotEnoughQuoteTokensToCoverFees",
		msg: "buy: Not enough quote tokens to cover for fees."
	},
	{
		code: 6040,
		name: "BuySlippageBelowMinBaseAmountOut",
		msg: "buy: slippage - would buy less tokens than expected min_base_amount_out"
	},
	{
		code: 6041,
		name: "MayhemModeDisabled"
	},
	{
		code: 6042,
		name: "OnlyPumpPoolsMayhemMode"
	},
	{
		code: 6043,
		name: "MayhemModeInDesiredState"
	},
	{
		code: 6044,
		name: "NotEnoughRemainingAccounts"
	},
	{
		code: 6045,
		name: "InvalidSharingConfigBaseMint"
	},
	{
		code: 6046,
		name: "InvalidSharingConfigCoinCreator"
	},
	{
		code: 6047,
		name: "CoinCreatorMigratedToSharingConfig",
		msg: "coin creator has been migrated to sharing config"
	},
	{
		code: 6048,
		name: "CreatorVaultMigratedToSharingConfig",
		msg: "creator_vault has been migrated to sharing config, use pump:distribute_creator_fees instead"
	},
	{
		code: 6049,
		name: "CashbackNotEnabled",
		msg: "Cashback is disabled"
	},
	{
		code: 6050,
		name: "OnlyPumpPoolsCashback"
	},
	{
		code: 6051,
		name: "CashbackNotInDesiredState"
	},
	{
		code: 6052,
		name: "TokensInVaultLessThanCashbackEarned"
	},
	{
		code: 6053,
		name: "BuybackFeeRecipientNotAuthorized",
		msg: "Buyback fee recipient not authorized"
	},
	{
		code: 6054,
		name: "AllBuybackFeeRecipientsShouldBeNonZero"
	},
	{
		code: 6055,
		name: "NotUniqueBuybackFeeRecipients"
	},
	{
		code: 6056,
		name: "BuybackBasisPointsOutOfRange",
		msg: "buyback_basis_points must be <= 10_000"
	},
	{
		code: 6057,
		name: "WrongBuybackFeeRecipientsCount",
		msg: "buyback fee recipients require exactly 8 remaining accounts (or none)"
	},
	{
		code: 6058,
		name: "BuybackFeeRecipientMissing"
	},
	{
		code: 6059,
		name: "MissingCashbackAccounts",
		msg: "Cashback trade is missing the required remaining accounts"
	},
	{
		code: 6060,
		name: "InvalidCashbackAccumulator",
		msg: "Cashback user_volume_accumulator account is invalid"
	},
	{
		code: 6061,
		name: "InvalidCashbackAccumulatorAta",
		msg: "Cashback user_volume_accumulator ATA is missing or invalid"
	},
	{
		code: 6062,
		name: "InvalidPoolV2",
		msg: "pool_v2 remaining account is missing or invalid"
	},
	{
		code: 6063,
		name: "InsufficientRealQuoteReserves",
		msg: "BOOST: sell output exceeds the real quote vault. effective = real + virtual is pricing-only; payout is capped at real_vault, so quote min(out, real_vault)"
	},
	{
		code: 6064,
		name: "BoostPoolLiquidityUnsupported",
		msg: "BOOST: deposit/withdraw don't apply to boost pools"
	},
	{
		code: 6065,
		name: "PoolCannotBoost",
		msg: "BOOST: pool cannot be boosted (no virtual reserves)"
	},
	{
		code: 6066,
		name: "BoostDisabled",
		msg: "BOOST: boost is disabled"
	},
	{
		code: 6067,
		name: "SeedLockViolation",
		msg: "BOOST: lp_supply must never drop below the circulating LP mint supply"
	},
	{
		code: 6068,
		name: "CreatorFeeNotConfigurable",
		msg: "Configurable creator fee is disabled"
	},
	{
		code: 6069,
		name: "CreatorFeeBpsOutOfRange",
		msg: "Creator fee basis points must be between 1 and the configured maximum"
	},
	{
		code: 6070,
		name: "CreatorFeeNotEditable",
		msg: "Creator fee is not editable for this pool"
	},
	{
		code: 6071,
		name: "CreatorFeeNotAllowedForCashbackCoin",
		msg: "Cashback coins cannot have a creator fee"
	},
	{
		code: 6072,
		name: "SharingConfigNotActive",
		msg: "Sharing config is not active"
	},
	{
		code: 6073,
		name: "NotAuthorized",
		msg: "Not authorized"
	},
	{
		code: 6074,
		name: "HolderRewardCreatorImmutable",
		msg: "The coin creator of a holder-reward pool cannot be changed"
	},
	{
		code: 6075,
		name: "CtoNotAllowedForMayhemPool",
		msg: "CTO is not allowed on a mayhem-mode pool"
	},
	{
		code: 6076,
		name: "InvalidHolderRewardCoinCreator",
		msg: "A holder-reward pool's coin creator must be the holder-rewards PDA"
	},
	{
		code: 6077,
		name: "CreatorFeeNotConfigurableForQuote",
		msg: "Creator fee is not configurable on a SOL or USDC quote; the fee schedule applies"
	},
	{
		code: 6078,
		name: "OnlyPumpPools",
		msg: "Only canonical pump pools are supported by this instruction"
	},
	{
		code: 6079,
		name: "CashbackCoinNotSupported",
		msg: "v2 trades do not support cashback coins; use the v1 instructions"
	},
	{
		code: 6080,
		name: "MayhemPoolNotSupported",
		msg: "v2 trades do not support mayhem-mode pools; use the v1 instructions"
	},
	{
		code: 6081,
		name: "CreatorFeesNotSwept",
		msg: "creator_fees must be swept before the coin creator changes"
	},
	{
		code: 6082,
		name: "FeeTiersEmpty",
		msg: "The fee config tier table is empty"
	},
	{
		code: 6083,
		name: "FeeConfigTooShort",
		msg: "The fee config account is shorter than its initialize size"
	},
	{
		code: 6084,
		name: "MultiHopDiscontinuousPath",
		msg: "multi-hop: a hop's input mint is neither side of its pool or curve, or the route does not end in user_out_token_account's mint"
	},
	{
		code: 6085,
		name: "MultiHopCurveRunMismatch",
		msg: "multi-hop: the balances around the bonding-curve hops do not match the amounts pump reported"
	},
	{
		code: 6086,
		name: "MultiHopMixedDirection",
		msg: "multi-hop: every hop must trade in the same direction, all buys or all sells"
	},
	{
		code: 6087,
		name: "SelfTransferNotAllowed",
		msg: "A transfer's source is its destination and the signer does not own it"
	},
	{
		code: 6088,
		name: "QuoteMintNotWritable",
		msg: "quote_mint must be writable for a quote with a Token-2022 transfer fee: its withheld fees are harvested to the mint"
	}
];
var types = [
	{
		name: "AdminCtoPoolEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "old_coin_creator",
					type: "pubkey"
				},
				{
					name: "new_coin_creator",
					type: "pubkey"
				},
				{
					name: "is_holder_reward",
					type: "bool"
				},
				{
					name: "is_cashback_coin",
					type: "bool"
				},
				{
					name: "old_creator_fee_bps",
					type: "u64"
				},
				{
					name: "new_creator_fee_bps",
					type: "u64"
				}
			]
		}
	},
	{
		name: "AdminUpdateTokenIncentivesEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "start_time",
					type: "i64"
				},
				{
					name: "end_time",
					type: "i64"
				},
				{
					name: "day_number",
					type: "u64"
				},
				{
					name: "token_supply_per_day",
					type: "u64"
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "seconds_in_a_day",
					type: "i64"
				},
				{
					name: "timestamp",
					type: "i64"
				}
			]
		}
	},
	{
		name: "BondingCurve",
		type: {
			kind: "struct",
			fields: [
				{
					name: "virtual_token_reserves",
					type: "u64"
				},
				{
					name: "virtual_sol_reserves",
					type: "u64"
				},
				{
					name: "real_token_reserves",
					type: "u64"
				},
				{
					name: "real_sol_reserves",
					type: "u64"
				},
				{
					name: "token_total_supply",
					type: "u64"
				},
				{
					name: "complete",
					type: "bool"
				},
				{
					name: "creator",
					type: "pubkey"
				},
				{
					name: "is_mayhem_mode",
					type: "bool"
				},
				{
					name: "is_cashback_coin",
					type: "bool"
				}
			]
		}
	},
	{
		name: "BoostBuyAndBurnEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "bonding_curve",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "authority",
					type: "pubkey"
				},
				{
					name: "quote_amount_in_requested",
					type: "u64"
				},
				{
					name: "quote_amount_in_used",
					type: "u64"
				},
				{
					name: "base_amount_burned",
					type: "u64"
				},
				{
					name: "virtual_quote_reserves",
					type: "i128"
				},
				{
					name: "real_quote_reserves_after",
					type: "u64"
				},
				{
					name: "base_reserves_after",
					type: "u64"
				},
				{
					name: "boost_vault_remaining",
					type: "u64"
				}
			]
		}
	},
	{
		name: "BuyEvent",
		docs: [
			"ix_name: \"buy\" | \"buy_exact_quote_in\""
		],
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_amount_out",
					type: "u64"
				},
				{
					name: "max_quote_amount_in",
					type: "u64"
				},
				{
					name: "user_base_token_reserves",
					type: "u64"
				},
				{
					name: "user_quote_token_reserves",
					type: "u64"
				},
				{
					name: "pool_base_token_reserves",
					type: "u64"
				},
				{
					name: "pool_quote_token_reserves",
					type: "u64"
				},
				{
					name: "quote_amount_in",
					type: "u64"
				},
				{
					name: "lp_fee_basis_points",
					type: "u64"
				},
				{
					name: "lp_fee",
					type: "u64"
				},
				{
					name: "protocol_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee",
					type: "u64"
				},
				{
					name: "quote_amount_in_with_lp_fee",
					type: "u64"
				},
				{
					name: "user_quote_amount_in",
					type: "u64"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "user_base_token_account",
					type: "pubkey"
				},
				{
					name: "user_quote_token_account",
					type: "pubkey"
				},
				{
					name: "protocol_fee_recipient",
					type: "pubkey"
				},
				{
					name: "protocol_fee_recipient_token_account",
					type: "pubkey"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				},
				{
					name: "coin_creator_fee_basis_points",
					type: "u64"
				},
				{
					name: "coin_creator_fee",
					type: "u64"
				},
				{
					name: "track_volume",
					type: "bool"
				},
				{
					name: "total_unclaimed_tokens",
					type: "u64"
				},
				{
					name: "total_claimed_tokens",
					type: "u64"
				},
				{
					name: "current_sol_volume",
					type: "u64"
				},
				{
					name: "last_update_timestamp",
					type: "i64"
				},
				{
					name: "min_base_amount_out",
					type: "u64"
				},
				{
					name: "ix_name",
					type: "string"
				},
				{
					name: "cashback_fee_basis_points",
					type: "u64"
				},
				{
					name: "cashback",
					type: "u64"
				},
				{
					name: "buyback_fee_basis_points",
					type: "u64"
				},
				{
					name: "buyback_fee",
					type: "u64"
				},
				{
					name: "virtual_quote_reserves",
					type: "i128"
				},
				{
					name: "can_boost",
					type: "bool"
				},
				{
					name: "base_supply",
					type: "u64"
				},
				{
					name: "holder_rewards_bps",
					type: "u64"
				},
				{
					name: "holder_rewards",
					type: "u64"
				},
				{
					name: "creator_fee_unclaimed",
					type: "u64"
				},
				{
					name: "quote_transfer_fee",
					type: "u64"
				}
			]
		}
	},
	{
		name: "ClaimCashbackEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "amount",
					type: "u64"
				},
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "total_claimed",
					type: "u64"
				},
				{
					name: "total_cashback_earned",
					type: "u64"
				}
			]
		}
	},
	{
		name: "ClaimTokenIncentivesEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "amount",
					type: "u64"
				},
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "total_claimed_tokens",
					type: "u64"
				},
				{
					name: "current_sol_volume",
					type: "u64"
				}
			]
		}
	},
	{
		name: "CloseUserVolumeAccumulatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "total_unclaimed_tokens",
					type: "u64"
				},
				{
					name: "total_claimed_tokens",
					type: "u64"
				},
				{
					name: "current_sol_volume",
					type: "u64"
				},
				{
					name: "last_update_timestamp",
					type: "i64"
				}
			]
		}
	},
	{
		name: "CollectCoinCreatorFeeEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				},
				{
					name: "coin_creator_fee",
					type: "u64"
				},
				{
					name: "coin_creator_vault_ata",
					type: "pubkey"
				},
				{
					name: "coin_creator_token_account",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "ConfigStatus",
		type: {
			kind: "enum",
			variants: [
				{
					name: "Paused"
				},
				{
					name: "Active"
				}
			]
		}
	},
	{
		name: "CreateConfigEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "lp_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee_recipients",
					type: {
						array: [
							"pubkey",
							8
						]
					}
				},
				{
					name: "coin_creator_fee_basis_points",
					type: "u64"
				},
				{
					name: "admin_set_coin_creator_authority",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "CreatePoolEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "index",
					type: "u16"
				},
				{
					name: "creator",
					type: "pubkey"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "quote_mint",
					type: "pubkey"
				},
				{
					name: "base_mint_decimals",
					type: "u8"
				},
				{
					name: "quote_mint_decimals",
					type: "u8"
				},
				{
					name: "base_amount_in",
					type: "u64"
				},
				{
					name: "quote_amount_in",
					type: "u64"
				},
				{
					name: "pool_base_amount",
					type: "u64"
				},
				{
					name: "pool_quote_amount",
					type: "u64"
				},
				{
					name: "minimum_liquidity",
					type: "u64"
				},
				{
					name: "initial_liquidity",
					type: "u64"
				},
				{
					name: "lp_token_amount_out",
					type: "u64"
				},
				{
					name: "pool_bump",
					type: "u8"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "lp_mint",
					type: "pubkey"
				},
				{
					name: "user_base_token_account",
					type: "pubkey"
				},
				{
					name: "user_quote_token_account",
					type: "pubkey"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				},
				{
					name: "is_mayhem_mode",
					type: "bool"
				},
				{
					name: "creator_fee_bps",
					type: "u64"
				},
				{
					name: "can_edit_creator_fee",
					type: "bool"
				},
				{
					name: "is_holder_reward",
					type: "bool"
				}
			]
		}
	},
	{
		name: "DepositEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "lp_token_amount_out",
					type: "u64"
				},
				{
					name: "max_base_amount_in",
					type: "u64"
				},
				{
					name: "max_quote_amount_in",
					type: "u64"
				},
				{
					name: "user_base_token_reserves",
					type: "u64"
				},
				{
					name: "user_quote_token_reserves",
					type: "u64"
				},
				{
					name: "pool_base_token_reserves",
					type: "u64"
				},
				{
					name: "pool_quote_token_reserves",
					type: "u64"
				},
				{
					name: "base_amount_in",
					type: "u64"
				},
				{
					name: "quote_amount_in",
					type: "u64"
				},
				{
					name: "lp_mint_supply",
					type: "u64"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "user_base_token_account",
					type: "pubkey"
				},
				{
					name: "user_quote_token_account",
					type: "pubkey"
				},
				{
					name: "user_pool_token_account",
					type: "pubkey"
				},
				{
					name: "quote_transfer_fee",
					type: "u64"
				}
			]
		}
	},
	{
		name: "DisableEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "disable_create_pool",
					type: "bool"
				},
				{
					name: "disable_deposit",
					type: "bool"
				},
				{
					name: "disable_withdraw",
					type: "bool"
				},
				{
					name: "disable_buy",
					type: "bool"
				},
				{
					name: "disable_sell",
					type: "bool"
				}
			]
		}
	},
	{
		name: "ExtendAccountEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "account",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "current_size",
					type: "u64"
				},
				{
					name: "new_size",
					type: "u64"
				}
			]
		}
	},
	{
		name: "FeeConfig",
		type: {
			kind: "struct",
			fields: [
				{
					name: "bump",
					type: "u8"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "flat_fees",
					type: {
						defined: {
							name: "Fees"
						}
					}
				},
				{
					name: "fee_tiers",
					type: {
						vec: {
							defined: {
								name: "FeeTier"
							}
						}
					}
				},
				{
					name: "stable_fee_tiers",
					type: {
						vec: {
							defined: {
								name: "FeeTier"
							}
						}
					}
				},
				{
					name: "exotic_flat_fees",
					type: {
						defined: {
							name: "Fees"
						}
					}
				}
			]
		}
	},
	{
		name: "FeeTier",
		type: {
			kind: "struct",
			fields: [
				{
					name: "market_cap_lamports_threshold",
					type: "u128"
				},
				{
					name: "fees",
					type: {
						defined: {
							name: "Fees"
						}
					}
				}
			]
		}
	},
	{
		name: "Fees",
		type: {
			kind: "struct",
			fields: [
				{
					name: "lp_fee_bps",
					type: "u64"
				},
				{
					name: "protocol_fee_bps",
					type: "u64"
				},
				{
					name: "creator_fee_bps",
					type: "u64"
				}
			]
		}
	},
	{
		name: "GlobalConfig",
		type: {
			kind: "struct",
			fields: [
				{
					name: "admin",
					docs: [
						"The admin pubkey"
					],
					type: "pubkey"
				},
				{
					name: "lp_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee_basis_points",
					type: "u64"
				},
				{
					name: "disable_flags",
					docs: [
						"Flags to disable certain functionality",
						"bit 0 - Disable create pool",
						"bit 1 - Disable deposit",
						"bit 2 - Disable withdraw",
						"bit 3 - Disable buy",
						"bit 4 - Disable sell"
					],
					type: "u8"
				},
				{
					name: "protocol_fee_recipients",
					docs: [
						"Addresses of the protocol fee recipients"
					],
					type: {
						array: [
							"pubkey",
							8
						]
					}
				},
				{
					name: "coin_creator_fee_basis_points",
					type: "u64"
				},
				{
					name: "admin_set_coin_creator_authority",
					docs: [
						"The admin authority for setting coin creators"
					],
					type: "pubkey"
				},
				{
					name: "whitelist_pda",
					type: "pubkey"
				},
				{
					name: "reserved_fee_recipient",
					type: "pubkey"
				},
				{
					name: "mayhem_mode_enabled",
					type: "bool"
				},
				{
					name: "reserved_fee_recipients",
					type: {
						array: [
							"pubkey",
							7
						]
					}
				},
				{
					name: "is_cashback_enabled",
					type: "bool"
				},
				{
					name: "buyback_fee_recipients",
					type: {
						array: [
							"pubkey",
							8
						]
					}
				},
				{
					name: "buyback_basis_points",
					type: "u64"
				},
				{
					name: "boost_authority",
					type: "pubkey"
				},
				{
					name: "boost_enabled",
					type: "bool"
				},
				{
					name: "creator_fee_configurable",
					type: "bool"
				},
				{
					name: "max_configurable_creator_fee_bps",
					type: "u64"
				}
			]
		}
	},
	{
		name: "GlobalVolumeAccumulator",
		type: {
			kind: "struct",
			fields: [
				{
					name: "start_time",
					type: "i64"
				},
				{
					name: "end_time",
					type: "i64"
				},
				{
					name: "seconds_in_a_day",
					type: "i64"
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "total_token_supply",
					type: {
						array: [
							"u64",
							30
						]
					}
				},
				{
					name: "sol_volumes",
					type: {
						array: [
							"u64",
							30
						]
					}
				}
			]
		}
	},
	{
		name: "InitBoostEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "bonding_curve",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "virtual_quote_reserves",
					type: "i128"
				},
				{
					name: "real_quote_reserves_after",
					type: "u64"
				}
			]
		}
	},
	{
		name: "InitUserVolumeAccumulatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "payer",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "timestamp",
					type: "i64"
				}
			]
		}
	},
	{
		name: "MigratePoolCoinCreatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "sharing_config",
					type: "pubkey"
				},
				{
					name: "old_coin_creator",
					type: "pubkey"
				},
				{
					name: "new_coin_creator",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "OptionBool",
		type: {
			kind: "struct",
			fields: [
				"bool"
			]
		}
	},
	{
		name: "OptionU64",
		type: {
			kind: "struct",
			fields: [
				"u64"
			]
		}
	},
	{
		name: "Pool",
		type: {
			kind: "struct",
			fields: [
				{
					name: "pool_bump",
					type: "u8"
				},
				{
					name: "index",
					type: "u16"
				},
				{
					name: "creator",
					type: "pubkey"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "quote_mint",
					type: "pubkey"
				},
				{
					name: "lp_mint",
					type: "pubkey"
				},
				{
					name: "pool_base_token_account",
					type: "pubkey"
				},
				{
					name: "pool_quote_token_account",
					type: "pubkey"
				},
				{
					name: "lp_supply",
					docs: [
						"True circulating supply without burns and lock-ups"
					],
					type: "u64"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				},
				{
					name: "is_mayhem_mode",
					type: "bool"
				},
				{
					name: "is_cashback_coin",
					type: "bool"
				},
				{
					name: "virtual_quote_reserves",
					docs: [
						"For non-boost pools, value is 0, so the behavior is identical to legacy pools."
					],
					type: "i128"
				},
				{
					name: "creator_fee_bps",
					type: "u64"
				},
				{
					name: "can_edit_creator_fee",
					type: "bool"
				},
				{
					name: "is_holder_reward",
					type: "bool"
				},
				{
					name: "protocol_fees",
					type: "u64"
				},
				{
					name: "creator_fees",
					type: "u64"
				}
			]
		}
	},
	{
		name: "ReservedFeeRecipientsEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "reserved_fee_recipient",
					type: "pubkey"
				},
				{
					name: "reserved_fee_recipients",
					type: {
						array: [
							"pubkey",
							7
						]
					}
				}
			]
		}
	},
	{
		name: "SellEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_amount_in",
					type: "u64"
				},
				{
					name: "min_quote_amount_out",
					type: "u64"
				},
				{
					name: "user_base_token_reserves",
					type: "u64"
				},
				{
					name: "user_quote_token_reserves",
					type: "u64"
				},
				{
					name: "pool_base_token_reserves",
					type: "u64"
				},
				{
					name: "pool_quote_token_reserves",
					type: "u64"
				},
				{
					name: "quote_amount_out",
					type: "u64"
				},
				{
					name: "lp_fee_basis_points",
					type: "u64"
				},
				{
					name: "lp_fee",
					type: "u64"
				},
				{
					name: "protocol_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee",
					type: "u64"
				},
				{
					name: "quote_amount_out_without_lp_fee",
					type: "u64"
				},
				{
					name: "user_quote_amount_out",
					type: "u64"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "user_base_token_account",
					type: "pubkey"
				},
				{
					name: "user_quote_token_account",
					type: "pubkey"
				},
				{
					name: "protocol_fee_recipient",
					type: "pubkey"
				},
				{
					name: "protocol_fee_recipient_token_account",
					type: "pubkey"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				},
				{
					name: "coin_creator_fee_basis_points",
					type: "u64"
				},
				{
					name: "coin_creator_fee",
					type: "u64"
				},
				{
					name: "cashback_fee_basis_points",
					type: "u64"
				},
				{
					name: "cashback",
					type: "u64"
				},
				{
					name: "buyback_fee_basis_points",
					type: "u64"
				},
				{
					name: "buyback_fee",
					type: "u64"
				},
				{
					name: "virtual_quote_reserves",
					type: "i128"
				},
				{
					name: "can_boost",
					type: "bool"
				},
				{
					name: "base_supply",
					type: "u64"
				},
				{
					name: "holder_rewards_bps",
					type: "u64"
				},
				{
					name: "holder_rewards",
					type: "u64"
				},
				{
					name: "creator_fee_unclaimed",
					type: "u64"
				},
				{
					name: "quote_transfer_fee",
					type: "u64"
				}
			]
		}
	},
	{
		name: "SetBondingCurveCoinCreatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "bonding_curve",
					type: "pubkey"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "SetBoostAuthorityEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "old_boost_authority",
					type: "pubkey"
				},
				{
					name: "new_boost_authority",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "SetMetaplexCoinCreatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "metadata",
					type: "pubkey"
				},
				{
					name: "coin_creator",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "Shareholder",
		type: {
			kind: "struct",
			fields: [
				{
					name: "address",
					type: "pubkey"
				},
				{
					name: "share_bps",
					type: "u16"
				}
			]
		}
	},
	{
		name: "SharingConfig",
		type: {
			kind: "struct",
			fields: [
				{
					name: "bump",
					type: "u8"
				},
				{
					name: "version",
					type: "u8"
				},
				{
					name: "status",
					type: {
						defined: {
							name: "ConfigStatus"
						}
					}
				},
				{
					name: "mint",
					type: "pubkey"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "admin_revoked",
					type: "bool"
				},
				{
					name: "shareholders",
					type: {
						vec: {
							defined: {
								name: "Shareholder"
							}
						}
					}
				}
			]
		}
	},
	{
		name: "SweepPoolFeeEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "base_mint",
					type: "pubkey"
				},
				{
					name: "quote_mint",
					type: "pubkey"
				},
				{
					name: "recipient",
					type: "pubkey"
				},
				{
					name: "payer",
					type: "pubkey"
				},
				{
					name: "amount",
					type: "u64"
				},
				{
					name: "bucket",
					type: "u8"
				}
			]
		}
	},
	{
		name: "SyncUserVolumeAccumulatorEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "total_claimed_tokens_before",
					type: "u64"
				},
				{
					name: "total_claimed_tokens_after",
					type: "u64"
				},
				{
					name: "timestamp",
					type: "i64"
				}
			]
		}
	},
	{
		name: "UpdateAdminEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "new_admin",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "UpdateCreatorFeeConfigEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "creator_fee_configurable",
					type: "bool"
				},
				{
					name: "max_configurable_creator_fee_bps",
					type: "u64"
				}
			]
		}
	},
	{
		name: "UpdateFeeConfigEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "admin",
					type: "pubkey"
				},
				{
					name: "lp_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee_basis_points",
					type: "u64"
				},
				{
					name: "protocol_fee_recipients",
					type: {
						array: [
							"pubkey",
							8
						]
					}
				},
				{
					name: "coin_creator_fee_basis_points",
					type: "u64"
				},
				{
					name: "admin_set_coin_creator_authority",
					type: "pubkey"
				}
			]
		}
	},
	{
		name: "UserVolumeAccumulator",
		type: {
			kind: "struct",
			fields: [
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "needs_claim",
					type: "bool"
				},
				{
					name: "total_unclaimed_tokens",
					type: "u64"
				},
				{
					name: "total_claimed_tokens",
					type: "u64"
				},
				{
					name: "current_sol_volume",
					type: "u64"
				},
				{
					name: "last_update_timestamp",
					type: "i64"
				},
				{
					name: "has_total_claimed_tokens",
					type: "bool"
				},
				{
					name: "cashback_earned",
					type: "u64"
				},
				{
					name: "total_cashback_claimed",
					type: "u64"
				}
			]
		}
	},
	{
		name: "WithdrawEvent",
		type: {
			kind: "struct",
			fields: [
				{
					name: "timestamp",
					type: "i64"
				},
				{
					name: "lp_token_amount_in",
					type: "u64"
				},
				{
					name: "min_base_amount_out",
					type: "u64"
				},
				{
					name: "min_quote_amount_out",
					type: "u64"
				},
				{
					name: "user_base_token_reserves",
					type: "u64"
				},
				{
					name: "user_quote_token_reserves",
					type: "u64"
				},
				{
					name: "pool_base_token_reserves",
					type: "u64"
				},
				{
					name: "pool_quote_token_reserves",
					type: "u64"
				},
				{
					name: "base_amount_out",
					type: "u64"
				},
				{
					name: "quote_amount_out",
					type: "u64"
				},
				{
					name: "lp_mint_supply",
					type: "u64"
				},
				{
					name: "pool",
					type: "pubkey"
				},
				{
					name: "user",
					type: "pubkey"
				},
				{
					name: "user_base_token_account",
					type: "pubkey"
				},
				{
					name: "user_quote_token_account",
					type: "pubkey"
				},
				{
					name: "user_pool_token_account",
					type: "pubkey"
				},
				{
					name: "quote_transfer_fee",
					type: "u64"
				}
			]
		}
	}
];
var pump_amm = {
	address: address,
	metadata: metadata,
	instructions: instructions,
	accounts: accounts,
	events: events,
	errors: errors,
	types: types
};

export { type BuyBaseInputResult, type BuyQuoteInputResult, CANONICAL_POOL_INDEX, type CollectCoinCreatorFeeSolanaState, type CommonSolanaState, type CreatePoolSolanaState, type DepositBaseAndLpTokenFromQuoteResult, type DepositBaseResult, type DepositLpTokenResult, type DepositQuoteAndLpTokenFromBaseResult, type DepositQuoteResult, type DepositResult, FEE_CONFIG_SIZE_POST_EXOTIC, FEE_CONFIG_SIZE_POST_STABLE, FEE_CONFIG_SIZE_PRE_STABLE, type FeeConfig, type FeeTier, type Fees, GLOBAL_CONFIG_PDA, GLOBAL_CONFIG_SIZE, GLOBAL_VOLUME_ACCUMULATOR_PDA, type GlobalConfig, type GlobalVolumeAccumulator, type LiquidityAccounts, type LiquiditySolanaState, MPL_TOKEN_METADATA_PROGRAM_ID, MULTI_HOP_MAX_HOPS, type MultiHopCurveQuoteHop, type MultiHopCurveVenue, type MultiHopLegFees, type MultiHopPoolQuoteHop, type MultiHopPoolVenue, type MultiHopQuoteHop, type MultiHopRoute, type MultiHopVenue, OFFLINE_PUMP_AMM_PROGRAM, OnlinePumpAmmSdk, POOL_ACCOUNT_NEW_SIZE, POOL_SIZE, PUMP_AMM_EVENT_AUTHORITY_PDA, PUMP_AMM_FEE_CONFIG_PDA, PUMP_AMM_PROGRAM_ID, PUMP_AMM_SDK, PUMP_AMM_TOTAL_TOKEN_SUPPLY, PUMP_EVENT_AUTHORITY_PDA, PUMP_FEE_CONFIG_PDA, PUMP_FEE_PROGRAM_ID, PUMP_GLOBAL_PDA, PUMP_MINT, PUMP_PROGRAM_ID, type Pool, PumpAmm, PumpAmmAdminSdk, PumpAmmSdk, type QuoteTransferFee, SOL_LIKE_QUOTE_MINTS, STABLE_QUOTE_MINTS, type SellBaseInputResult, type SellQuoteInputResult, type SwapAccounts, type SwapSolanaState, type TradeOptions, USDC_MINT, type UserVolumeAccumulator, type WithdrawAutocompleteResult, type WithdrawResult, bondingCurvePda, boostVaultAta, boostVaultAuthorityPda, buyBaseInput, buyDebit, buyQuoteInput, calculateFeeTier, canonicalPoolQuoteMint, canonicalPumpPoolPda, coinCreatorVaultAtaPda, coinCreatorVaultAuthorityPda, computeFeesBps, currentDayTokens, depositLpToken, feeSharingConfigPda, feesForQuoteMint, getBuybackFeeRecipient, getFeeRecipient, getPumpAmmProgram, grossForTransferFee, holderRewardsPda, isPumpPool, isSolLikeQuoteMint, isStableQuoteMint, isZeroFees, lpMintAta, lpMintPda, metadataPda, multiHopSwapQuote, netOfTransferFee, parseTransferFeeConfig, poolMarketCap, poolPda, poolV2Pda, pump_amm as pumpAmmJson, pumpAmmPda, pumpFeePda, pumpPda, pumpPoolAuthorityPda, resolveMultiHopRoute, sellBaseInput, sellQuoteInput, supportsTradeV2, totalUnclaimedTokens, transferFeeAt, transferFeeOn, userVolumeAccumulatorPda, withdraw };
