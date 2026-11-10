"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Stats, WalletStanding } from "@/lib/types";
import { useWallet } from "./wallet";

/* ------------------------------------------------------------------ */
/* Live stats (one poller for the whole page)                          */
/* ------------------------------------------------------------------ */

interface StatsContextValue {
  stats: Stats | null;
  error: boolean;
  refresh: () => void;
}

const StatsContext = createContext<StatsContextValue>({
  stats: null,
  error: false,
  refresh: () => {},
});

export function useStats() {
  return useContext(StatsContext);
}

const STATS_INTERVAL_MS = 15_000;

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("stats");
      setStats((await res.json()) as Stats);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, STATS_INTERVAL_MS);
    const onRefresh = () => void refresh();
    window.addEventListener("stats-refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("stats-refresh", onRefresh);
    };
  }, [refresh]);

  const value = useMemo(() => ({ stats, error, refresh }), [stats, error, refresh]);
  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* The connected wallet's place in the draw                            */
/* ------------------------------------------------------------------ */

interface EntryContextValue {
  standing: WalletStanding | null;
  loading: boolean;
  entering: boolean;
  error: string | null;
  enter: () => Promise<void>;
  reload: () => void;
}

const EntryContext = createContext<EntryContextValue>({
  standing: null,
  loading: false,
  entering: false,
  error: null,
  enter: async () => {},
  reload: () => {},
});

export function useEntry() {
  return useContext(EntryContext);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function EntryProvider({ children }: { children: React.ReactNode }) {
  const { address, signMessage } = useWallet();
  const { refresh: refreshStats } = useStats();
  const [standing, setStanding] = useState<WalletStanding | null>(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<string | null>(null);

  const load = useCallback(async (wallet: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/enter/status?wallet=${wallet}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this wallet.");
      if (current.current === wallet) setStanding(data as WalletStanding);
    } catch (e) {
      if (current.current === wallet) {
        setError(e instanceof Error ? e.message : "Could not load this wallet.");
      }
    } finally {
      if (current.current === wallet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    current.current = address;
    setStanding(null);
    setError(null);
    if (address) void load(address);
  }, [address, load]);

  const enter = useCallback(async () => {
    if (!address) return;
    setEntering(true);
    setError(null);
    try {
      const challengeRes = await fetch("/api/enter/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) throw new Error(challenge.error ?? "Could not start.");

      const signature = await signMessage(challenge.message as string);

      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          nonce: challenge.nonce,
          issuedAt: challenge.issuedAt,
          mac: challenge.mac,
          signature: toBase64(signature),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your entry.");

      if (current.current === address) {
        setStanding((prev) => ({ ...(prev ?? {}), ...(data.standing as WalletStanding) }));
      }
      refreshStats();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /reject|denied|cancel/i.test(message)
          ? "Signature cancelled — you're not entered yet."
          : message || "Something went wrong. Try again.",
      );
    } finally {
      setEntering(false);
    }
  }, [address, signMessage, refreshStats]);

  const value = useMemo(
    () => ({
      standing,
      loading,
      entering,
      error,
      enter,
      reload: () => {
        if (address) void load(address);
      },
    }),
    [standing, loading, entering, error, enter, address, load],
  );

  return <EntryContext.Provider value={value}>{children}</EntryContext.Provider>;
}
