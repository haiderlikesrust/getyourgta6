/** Shapes shared between API routes and client components. No server imports here. */

export type DrawTier = "holder" | "open";

export interface DrawRules {
  boostPercent: number;
  boostMultiplier: number;
  holdersAutoEnter: boolean;
}

export interface PoolSummary {
  totalTickets: number;
  holderEntrants: number;
  openEntrants: number;
  optIns: number;
  totalHolders: number | null;
  live: boolean;
  updatedAt: string;
}

export interface WinnerRow {
  id: string;
  wallet: string;
  brand: string;
  amountUsd: number;
  status: string;
  tier: string;
  tickets: number;
  poolTickets: number;
  createdAt: string;
}

export interface TreasuryEventRow {
  id: string;
  kind: string;
  usdValue: number;
  txSig: string | null;
  from: string | null;
  to: string | null;
  asset: string | null;
  createdAt: string;
}

export interface SiteInfo {
  symbol: string | null;
  /** the coin's pump.fun page, built from the CA */
  buyUrl: string | null;
}

export interface Stats {
  balanceSol: number;
  balanceUsd: number;
  allocatedUsd: number;
  availableUsd: number;
  prizeUsd: number;
  threshold: number;
  progressPercent: number;
  solPrice: number;
  pendingTokenBalance: number;
  pendingTokenUsd: number;
  rewardWallet: string | null;
  tokenMint: string | null;
  totalRewards: number;
  totalClaimed: number;
  totalDistributedUsd: number;
  rules: DrawRules;
  pool: PoolSummary;
  /** gift card platforms a winner can choose from */
  brands: string[];
  site: SiteInfo;
  recentWinners: WinnerRow[];
  events: TreasuryEventRow[];
  lastRunAt: string | null;
  testMode: boolean;
  testIntervalMs: number;
}

export interface WalletStanding {
  wallet: string;
  optedIn: boolean;
  entered: boolean;
  tier: DrawTier | null;
  tickets: number;
  holdingPercent: number | null;
  boosted: boolean;
  tokensToBoost: number | null;
  odds: number | null;
  totalTickets: number;
  excluded: boolean;
  rules?: DrawRules;
  unclaimedRewards?: number;
}
