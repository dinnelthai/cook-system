# Local execution capability flags

All local capabilities are independent and default to disabled.

| Environment variable | Capability |
|---|---|
| `COOK_LOCAL_FAUCET=1` | Local validator airdrop only |
| `COOK_LOCAL_TRANSFER=1` | Local validator wallet transfers |
| `COOK_LOCAL_TRADING=1` | Local PumpSwap trading adapter |
| unset / any other value | Disabled |

Setting one flag never enables another. Each adapter also requires an independently pinned non-public genesis hash and loopback-only RPC. Trading additionally requires the explicitly configured loopback Pump Lab endpoint and wallet ownership checks. Do not set these flags against public clusters or production funds. The server is a local development service, not an authenticated multi-user service.

Example: enable only the local faucet:

```bash
COOK_LOCAL_FAUCET=1
# Leave COOK_LOCAL_TRANSFER and COOK_LOCAL_TRADING unset.
```

The offline server also applies bounded HTTP header/request timeouts, keep-alive limits and a per-process connection cap. These controls reduce accidental resource exhaustion; they are not a substitute for OS-level isolation.

The local HTTP API now measures request bodies in bytes (not UTF-16 characters), drains oversized requests without retaining them, enforces the 4 KiB body cap, and rejects malformed UTF-8. Request/header timeouts bound slow-client resource use.

The paper quote gate now blocks when volatility evidence is missing, malformed or outside its accepted basis-point range instead of silently substituting zero volatility. Inventory skew is strictly below 10000 bps so the reservation price cannot collapse to zero; maximum drawdown policy is capped at 10000 bps. Numeric strings are length-bounded before BigInt parsing to prevent pathological inputs. These are paper-risk controls only; no live order path was added.

The alert journal and file-backed emergency halt now use the shared bounded regular-file reader, so their read paths also reject leaf symlinks and cap bytes actually consumed. Halt state remains fail-closed if the file cannot be read. This does not provide protection against a malicious process with the same OS user or untrusted parent directories.

## Launcher safety correction

`scripts/start-localnet.mjs` no longer enables the local faucet implicitly. Faucet, transfer and trading flags are forwarded only when the operator explicitly sets the corresponding `COOK_LOCAL_*` variable to exactly `1`; otherwise each is passed as `0`. The launcher remains a private-LAN-to-loopback port forward and must only target the operator's known local validator host.

## Transfer confirmation semantics

Local wallet transfers now poll the submitted signature and report `CONFIRMED`, `FAILED`, or `UNKNOWN`. A send/confirmation transport error after the submission boundary is deliberately reported as `UNKNOWN`; operators must inspect the signature or sender/recipient balances before retrying. The adapter never auto-retries a transfer.
