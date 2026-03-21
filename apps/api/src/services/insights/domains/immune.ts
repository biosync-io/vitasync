import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope } from "../math.js"

export const immuneRunners: Record<string, AlgorithmRunner> = {
  "illness-prediction": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const temp = ctx.vals("temperature"); const sleep = ctx.vals("sleep")
    if (rhr.length < 10 || hrv.length < 7) return null
    const rhrBase = rhr.slice(0, -3).reduce((a, b) => a + b, 0) / (rhr.length - 3)
    const rhrRecent = rhr.slice(-3).reduce((a, b) => a + b, 0) / 3
    const hrvBase = hrv.slice(0, -3).reduce((a, b) => a + b, 0) / (hrv.length - 3)
    const hrvRecent = hrv.slice(-3).reduce((a, b) => a + b, 0) / 3
    let riskScore = 0
    if (rhrRecent > rhrBase * 1.08) riskScore += 25
    if (hrvRecent < hrvBase * 0.8) riskScore += 30
    if (temp.length >= 3) { const recent = temp.slice(-2).reduce((a, b) => a + b, 0) / 2; if (recent > 37.3) riskScore += 25 }
    if (sleep.length >= 5) { const recentSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3; if (recentSleep < 360) riskScore += 20 }
    const sev: InsightSeverity = riskScore >= 50 ? "critical" : riskScore >= 25 ? "warning" : "positive"
    return ctx.makeInsight(alg, sev, `Illness risk (24-48h): ${riskScore}%. ${riskScore >= 50 ? "⚠️ HIGH — Multiple biomarkers suggest your immune system is under siege. Consider clearing your schedule, prioritizing rest and hydration." : riskScore >= 25 ? "Moderate risk — one or more biomarkers elevated. Extra rest recommended." : "Low risk — immune markers look stable."}`, riskScore, "%", { low: 0, high: 50 }, { rhrElevation: +((rhrRecent / rhrBase - 1) * 100).toFixed(1), hrvDrop: +((1 - hrvRecent / hrvBase) * 100).toFixed(1) })
  },

  "immune-readiness": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const sleep = ctx.vals("sleep"); const recovery = ctx.vals("recovery_score")
    if (rhr.length < 7 || sleep.length < 7) return null
    let score = 50
    const avgRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (avgRHR < 62) score += 15; else if (avgRHR > 75) score -= 15
    if (hrv.length >= 7) { const avgHRV = hrv.slice(-7).reduce((a, b) => a + b, 0) / 7; if (avgHRV > 45) score += 15; else if (avgHRV < 25) score -= 15 }
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (avgSleep >= 420) score += 10; else if (avgSleep < 360) score -= 15
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg >= 70) score += 10; else if (avg < 40) score -= 10 }
    score = Math.max(0, Math.min(100, score))
    const sev: InsightSeverity = score >= 70 ? "positive" : score >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Immune readiness: ${score}/100. ${score >= 70 ? "Strong immune foundation — sleep, recovery, and autonomic markers all favorable." : score >= 45 ? "Moderate immune status. Avoid excessive training or sleep deprivation." : "Weakened immune signals. Prioritize 8+ hours of sleep and reduce intensity."}`, score, "/100", { low: 40, high: 80 }, { avgRHR: Math.round(avgRHR), avgSleep: Math.round(avgSleep) })
  },

  "infection-recovery-tracker": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 14) return null
    // Find spike (possible infection) then track recovery
    const base = rhr.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const spikes = rhr.map((v, i) => ({ i, v, elevated: v > base * 1.1 }))
    const spikeStart = spikes.findIndex(s => s.elevated)
    if (spikeStart < 0) return ctx.makeInsight(alg, "positive", "No RHR spikes detected — no recent infection signatures in your data.", 0, "days", null, {})
    const spikeEnd = spikes.slice(spikeStart).findIndex(s => !s.elevated)
    const duration = spikeEnd > 0 ? spikeEnd : rhr.length - spikeStart
    const recovered = spikeEnd > 0
    const sev: InsightSeverity = recovered ? (duration <= 5 ? "positive" : "info") : "warning"
    return ctx.makeInsight(alg, sev, `RHR elevation detected: ${duration} days${recovered ? " (resolved)" : " (ongoing)"}. ${recovered ? `Recovered in ${duration} days. ${duration <= 5 ? "Fast recovery." : "Extended recovery — ensure full return to baseline before hard training."}` : "Still elevated — continue rest-focused approach."}`, duration, "days", { low: 1, high: 7 }, { baseline: Math.round(base), recovered })
  },

  "sleep-immunity-link": (alg, ctx) => {
    const sleep = ctx.vals("sleep")
    if (sleep.length < 14) return null
    const shortNights = sleep.filter(v => v < 360).length
    const pct = Math.round((shortNights / sleep.length) * 100)
    // Research: <6h sleep = 4.2x more likely to catch a cold
    const riskMultiplier = pct > 50 ? 4.2 : pct > 30 ? 2.5 : pct > 15 ? 1.5 : 1.0
    const sev: InsightSeverity = riskMultiplier <= 1.0 ? "positive" : riskMultiplier <= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep-immunity factor: ${riskMultiplier}x baseline risk. ${shortNights} of ${sleep.length} nights under 6 hours (${pct}%). ${riskMultiplier <= 1.0 ? "Excellent — consistent sleep boosts immune function." : riskMultiplier <= 2 ? "Some short nights. Each night <6h significantly increases infection susceptibility." : `Frequent under-sleep raises cold/flu risk ${riskMultiplier}x per Prather et al. research.`}`, riskMultiplier, "x risk", { low: 1, high: 3 }, { shortNights, totalNights: sleep.length, pctShort: pct })
  },

  "stress-immune-burden": (alg, ctx) => {
    const stress = ctx.vals("stress"); const recovery = ctx.vals("recovery_score")
    if (stress.length < 7 || recovery.length < 7) return null
    const avgStress = stress.slice(-7).reduce((a, b) => a + b, 0) / 7
    const avgRecovery = recovery.slice(-7).reduce((a, b) => a + b, 0) / 7
    const burden = Math.round(avgStress * 0.6 + (100 - avgRecovery) * 0.4)
    const sev: InsightSeverity = burden < 30 ? "positive" : burden < 55 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Immune burden score: ${burden}/100 (stress: ${Math.round(avgStress)}, recovery deficit: ${Math.round(100 - avgRecovery)}). ${burden < 30 ? "Low burden — immune reserves are well-maintained." : burden < 55 ? "Moderate burden. Monitor for fatigue signals." : "High cumulative stress-recovery imbalance weakens immune defenses. Reduce stressors."}`, burden, "/100", { low: 20, high: 60 }, { avgStress: Math.round(avgStress), avgRecovery: Math.round(avgRecovery) })
  },

  "temperature-baseline-deviation": (alg, ctx) => {
    const temp = ctx.vals("temperature")
    if (temp.length < 7) return null
    const base = temp.slice(0, -3).reduce((a, b) => a + b, 0) / (temp.length - 3)
    const recent = temp.slice(-3).reduce((a, b) => a + b, 0) / 3
    const delta = recent - base
    const sev: InsightSeverity = Math.abs(delta) < 0.3 ? "positive" : Math.abs(delta) < 0.6 ? "info" : delta > 0 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Body temp deviation: ${delta > 0 ? "+" : ""}${delta.toFixed(2)}°C from baseline (${base.toFixed(1)}°C). ${Math.abs(delta) < 0.3 ? "Stable — no signs of immune activation." : delta > 0.6 ? "Elevated temperature may indicate immune response or infection onset." : delta < -0.3 ? "Below baseline — could indicate fatigue or hormonal changes." : "Minor deviation — worth monitoring."}`, Number(delta.toFixed(2)), "°C", { low: -0.3, high: 0.3 }, { baseline: +base.toFixed(2), recent: +recent.toFixed(2) })
  },

  "post-training-immune-window": (alg, ctx) => {
    const recovery = ctx.vals("recovery_score")
    if (recovery.length < 7 || ctx.workouts.length < 3) return null
    const hardWorkouts = ctx.workouts.filter(w => (w.durationSeconds || 0) > 3600 || (w.avgHeartRate || 0) > 150)
    if (hardWorkouts.length === 0) return ctx.makeInsight(alg, "positive", "No recent high-intensity sessions detected — no immune suppression window concern.", 0, "sessions", null, {})
    const windowRisk = Math.min(100, hardWorkouts.length * 20)
    const sev: InsightSeverity = windowRisk <= 20 ? "positive" : windowRisk <= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Post-exercise immune window: ${windowRisk}% risk. ${hardWorkouts.length} intense sessions detected. ${windowRisk <= 20 ? "Minimal risk with adequate recovery." : windowRisk <= 50 ? "Moderate — ensure nutrition and sleep within 2h post-workout." : "Frequent high-intensity training creates immune suppression windows. Add recovery days."}`, windowRisk, "%", { low: 0, high: 50 }, { intenseSessions: hardWorkouts.length })
  },

  "seasonal-vulnerability": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const stress = ctx.vals("stress")
    const rhr = ctx.vals("resting_heart_rate")
    if (sleep.length < 7 || rhr.length < 7) return null
    let vulnerabilities = 0
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (avgSleep < 390) vulnerabilities++
    if (stress.length >= 7) { const avg = stress.slice(-7).reduce((a, b) => a + b, 0) / 7; if (avg > 60) vulnerabilities++ }
    const rhrTrend = trend(rhr.slice(-14))
    if (rhrTrend === "rising") vulnerabilities++
    if (ctx.workouts.length > 10) vulnerabilities++ // Overtraining
    const risk = ["Low", "Mild", "Moderate", "High", "Very High"][Math.min(4, vulnerabilities)]!
    const sev: InsightSeverity = vulnerabilities <= 1 ? "positive" : vulnerabilities <= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Seasonal illness vulnerability: ${risk} (${vulnerabilities}/4 risk factors). ${vulnerabilities <= 1 ? "Well-protected. Maintain current habits." : "Active risk factors: " + [avgSleep < 390 ? "short sleep" : "", stress.length >= 7 && stress.slice(-7).reduce((a, b) => a + b, 0) / 7 > 60 ? "high stress" : "", rhrTrend === "rising" ? "rising RHR" : "", ctx.workouts.length > 10 ? "overtraining" : ""].filter(Boolean).join(", ") + "."}`, vulnerabilities, "/4", { low: 0, high: 2 }, { risk })
  },
}
