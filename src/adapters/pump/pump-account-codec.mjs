import {
  PUMP_PROGRAM_ID,
  decodeProgramAccount,
} from "./pump-decoder.mjs";

export const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function accountBytes(accountInfo) {
  const encoded = accountInfo?.value?.data;
  if (!Array.isArray(encoded) || encoded[1] !== "base64" || typeof encoded[0] !== "string") {
    throw new TypeError("accountInfo must contain base64 account data");
  }
  return Buffer.from(encoded[0], "base64");
}

export function decodeMintAccount(accountInfo) {
  const owner = accountInfo?.value?.owner;
  if (owner !== SPL_TOKEN_PROGRAM_ID && owner !== TOKEN_2022_PROGRAM_ID) {
    const error = new Error(`unsupported mint owner program: ${owner}`);
    error.code = "UNSUPPORTED_TOKEN_PROGRAM";
    throw error;
  }
  const bytes = accountBytes(accountInfo);
  if (bytes.length < 82) throw new RangeError("mint account data is shorter than the base SPL Mint layout");
  const decimals = bytes.readUInt8(44);
  const initialized = bytes.readUInt8(45) === 1;
  if (!initialized) throw new Error("mint account is not initialized");
  return {
    owner_program_id: owner,
    decimals,
    supply_base_units: bytes.readBigUInt64LE(36).toString(),
    is_token_2022: owner === TOKEN_2022_PROGRAM_ID,
    account_data_length: bytes.length,
  };
}

export function decodeBondingCurveAccount(accountInfo) {
  const owner = accountInfo?.value?.owner;
  if (owner !== PUMP_PROGRAM_ID) {
    const error = new Error(`bonding curve is not owned by Pump: ${owner}`);
    error.code = "INVALID_BONDING_CURVE_OWNER";
    throw error;
  }
  const decoded = decodeProgramAccount({
    programId: PUMP_PROGRAM_ID,
    data: accountBytes(accountInfo),
    encoding: "base64",
  });
  if (!["DECODED", "PARTIAL_ACCOUNT_LAYOUT"].includes(decoded.status) || decoded.account_name !== "BondingCurve") {
    const error = new Error(`unable to decode BondingCurve account: ${decoded.status}`);
    error.code = "BONDING_CURVE_DECODE_FAILED";
    error.decoded = decoded;
    throw error;
  }
  return {
    ...decoded,
    account_address: accountInfo.address ?? null,
    account_owner: owner,
    context_slot: accountInfo.context?.slot ?? null,
    data: {
      ...decoded.data,
      virtual_token_reserves_base_units: decoded.data.virtual_token_reserves?.toString?.() ?? null,
      virtual_quote_reserves_base_units: decoded.data.virtual_quote_reserves?.toString?.() ?? null,
      real_token_reserves_base_units: decoded.data.real_token_reserves?.toString?.() ?? null,
      real_quote_reserves_base_units: decoded.data.real_quote_reserves?.toString?.() ?? null,
      token_total_supply_base_units: decoded.data.token_total_supply?.toString?.() ?? null,
      protocol_fees_base_units: decoded.data.protocol_fees?.toString?.() ?? null,
      creator_fees_base_units: decoded.data.creator_fee?.toString?.() ?? null,
    },
  };
}

export function bondingCurveSnapshotState(decodedAccount) {
  if (!decodedAccount?.data) throw new TypeError("decoded BondingCurve account is required");
  const data = decodedAccount.data;
  const required = [
    "virtual_token_reserves_base_units",
    "virtual_quote_reserves_base_units",
    "real_token_reserves_base_units",
    "real_quote_reserves_base_units",
    "token_total_supply_base_units",
    "protocol_fees_base_units",
    "creator_fees_base_units",
  ];
  const missing = required.filter((field) => data[field] === null || data[field] === undefined);
  if (missing.length) {
    const error = new Error(`BondingCurve snapshot is missing: ${missing.join(", ")}`);
    error.code = "PARTIAL_BONDING_CURVE_SNAPSHOT";
    error.missing_fields = missing;
    throw error;
  }
  return {
    virtual_token_reserves_base_units: data.virtual_token_reserves_base_units,
    virtual_quote_reserves_base_units: data.virtual_quote_reserves_base_units,
    real_token_reserves_base_units: data.real_token_reserves_base_units,
    real_quote_reserves_base_units: data.real_quote_reserves_base_units,
    token_total_supply_base_units: data.token_total_supply_base_units,
    protocol_fees_base_units: data.protocol_fees_base_units,
    creator_fees_base_units: data.creator_fees_base_units,
    complete: data.complete,
  };
}

export function normalizeBondingCurveMarket({
  mint,
  quoteMint = "So11111111111111111111111111111111111111112",
  network = "mainnet",
  curveAccount,
  idlRevision,
}) {
  if (typeof mint !== "string" || mint.length === 0) throw new TypeError("mint is required");
  if (network !== "mainnet" && network !== "devnet") throw new TypeError("network must be mainnet or devnet");
  return {
    chain_id: "solana",
    network,
    token_mint: mint,
    quote_mint: quoteMint,
    curve_program_id: PUMP_PROGRAM_ID,
    curve_account: curveAccount ?? null,
    program_version: null,
    idl_revision: idlRevision ?? null,
    market_phase: "bonding_curve",
  };
}
