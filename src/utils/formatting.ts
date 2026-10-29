export function updatedLabel(date: string | null | undefined) {
  return date ? new Date(date).toLocaleString() : 'Unknown update time';
}

export function priceAge(date: string | null | undefined, now = Date.now()) {
  const timestamp = date ? Date.parse(date) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now) return { label: 'Update age unavailable', tone: 'unknown' as const };
  const age = now - timestamp;
  const minutes = Math.floor(age / 60_000);
  const hours = Math.floor(age / 3_600_000);
  const days = Math.floor(hours / 24);
  const label = age < 60_000 ? 'Updated just now'
    : minutes < 60 ? `Updated ${minutes}m ago`
      : hours < 24 ? `Updated ${hours}h ${Math.floor(minutes % 60)}m ago`
        : `Updated ${days}d ${hours % 24}h ago`;
  return { label, tone: age <= 7 * 3_600_000 ? 'green' as const : age <= 24 * 3_600_000 ? 'yellow' as const : 'red' as const };
}

export function qualityLabel(quality: number) {
  return ['Normal', 'Good', 'Outstanding', 'Excellent', 'Masterpiece'][quality - 1] || `Quality ${quality}`;
}
