"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { shortAddress } from "@/lib/format";

/* Minimal typings for the Wallet Standard features we use. */
type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{
    accounts: readonly WalletAccount[];
  }>;
};
type DisconnectFeature = { disconnect: () => Promise<void> };
type EventsFeature = {
  on: (
    event: "change",
    listener: (props: { accounts?: readonly WalletAccount[] }) => void,
  ) => () => void;
};
type SignMessageFeature = {
  signMessage: (
    ...inputs: { account: WalletAccount; message: Uint8Array }[]
  ) => Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
};

const LAST_WALLET_KEY = "gta6fund:last-wallet";

function feature<T>(wallet: Wallet, name: string): T | undefined {
  return (wallet.features as Record<string, unknown>)[name] as T | undefined;
}

function isSolanaWallet(wallet: Wallet): boolean {
  return (
    wallet.chains.some((chain) => chain.startsWith("solana:")) &&
    "standard:connect" in wallet.features &&
    "solana:signMessage" in wallet.features
  );
}

function solanaAccount(accounts: readonly WalletAccount[]): WalletAccount | null {
  return (
    accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ??
    accounts[0] ??
    null
  );
}

interface WalletContextValue {
  wallets: Wallet[];
  walletName: string | null;
  walletIcon: string | null;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: (name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<Uint8Array>;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [active, setActive] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const triedSilent = useRef(false);

  // Discover installed wallets (Phantom, Solflare, Backpack, ... register themselves).
  useEffect(() => {
    const registry = getWallets();
    const refresh = () => setWallets(registry.get().filter(isSolanaWallet));
    refresh();
    const offRegister = registry.on("register", refresh);
    const offUnregister = registry.on("unregister", refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  // Follow account switches / revocations made inside the wallet.
  useEffect(() => {
    if (!active) return;
    const events = feature<EventsFeature>(active, "standard:events");
    if (!events) return;
    return events.on("change", ({ accounts }) => {
      if (!accounts) return;
      const next = solanaAccount(accounts);
      setAccount(next);
      if (!next) setActive(null);
    });
  }, [active]);

  const connectWallet = useCallback(
    async (wallet: Wallet, silent: boolean) => {
      const connectFeature = feature<ConnectFeature>(wallet, "standard:connect");
      if (!connectFeature) throw new Error("This wallet cannot connect here.");
      const { accounts } = await connectFeature.connect(
        silent ? { silent: true } : undefined,
      );
      const next = solanaAccount(accounts.length ? accounts : wallet.accounts);
      if (!next) {
        if (silent) return false;
        throw new Error("No Solana account was shared by the wallet.");
      }
      setActive(wallet);
      setAccount(next);
      try {
        localStorage.setItem(LAST_WALLET_KEY, wallet.name);
      } catch {
        // storage unavailable
      }
      return true;
    },
    [],
  );

  // Quietly restore the previous session once the wallet shows up.
  useEffect(() => {
    if (triedSilent.current || active || wallets.length === 0) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_WALLET_KEY);
    } catch {
      last = null;
    }
    if (!last) return;
    const wallet = wallets.find((w) => w.name === last);
    if (!wallet) return;
    triedSilent.current = true;
    connectWallet(wallet, true).catch(() => {});
  }, [wallets, active, connectWallet]);

  const connect = useCallback(
    async (name: string) => {
      const wallet = wallets.find((w) => w.name === name);
      if (!wallet) return;
      setConnecting(true);
      setError(null);
      try {
        await connectWallet(wallet, false);
        setModalOpen(false);
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Connection was cancelled.",
        );
      } finally {
        setConnecting(false);
      }
    },
    [wallets, connectWallet],
  );

  const disconnect = useCallback(async () => {
    const wallet = active;
    setActive(null);
    setAccount(null);
    try {
      localStorage.removeItem(LAST_WALLET_KEY);
    } catch {
      // storage unavailable
    }
    if (wallet) {
      await feature<DisconnectFeature>(wallet, "standard:disconnect")
        ?.disconnect()
        .catch(() => {});
    }
  }, [active]);

  const signMessage = useCallback(
    async (message: string) => {
      if (!active || !account) throw new Error("Connect a wallet first.");
      const signer = feature<SignMessageFeature>(active, "solana:signMessage");
      if (!signer) throw new Error("This wallet cannot sign messages.");
      const [result] = await signer.signMessage({
        account,
        message: new TextEncoder().encode(message),
      });
      if (!result?.signature) throw new Error("The wallet returned no signature.");
      return result.signature;
    },
    [active, account],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      walletName: active?.name ?? null,
      walletIcon: active?.icon ?? null,
      address: account?.address ?? null,
      connecting,
      error,
      connect,
      disconnect,
      signMessage,
      modalOpen,
      openModal: () => {
        setError(null);
        setModalOpen(true);
      },
      closeModal: () => setModalOpen(false),
    }),
    [wallets, active, account, connecting, error, connect, disconnect, signMessage, modalOpen],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletModal />
    </WalletContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

const INSTALL_LINKS = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
  { name: "Backpack", href: "https://backpack.app/download" },
];

