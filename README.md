# GTA6 Fund

Suggested domain `gta6fund.xyz` · coin "GTA 6 Fund" · ticker `$GTA6FUND`

A Next.js app that gives away $100 PlayStation / Xbox gift cards (enough for a
GTA 6 pre-order), funded by a pump.fun coin's creator rewards.

**Unofficial fan project.** Not affiliated with Rockstar Games, Take-Two
Interactive, Sony, Microsoft or Bitrefill.

The site name lives in one file: [`lib/brand.ts`](lib/brand.ts).

## How it works

1. **Creator rewards come in** as a token (default: TTWO tokenized stock,
   `REWARD_TOKEN_MINT`). Every 5 minutes a cron claims them and swaps them to
   SOL on Jupiter into the treasury wallet.
2. **The pot is checked every 5 minutes.** When it holds enough to actually buy
   a card (`REWARD_THRESHOLD_USD` + `PRIZE_BUFFER_PERCENT`), a draw fires. If
   the pot covers several cards, one is drawn per check.
3. **Who is in the draw**
   - *Walk-in*: anyone who connects a wallet and signs the free opt-in
     message gets **1 ticket**. No coin needed.
   - *High roller*: any wallet holding at least `HOLDER_BOOST_PERCENT` (0.1%)
     of supply gets `HOLDER_BOOST_MULTIPLIER` (10) tickets, automatically.
   - Program-owned accounts (bonding curve, pools) and `EXCLUDE_ADDRESSES`
     can never win.
4. **One ticket is pulled** with Node's cryptographic RNG. The winner, their
   tier and their odds are published.
5. **The winner claims** on `/claim`: picks a console, proves wallet ownership
   with a 0.01 SOL transfer (refunded), and the gift card is bought on Bitrefill
   — paid from the treasury in SOL or USDC on Solana — and revealed once.

## Setup

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` (every variable is documented in `.env.example`), then:

```bash
npm run db:push
```

```bash
npm run dev
```

## Cron

| Endpoint | Schedule | What it does |
|----------|----------|--------------|
| `/api/cron/claim-fees` | every 5 min | claim creator rewards, swap to SOL on Jupiter |
| `/api/cron/distribute` | every 5 min | draw a winner if the pot can buy a card |

Both need `x-cron-secret: $CRON_SECRET` (or `Authorization: Bearer`).
`docker/crontab` and `vercel.json` are already set to 5 minutes. On Vercel,
5-minute crons need a paid plan.

`/api/cron/distribute?dryRun=true` builds the real pool and picks a winner
without creating a reward.

## API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/stats` | GET | public | pot, pool, winners, paper trail |
| `/api/enter/challenge` | POST | public | message for a wallet to sign |
| `/api/enter` | POST | wallet signature | opt a wallet in (idempotent) |
| `/api/enter/status` | GET | public | a wallet's tickets, odds, wins |
| `/api/claim/start` | POST | public | start a claim for a winning wallet |
| `/api/claim/status` | POST | claim token | verify, buy, reveal |
| `/api/cron/*` | GET/POST | `CRON_SECRET` | the two jobs above |

## Going live checklist

- `CA` (the coin's contract address), `HELIUS_API_KEY`, `SOLANA_RPC_URL`, a dedicated
  `REWARD_WALLET_SECRET` with a little SOL for fees.
- `PUMP_CREATOR_WALLET_SECRET` if the coin's creator wallet is not the treasury.
- Bitrefill: `BITREFILL_API_KEY`, `BITREFILL_MODE=live`,
  `BITREFILL_PRODUCT_PLAYSTATION` / `_XBOX`
  (`npx tsx --env-file=.env scripts/find-products.ts playstation`).
  Check what Bitrefill charges for the $100 card and set `PRIZE_BUFFER_PERCENT`
  to match.
- Run one end-to-end claim with `BITREFILL_MODE=test` first.
- `OPT_IN_MIN_SOL` above 0 if free entries get farmed with empty wallets.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/test-entry-flow.ts` | opt-in flow + draw fairness check against a running server |
| `scripts/test-holder-pick.ts` | run the weighted draw on the live pool, no rewards created |
| `scripts/check-pump-fees.ts` | show the creator vault balance |
| `scripts/trigger-pump-claim.ts` | run the claim + swap job once |
| `scripts/trigger-cron.ts` | run the draw job once |
| `scripts/find-products.ts` | look up Bitrefill product ids |

## Safety notes

- Payments are resumable: the provider invoice id and the payment signature are
  stored on the reward *before* the transaction is broadcast, so a timeout or
  restart continues the same order instead of paying twice.
- A payment is refused unless the amount Bitrefill asks for is worth roughly
  the card's value.
- Swaps are refused above `SWAP_MAX_PRICE_IMPACT_PERCENT`.
- Gift card codes and temp wallet keys are encrypted at rest (AES-256-GCM).
- Never commit `.env`.

## Legal

You are responsible for giveaway / sweepstakes rules where you operate, for
trademark use, and for taxes. Keep the site clearly marked as unofficial.
