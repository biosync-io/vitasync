import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, coefficientOfVariation } from "../math.js"

export const cognitiveRunners: Record<string, AlgorithmRunner> = {
  "cognitive-readiness": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const hrv = ctx.vals("heart_rate_variability")
    const stress = ctx.vals("stress")
    if (sleep.length < 7 || hrv.length < 7) return null
    let score = 50
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep >= 420) score += 18; else if (avgSleep >= 360) score += 8; else score -= 15
    const avgHRV = hrv.slice(-3).reduce((a, b) => a + b, 0) / 3
    const baseHRV = hrv.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, hrv.length - 3)
    if (avgHRV > baseHRV * 1.05) score += 15; else if (avgHRV < baseHRV * 0.85) score -= 15
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg < 40) score += 12; else if (avg > 70) score -= 15 }
    const sleepConsistency = stddev(sleep.slice(-7))
    if (sleepConsistency < 30) score += 5
    score = Math.max(0, Math.min(100, score))
    const sev: InsightSeverity = score >= 75 ? "positive" : score >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Mental performance readiness: ${score}/100. ${score >= 75 ? "Peak cognitive state — optimal for complex tasks, learning, and important decisions." : score >= 50 ? "Adequate focus capacity. Schedule demanding work in your peak alertness window." : "Reduced cognitive resources. Defer critical decisions; focus on routine tasks."}`, score, "/100", { low: 40, high: 80 }, { avgSleep: Math.round(avgSleep), hrvRatio: +(avgHRV / baseHRV).toFixed(2) })
  },

  "focus-window-prediction": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const rhr = ctx.vals("resting_heart_rate")
    if (sleep.length < 7 || rhr.length < 7) return null
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    const sleepHrs = avgSleep / 60
    // Peak focus typically 2-4h after waking; duration correlates with sleep quality
    const focusDuration = Math.round(Math.min(4, Math.max(1, (sleepHrs - 5) * 0.8)))
    const quality = avgSleep >= 420 ? "high" : avgSleep >= 360 ? "medium" : "low"
    const sev: InsightSeverity = quality === "high" ? "positive" : quality === "medium" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Predicted deep focus: ~${focusDuration}h window, ${quality} quality. Based on ${sleepHrs.toFixed(1)}h avg sleep. ${quality === "high" ? "Schedule your most mentally demanding work 2-4h after waking." : quality === "medium" ? "Usable focus window but may need breaks. Avoid multitasking." : "Limited focus capacity today. Use Pomodoro technique for short bursts."}`, focusDuration, "hours", { low: 1, high: 4 }, { sleepHrs: +sleepHrs.toFixed(1), quality })
  },

  "brain-fog-risk": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const spo2 = ctx.vals("spo2")
    const stress = ctx.vals("stress")
    if (sleep.length < 5) return null
    let risk = 0
    const recentSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (recentSleep < 360) risk += 35
    if (recentSleep < 300) risk += 15
    const sleepDebt = sleep.slice(-7).reduce((acc, v) => acc + Math.max(0, 480 - v), 0)
    if (sleepDebt > 300) risk += 20
    if (spo2.length >= 3) { const avg = spo2.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg < 95) risk += 15 }
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg > 70) risk += 15 }
    risk = Math.min(100, risk)
    const sev: InsightSeverity = risk < 20 ? "positive" : risk < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Brain fog risk: ${risk}%. ${risk < 20 ? "Clear-headed — all cognitive support factors are favorable." : risk < 50 ? "Mild fog potential. Stay hydrated, take movement breaks." : "High brain fog risk from " + (recentSleep < 360 ? "poor sleep" : "") + (sleepDebt > 300 ? ", accumulated sleep debt" : "") + ". Reduce cognitive load today."}`, risk, "%", { low: 0, high: 50 }, { recentSleepMin: Math.round(recentSleep), sleepDebtMin: Math.round(sleepDebt) })
  },

  "sleep-learning-capacity": (alg, ctx) => {
    const sleep = ctx.vals("sleep")
    if (sleep.length < 7) return null
    // REM sleep crucial for memory consolidation. Proxy from total sleep + stages
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    const estimatedREM = avgSleep * 0.22 // ~22% of sleep is REM on average
    const learningCapacity = Math.min(100, Math.round((estimatedREM / 100) * 100))
    const sev: InsightSeverity = learningCapacity >= 70 ? "positive" : learningCapacity >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Learning & memory capacity: ${learningCapacity}%. Est. ~${Math.round(estimatedREM)} min REM/night. ${learningCapacity >= 70 ? "Strong memory consolidation conditions — great time for learning new skills." : learningCapacity >= 45 ? "Adequate for learning. Space repetitions to compensate." : "Reduced memory consolidation. Poor sleep undermines learning efficiency by up to 40%."}`, learningCapacity, "%", { low: 40, high: 80 }, { avgSleepMin: Math.round(avgSleep), estREMMin: Math.round(estimatedREM) })
  },

  "decision-fatigue-risk": (alg, ctx) => {
    const stress = ctx.vals("stress"); const sleep = ctx.vals("sleep")
    const recovery = ctx.vals("recovery_score")
    if (sleep.length < 5) return null
    let risk = 0
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (avgSleep < 390) risk += 25
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; risk += Math.min(30, Math.max(0, (avg - 40) * 0.6)) }
    if (recovery.length >= 3) { const avg = recovery.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg < 50) risk += 20 }
    // Late in the day, glucose depletion increases decision fatigue
    const workloadProxy = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 86400000)).length
    if (workloadProxy >= 2) risk += 15
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 25 ? "positive" : risk < 55 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Decision fatigue risk: ${risk}%. ${risk < 25 ? "Good executive function reserves. Front-load important decisions early in the day." : risk < 55 ? "Moderate depletion risk. Batch decisions and simplify choices where possible." : "High decision fatigue risk — automate routine decisions, defer non-urgent ones."}`, risk, "%", { low: 0, high: 50 }, { avgSleepMin: Math.round(avgSleep) })
  },

  "creativity-window": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const hrv = ctx.vals("heart_rate_variability")
    if (sleep.length < 7 || hrv.length < 7) return null
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    const hrvCV = coefficientOfVariation(hrv.slice(-7))
    // Higher HRV variability often correlates with creative thinking
    const creativeScore = Math.round(Math.min(100, (avgSleep / 480) * 40 + Math.min(60, hrvCV * 3)))
    const sev: InsightSeverity = creativeScore >= 65 ? "positive" : creativeScore >= 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Creative potential: ${creativeScore}/100. ${creativeScore >= 65 ? "High — divergent thinking is likely enhanced. Great for brainstorming and creative work." : creativeScore >= 40 ? "Moderate — structured creative tasks are feasible." : "Low creative bandwidth. Focus on analytical/routine work instead."}`, creativeScore, "/100", { low: 30, high: 70 }, { hrvCV: +hrvCV.toFixed(1), avgSleepMin: Math.round(avgSleep) })
  },

  "reaction-time-estimate": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const rhr = ctx.vals("resting_heart_rate")
    if (sleep.length < 5 || rhr.length < 5) return null
    const avgSleep = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3
    const sleepDebt = sleep.slice(-5).reduce((acc, v) => acc + Math.max(0, 480 - v), 0)
    // Baseline ~250ms, degrades with sleep debt
    const baselineMs = 250
    const penalty = Math.min(100, sleepDebt * 0.05) // 50ms per ~1000min sleep debt
    const estimated = Math.round(baselineMs + penalty)
    const sev: InsightSeverity = estimated <= 270 ? "positive" : estimated <= 300 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated reaction time: ~${estimated}ms (${estimated <= 270 ? "sharp" : estimated <= 300 ? "normal" : "impaired"}). ${estimated <= 270 ? "Peak alertness — safe for activities requiring quick reflexes." : estimated <= 300 ? "Slightly slowed. Adequate for most tasks." : "Impaired reflexes from sleep deficit. Avoid challenging driving conditions."}`, estimated, "ms", { low: 220, high: 300 }, { sleepDebtMin: Math.round(sleepDebt), avgSleepMin: Math.round(avgSleep) })
  },

  "mental-energy-forecast": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const stress = ctx.vals("stress")
    const recovery = ctx.vals("recovery_score")
    if (sleep.length < 5) return null
    let energy = 60
    const lastSleep = sleep[sleep.length - 1]!
    if (lastSleep >= 450) energy += 20; else if (lastSleep >= 390) energy += 10; else energy -= 15
    if (stress.length >= 3) { const recent = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; if (recent < 40) energy += 10; else if (recent > 65) energy -= 15 }
    if (recovery.length >= 1) { const last = recovery[recovery.length - 1]!; if (last >= 70) energy += 10; else if (last < 40) energy -= 10 }
    energy = Math.max(0, Math.min(100, energy))
    const sev: InsightSeverity = energy >= 70 ? "positive" : energy >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Mental energy forecast: ${energy}/100. ${energy >= 70 ? "Full reserves — tackle your hardest cognitive challenges today." : energy >= 45 ? "Moderate capacity. Pace yourself and schedule breaks." : "Low mental reserves. Protect your energy — say no to non-essential commitments."}`, energy, "/100", { low: 40, high: 80 }, { lastSleepMin: Math.round(lastSleep) })
  },
}
