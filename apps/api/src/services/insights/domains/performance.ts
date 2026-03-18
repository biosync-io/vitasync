import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, coefficientOfVariation, movingAverage, percentile } from "../math.js"

export const performanceRunners: Record<string, AlgorithmRunner> = {
  "peak-performance-prediction": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const sleep = ctx.vals("sleep")
    const recovery = ctx.vals("recovery_score"); const rhr = ctx.vals("resting_heart_rate")
    if (hrv.length < 7 || sleep.length < 7 || rhr.length < 7) return null
    let score = 50
    const hrvP = percentile(hrv, hrv.slice(-3).reduce((a, b) => a + b, 0) / 3)
    if (hrvP > 75) score += 20; else if (hrvP < 25) score -= 15
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep >= 450) score += 15; else if (avgSleep < 360) score -= 15
    const rhrP = percentile(rhr, rhr.slice(-3).reduce((a, b) => a + b, 0) / 3)
    if (rhrP < 25) score += 10; else if (rhrP > 75) score -= 10 // Lower RHR = more fit
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 80) score += 10; else if (avg < 40) score -= 15 }
    score = Math.max(0, Math.min(100, Math.round(score)))
    const sev: InsightSeverity = score >= 80 ? "positive" : score >= 55 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Peak performance readiness: ${score}/100. ${score >= 80 ? "🔥 GO DAY — you are in the top tier of your personal range. This is the day for PRs, competitions, and max effort sessions." : score >= 55 ? "Solid performance capacity. Good for structured training sessions." : "Below your performance baseline. Prioritize technique work over intensity."}`, score, "/100", { low: 40, high: 80 }, { hrvPercentile: Math.round(hrvP), avgSleepMin: Math.round(avgSleep) })
  },

  "pr-potential": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const sleep = ctx.vals("sleep")
    const recovery = ctx.vals("recovery_score"); const rhr = ctx.vals("resting_heart_rate")
    if (hrv.length < 14 || sleep.length < 14 || rhr.length < 14) return null
    // Check if all metrics are simultaneously in top quartile (rare alignment)
    const hrvP = percentile(hrv, hrv.slice(-3).reduce((a, b) => a + b, 0) / 3)
    const sleepP = percentile(sleep, sleep.slice(-3).reduce((a, b) => a + b, 0) / 3)
    const rhrP = percentile(rhr, rhr.slice(-3).reduce((a, b) => a + b, 0) / 3)
    const topQuartileCount = [hrvP > 75, sleepP > 75, rhrP < 25].filter(Boolean).length
    let potential = 0
    if (topQuartileCount === 3) potential = 95
    else if (topQuartileCount === 2) potential = 70
    else if (topQuartileCount === 1) potential = 40
    else potential = 15
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 85) potential = Math.min(100, potential + 10) }
    const sev: InsightSeverity = potential >= 80 ? "positive" : potential >= 50 ? "info" : "info"
    return ctx.makeInsight(alg, sev, `Personal record potential: ${potential}%. ${potential >= 80 ? "RARE ALIGNMENT — HRV, sleep, and recovery are all in your top quartile simultaneously. Max effort today has the highest PR probability." : potential >= 50 ? "Good conditions for strong performance but not peak alignment." : "Not yet PR conditions. Continue building your base."}`, potential, "%", { low: 20, high: 80 }, { hrvP: Math.round(hrvP), sleepP: Math.round(sleepP), topQuartileCount })
  },

  "vo2max-trend": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 30) return null
    // VO2max proxy: lower RHR correlates with higher VO2max
    const recent = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const month = rhr.slice(-30).reduce((a, b) => a + b, 0) / 30
    const slope = linearSlope(rhr.slice(-30))
    const improving = slope < -0.05
    // Rough VO2max estimation: 15.3 × (208 - 0.7 × age) / RHR (we approximate w/o age)
    const estVO2 = Math.round(15.3 * 190 / recent)
    const sev: InsightSeverity = improving ? "positive" : slope > 0.05 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Estimated VO2max trend: ~${estVO2} ml/kg/min (${improving ? "improving ↑" : slope > 0.05 ? "declining ↓" : "stable →"}). RHR ${recent.toFixed(0)} bpm (30d avg: ${month.toFixed(0)}). ${improving ? "Your aerobic fitness is trending upward — excellent!" : slope > 0.05 ? "Declining fitness trend. Increase zone 2 training volume." : "Stable fitness level. Add variety to break plateaus."}`, estVO2, "ml/kg/min", { low: 30, high: 60 }, { recentRHR: +recent.toFixed(1), rhrSlope30d: +slope.toFixed(3) })
  },

  "race-readiness": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const rhr = ctx.vals("resting_heart_rate")
    const sleep = ctx.vals("sleep"); const recovery = ctx.vals("recovery_score")
    if (hrv.length < 14 || rhr.length < 14 || sleep.length < 14) return null
    let readiness = 50
    // Taper detection: reduced training load + maintaining fitness
    const recentWorkouts = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 7 * 86400000))
    const prevWorkouts = ctx.workouts.filter(w => { const d = new Date(w.startedAt); return d < new Date(Date.now() - 7 * 86400000) && d >= new Date(Date.now() - 14 * 86400000) })
    if (recentWorkouts.length < prevWorkouts.length && recentWorkouts.length > 0) readiness += 10 // Possible taper
    // Supercompensation check
    const hrvSlope = linearSlope(hrv.slice(-7))
    if (hrvSlope > 0.5) readiness += 15 // Rising HRV post-taper
    const rhrSlope = linearSlope(rhr.slice(-7))
    if (rhrSlope < -0.2) readiness += 10 // Dropping RHR
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep >= 450) readiness += 10
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 75) readiness += 10 }
    readiness = Math.max(0, Math.min(100, Math.round(readiness)))
    const sev: InsightSeverity = readiness >= 75 ? "positive" : readiness >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Race/competition readiness: ${readiness}/100. ${readiness >= 75 ? "Strong readiness — your taper and recovery are paying off. You're primed for peak competition performance." : readiness >= 50 ? "Moderate readiness. Consider 1-2 more easy days before competition." : "Not yet race-ready. Continue your taper with emphasis on sleep and nutrition."}`, readiness, "/100", { low: 40, high: 80 }, { hrvSlope7d: +hrvSlope.toFixed(2), recentWorkoutCount: recentWorkouts.length })
  },

  "overtraining-syndrome-risk": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const rhr = ctx.vals("resting_heart_rate")
    const sleep = ctx.vals("sleep"); const recovery = ctx.vals("recovery_score")
    if (hrv.length < 14 || rhr.length < 14) return null
    let risk = 0
    const hrvSlope = linearSlope(hrv.slice(-14))
    if (hrvSlope < -0.5) risk += 20
    if (hrvSlope < -1) risk += 15
    const rhrSlope = linearSlope(rhr.slice(-14))
    if (rhrSlope > 0.3) risk += 15
    if (sleep.length >= 14) {
      const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
      const prevSleep = sleep.slice(-14, -7).reduce((a, b) => a + b, 0) / 7
      if (avgSleep > prevSleep + 30) risk += 10 // Needing more sleep = overreaching
    }
    if (recovery.length >= 7) {
      const avgRec = recovery.slice(-7).reduce((a, b) => a + b, 0) / 7
      if (avgRec < 40) risk += 20
    }
    const weeklyWorkouts = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 7 * 86400000))
    if (weeklyWorkouts.length >= 7) risk += 15 // Training every day
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 20 ? "positive" : risk < 40 ? "info" : risk < 65 ? "warning" : "critical"
    return ctx.makeInsight(alg, sev, `Overtraining syndrome risk: ${risk}%. ${risk < 20 ? "Healthy training-recovery balance." : risk < 40 ? "Early signs of overreaching. An extra rest day would be beneficial." : "WARNING: Significant overtraining indicators — declining HRV, rising RHR, poor recovery scores. Implement a deload week to prevent chronic overtraining."}`, risk, "%", { low: 0, high: 40 }, { hrvSlope14d: +hrvSlope.toFixed(2), rhrSlope14d: +rhrSlope.toFixed(2), weeklyWorkouts: weeklyWorkouts.length })
  },

  "training-load-balance": (alg, ctx) => {
    const recentDays = 7; const prevDays = 28
    const recentWorkouts = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - recentDays * 86400000))
    const prevWorkouts = ctx.workouts.filter(w => { const d = new Date(w.startedAt); return d < new Date(Date.now() - recentDays * 86400000) && d >= new Date(Date.now() - prevDays * 86400000) })
    if (recentWorkouts.length === 0 && prevWorkouts.length === 0) return null
    const recentLoad = recentWorkouts.reduce((a, w) => a + ((w.durationSeconds ?? 0) / 60), 0)
    const prevWeeklyLoad = prevWorkouts.reduce((a, w) => a + ((w.durationSeconds ?? 0) / 60), 0) / 3 // 3 weeks
    const ratio = prevWeeklyLoad > 0 ? recentLoad / prevWeeklyLoad : 1
    // Acute:Chronic ratio - sweet spot is 0.8-1.3
    const inSweetSpot = ratio >= 0.8 && ratio <= 1.3
    const risky = ratio > 1.5
    const sev: InsightSeverity = inSweetSpot ? "positive" : risky ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Training load ratio: ${ratio.toFixed(2)} (acute:chronic). ${inSweetSpot ? "Sweet spot — optimal balance between fitness gains and injury prevention." : risky ? "SPIKE detected — >1.5x your chronic load. Injury risk significantly elevated. Scale back this week." : ratio < 0.8 ? "Under-training relative to your base. OK for deload; increase gradually otherwise." : "Slightly above optimal range. Monitor recovery closely."}`, +ratio.toFixed(2), "ratio", { low: 0.8, high: 1.3 }, { recentLoadMin: recentLoad, prevWeeklyAvgMin: Math.round(prevWeeklyLoad) })
  },

  "lactate-threshold-estimate": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 14) return null
    const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    // Approximate LT at ~85% of estimated max HR
    // MaxHR approximation without age: use RHR + reserve
    const estimatedMaxHR = Math.round(avgRHR + 120) // Rough estimate
    const ltEstimate = Math.round(estimatedMaxHR * 0.85)
    const zone2Top = Math.round(estimatedMaxHR * 0.75)
    const sev: InsightSeverity = "info"
    return ctx.makeInsight(alg, sev, `Estimated lactate threshold: ~${ltEstimate} bpm (est. max HR: ${estimatedMaxHR}). Zone 2 ceiling: ~${zone2Top} bpm. Train at ${zone2Top}-${ltEstimate} bpm to improve aerobic threshold. Most of your endurance work should stay below ${zone2Top} bpm.`, ltEstimate, "bpm", { low: avgRHR + 80, high: avgRHR + 110 }, { avgRHR: +avgRHR.toFixed(1), estimatedMaxHR, zone2Top })
  },

  "recovery-rate-analysis": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const rhr = ctx.vals("resting_heart_rate")
    if (hrv.length < 14 || rhr.length < 14) return null
    // Check how quickly metrics return to baseline after hard workouts
    const hardWorkouts = ctx.workouts.filter(w => ((w.durationSeconds ?? 0) / 60) > 45 || (w.avgHeartRate ?? 0) > 150)
    if (hardWorkouts.length < 2) return null
    const baseHRV = hrv.reduce((a, b) => a + b, 0) / hrv.length
    const baseRHR = rhr.reduce((a, b) => a + b, 0) / rhr.length
    // Compare recent recovery bounce
    const hrvBounce = hrv.slice(-3).reduce((a, b) => a + b, 0) / 3 - Math.min(...hrv.slice(-7))
    const rhrDrop = Math.max(...rhr.slice(-7)) - rhr.slice(-3).reduce((a, b) => a + b, 0) / 3
    let recoveryRate = 50
    if (hrvBounce > 5) recoveryRate += 20
    if (rhrDrop > 3) recoveryRate += 15
    if (hrvBounce > 10) recoveryRate += 10
    recoveryRate = Math.max(0, Math.min(100, Math.round(recoveryRate)))
    const sev: InsightSeverity = recoveryRate >= 70 ? "positive" : recoveryRate >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Recovery rate: ${recoveryRate}/100. ${recoveryRate >= 70 ? "Fast recovery — your body efficiently returns to baseline after hard efforts. Sign of excellent fitness." : recoveryRate >= 45 ? "Normal recovery patterns. Allow 24-48h between intense sessions." : "Slow recovery — consider longer rest periods and recovery-focused nutrition."}`, recoveryRate, "/100", { low: 35, high: 75 }, { hrvBounce: +hrvBounce.toFixed(1), rhrDrop: +rhrDrop.toFixed(1) })
  },

  "endurance-capacity": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    if (rhr.length < 14 || hrv.length < 14) return null
    const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const hrvAvg = hrv.slice(-14).reduce((a, b) => a + b, 0) / 14
    // Higher HRV + lower RHR = better endurance capacity
    let capacity = 50
    if (avgRHR < 55) capacity += 20; else if (avgRHR < 65) capacity += 10; else if (avgRHR > 75) capacity -= 10
    if (hrvAvg > 60) capacity += 15; else if (hrvAvg > 40) capacity += 5; else capacity -= 10
    const recentLong = ctx.workouts.filter(w => ((w.durationSeconds ?? 0) / 60) > 60 && new Date(w.startedAt) >= new Date(Date.now() - 14 * 86400000))
    if (recentLong.length >= 2) capacity += 10
    capacity = Math.max(0, Math.min(100, Math.round(capacity)))
    const sev: InsightSeverity = capacity >= 70 ? "positive" : capacity >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Endurance capacity: ${capacity}/100 (RHR: ${avgRHR.toFixed(0)}, HRV: ${hrvAvg.toFixed(0)}). ${capacity >= 70 ? "Strong aerobic base — well-suited for long-duration activities." : capacity >= 45 ? "Moderate endurance. Increase zone 2 training volume for improvement." : "Lower aerobic capacity. Build base with consistent low-intensity cardio."}`, capacity, "/100", { low: 35, high: 75 }, { avgRHR: +avgRHR.toFixed(1), hrvAvg: +hrvAvg.toFixed(1) })
  },

  "muscle-readiness": (alg, ctx) => {
    const recovery = ctx.vals("recovery_score"); const sleep = ctx.vals("sleep")
    if (sleep.length < 5) return null
    let readiness = 55
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep >= 420) readiness += 15; else if (avgSleep < 360) readiness -= 15
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 70) readiness += 15; else if (avg < 40) readiness -= 15 }
    // Check recent strength training to gauge recovery need
    const recentStrength = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 48 * 3600000) && ((w.durationSeconds ?? 0) / 60) > 30)
    if (recentStrength.length >= 2) readiness -= 15 // Consecutive training days
    if (recentStrength.length === 0) readiness += 10 // Rest day
    readiness = Math.max(0, Math.min(100, Math.round(readiness)))
    const sev: InsightSeverity = readiness >= 70 ? "positive" : readiness >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Muscle readiness: ${readiness}/100. ${readiness >= 70 ? "Muscles are primed — good day for resistance training and heavy lifts." : readiness >= 45 ? "Moderate readiness. Light-to-moderate loads recommended." : "Muscles still recovering. Focus on mobility work, stretching, or light cardio."}`, readiness, "/100", { low: 35, high: 75 }, { avgSleepMin: Math.round(avgSleep), recentWorkouts48h: recentStrength.length })
  },

  "flow-state-likelihood": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability"); const sleep = ctx.vals("sleep")
    const stress = ctx.vals("stress"); const recovery = ctx.vals("recovery_score")
    if (hrv.length < 7 || sleep.length < 7) return null
    let score = 40
    const hrvRecent = hrv.slice(-3).reduce((a, b) => a + b, 0) / 3
    const hrvBase = hrv.reduce((a, b) => a + b, 0) / hrv.length
    if (hrvRecent > hrvBase * 1.1) score += 20; else if (hrvRecent > hrvBase) score += 10
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep >= 420) score += 15
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg < 40) score += 15; else if (avg > 65) score -= 15 }
    if (recovery.length >= 1 && recovery[recovery.length - 1]! >= 75) score += 10
    score = Math.max(0, Math.min(100, Math.round(score)))
    const sev: InsightSeverity = score >= 70 ? "positive" : score >= 45 ? "info" : "info"
    return ctx.makeInsight(alg, sev, `Flow state likelihood: ${score}%. ${score >= 70 ? "Optimal conditions for entering a flow state — high parasympathetic tone, well-rested, low stress. Choose a challenging-but-achievable task." : score >= 45 ? "Decent potential for focused work. Minimize distractions to maximize chances." : "Flow state unlikely today. Break work into smaller, less demanding chunks."}`, score, "%", { low: 30, high: 70 }, { hrvRatio: +(hrvRecent / hrvBase).toFixed(2), avgSleepMin: Math.round(avgSleep) })
  },
}