function WalletModal() {
  const { wallets, modalOpen, closeModal, connect, connecting, error } = useWallet();
  const [mobileLink, setMobileLink] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMobileLink(
        `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`,
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/80 p-4 backdrop-blur-md sm:items-center"
      onClick={closeModal}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        className="panel rise w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full" style={{ background: "var(--sunset-gradient)" }} />
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label text-gold">Step one</p>
              <h2 id="wallet-modal-title" className="h-display mt-1 text-4xl">
                Pick your wallet
              </h2>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xl leading-none transition hover:bg-white/20"
            >
              ×
            </button>
          </div>

          <p className="mt-3 text-sm text-haze">
            Connecting only shares your public address. Entering the draw is a
            free signature — never a transaction.
          </p>

          <div className="mt-5 space-y-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                type="button"
                disabled={connecting}
                onClick={() => connect(wallet.name)}
                className="group flex w-full items-center gap-4 rounded-xl bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.12] disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wallet.icon}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-lg"
                />
                <span className="font-display text-xl font-bold uppercase tracking-wide">
                  {wallet.name}
                </span>
                <span className="label ml-auto text-teal">Detected</span>
              </button>
            ))}

            {wallets.length === 0 && (
              <div className="rounded-xl bg-white/[0.06] p-4">
                <p className="font-display text-xl font-bold uppercase">
                  No Solana wallet found
                </p>
                <p className="mt-1 text-sm text-haze">
                  Install one, then reload this page.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {INSTALL_LINKS.map((link) => (
                    <a
                      key={link.name}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      {link.name}
                    </a>
                  ))}
                </div>
                {mobileLink && (
                  <a href={mobileLink} className="btn btn-hot mt-4 w-full">
                    Open in Phantom app
                  </a>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-magenta/15 px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav button                                                          */
/* ------------------------------------------------------------------ */

export function WalletButton() {
  const { address, walletIcon, openModal, disconnect, connecting } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!address) {
    return (
      <button
        type="button"
        onClick={openModal}
        disabled={connecting}
        className="btn btn-hot btn-sm"
      >
        {connecting ? (
          "Connecting…"
        ) : (
          <>
            Connect<span className="hidden sm:inline">&nbsp;wallet</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full bg-white/10 pl-1.5 pr-3.5 font-mono text-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition hover:bg-white/[0.16]"
      >
        {walletIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={walletIcon} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
        ) : (
          <span className="h-7 w-7 rounded-full" style={{ background: "var(--sunset-gradient)" }} />
        )}
        {shortAddress(address)}
      </button>

      {open && (
        <div className="panel absolute right-0 top-12 z-50 w-52 overflow-hidden p-1.5">
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10"
            onClick={() => {
              navigator.clipboard?.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose transition hover:bg-white/10"
            onClick={() => {
              setOpen(false);
              void disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
