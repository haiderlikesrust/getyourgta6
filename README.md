# GTA6 Preorder Fund — Holder Rewards App

A Next.js app that rewards random pump.fun token holders with GTA 6 preorder gift cards (PlayStation / Xbox via Bitrefill). Styled after the [GTA VI website](https://www.rockstargames.com/VI) aesthetic.

**This is an unofficial fan project.** Not affiliated with Rockstar Games, Take-Two Interactive, PlayStation, Xbox, or Bitrefill.

## How it works

1. **Hourly check** — A cron job reads the reward wallet SOL balance and converts it to USD via Jupiter Price API.
2. **Threshold** — If `available balance (USD) - allocated ledger >= $100`, a reward is triggered.
3. **Random winner** — All token holders are snapshotted via Helius `getTokenAccounts`, filtered for eligibility, and one is picked at random.
4. **Gift card** — A $100 PlayStation or Xbox gift card is purchased (mocked for now; Bitrefill-ready interface).
5. **Claim** — The winner visits `/claim`, enters their wallet, sends 0.01 SOL from that wallet to a temp address to prove ownership, gets refunded, and receives the gift card code.

## Tech stack

- **Next.js 15** (App Router) + Tailwind CSS v4
- **Prisma** + SQLite
- **@solana/web3.js** for on-chain operations
- **Helius** for holder snapshots
- **Jupiter** for SOL/USD price

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `HELIUS_API_KEY` | Helius API key for RPC + holder snapshots |
| `TOKEN_MINT` | Your pump.fun token mint address |
| `SOLANA_RPC_URL` | Helius mainnet RPC URL |
| `REWARD_WALLET_SECRET` | Base58-encoded secret key for reward wallet |
| `CRON_SECRET` | Secret to protect the cron endpoint |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes) for AES-256-GCM |
| `REWARD_THRESHOLD_USD` | USD threshold before distributing (default: 100) |
| `VERIFY_AMOUNT_SOL` | SOL amount for wallet verification (default: 0.01) |
| `MIN_HOLDING` | Minimum tokens to be eligible (default: 1) |
| `GIFT_CARD_BRANDS` | Comma-separated: `playstation,xbox` |
| `JUP_API_KEY` | Optional Jupiter API key |

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Initialize database

```bash
npm run db:push
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Hourly cron

### Vercel (production)

`vercel.json` configures an hourly cron hitting `/api/cron/distribute`. Set `CRON_SECRET` in Vercel env vars. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.

### Manual / local trigger

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/distribute
```

### External scheduler

Use any cron service (cron-job.org, GitHub Actions, etc.) to POST/GET the endpoint hourly with the `Authorization` header or `x-cron-secret` header.

## API endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/stats` | GET | Public | Reward pool stats + recent winners |
| `/api/cron/distribute` | GET/POST | `CRON_SECRET` | Hourly distribution job |
| `/api/claim/start` | POST | Public | Start claim for winning wallet |
| `/api/claim/status` | GET | Public | Poll claim verification status |

## Claim flow

1. Winner enters wallet address on `/claim`
2. Server checks for an `UNCLAIMED` reward for that wallet
3. A temporary Solana keypair is generated; user sends 0.01 SOL from their winning wallet to the temp address
4. Server detects the incoming transfer, verifies sender matches the winning wallet
5. Server refunds 0.01 SOL and sweeps remaining funds to the reward wallet
6. Gift card code is revealed to the user

## Gift cards (mock mode)

Gift card purchases are currently **mocked** in `lib/bitrefill.ts`. Codes are randomly generated placeholders. When you have Bitrefill API access, replace `purchaseGiftCard()` with the real API call.

## Security notes

- **Never commit** `.env` or expose `REWARD_WALLET_SECRET` / `ENCRYPTION_KEY`
- Reward wallet private key must be stored securely (env vars, secrets manager)
- Cron endpoint is protected by `CRON_SECRET`
- Gift card codes and temp wallet secrets are encrypted at rest with AES-256-GCM
- Verification requires sending from the exact winning wallet address

## Legal disclaimer

This is a community giveaway mechanism. You are responsible for:
- Compliance with local gambling/giveaway laws
- Trademark usage (Rockstar, GTA, PlayStation, Xbox)
- Tax implications for recipients
- Terms of service for pump.fun and Solana

Mark the site clearly as unofficial and not endorsed by any brand.

## Project structure

```
app/
  page.tsx              # Landing page
  claim/page.tsx        # Claim flow UI
  api/
    stats/route.ts      # Public stats
    cron/distribute/    # Hourly job
    claim/start/        # Start claim
    claim/status/       # Poll + verify + reveal
components/             # Header, Footer, StatsPanel
lib/
  config.ts             # Env config
  db.ts                 # Prisma client
  helius.ts             # Holder snapshots
  price.ts              # Jupiter SOL price
  solana.ts             # Wallet ops + verification
  bitrefill.ts          # Mock gift card purchase
  crypto.ts             # AES encryption
prisma/schema.prisma    # Database schema
```
