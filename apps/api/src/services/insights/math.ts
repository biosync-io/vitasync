export function trend(values: number[]): "rising" | "falling" | "stable" {
  if (values.length < 3) return "stable"
  const half = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, half)
  const secondHalf = values.slice(half)
  const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const diff = ((avg2 - avg1) / (avg1 || 1)) * 100
  if (diff > 5) return "rising"
  if (diff < -5) return "falling"
  return "stable"
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
}

export function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

export function movingAverage(values: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return result
}

export function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  return (stddev(values) / mean) * 100
}

export function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}
