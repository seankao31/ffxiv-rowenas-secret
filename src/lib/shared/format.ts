export function formatGil(n: number | null): string {
  return n != null ? Math.round(n).toLocaleString() : '\u2014'
}

export function confidenceColor(c: number): string {
  if (c >= 0.85) return '#5b5'
  if (c >= 0.60) return '#cb3'
  if (c >= 0.25) return '#e83'
  return '#d44'
}

export function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High'
  if (c >= 0.60) return 'Medium'
  if (c >= 0.25) return 'Low'
  return 'Stale'
}
