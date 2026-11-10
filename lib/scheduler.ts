import { DRAW_INTERVAL_MINUTES } from "./brand";
import { runDistribution } from "./distribute";
import { runTreasuryJob } from "./jobs";

/**
 * The in-app worker. Every 5 minutes: claim + swap creator rewards, then draw
 * a winner if the pot can buy a card. It runs inside the Next.js server, so a
 * Dokploy deployment needs no separate cron container.
 *
 * Safe with two containers alive at once (zero-downtime updates): both jobs
 * take a database lock, so only one of them does the work.
 */

const FIRST_TICK_DELAY_MS = 30_000;

interface WorkerState {
  timer: ReturnType<typeof setInterval> | null;
  firstTick: ReturnType<typeof setTimeout> | null;
  running: Promise<void> | null;
  stopping: boolean;
  lastTickAt: Date | null;
}

// Next bundles the startup hook and the API routes separately, so module-level
// variables would exist twice. One object on globalThis is shared by both.
const globalForWorker = globalThis as unknown as { __gta6Worker?: WorkerState };
const state: WorkerState = (globalForWorker.__gta6Worker ??= {
  timer: null,
  firstTick: null,
  running: null,
  stopping: false,
  lastTickAt: null,
});

export function workerEnabled(): boolean {
  return (process.env.WORKER_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function schedulerStatus() {
  return {
    enabled: workerEnabled(),
    started: state.timer !== null || state.firstTick !== null,
    busy: state.running !== null,
    lastTickAt: state.lastTickAt?.toISOString() ?? null,
  };
}

function intervalMs(): number {
  const raw = Number.parseInt(process.env.WORKER_INTERVAL_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 30_000
    ? raw
    : DRAW_INTERVAL_MINUTES * 60_000;
}

async function tick() {
  if (state.running || state.stopping) return;
  state.lastTickAt = new Date();

  state.running = (async () => {
    try {
      const treasury = await runTreasuryJob();
      if (treasury.status === "error") {
        console.warn("[worker] treasury job finished with errors");
      }
    } catch (error) {
      console.error("[worker] treasury job crashed:", error);
    }

    if (state.stopping) return;

    try {
      const draw = await runDistribution({ simulateTreasury: false });
      if (draw.status === "distributed") {
        console.log(
          `[worker] draw: ${draw.holderWallet} won (${draw.winnerTier}, ${draw.winnerTickets}/${draw.totalTickets} tickets)`,
        );
      }
    } catch (error) {
      console.error("[worker] draw crashed:", error);
    }
  })().finally(() => {
    state.running = null;
  });

  await state.running;
}

export function startScheduler() {
  if (!workerEnabled() || state.timer || state.firstTick) return;
  const every = intervalMs();
  console.log(`[worker] started: every ${Math.round(every / 1000)}s`);
  // Let the server come up and pass its health check before the first run.
  state.firstTick = setTimeout(() => {
    state.firstTick = null;
    void tick();
    state.timer = setInterval(() => void tick(), every);
  }, FIRST_TICK_DELAY_MS);
}

/** Stop scheduling and wait (up to `maxWaitMs`) for the job in flight to finish. */
export async function stopScheduler(maxWaitMs: number): Promise<void> {
  state.stopping = true;
  if (state.firstTick) clearTimeout(state.firstTick);
  if (state.timer) clearInterval(state.timer);
  state.firstTick = null;
  state.timer = null;
  if (state.running) {
    await Promise.race([
      state.running,
      new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
    ]);
  }
}
