import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev } from "../math.js"

export const sleepRunners: Record<string, AlgorithmRunner> = {
  "sleep-duration": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    if (sleepRecs.length === 0) return null
    const durations = sleepRecs.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0)).filter((d) => d > 0)
    if (durations.length === 0) return null
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length
    const hours = avg / 60
    const sev: InsightSeverity = hours >= 7 && hours <= 9 ? "positive" : hours >= 6 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Average sleep: ${hours.toFixed(1)}h/night. ${hours >= 7 ? "Meeting CDC recommendation of 7-9 hours." : hours >= 6 ? "Slightly below recommendation." : "Significantly below recommended 7-9 hours."}`, Math.round(avg), "min", { low: 420, high: 540 }, { avgHours: Number(hours.toFixed(1)), nights: durations.length })
  },

  "sleep-efficiency": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    if (sleepRecs.length === 0) return null
    const efficiencies = sleepRecs.map((r) => {
      const d = r.data as { durationMinutes?: number; startTime?: string; endTime?: string; stages?: { awake?: number } } | null
      if (!d?.durationMinutes) return null
      const awake = d.stages?.awake ?? 0
      const totalTime = d.durationMinutes + awake
      return totalTime > 0 ? (d.durationMinutes / totalTime) * 100 : null
    }).filter((e): e is number => e != null)
    if (efficiencies.length === 0) return null
    const avg = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
    const sev: InsightSeverity = avg >= 85 ? "positive" : avg >= 75 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep efficiency: ${Math.round(avg)}%. ${avg >= 85 ? "Excellent — minimal wakefulness." : "Below 85% target — fragmented sleep."}`, Math.round(avg), "%", { low: 85, high: 100 }, { nights: efficiencies.length })
  },

  "deep-sleep-ratio": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const ratios = sleepRecs.map((r) => {
      const d = r.data as { durationMinutes?: number; stages?: { deep?: number } } | null
      if (!d?.stages?.deep || !d.durationMinutes) return null
      return (d.stages.deep / d.durationMinutes) * 100
    }).filter((r): r is number => r != null)
    if (ratios.length === 0) return null
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const sev: InsightSeverity = avg >= 15 && avg <= 25 ? "positive" : avg >= 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Deep sleep: ${Math.round(avg)}% of total. ${avg >= 15 && avg <= 25 ? "Optimal range for physical restoration." : avg < 15 ? "Below optimal — may impact recovery." : "Above typical range."}`, Math.round(avg), "%", { low: 15, high: 25 }, { nights: ratios.length })
  },

  "rem-sleep-ratio": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const ratios = sleepRecs.map((r) => {
      const d = r.data as { durationMinutes?: number; stages?: { rem?: number } } | null
      if (!d?.stages?.rem || !d.durationMinutes) return null
      return (d.stages.rem / d.durationMinutes) * 100
    }).filter((r): r is number => r != null)
    if (ratios.length === 0) return null
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const sev: InsightSeverity = avg >= 20 && avg <= 25 ? "positive" : avg >= 15 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `REM sleep: ${Math.round(avg)}% of total. ${avg >= 20 ? "Good for memory consolidation and learning." : "Below optimal — may impact cognitive recovery."}`, Math.round(avg), "%", { low: 20, high: 25 }, { nights: ratios.length })
  },

  "sleep-consistency": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const bedtimes = sleepRecs.map((r) => {
      const d = r.data as { startTime?: string } | null
      if (!d?.startTime) return null
      const dt = new Date(d.startTime)
      return dt.getHours() * 60 + dt.getMinutes()
    }).filter((t): t is number => t != null)
    if (bedtimes.length < 5) return null
    const sd = stddev(bedtimes)
    const sev: InsightSeverity = sd < 30 ? "positive" : sd < 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Bedtime variability: ±${Math.round(sd)} min. ${sd < 30 ? "Very consistent sleep schedule." : sd < 60 ? "Moderate consistency." : "Highly irregular — social jet lag risk."}`, Math.round(sd), "min", { low: 0, high: 30 }, { nights: bedtimes.length })
  },

  "sleep-debt": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const last7 = sleepRecs.slice(-7)
    const durations = last7.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0))
    if (durations.length === 0) return null
    const totalSleep = durations.reduce((a, b) => a + b, 0)
    const target = durations.length * 480
    const debt = target - totalSleep
    const sev: InsightSeverity = debt <= 0 ? "positive" : debt < 120 ? "info" : debt < 300 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Sleep debt: ${debt > 0 ? Math.round(debt) : 0} min over ${durations.length} days. ${debt <= 0 ? "No sleep debt — well rested." : `Deficit of ${(debt / 60).toFixed(1)}h vs 8h/night target.`}`, Math.max(0, Math.round(debt)), "min", null, { totalSleep: Math.round(totalSleep), target, days: durations.length })
  },

  "sleep-latency": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const latencies = sleepRecs.map((r) => {
      const d = r.data as { startTime?: string; stages?: { awake?: number } } | null
      return d?.stages?.awake != null ? Math.min(d.stages.awake, 60) : null
    }).filter((l): l is number => l != null)
    if (latencies.length === 0) return null
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const sev: InsightSeverity = avg <= 15 ? "positive" : avg <= 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Average sleep onset: ~${Math.round(avg)} min. ${avg <= 15 ? "Healthy — falling asleep quickly." : avg <= 30 ? "Within normal range." : "Prolonged latency — consider sleep hygiene improvements."}`, Math.round(avg), "min", { low: 0, high: 20 }, { nights: latencies.length })
  },

  "awakening-freq": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const awakenings = sleepRecs.map((r) => (r.data as { awakenings?: number } | null)?.awakenings).filter((a): a is number => a != null)
    if (awakenings.length === 0) return null
    const avg = awakenings.reduce((a, b) => a + b, 0) / awakenings.length
    const sev: InsightSeverity = avg <= 2 ? "positive" : avg <= 5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Average ${Math.round(avg)} awakenings/night. ${avg <= 2 ? "Minimal disruption." : avg <= 5 ? "Moderate — common range." : "Frequent awakenings may impair deep sleep."}`, Math.round(avg), "count", { low: 0, high: 3 }, { nights: awakenings.length })
  },

  "sleep-score-trend": (alg, ctx) => {
    const v = ctx.vals("sleep_score")
    if (v.length < 5) return null
    const last14 = v.slice(-14)
    const t = trend(last14)
    const avg = last14.reduce((a, b) => a + b, 0) / last14.length
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Sleep score trend: ${t} (avg ${Math.round(avg)}). ${t === "rising" ? "Improving sleep quality." : t === "falling" ? "Declining — review sleep habits." : "Stable sleep quality."}`, Math.round(avg), "score", { low: 70, high: 100 }, { trend: t })
  },

  "sleep-hr-dip": (alg, ctx) => {
    const sleepRecs = ctx.recs("sleep")
    const hrVals = ctx.vals("heart_rate")
    const rhrVals = ctx.vals("resting_heart_rate")
    if (sleepRecs.length === 0 || (hrVals.length === 0 && rhrVals.length === 0)) return null
    const sleepHRs = sleepRecs.map((r) => (r.data as { heartRateAvg?: number } | null)?.heartRateAvg).filter((h): h is number => h != null)
    if (sleepHRs.length === 0) return null
    const avgSleepHR = sleepHRs.reduce((a, b) => a + b, 0) / sleepHRs.length
    const dayHR = rhrVals.length > 0 ? rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length : hrVals.reduce((a, b) => a + b, 0) / hrVals.length
    const dipPct = ((dayHR - avgSleepHR) / dayHR) * 100
    const sev: InsightSeverity = dipPct >= 10 && dipPct <= 20 ? "positive" : dipPct < 10 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Nocturnal HR dip: ${Math.round(dipPct)}%. ${dipPct >= 10 && dipPct <= 20 ? "Normal physiological dipping pattern." : dipPct < 10 ? "Non-dipping pattern — may indicate autonomic dysfunction." : "Enhanced dipping."}`, Math.round(dipPct), "%", { low: 10, high: 20 }, { avgSleepHR: Math.round(avgSleepHR), dayHR: Math.round(dayHR) })
  },

  // ── Advanced Sleep ──
  "sleep-architecture": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const avgMin = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
    const idealDeep = avgMin * 0.2; const idealREM = avgMin * 0.25; const idealLight = avgMin * 0.55
    const score = Math.min(100, Math.round((avgMin / 480) * 100))
    const sev: InsightSeverity = score >= 80 ? "positive" : score >= 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep architecture score: ${score}/100. Avg ${Math.round(avgMin)} min/night (ideal targets: ~${Math.round(idealDeep)} deep, ~${Math.round(idealREM)} REM, ~${Math.round(idealLight)} light).`, score, "/100", { low: 60, high: 90 }, { avgMin: Math.round(avgMin) })
  },

  "rem-latency": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const avgSleep = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
    const estimatedLatency = Math.max(15, 90 - (avgSleep / 480) * 30)
    const sev: InsightSeverity = estimatedLatency < 70 ? "positive" : estimatedLatency < 90 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated REM latency: ~${Math.round(estimatedLatency)} min. ${estimatedLatency < 70 ? "Normal — REM onset within expected range." : "Possibly delayed REM — sufficient sleep duration helps."}`, Math.round(estimatedLatency), "min", { low: 60, high: 90 }, { avgSleep: Math.round(avgSleep) })
  },

  "sleep-fragmentation": (alg, ctx) => {
    const sleepV = ctx.vals("sleep"); const ss = ctx.vals("sleep_score")
    if (sleepV.length < 7) return null
    const avgDuration = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
    const avgScore = ss.length >= 7 ? ss.slice(-7).reduce((a, b) => a + b, 0) / 7 : 75
    const fragIndex = Math.max(0, 100 - avgScore - (avgDuration > 420 ? 0 : 10))
    const sev: InsightSeverity = fragIndex < 20 ? "positive" : fragIndex < 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep fragmentation index: ${fragIndex.toFixed(0)}. ${fragIndex < 20 ? "Minimal disruption — consolidated sleep." : fragIndex < 40 ? "Moderate fragmentation." : "High fragmentation — consider sleep environment changes."}`, Math.round(fragIndex), "index", { low: 0, high: 40 }, { avgDuration: Math.round(avgDuration), avgScore: Math.round(avgScore) })
  },

  "circadian-phase-shift": (alg, ctx) => {
    const sleepStats = ctx.dayStats("sleep")
    if (sleepStats.length < 14) return null
    const first7 = sleepStats.slice(0, 7).map((d) => new Date(d.date).getHours() * 60 + new Date(d.date).getMinutes())
    const last7 = sleepStats.slice(-7).map((d) => new Date(d.date).getHours() * 60 + new Date(d.date).getMinutes())
    const avgFirst = first7.reduce((a, b) => a + b, 0) / first7.length
    const avgLast = last7.reduce((a, b) => a + b, 0) / last7.length
    const shift = avgLast - avgFirst
    const sev: InsightSeverity = Math.abs(shift) < 15 ? "positive" : Math.abs(shift) < 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Circadian shift: ${shift > 0 ? "+" : ""}${Math.round(shift)} min over 14 days. ${Math.abs(shift) < 15 ? "Stable circadian phase." : Math.abs(shift) < 45 ? "Moderate phase drift." : "Significant phase shift — may affect sleep quality."}`, Math.round(shift), "min", { low: -30, high: 30 }, { avgFirst: Math.round(avgFirst), avgLast: Math.round(avgLast) })
  },

  "weekend-sleep-rebound": (alg, ctx) => {
    const sleepStats = ctx.dayStats("sleep")
    if (sleepStats.length < 14) return null
    const weekendSleep = sleepStats.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 }).map((d) => d.value)
    const weekdaySleep = sleepStats.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 }).map((d) => d.value)
    if (weekendSleep.length < 2 || weekdaySleep.length < 5) return null
    const weAvg = weekendSleep.reduce((a, b) => a + b, 0) / weekendSleep.length
    const wdAvg = weekdaySleep.reduce((a, b) => a + b, 0) / weekdaySleep.length
    const rebound = weAvg - wdAvg
    const sev: InsightSeverity = Math.abs(rebound) < 30 ? "positive" : rebound > 60 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Weekend sleep: +${Math.round(rebound)} min vs weekdays. ${Math.abs(rebound) < 30 ? "Minimal social jet lag." : rebound > 60 ? "Significant weekend rebound — suggests weekday sleep debt." : "Moderate rebound."}`, Math.round(rebound), "min", { low: 0, high: 45 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
  },

  "sleep-regularity-index": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 14) return null
    const mean = sleepV.reduce((a, b) => a + b, 0) / sleepV.length
    let matches = 0
    for (let i = 1; i < sleepV.length; i++) { if ((sleepV[i]! > mean && sleepV[i - 1]! > mean) || (sleepV[i]! <= mean && sleepV[i - 1]! <= mean)) matches++ }
    const sri = (matches / (sleepV.length - 1)) * 100
    const sev: InsightSeverity = sri >= 80 ? "positive" : sri >= 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep regularity index: ${sri.toFixed(0)}%. ${sri >= 80 ? "Highly regular sleep pattern." : sri >= 60 ? "Moderately regular." : "Irregular — consistency improves sleep quality."}`, Number(sri.toFixed(0)), "%", { low: 60, high: 90 }, { days: sleepV.length })
  },

  "sws-adequacy": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const avgTotal = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
    const estDeep = avgTotal * 0.15
    const targetDeep = 90
    const pct = (estDeep / targetDeep) * 100
    const sev: InsightSeverity = pct >= 80 ? "positive" : pct >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated deep sleep: ~${Math.round(estDeep)} min/night (target: ${targetDeep} min, ${pct.toFixed(0)}%). ${pct >= 80 ? "Adequate restorative sleep." : "More total sleep may increase deep sleep."}`, Math.round(estDeep), "min", { low: 60, high: 100 }, { totalSleep: Math.round(avgTotal) })
  },

  "sleep-onset-var": (alg, ctx) => {
    const sleepStats = ctx.dayStats("sleep")
    if (sleepStats.length < 7) return null
    const onsets = sleepStats.map((d) => { const dt = new Date(d.date); return dt.getHours() * 60 + dt.getMinutes() })
    const sd = stddev(onsets)
    const sev: InsightSeverity = sd < 20 ? "positive" : sd < 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep onset variability: ±${Math.round(sd)} min. ${sd < 20 ? "Very consistent bedtime." : sd < 45 ? "Moderate variability." : "Highly variable — a consistent bedtime improves sleep quality."}`, Math.round(sd), "min", { low: 10, high: 45 }, { days: onsets.length })
  },

  "terminal-wakefulness": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const shortNights = sleepV.slice(-14).filter((v) => v < 360).length
    const pct = (shortNights / Math.min(14, sleepV.length)) * 100
    const sev: InsightSeverity = pct < 15 ? "positive" : pct < 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Short sleep nights (<6h): ${shortNights}/${Math.min(14, sleepV.length)} (${pct.toFixed(0)}%). ${pct >= 30 ? "Frequent short nights — possible terminal wakefulness pattern." : "Sleep duration generally adequate."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 25 }, { shortNights })
  },

  "sleep-pressure": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 3) return null
    const lastSleep = sleepV[sleepV.length - 1]!
    const wakeDuration = Math.max(0, 1440 - lastSleep)
    const pressure = Math.min(100, (wakeDuration / 960) * 100)
    const sev: InsightSeverity = pressure < 70 ? "positive" : pressure < 90 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep pressure: ${pressure.toFixed(0)}/100 (${Math.round(wakeDuration / 60)}h wake estimated). ${pressure >= 90 ? "High pressure — sleep soon for best quality." : "Manageable sleep pressure."}`, Math.round(pressure), "/100", { low: 40, high: 85 }, { wakeDuration: Math.round(wakeDuration) })
  },

  "rem-deficit": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const totalSleep = sleepV.slice(-7).reduce((a, b) => a + b, 0)
    const estREM = totalSleep * 0.22
    const targetREM = 90 * 7
    const deficit = targetREM - estREM
    const sev: InsightSeverity = deficit < 60 ? "positive" : deficit < 150 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated 7-day REM: ~${Math.round(estREM)} min (target: ${targetREM} min). ${deficit > 0 ? `Deficit: ${Math.round(deficit)} min.` : "Meeting target."} ${deficit >= 150 ? "More sleep duration needed for adequate REM." : ""}`, Math.round(deficit), "min deficit", { low: 0, high: 120 }, { estREM: Math.round(estREM) })
  },

  "light-sleep-excess": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7) return null
    const avgTotal = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
    const estLight = avgTotal * 0.55
    const lightPct = (estLight / avgTotal) * 100
    const sev: InsightSeverity = lightPct < 55 ? "positive" : lightPct < 65 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated light sleep: ${lightPct.toFixed(0)}% of total. ${lightPct >= 65 ? "Possibly excessive light sleep — deep sleep and REM may be insufficient." : "Normal sleep stage distribution."}`, Number(lightPct.toFixed(0)), "%", { low: 40, high: 60 }, { avgTotal: Math.round(avgTotal) })
  },
}
