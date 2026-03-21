import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, coefficientOfVariation } from "../math.js"

export const metabolicRunners: Record<string, AlgorithmRunner> = {
  "glucose-status": (alg, ctx) => {
    const v = ctx.vals("blood_glucose")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    let cat: string
    let sev: InsightSeverity
    if (avg < 100) { cat = "Normal"; sev = "positive" }
    else if (avg < 126) { cat = "Prediabetic"; sev = "warning" }
    else { cat = "Diabetic range"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `Avg blood glucose: ${Math.round(avg)} mg/dL — ${cat}. ${avg >= 100 ? "Consult healthcare provider." : "Within healthy range."}`, Math.round(avg), "mg/dL", { low: 70, high: 100 }, { category: cat })
  },

  "glucose-variability": (alg, ctx) => {
    const v = ctx.vals("blood_glucose")
    if (v.length < 5) return null
    const cv = coefficientOfVariation(v)
    const sev: InsightSeverity = cv < 20 ? "positive" : cv < 36 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Glucose variability: CV=${Math.round(cv)}%. ${cv < 20 ? "Excellent glycemic control." : cv < 36 ? "Moderate variability." : "High variability — poor glycemic control."}`, Math.round(cv), "%", { low: 0, high: 36 }, {})
  },

  "glucose-trend": (alg, ctx) => {
    const v = ctx.vals("blood_glucose")
    if (v.length < 5) return null
    const t = trend(v.slice(-14))
    const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Blood glucose trend: ${t}. ${t === "rising" ? "Rising levels — review dietary patterns." : "Stable or improving."}`, Math.round(v[v.length - 1]!), "mg/dL", null, { trend: t })
  },

  // ── Advanced Metabolic ──
  "glucose-meal-response": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 10) return null
    const spikes = glucose.filter((g) => g > 160).length
    const pct = (spikes / glucose.length) * 100
    const sev: InsightSeverity = pct < 10 ? "positive" : pct < 25 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Post-meal glucose spikes (>160 mg/dL): ${spikes}/${glucose.length} readings (${pct.toFixed(0)}%). ${pct >= 25 ? "Frequent spikes — consider glycemic index of meals." : "Glucose responses generally controlled."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 20 }, { spikes })
  },

  "fasting-glucose-trend": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 14) return null
    const t = trend(glucose.slice(-14))
    const avg = glucose.slice(-7).reduce((a, b) => a + b, 0) / 7
    const sev: InsightSeverity = avg < 100 ? "positive" : avg < 126 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Fasting glucose trend: ${avg.toFixed(0)} mg/dL avg (${t}). ${avg < 100 ? "Normal fasting glucose." : avg < 126 ? "Prediabetic range — lifestyle modifications recommended." : "Elevated — consult healthcare provider."}`, Math.round(avg), "mg/dL", { low: 70, high: 100 }, { trend: t })
  },

  "dawn-phenomenon": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 7) return null
    const baseline = glucose.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, glucose.length - 3)
    const recent = glucose.slice(-3).reduce((a, b) => a + b, 0) / 3
    const rise = recent - baseline
    const detected = rise > 15
    const sev: InsightSeverity = !detected ? "positive" : rise < 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Dawn phenomenon: ${detected ? "detected" : "not detected"} (${rise > 0 ? "+" : ""}${rise.toFixed(0)} mg/dL morning rise). ${detected ? "Morning glucose elevation present." : "Normal morning glucose pattern."}`, Math.round(rise), "mg/dL", { low: 0, high: 20 }, { baseline: Math.round(baseline), recent: Math.round(recent) })
  },

  "glucose-exercise-response": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 7 || ctx.workouts.length < 3) return null
    const avg = glucose.reduce((a, b) => a + b, 0) / glucose.length
    const t = trend(glucose.slice(-7))
    const sev: InsightSeverity = avg < 120 ? "positive" : avg < 150 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Post-exercise glucose avg: ${avg.toFixed(0)} mg/dL (${t}). ${avg < 120 ? "Exercise effectively lowering glucose." : "Glucose remains elevated after exercise."}`, Math.round(avg), "mg/dL", { low: 70, high: 140 }, { trend: t, workouts: ctx.workouts.length })
  },

  "time-in-range": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 7) return null
    const inRange = glucose.filter((g) => g >= 70 && g <= 180).length
    const pct = (inRange / glucose.length) * 100
    const sev: InsightSeverity = pct >= 70 ? "positive" : pct >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Time in glucose range (70-180): ${pct.toFixed(0)}%. ${pct >= 70 ? "Excellent glycemic control." : pct >= 50 ? "Moderate control — minimize out-of-range readings." : "Significant time outside range — review management plan."}`, Number(pct.toFixed(0)), "%", { low: 50, high: 80 }, { inRange, total: glucose.length })
  },

  "hypoglycemia-risk": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 7) return null
    const lowCount = glucose.filter((g) => g < 70).length
    const pct = (lowCount / glucose.length) * 100
    const sev: InsightSeverity = pct === 0 ? "positive" : pct < 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Hypoglycemia events (<70 mg/dL): ${lowCount}/${glucose.length} (${pct.toFixed(0)}%). ${pct >= 10 ? "Frequent low glucose — review medication and meal timing." : "Low glucose events are rare."}`, lowCount, "events", { low: 0, high: 3 }, { pct: pct.toFixed(0) })
  },

  "insulin-sensitivity-proxy": (alg, ctx) => {
    const glucose = ctx.vals("blood_glucose")
    if (glucose.length < 14) return null
    const cv = coefficientOfVariation(glucose.slice(-14))
    const sev: InsightSeverity = cv < 20 ? "positive" : cv < 36 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Glucose variability (CV): ${cv.toFixed(0)}%. ${cv < 20 ? "Low variability — good insulin sensitivity proxy." : cv < 36 ? "Moderate variability." : "High variability — possible insulin resistance indicator."}`, Number(cv.toFixed(0)), "%CV", { low: 15, high: 36 }, { days: 14 })
  },

  "calorie-burn-efficiency": (alg, ctx) => {
    const cal = ctx.vals("calories"); const weight = ctx.vals("weight")
    if (cal.length < 7 || weight.length < 1) return null
    const w = weight[weight.length - 1]!
    const avgCal = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
    const perKg = w > 0 ? avgCal / w : 0
    const sev: InsightSeverity = perKg >= 30 ? "positive" : perKg >= 22 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Calorie burn efficiency: ${perKg.toFixed(1)} kcal/kg/day. ${perKg >= 30 ? "Active metabolism." : perKg >= 22 ? "Average efficiency." : "Low burn per kg — increase activity intensity."}`, Number(perKg.toFixed(1)), "kcal/kg", { low: 22, high: 35 }, { weight: w, avgCal: Math.round(avgCal) })
  },
}
