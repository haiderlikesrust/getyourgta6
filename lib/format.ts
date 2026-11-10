export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function usd(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return value.toLocaleString("en-US");
}

/** 0.0184 -> "1 in 54" */
export function oneIn(odds: number | null | undefined): string | null {
  if (!odds || odds <= 0) return null;
  if (odds >= 1) return "1 in 1";
  return `1 in ${Math.round(1 / odds).toLocaleString("en-US")}`;
}

export function percent(value: number, digits = 2): string {
  if (value > 0 && value < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}%`;
  return `${value.toFixed(digits)}%`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
