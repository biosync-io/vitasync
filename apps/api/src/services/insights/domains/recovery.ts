import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, linearSlope, stddev, coefficientOfVariation } from "../math.js"

export const recoveryRunners: Record<string, AlgorithmRunner> = {
  "recovery-status": (alg, ctx) => {
    const v = ctx.vals("recovery_score")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    let cat: string
    let sev: InsightSeverity
    if (latest >= 80) { cat = "Optimal"; sev = "positive" }
    else if (latest >= 60) { cat = "Good"; sev = "info" }
    else if (latest >= 40) { cat = "Moderate"; sev = "warning" }
    else { cat = "Poor"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `Recovery: ${Math.round(latest)}/100 — ${cat}. ${latest >= 60 ? "Ready for training." : "Consider lighter activity."}`, Math.round(latest), "score", { low: 60, high: 100 }, { category: cat })
  },

  "recovery-trend": (alg, ctx) => {
    const v = ctx.vals("recovery_score")
    if (v.length < 3) return null
    const last7 = v.slice(-7)
    const t = trend(last7)
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Recovery trend: ${t} over ${last7.length} days.`, Math.round(last7[last7.length - 1]!), "score", null, { trend: t })
  },

  "readiness-status": (alg, ctx) => {
    const v = ctx.vals("readiness_score")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    const sev: InsightSeverity = latest >= 75 ? "positive" : latest >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Readiness: ${Math.round(latest)}/100. ${latest >= 75 ? "Primed for high-intensity training." : latest >= 50 ? "Moderate readiness — standard training OK." : "Low readiness — prioritize recovery."}`, Math.round(latest), "score", { low: 50, high: 100 }, {})
  },

  "strain-balance": (alg, ctx) => {
    const strainV = ctx.vals("strain_score")
    const recoveryV = ctx.vals("recovery_score")
    if (strainV.length === 0 || recoveryV.length === 0) return null
    const avgStrain = strainV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(strainV.length, 7)
    const avgRecovery = recoveryV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(recoveryV.length, 7)
    const ratio = avgRecovery > 0 ? avgStrain / avgRecovery : 0
    const sev: InsightSeverity = ratio < 0.8 ? "positive" : ratio < 1.2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Strain/Recovery ratio: ${ratio.toFixed(2)}. ${ratio < 0.8 ? "Well recovered — capacity for more." : ratio < 1.2 ? "Balanced load." : "Strain exceeding recovery — overtraining risk."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.5, high: 1.0 }, { avgStrain: Math.round(avgStrain), avgRecovery: Math.round(avgRecovery) })
  },

  "stress-level": (alg, ctx) => {
    const v = ctx.vals("stress")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    let cat: string
    let sev: InsightSeverity
    if (avg < 25) { cat = "Low"; sev = "positive" }
    else if (avg < 50) { cat = "Moderate"; sev = "info" }
    else if (avg < 75) { cat = "High"; sev = "warning" }
    else { cat = "Very High"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `Average stress: ${Math.round(avg)}/100 — ${cat}. ${avg >= 50 ? "Consider stress management techniques." : "Stress levels well managed."}`, Math.round(avg), "score", { low: 0, high: 50 }, { category: cat })
  },

  "stress-trend": (alg, ctx) => {
    const v = ctx.vals("stress")
    if (v.length < 5) return null
    const t = trend(v.slice(-14))
    const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Stress trend: ${t}. ${t === "rising" ? "Increasing stress — monitor closely." : t === "falling" ? "Decreasing stress — good progress." : "Stable stress levels."}`, Math.round(v[v.length - 1]!), "score", null, { trend: t })
  },

  // ── Advanced Recovery & Stress ──
  "recovery-time-needed": (alg, ctx) => {
    const strain = ctx.vals("strain_score"); const rec = ctx.vals("recovery_score")
    if (strain.length < 3 || rec.length < 3) return null
    const avgStrain = strain.slice(-3).reduce((a, b) => a + b, 0) / 3
    const avgRec = rec.slice(-3).reduce((a, b) => a + b, 0) / 3
    const hoursNeeded = Math.max(12, avgStrain * 1.5 - avgRec * 0.3)
    const sev: InsightSeverity = hoursNeeded < 18 ? "positive" : hoursNeeded < 24 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated recovery needed: ${Math.round(hoursNeeded)}h. ${hoursNeeded < 18 ? "Light recovery sufficient." : hoursNeeded < 24 ? "Standard recovery period." : "Extended recovery recommended."}`, Math.round(hoursNeeded), "hours", { low: 12, high: 24 }, { avgStrain: avgStrain.toFixed(0), avgRec: avgRec.toFixed(0) })
  },

  "stress-recovery-ratio": (alg, ctx) => {
    const stress = ctx.vals("stress"); const rec = ctx.vals("recovery_score")
    if (stress.length < 7 || rec.length < 7) return null
    const avgStress = stress.slice(-7).reduce((a, b) => a + b, 0) / 7
    const avgRec = rec.slice(-7).reduce((a, b) => a + b, 0) / 7
    const ratio = avgRec > 0 ? avgStress / avgRec : 999
    const sev: InsightSeverity = ratio < 0.8 ? "positive" : ratio < 1.2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Stress/recovery ratio: ${ratio.toFixed(2)}. ${ratio < 0.8 ? "Recovery exceeds stress — well balanced." : ratio < 1.2 ? "Balanced." : "Stress exceeds recovery — prioritize rest."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.5, high: 1.2 }, { avgStress: Math.round(avgStress), avgRec: Math.round(avgRec) })
  },

  "allostatic-load": (alg, ctx) => {
    const stress = ctx.vals("stress"); const rhr = ctx.vals("resting_heart_rate"); const sleepV = ctx.vals("sleep")
    if (stress.length < 7 || rhr.length < 7 || sleepV.length < 7) return null
    const stressScore = Math.min(33, (stress.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
    const rhrScore = Math.min(33, Math.max(0, (rhr.slice(-7).reduce((a, b) => a + b, 0) / 7 - 50) / 50 * 33))
    const sleepScore = Math.min(33, Math.max(0, (1 - sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 33))
    const load = Math.round(stressScore + rhrScore + sleepScore)
    const sev: InsightSeverity = load < 30 ? "positive" : load < 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Allostatic load: ${load}/100. Stress=${Math.round(stressScore)}, Cardiac=${Math.round(rhrScore)}, Sleep=${Math.round(sleepScore)}. ${load < 30 ? "Low physiological burden." : load < 60 ? "Moderate stress load." : "High cumulative stress — recovery needed."}`, load, "/100", { low: 20, high: 60 }, { stressScore: Math.round(stressScore), rhrScore: Math.round(rhrScore), sleepScore: Math.round(sleepScore) })
  },

  "burnout-risk": (alg, ctx) => {
    const stress = ctx.vals("stress"); const rec = ctx.vals("recovery_score")
    if (stress.length < 14 || rec.length < 14) return null
    const stressTrend = linearSlope(stress.slice(-14))
    const recTrend = linearSlope(rec.slice(-14))
    const risk = (stressTrend > 0 ? 1 : 0) + (recTrend < 0 ? 1 : 0) + (stress.slice(-7).reduce((a, b) => a + b, 0) / 7 > 70 ? 1 : 0)
    const sev: InsightSeverity = risk === 0 ? "positive" : risk <= 1 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Burnout risk: ${risk}/3 indicators. ${risk >= 2 ? "Rising stress + declining recovery — take preventive action." : "Manageable stress levels."}`, risk, "/3", { low: 0, high: 2 }, { stressTrend: stressTrend.toFixed(3), recTrend: recTrend.toFixed(3) })
  },

  "recovery-velocity": (alg, ctx) => {
    const rec = ctx.vals("recovery_score")
    if (rec.length < 14) return null
    const dips: number[] = []; let i = 0
    while (i < rec.length) { if (rec[i]! < 50) { const start = i; while (i < rec.length && rec[i]! < 50) i++; dips.push(i - start) } else { i++ } }
    const avgDipLen = dips.length > 0 ? dips.reduce((a, b) => a + b, 0) / dips.length : 0
    const sev: InsightSeverity = avgDipLen <= 2 ? "positive" : avgDipLen <= 4 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Recovery velocity: avg ${avgDipLen.toFixed(1)} days below 50%. ${avgDipLen <= 2 ? "Quick bounce-back." : avgDipLen <= 4 ? "Moderate recovery speed." : "Slow recovery — consider rest priorities."}`, Number(avgDipLen.toFixed(1)), "days", { low: 1, high: 4 }, { dips: dips.length })
  },

  "stress-reactivity": (alg, ctx) => {
    const stress = ctx.vals("stress")
    if (stress.length < 14) return null
    const baseline = stress.slice(0, -7).reduce((a, b) => a + b, 0) / (stress.length - 7)
    const peaks = stress.slice(-7).filter((s) => s > baseline * 1.3)
    const avgPeak = peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : baseline
    const reactivity = avgPeak - baseline
    const sev: InsightSeverity = reactivity < 15 ? "positive" : reactivity < 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Stress reactivity: ${reactivity.toFixed(0)} points above baseline. ${peaks.length} spike days this week. ${reactivity >= 30 ? "High stress reactivity." : "Normal stress response."}`, Math.round(reactivity), "points", { low: 0, high: 25 }, { baseline: Math.round(baseline), spikeDays: peaks.length })
  },

  "weekend-recovery": (alg, ctx) => {
    const rec = ctx.dayStats("recovery_score")
    if (rec.length < 14) return null
    const we = rec.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 }).map((d) => d.value)
    const wd = rec.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 }).map((d) => d.value)
    const weAvg = we.length ? we.reduce((a, b) => a + b, 0) / we.length : 0
    const wdAvg = wd.length ? wd.reduce((a, b) => a + b, 0) / wd.length : 0
    const diff = weAvg - wdAvg
    const sev: InsightSeverity = diff > 5 ? "positive" : Math.abs(diff) < 5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Weekend recovery: ${Math.round(weAvg)}% vs weekday: ${Math.round(wdAvg)}% (${diff > 0 ? "+" : ""}${Math.round(diff)}%). ${diff > 5 ? "Better weekend recovery — expected pattern." : Math.abs(diff) < 5 ? "Consistent recovery." : "Weekdays have better recovery — unusual."}`, Math.round(diff), "%", { low: 0, high: 15 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
  },

  "stress-habituation": (alg, ctx) => {
    const stress = ctx.vals("stress")
    if (stress.length < 21) return null
    const first = stress.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const mid = stress.slice(7, 14).reduce((a, b) => a + b, 0) / 7
    const last = stress.slice(-7).reduce((a, b) => a + b, 0) / 7
    const adapting = first > mid && mid > last
    const sev: InsightSeverity = adapting ? "positive" : last < first ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Stress habituation: Week1=${Math.round(first)}, Week2=${Math.round(mid)}, Week3=${Math.round(last)}. ${adapting ? "Progressively adapting — stress response declining." : last < first ? "Partial adaptation." : "No habituation — stress management strategies needed."}`, Math.round(last), "score", { low: 30, high: 70 }, { first: Math.round(first), mid: Math.round(mid), last: Math.round(last) })
  },

  "composite-recovery": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const sleepV = ctx.vals("sleep"); const stress = ctx.vals("stress")
    if (hrv.length < 7 || sleepV.length < 7 || stress.length < 7) return null
    const hrvScore = Math.min(33, (hrv.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
    const sleepScore = Math.min(33, (sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 33)
    const stressScore = Math.min(33, (1 - stress.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
    const nri = Math.round(hrvScore + sleepScore + stressScore)
    const sev: InsightSeverity = nri >= 70 ? "positive" : nri >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Neural recovery index: ${nri}/100. HRV=${Math.round(hrvScore)}, Sleep=${Math.round(sleepScore)}, Stress=${Math.round(stressScore)}. ${nri >= 70 ? "Excellent neural recovery." : nri >= 45 ? "Moderate recovery." : "Poor recovery — prioritize rest."}`, nri, "/100", { low: 45, high: 80 }, { hrvScore: Math.round(hrvScore), sleepScore: Math.round(sleepScore), stressScore: Math.round(stressScore) })
  },

  "readiness-prediction": (alg, ctx) => {
    const rec = ctx.vals("recovery_score"); const sleepV = ctx.vals("sleep"); const strain = ctx.vals("strain_score")
    if (rec.length < 3 || sleepV.length < 3 || strain.length < 3) return null
    const lastRec = rec[rec.length - 1]!; const lastSleep = sleepV[sleepV.length - 1]!; const lastStrain = strain[strain.length - 1]!
    const predicted = Math.round(lastRec * 0.4 + (lastSleep / 480) * 30 + (1 - lastStrain / 100) * 30)
    const sev: InsightSeverity = predicted >= 70 ? "positive" : predicted >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Predicted readiness: ${predicted}/100. ${predicted >= 70 ? "Ready for hard training tomorrow." : predicted >= 45 ? "Moderate readiness — light to moderate training." : "Low readiness — prioritize recovery."}`, predicted, "/100", { low: 40, high: 75 }, { lastRec, lastSleep, lastStrain })
  },

  "strain-accumulation": (alg, ctx) => {
    const strain = ctx.vals("strain_score")
    if (strain.length < 7) return null
    const weekTotal = strain.slice(-7).reduce((a, b) => a + b, 0)
    const avgDaily = weekTotal / 7
    const sev: InsightSeverity = weekTotal < 70 ? "positive" : weekTotal < 100 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `7-day strain: ${weekTotal.toFixed(0)} (avg ${avgDaily.toFixed(0)}/day). ${weekTotal >= 100 ? "High accumulated strain — recovery day recommended." : "Manageable strain level."}`, Math.round(weekTotal), "total", { low: 50, high: 100 }, { avgDaily: avgDaily.toFixed(0) })
  },

  "recovery-consistency": (alg, ctx) => {
    const rec = ctx.vals("recovery_score")
    if (rec.length < 14) return null
    const cv = coefficientOfVariation(rec.slice(-14))
    const sev: InsightSeverity = cv < 15 ? "positive" : cv < 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Recovery consistency (CV): ${cv.toFixed(0)}%. ${cv < 15 ? "Very stable recovery." : cv < 30 ? "Moderate variation." : "Highly variable recovery — inconsistent stress/rest patterns."}`, Number(cv.toFixed(0)), "%CV", { low: 10, high: 30 }, { days: 14 })
  },
}
