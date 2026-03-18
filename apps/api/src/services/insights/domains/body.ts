import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, movingAverage, coefficientOfVariation } from "../math.js"

export const bodyRunners: Record<string, AlgorithmRunner> = {
  "bmi-classification": (alg, ctx) => {
    const v = ctx.vals("bmi")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    let cat: string
    let sev: InsightSeverity
    if (latest < 18.5) { cat = "Underweight"; sev = "warning" }
    else if (latest < 25) { cat = "Normal"; sev = "positive" }
    else if (latest < 30) { cat = "Overweight"; sev = "warning" }
    else { cat = "Obese"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `BMI: ${latest.toFixed(1)} — ${cat}.`, Number(latest.toFixed(1)), "kg/m²", { low: 18.5, high: 25 }, { category: cat })
  },

  "weight-trend": (alg, ctx) => {
    const v = ctx.vals("weight")
    if (v.length < 5) return null
    const slope = linearSlope(v)
    const weeklyChange = slope * 7
    const sev: InsightSeverity = Math.abs(weeklyChange) < 0.2 ? "info" : Math.abs(weeklyChange) < 0.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Weight trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(2)} kg/week. ${Math.abs(weeklyChange) < 0.2 ? "Stable weight." : weeklyChange > 0 ? "Gaining trend." : "Losing trend."}`, Number(weeklyChange.toFixed(2)), "kg/week", null, { slope: Number(slope.toFixed(4)), samples: v.length, latest: v[v.length - 1] })
  },

  "body-fat-zone": (alg, ctx) => {
    const v = ctx.vals("body_fat")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    let zone: string
    let sev: InsightSeverity
    if (latest < 14) { zone = "Athletic"; sev = "positive" }
    else if (latest < 21) { zone = "Fitness"; sev = "positive" }
    else if (latest < 25) { zone = "Acceptable"; sev = "info" }
    else { zone = "Above recommended"; sev = "warning" }
    return ctx.makeInsight(alg, sev, `Body fat: ${latest.toFixed(1)}% — ${zone} range.`, Number(latest.toFixed(1)), "%", { low: 10, high: 25 }, { zone })
  },

  "weight-volatility": (alg, ctx) => {
    const v = ctx.vals("weight")
    if (v.length < 5) return null
    const diffs = []
    for (let i = 1; i < v.length; i++) diffs.push(Math.abs(v[i]! - v[i - 1]!))
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
    const sev: InsightSeverity = avg < 0.5 ? "positive" : avg < 1.0 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Day-to-day weight fluctuation: ±${avg.toFixed(2)} kg. ${avg < 0.5 ? "Very stable." : avg < 1.0 ? "Normal fluctuation." : "High volatility — may indicate fluid retention."}`, Number(avg.toFixed(2)), "kg", { low: 0, high: 0.5 }, {})
  },

  "bp-classification": (alg, ctx) => {
    const bpRecs = ctx.recs("blood_pressure")
    if (bpRecs.length === 0) return null
    const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
    const diastolics = bpRecs.map((r) => (r.data as { diastolic?: number } | null)?.diastolic).filter((v): v is number => v != null)
    if (systolics.length === 0) return null
    const avgSys = systolics.reduce((a, b) => a + b, 0) / systolics.length
    const avgDia = diastolics.length > 0 ? diastolics.reduce((a, b) => a + b, 0) / diastolics.length : 0
    let cat: string
    let sev: InsightSeverity
    if (avgSys < 120 && avgDia < 80) { cat = "Normal"; sev = "positive" }
    else if (avgSys < 130) { cat = "Elevated"; sev = "info" }
    else if (avgSys < 140) { cat = "Stage 1 Hypertension"; sev = "warning" }
    else if (avgSys < 180) { cat = "Stage 2 Hypertension"; sev = "critical" }
    else { cat = "Hypertensive Crisis"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `Blood pressure: ${Math.round(avgSys)}/${Math.round(avgDia)} mmHg — ${cat} (AHA classification).`, Math.round(avgSys), "mmHg", { low: 90, high: 120 }, { category: cat, systolic: Math.round(avgSys), diastolic: Math.round(avgDia) })
  },

  "bp-trend": (alg, ctx) => {
    const bpRecs = ctx.recs("blood_pressure")
    const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
    if (systolics.length < 5) return null
    const t = trend(systolics.slice(-14))
    const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Blood pressure trend: ${t}. ${t === "rising" ? "Monitor closely — consult physician if persistent." : "Stable or improving."}`, systolics[systolics.length - 1]!, "mmHg", null, { trend: t })
  },

  "temp-anomaly": (alg, ctx) => {
    const v = ctx.vals("temperature")
    if (v.length === 0) return null
    const latest = v[v.length - 1]!
    const sev: InsightSeverity = latest >= 36.1 && latest <= 37.2 ? "positive" : latest < 38.0 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Body temperature: ${latest.toFixed(1)}°C. ${latest >= 36.1 && latest <= 37.2 ? "Normal range." : latest < 36.1 ? "Below normal — monitor for hypothermia." : "Elevated — possible fever."}`, Number(latest.toFixed(1)), "°C", { low: 36.1, high: 37.2 }, {})
  },

  // ── Advanced Body Composition ──
  "body-composition-trend": (alg, ctx) => {
    const weight = ctx.vals("weight"); const bf = ctx.vals("body_fat")
    if (weight.length < 7 || bf.length < 7) return null
    const wTrend = trend(weight.slice(-14)); const bfTrend = trend(bf.slice(-14))
    const ideal = (wTrend === "falling" && bfTrend === "falling") || (wTrend === "rising" && bfTrend === "falling")
    const sev: InsightSeverity = ideal ? "positive" : wTrend === "stable" && bfTrend === "stable" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Weight: ${wTrend}, Body fat: ${bfTrend}. ${ideal ? "Favorable body composition change." : "Monitor composition alongside weight."}`, bf[bf.length - 1]!, "%", { low: 10, high: 25 }, { wTrend, bfTrend })
  },

  "lean-mass-estimate": (alg, ctx) => {
    const weight = ctx.vals("weight"); const bf = ctx.vals("body_fat")
    if (weight.length < 3 || bf.length < 3) return null
    const w = weight[weight.length - 1]!; const f = bf[bf.length - 1]!
    const lean = w * (1 - f / 100)
    const prevW = weight.length > 7 ? weight[weight.length - 8]! : weight[0]!
    const prevF = bf.length > 7 ? bf[bf.length - 8]! : bf[0]!
    const prevLean = prevW * (1 - prevF / 100)
    const change = lean - prevLean
    const sev: InsightSeverity = change > 0 ? "positive" : Math.abs(change) < 0.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Lean mass: ${lean.toFixed(1)} kg (${change > 0 ? "+" : ""}${change.toFixed(1)} kg change). ${change > 0 ? "Gaining lean mass." : Math.abs(change) < 0.5 ? "Stable." : "Lean mass declining — increase protein/resistance training."}`, Number(lean.toFixed(1)), "kg", { low: 40, high: 70 }, { weight: w, bodyFat: f })
  },

  "bmi-trend": (alg, ctx) => {
    const bmi = ctx.vals("bmi")
    if (bmi.length < 7) return null
    const current = bmi[bmi.length - 1]!
    const t = trend(bmi.slice(-30))
    const cat = current < 18.5 ? "Underweight" : current < 25 ? "Normal" : current < 30 ? "Overweight" : "Obese"
    const sev: InsightSeverity = current >= 18.5 && current < 25 ? "positive" : current >= 25 && current < 30 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `BMI: ${current.toFixed(1)} (${cat}, ${t}). ${current >= 18.5 && current < 25 ? "Healthy range." : `Consider lifestyle adjustments for optimal BMI.`}`, Number(current.toFixed(1)), "kg/m²", { low: 18.5, high: 25 }, { category: cat, trend: t })
  },

  "weight-goal-projection": (alg, ctx) => {
    const weight = ctx.vals("weight")
    if (weight.length < 14) return null
    const slope = linearSlope(weight.slice(-14))
    const current = weight[weight.length - 1]!
    const weeklyChange = slope * 7
    const sev: InsightSeverity = Math.abs(weeklyChange) < 0.5 ? "info" : weeklyChange < -1.5 ? "warning" : "positive"
    return ctx.makeInsight(alg, sev, `Weight trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(2)} kg/week. ${Math.abs(weeklyChange) < 0.2 ? "Weight is stable." : weeklyChange < -1.5 ? "Rapid loss — ensure adequate nutrition." : "Steady progress."}`, Number(weeklyChange.toFixed(2)), "kg/week", { low: -1, high: 0.5 }, { current: current.toFixed(1), slope: slope.toFixed(4) })
  },

  "fluid-retention-pattern": (alg, ctx) => {
    const weight = ctx.vals("weight")
    if (weight.length < 14) return null
    const ma = movingAverage(weight, 3)
    const spikes = weight.filter((w, i) => i < ma.length && w > ma[i]! + 1).length
    const pct = (spikes / weight.length) * 100
    const sev: InsightSeverity = pct < 10 ? "positive" : pct < 25 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Fluid retention spikes: ${spikes} days (~${pct.toFixed(0)}%). ${pct >= 25 ? "Frequent weight spikes — possible fluid retention cycles." : "Normal weight fluctuation."}`, spikes, "days", { low: 0, high: 5 }, { totalDays: weight.length })
  },

  "metabolic-rate-estimate": (alg, ctx) => {
    const weight = ctx.vals("weight"); const cal = ctx.vals("calories")
    if (weight.length < 3 || cal.length < 7) return null
    const w = weight[weight.length - 1]!
    const bmr = w * 24
    const avgCal = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
    const activityFactor = avgCal / bmr
    const sev: InsightSeverity = activityFactor >= 1.5 ? "positive" : activityFactor >= 1.2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated BMR: ${Math.round(bmr)} kcal. Activity factor: ${activityFactor.toFixed(2)}. ${activityFactor >= 1.5 ? "Active lifestyle." : activityFactor >= 1.2 ? "Lightly active." : "Sedentary."}`, Math.round(bmr), "kcal", { low: 1200, high: 2400 }, { weight: w, activityFactor: activityFactor.toFixed(2) })
  },

  "body-fat-trend": (alg, ctx) => {
    const bf = ctx.vals("body_fat")
    if (bf.length < 7) return null
    const slope = linearSlope(bf.slice(-30))
    const current = bf[bf.length - 1]!
    const monthlyChange = slope * 30
    const sev: InsightSeverity = monthlyChange < -0.5 ? "positive" : Math.abs(monthlyChange) < 0.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Body fat: ${current.toFixed(1)}% (${monthlyChange > 0 ? "+" : ""}${monthlyChange.toFixed(1)}%/month). ${monthlyChange < -0.5 ? "Decreasing — good progress." : Math.abs(monthlyChange) < 0.5 ? "Stable." : "Increasing — review diet and exercise."}`, Number(current.toFixed(1)), "%", { low: 10, high: 25 }, { monthlyChange: monthlyChange.toFixed(2) })
  },

  "weight-plateau": (alg, ctx) => {
    const weight = ctx.vals("weight")
    if (weight.length < 14) return null
    const recent = weight.slice(-14)
    const cv = coefficientOfVariation(recent)
    const slope = Math.abs(linearSlope(recent))
    const isPlateau = cv < 1 && slope < 0.02
    const sev: InsightSeverity = isPlateau ? "info" : "positive"
    return ctx.makeInsight(alg, sev, `Weight plateau: ${isPlateau ? "Yes" : "No"} (CV: ${cv.toFixed(1)}%, slope: ${slope.toFixed(3)} kg/day). ${isPlateau ? "Weight has been stable for 2 weeks — adjust plan if losing/gaining is the goal." : "Weight is actively changing."}`, Number(cv.toFixed(1)), "% CV", { low: 0, high: 3 }, { slope: slope.toFixed(3), isPlateau })
  },
}
