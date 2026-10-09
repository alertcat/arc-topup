# ArcTopUp

A minimal settlement contract for prepaid-credit checkouts on **Arc mainnet** (chain id 5042), where USDC is the native currency and the gas token. In production since October 2026 at RelayDance (relaydance.com/arc) for prepaid credit; this repository holds the contract, its deployment record and the design notes needed to integrate it.

| | |
|---|---|
| Contract | [`0x550E9520572e2Fabc4ae8d8212A3e0e8c12EaAc7`](https://explorer.arc.io/address/0x550E9520572e2Fabc4ae8d8212A3e0e8c12EaAc7) |
| Deployment tx | [`0xc4011339…a4c8b`](https://explorer.arc.io/tx/0xc4011339f1de81fa8a5fa6928dea5ae0cf9a27e399fcf593d998e82d734a4c8b), block 25129869 |
| Compiler | solc 0.8.28, optimizer 200 runs, EVM `paris` |

## The problem it solves

On Arc a payment is a plain value transfer. That is the whole appeal (sub-second finality, a sub-cent fee paid in the asset being spent, no token approval), but it has one consequence for anyone running a checkout: **native USDC transfers emit no ERC-20 `Transfer` log** on the USDC interface (`0x3600…0000`). A plain wallet "send" leaves nothing to subscribe to. We verified this on mainnet before writing the contract: 21,000-gas value transfers produce zero logs from the USDC interface, and so do value-carrying contract calls.

`ArcTopUp` turns a payment into an event and attaches an order id when the wallet can pass calldata:

```solidity
event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount, uint256 index);

function pay(bytes32 orderId) external payable;   // wallet with calldata support
receive() external payable;                        // plain transfer, orderId = 0
```

Every payment is forwarded to `treasury` inside the same transaction (state updated before the external call; a failed forward reverts the payment), so the contract never holds funds. `owner` can change the treasury and hand over ownership; nothing is upgradeable and there is no pause.

## Matching plain transfers

Many mobile wallets can only do a plain transfer from a QR code, so `receive()` is a first-class path. The off-chain side gives every order an exact amount: the price plus a random 1–999 micro-USDC tag that is unique among pending orders (1 USDC = 1e18 wei of native value = 1e6 units at the ERC-20 interface, so a tag is 1e12–999e12 wei). A `Paid` log with a zero `orderId` is resolved by exact amount; a non-zero `orderId` is resolved directly. An amount below the order's expected value is flagged for manual settlement; at or above credits it.

The EIP-681 URI a checkout page can render as a QR code is simply `ethereum:<contract>@5042?value=<wei>`; a browser wallet sends `pay(orderId)` with the value attached (`0x8609cad1` + the 32-byte order id).

## Reading the chain

- `totalOrders()` / `totalPaid()` give live counters without an indexer (`totalPaid` is in 18-decimal wei).
- Public RPC (`rpc.mainnet.arc.io`): `eth_getLogs` is capped at 2,000 results per call and rejects wide block ranges; scan in windows of a few hundred blocks and persist the head. Blocks arrive every 0.5 s with a flat 20 gwei base fee.
- The event topic is `keccak256("Paid(bytes32,address,uint256,uint256)") = 0x5ce467ae5694ddb233a02ca7eb987835c5e2ea71eec0e379bf3a5e1207ae2459`.

## Deploying your own

```bash
npm i solc@0.8.28 ethers@6
echo '{"privateKey":"0x…"}' > deployer.json          # a fresh key with a little USDC on Arc for gas
node deploy.js --deploy <treasury> [<owner>]        # compiles, deploys, optionally transfers ownership
```

`deploy.js` compiles with solc-js using the settings above and writes `build/deployment.json`.

## License

GPL-3.0-or-later for this repository (see `LICENSE`). The contract source keeps the `MIT` SPDX identifier it was compiled and deployed with, so the file still matches the on-chain bytecode byte for byte.
