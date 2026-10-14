export function updatedLabel(date: string | null | undefined) {
  return date ? new Date(date).toLocaleString() : 'Unknown update time';
}

export function qualityLabel(quality: number) {
  return ['Normal', 'Good', 'Outstanding', 'Excellent', 'Masterpiece'][quality - 1] || `Quality ${quality}`;
}
