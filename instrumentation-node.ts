import { prisma } from "./lib/db";
import { startScheduler, stopScheduler } from "./lib/scheduler";

/**
 * Node-runtime startup (never during `next build`). Starts the in-app worker and
 * makes shutdown graceful, which is what lets a zero-downtime update hand over
 * cleanly: the old container finishes the job and the requests it is in the
 * middle of before it exits.
 */
export async function registerNode() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // WAL lets the old and the new container read and write the same SQLite file
  // side by side during an update. The setting is stored in the database file.
  if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
    await prisma
      .$queryRawUnsafe("PRAGMA journal_mode=WAL")
      .catch((error) => console.warn("[db] could not enable WAL:", error));
  }

  startScheduler();

  // The image sets NEXT_MANUAL_SIG_HANDLE=true, so stopping is ours to handle.
  if (process.env.NEXT_MANUAL_SIG_HANDLE === "true") {
    let exiting = false;
    const shutdown = async (signal: string) => {
      if (exiting) return;
      exiting = true;
      console.log(`[server] ${signal}: finishing work in flight`);
      // Stay inside Docker's default 10 s stop grace: about 7.5 s in total.
      // 1. no new jobs; give the running one a moment (payments are resumable anyway)
      await stopScheduler(5_000);
      // 2. let requests already being served complete
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }
}
