import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, coefficientOfVariation } from "../math.js"

export const hormonalRunners: Record<string, AlgorithmRunner> = {
  "cortisol-proxy": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const rhr = ctx.vals("resting_heart_rate")
    const stress = ctx.vals("stress")
    if (hrv.length < 7 || rhr.length < 7) return null
    const hrvTrend = linearSlope(hrv.slice(-7))
    const rhrTrend = linearSlope(rhr.slice(-7))
    let cortisolEstimate = 50
    if (hrvTrend < -1) cortisolEstimate += 15 // HRV declining = cortisol rising
    if (rhrTrend > 0.3) cortisolEstimate += 10 // RHR climbing = stress hormone elevation
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; cortisolEstimate += Math.max(0, (avg - 50) * 0.4) }
    const morningHRV = hrv.slice(-7).reduce((a, b) => a + b, 0) / 7
    const baseline = hrv.reduce((a, b) => a + b, 0) / hrv.length
    if (morningHRV < baseline * 0.85) cortisolEstimate += 10
    cortisolEstimate = Math.max(0, Math.min(100, Math.round(cortisolEstimate)))
    const sev: InsightSeverity = cortisolEstimate < 45 ? "positive" : cortisolEstimate < 65 ? "info" : cortisolEstimate < 80 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Cortisol stress proxy: ${cortisolEstimate}/100 (${cortisolEstimate < 45 ? "low — healthy stress regulation" : cortisolEstimate < 65 ? "moderate — within normal range" : "elevated — consider stress management"}). Based on HRV decline rate, RHR trends, and stress patterns. ${cortisolEstimate >= 65 ? "Chronic elevation impairs immune function, sleep, and body composition." : ""}`, cortisolEstimate, "/100", { low: 20, high: 60 }, { hrvTrend: +hrvTrend.toFixed(2), rhrTrend: +rhrTrend.toFixed(2) })
  },

  "testosterone-proxy": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const hrv = ctx.vals("heart_rate_variability")
    const recovery = ctx.vals("recovery_score")
    if (sleep.length < 7 || hrv.length < 7) return null
    let score = 50
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (avgSleep >= 420) score += 15; else if (avgSleep < 360) score -= 20
    const sleepConsistency = stddev(sleep.slice(-7))
    if (sleepConsistency < 30) score += 10
    const hrvAvg = hrv.slice(-7).reduce((a, b) => a + b, 0) / 7
    const hrvBase = hrv.reduce((a, b) => a + b, 0) / hrv.length
    if (hrvAvg > hrvBase * 1.05) score += 10; else if (hrvAvg < hrvBase * 0.9) score -= 10
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 70) score += 10; else if (avg < 40) score -= 10 }
    const recentWorkouts = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 7 * 86400000))
    if (recentWorkouts.length >= 3 && recentWorkouts.length <= 5) score += 5
    score = Math.max(0, Math.min(100, Math.round(score)))
    const sev: InsightSeverity = score >= 70 ? "positive" : score >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Anabolic environment score: ${score}/100. ${score >= 70 ? "Favorable hormone milieu — strong conditions for muscle growth and recovery." : score >= 45 ? "Moderate anabolic status. Prioritize sleep quality to optimize." : "Low anabolic drive — sleep debt and stress are suppressing recovery hormones."}`, score, "/100", { low: 40, high: 75 }, { avgSleepMin: Math.round(avgSleep), weeklyWorkouts: recentWorkouts.length })
  },

  "hormonal-rhythm-stability": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const rhr = ctx.vals("resting_heart_rate")
    if (sleep.length < 14 || rhr.length < 14) return null
    const sleepCV = coefficientOfVariation(sleep.slice(-14))
    const rhrCV = coefficientOfVariation(rhr.slice(-14))
    const stability = Math.round(100 - (sleepCV * 1.5 + rhrCV * 2))
    const clamped = Math.max(0, Math.min(100, stability))
    const sev: InsightSeverity = clamped >= 70 ? "positive" : clamped >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Circadian rhythm stability: ${clamped}/100. ${clamped >= 70 ? "Strong — consistent patterns support healthy hormone cycling." : clamped >= 45 ? "Some variability detected. Aim for consistent sleep/wake times." : "Unstable circadian rhythm. Irregular schedules disrupt cortisol, melatonin, and growth hormone production."}`, clamped, "/100", { low: 40, high: 75 }, { sleepCV: +sleepCV.toFixed(1), rhrCV: +rhrCV.toFixed(1) })
  },

  "stress-hormone-accumulation": (alg, ctx) => {
    const stress = ctx.vals("stress"); const hrv = ctx.vals("heart_rate_variability")
    if (stress.length < 10) return null
    const weekAvg = stress.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, stress.length)
    const prevWeekAvg = stress.slice(-14, -7).length > 0 ? stress.slice(-14, -7).reduce((a, b) => a + b, 0) / stress.slice(-14, -7).length : weekAvg
    const accumulation = Math.round(weekAvg * 0.6 + Math.max(0, weekAvg - prevWeekAvg) * 0.4)
    const chronic = weekAvg > 60 && prevWeekAvg > 55
    const sev: InsightSeverity = accumulation < 35 ? "positive" : accumulation < 55 ? "info" : chronic ? "critical" : "warning"
    return ctx.makeInsight(alg, sev, `Stress accumulation index: ${accumulation}. ${chronic ? "CHRONIC: Sustained high stress over 2+ weeks. This pattern is associated with adrenal fatigue, metabolic dysfunction, and reduced immune function." : accumulation < 35 ? "Well-managed stress levels." : "Rising stress load — schedule active recovery."}`, accumulation, "", { low: 20, high: 55 }, { weekAvg: +weekAvg.toFixed(1), prevWeekAvg: +prevWeekAvg.toFixed(1), chronic })
  },

  "recovery-hormone-window": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const hrv = ctx.vals("heart_rate_variability")
    if (sleep.length < 5 || hrv.length < 5) return null
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    const deepSleepProxy = avgSleep * 0.18 // ~18% deep sleep
    // Growth hormone secretion peaks in first deep sleep cycle
    const ghWindow = Math.round(Math.min(100, (deepSleepProxy / 90) * 100))
    const sev: InsightSeverity = ghWindow >= 70 ? "positive" : ghWindow >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Growth hormone window quality: ${ghWindow}%. Est. ${Math.round(deepSleepProxy)} min deep sleep. ${ghWindow >= 70 ? "Optimal GH secretion conditions — supports tissue repair, fat metabolism, and muscle recovery." : ghWindow >= 45 ? "Moderate GH production. Try sleeping in a cooler room to enhance deep sleep." : "Poor GH window — insufficient deep sleep. Avoid alcohol and screens before bed."}`, ghWindow, "%", { low: 40, high: 80 }, { estDeepSleepMin: Math.round(deepSleepProxy) })
  },

  "metabolic-hormone-balance": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const rhr = ctx.vals("resting_heart_rate")
    const body = ctx.vals("weight")
    if (sleep.length < 7 || rhr.length < 7) return null
    let balance = 60
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (avgSleep < 360) balance -= 20 // Short sleep = ghrelin up, leptin down
    if (avgSleep >= 420) balance += 10
    const rhrTrend = linearSlope(rhr.slice(-7))
    if (rhrTrend > 0.5) balance -= 10 // Sympathetic dominance
    if (body.length >= 14) {
      const weightChange = Math.abs(body[body.length - 1]! - body[body.length - 14]!)
      if (weightChange > 2) balance -= 10
    }
    balance = Math.max(0, Math.min(100, Math.round(balance)))
    const sev: InsightSeverity = balance >= 65 ? "positive" : balance >= 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Metabolic hormone balance: ${balance}/100. ${balance >= 65 ? "Healthy leptin/ghrelin signaling — appetite regulation should be normal." : balance >= 40 ? "Some appetite dysregulation possible. Prioritize sleep quality." : "Disrupted hunger hormones from poor sleep. You may experience increased cravings and reduced satiety signals."}`, balance, "/100", { low: 35, high: 70 }, { avgSleepMin: Math.round(avgSleep), rhrTrend: +rhrTrend.toFixed(2) })
  },

  "thyroid-function-proxy": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const sleep = ctx.vals("sleep")
    const body = ctx.vals("weight")
    if (rhr.length < 14) return null
    let score = 60
    const rhrAvg = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const rhrBase = rhr.reduce((a, b) => a + b, 0) / rhr.length
    const rhrDelta = rhrAvg - rhrBase
    // Hypothyroid: lower RHR, more sleep needed, weight gain
    // Hyperthyroid: higher RHR, less sleep, weight loss
    if (Math.abs(rhrDelta) < 3) score += 20 // Stable
    if (Math.abs(rhrDelta) > 8) score -= 20
    if (sleep.length >= 14) {
      const sleepAvg = sleep.slice(-14).reduce((a, b) => a + b, 0) / 14
      if (sleepAvg > 540 && rhrDelta < -3) score -= 15 // Sleeping more + lower RHR = hypothyroid signal
      if (sleepAvg < 330 && rhrDelta > 5) score -= 15 // Sleeping less + higher RHR = hyperthyroid signal
    }
    score = Math.max(0, Math.min(100, Math.round(score)))
    const sev: InsightSeverity = score >= 65 ? "positive" : score >= 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Thyroid function proxy: ${score}/100. ${score >= 65 ? "Stable metabolic markers consistent with normal thyroid function." : score >= 40 ? "Some variation in metabolic indicators. Monitor for persistent changes." : "Metabolic patterns suggest possible thyroid imbalance. Consult your healthcare provider if symptoms persist."}`, score, "/100", { low: 40, high: 75 }, { rhrAvg: +rhrAvg.toFixed(1), rhrDelta: +rhrDelta.toFixed(1) })
  },

  "adrenal-fatigue-risk": (alg, ctx) => {
    const stress = ctx.vals("stress"); const hrv = ctx.vals("heart_rate_variability")
    const sleep = ctx.vals("sleep"); const recovery = ctx.vals("recovery_score")
    if (stress.length < 14 || hrv.length < 14) return null
    let risk = 0
    const stressAvg = stress.slice(-14).reduce((a, b) => a + b, 0) / 14
    if (stressAvg > 60) risk += 25
    if (stressAvg > 75) risk += 15
    const hrvSlope = linearSlope(hrv.slice(-14))
    if (hrvSlope < -0.5) risk += 20
    if (sleep.length >= 14) {
      const sleepAvg = sleep.slice(-14).reduce((a, b) => a + b, 0) / 14
      if (sleepAvg < 360) risk += 15
    }
    if (recovery.length >= 7) {
      const recAvg = recovery.slice(-7).reduce((a, b) => a + b, 0) / 7
      if (recAvg < 40) risk += 15
    }
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 20 ? "positive" : risk < 40 ? "info" : risk < 65 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Adrenal fatigue risk: ${risk}%. ${risk < 20 ? "Low — healthy stress-recovery balance." : risk < 40 ? "Mild risk. Incorporate mindfulness or yoga." : "High risk from sustained stress + declining HRV. Implement strict recovery protocols — rest days, sleep optimization, adaptogenic practices."}`, risk, "%", { low: 0, high: 40 }, { stressAvg14d: +stressAvg.toFixed(1), hrvSlope14d: +hrvSlope.toFixed(2) })
  },
}
