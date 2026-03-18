import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev } from "../math.js"

export const respiratoryRunners: Record<string, AlgorithmRunner> = {
  "spo2-status": (alg, ctx) => {
    const v = ctx.vals("spo2")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    const sev: InsightSeverity = latest >= 95 ? "positive" : latest >= 90 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `SpO2: ${Math.round(latest)}%. ${latest >= 95 ? "Normal blood oxygen." : latest >= 90 ? "Below normal — monitor for respiratory issues." : "Critically low — seek medical attention."}`, Math.round(latest), "%", { low: 95, high: 100 }, {})
  },

  "spo2-trend": (alg, ctx) => {
    const v = ctx.vals("spo2")
    if (v.length < 3) return null
    const t = trend(v.slice(-7))
    const sev: InsightSeverity = t === "falling" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `SpO2 trend: ${t}. ${t === "falling" ? "Declining — watch for respiratory symptoms." : "Stable oxygen levels."}`, Math.round(v[v.length - 1]!), "%", null, { trend: t })
  },

  "resp-rate-status": (alg, ctx) => {
    const v = ctx.vals("respiratory_rate")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    const sev: InsightSeverity = avg >= 12 && avg <= 20 ? "positive" : avg >= 10 && avg <= 24 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Respiratory rate: ${avg.toFixed(1)} brpm. ${avg >= 12 && avg <= 20 ? "Normal adult range." : "Outside normal 12-20 brpm range."}`, Number(avg.toFixed(1)), "brpm", { low: 12, high: 20 }, {})
  },

  "resp-rate-trend": (alg, ctx) => {
    const v = ctx.vals("respiratory_rate")
    if (v.length < 5) return null
    const t = trend(v.slice(-14))
    const sev: InsightSeverity = t === "rising" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Respiratory rate trend: ${t}. ${t === "rising" ? "Increasing — may indicate stress or illness." : "Stable breathing patterns."}`, Number(v[v.length - 1]!.toFixed(1)), "brpm", null, { trend: t })
  },

  "resp-sleep-corr": (alg, ctx) => {
    const respV = ctx.vals("respiratory_rate")
    const sleepRecs = ctx.recs("sleep")
    if (respV.length < 5 || sleepRecs.length < 5) return null
    const sleepScores = sleepRecs.map((r) => (r.data as { score?: number } | null)?.score).filter((s): s is number => s != null)
    if (sleepScores.length < 3) return null
    const respTrend = trend(respV.slice(-7))
    const sleepTrend = trend(sleepScores.slice(-7))
    const correlated = (respTrend === "rising" && sleepTrend === "falling") || (respTrend === "falling" && sleepTrend === "rising")
    return ctx.makeInsight(alg, correlated ? "warning" : "info", `Respiratory rate is ${respTrend}, sleep quality is ${sleepTrend}. ${correlated ? "Inverse correlation detected — elevated breathing may impair sleep." : "No significant correlation."}`, null, null, null, { respTrend, sleepTrend, correlated })
  },

  // ── Advanced Respiratory & SpO2 ──
  "sleep-breathing": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate"); const sleepV = ctx.vals("sleep")
    if (rr.length < 7 || sleepV.length < 7) return null
    const avgRR = rr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const rrSD = stddev(rr.slice(-7))
    const sev: InsightSeverity = avgRR < 16 && rrSD < 3 ? "positive" : avgRR < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep breathing: avg ${avgRR.toFixed(1)} breaths/min (SD: ${rrSD.toFixed(1)}). ${avgRR < 16 ? "Calm, regular breathing." : avgRR < 20 ? "Normal range." : "Elevated — possible stress or respiratory issue."}`, Number(avgRR.toFixed(1)), "breaths/min", { low: 12, high: 18 }, { rrSD: rrSD.toFixed(1) })
  },

  "respiratory-fitness": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate")
    if (rr.length < 14 || ctx.workouts.length < 3) return null
    const t = trend(rr.slice(-14))
    const avgRR = rr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const sev: InsightSeverity = t === "falling" ? "positive" : t === "stable" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Respiratory fitness: avg RR ${avgRR.toFixed(1)}/min (${t}). ${t === "falling" ? "Improving — lower RR indicates better fitness." : "Respiratory rate stable or rising."}`, Number(avgRR.toFixed(1)), "breaths/min", { low: 12, high: 18 }, { trend: t, workouts: ctx.workouts.length })
  },

  "dyspnea-risk": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate"); const spo2 = ctx.vals("spo2")
    if (rr.length < 5 || spo2.length < 5) return null
    const avgRR = rr.slice(-5).reduce((a, b) => a + b, 0) / 5
    const avgSpO2 = spo2.slice(-5).reduce((a, b) => a + b, 0) / 5
    const risk = (avgRR > 20 ? 1 : 0) + (avgSpO2 < 95 ? 1 : 0)
    const sev: InsightSeverity = risk === 0 ? "positive" : risk === 1 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Respiratory risk: ${risk}/2 flags (RR: ${avgRR.toFixed(0)}, SpO2: ${avgSpO2.toFixed(0)}%). ${risk >= 2 ? "Elevated RR + low SpO2 — medical evaluation suggested." : "Respiratory parameters normal."}`, risk, "/2", { low: 0, high: 1 }, { avgRR: avgRR.toFixed(0), avgSpO2: avgSpO2.toFixed(0) })
  },

  "nocturnal-desat": (alg, ctx) => {
    const spo2 = ctx.vals("spo2")
    if (spo2.length < 7) return null
    const lowNights = spo2.filter((v) => v < 93).length
    const pct = (lowNights / spo2.length) * 100
    const sev: InsightSeverity = pct === 0 ? "positive" : pct < 15 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Nocturnal desaturation (<93%): ${lowNights}/${spo2.length} readings (${pct.toFixed(0)}%). ${pct >= 15 ? "Frequent low SpO2 — consider sleep study." : "SpO2 generally adequate during sleep."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 10 }, { lowNights })
  },

  "breathing-efficiency": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate"); const hr = ctx.vals("heart_rate")
    if (rr.length < 7 || hr.length < 7) return null
    const n = Math.min(rr.length, hr.length)
    const ratios = rr.slice(-n).map((r, i) => hr[hr.length - n + i]! > 0 ? r / hr[hr.length - n + i]! : 0).filter((r) => r > 0)
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const sev: InsightSeverity = avgRatio < 0.2 ? "positive" : avgRatio < 0.3 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Breathing efficiency (RR/HR): ${avgRatio.toFixed(3)}. ${avgRatio < 0.2 ? "Efficient breathing relative to heart rate." : "Higher ratio — respiratory conditioning may help."}`, Number(avgRatio.toFixed(3)), "ratio", { low: 0.1, high: 0.25 }, { samples: ratios.length })
  },

  "respiratory-reserve": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate")
    if (rr.length < 14) return null
    const min = Math.min(...rr); const max = Math.max(...rr)
    const reserve = max - min
    const sev: InsightSeverity = reserve > 8 ? "positive" : reserve > 4 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Respiratory reserve: ${reserve.toFixed(0)} breaths/min range (${min.toFixed(0)}-${max.toFixed(0)}). ${reserve > 8 ? "Good respiratory dynamic range." : "Limited reserve — may indicate reduced capacity."}`, Math.round(reserve), "breaths/min", { low: 4, high: 12 }, { min: min.toFixed(0), max: max.toFixed(0) })
  },

  "spo2-variability": (alg, ctx) => {
    const spo2 = ctx.vals("spo2")
    if (spo2.length < 7) return null
    const sd = stddev(spo2.slice(-14))
    const sev: InsightSeverity = sd < 1.5 ? "positive" : sd < 3 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `SpO2 variability (SD): ${sd.toFixed(1)}%. ${sd < 1.5 ? "Very stable oxygen saturation." : sd < 3 ? "Normal variation." : "High variability — monitor for patterns."}`, Number(sd.toFixed(1)), "%SD", { low: 0.5, high: 3 }, { days: Math.min(14, spo2.length) })
  },

  "ventilatory-threshold": (alg, ctx) => {
    const rr = ctx.vals("respiratory_rate"); const hr = ctx.vals("heart_rate")
    if (rr.length < 7 || hr.length < 7 || ctx.workouts.length < 3) return null
    const maxRR = Math.max(...rr); const maxHR = Math.max(...hr)
    const vtEstimate = maxHR > 0 ? (maxRR / maxHR) * 100 : 0
    const sev: InsightSeverity = vtEstimate > 15 ? "positive" : vtEstimate > 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Ventilatory threshold proxy: ${vtEstimate.toFixed(1)}. Max RR: ${maxRR.toFixed(0)}, Max HR: ${maxHR.toFixed(0)}. ${vtEstimate > 15 ? "Good ventilatory capacity." : "Room for respiratory fitness improvement."}`, Number(vtEstimate.toFixed(1)), "index", { low: 10, high: 20 }, { maxRR: maxRR.toFixed(0), maxHR: maxHR.toFixed(0) })
  },
}
