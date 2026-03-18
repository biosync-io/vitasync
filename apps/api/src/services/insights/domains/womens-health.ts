import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, coefficientOfVariation, movingAverage } from "../math.js"

export const womensHealthRunners: Record<string, AlgorithmRunner> = {
  "cycle-phase-detection": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const temp = ctx.vals("temperature")
    if (rhr.length < 28 || hrv.length < 28) return null
    // RHR typically rises ~2-3bpm in luteal phase; HRV typically drops
    const last14RHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const prev14RHR = rhr.slice(-28, -14).reduce((a, b) => a + b, 0) / 14
    const rhrDelta = last14RHR - prev14RHR
    const last14HRV = hrv.slice(-14).reduce((a, b) => a + b, 0) / 14
    const prev14HRV = hrv.slice(-28, -14).reduce((a, b) => a + b, 0) / 14
    const hrvDelta = last14HRV - prev14HRV
    let phase = "unknown"
    if (rhrDelta > 1.5 && hrvDelta < -2) phase = "luteal"
    else if (rhrDelta < -1 && hrvDelta > 2) phase = "follicular"
    else if (Math.abs(rhrDelta) <= 1.5) phase = "transition"
    const confidence = Math.min(100, Math.round(Math.abs(rhrDelta) * 15 + Math.abs(hrvDelta) * 5))
    const sev: InsightSeverity = phase !== "unknown" ? "info" : "info"
    return ctx.makeInsight(alg, sev, `Estimated cycle phase: ${phase} (${confidence}% confidence). ${phase === "luteal" ? "Higher RHR and lower HRV typical in luteal phase. You may need more recovery time and sleep." : phase === "follicular" ? "Follicular phase detected — typically the best window for high-intensity training and PRs." : "Transition period — monitor for phase shift in coming days."}`, confidence, "%", { low: 30, high: 80 }, { phase, rhrDelta: +rhrDelta.toFixed(1), hrvDelta: +hrvDelta.toFixed(1) })
  },

  "phase-adapted-training": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    if (rhr.length < 28 || hrv.length < 28) return null
    const last7RHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const baseRHR = rhr.slice(-28).reduce((a, b) => a + b, 0) / 28
    const diff = last7RHR - baseRHR
    const isLuteal = diff > 1.5
    let rec = ""
    let intensity = 0
    if (isLuteal) {
      rec = "Luteal phase indicators detected. Reduce peak intensity by 5-10%, increase warm-up duration, and prioritize yoga/mobility. Carb intake may need to increase for sustained energy."
      intensity = 65
    } else {
      rec = "Follicular/early phase indicators — optimal window for strength gains, HIIT, and setting PRs. Your body recovers faster in this phase."
      intensity = 85
    }
    const sev: InsightSeverity = isLuteal ? "info" : "positive"
    return ctx.makeInsight(alg, sev, `Phase-adapted training: ${intensity}% intensity recommended. ${rec}`, intensity, "%", { low: 50, high: 90 }, { rhrDiff: +diff.toFixed(1), phase: isLuteal ? "luteal" : "follicular" })
  },

  "energy-cycle-pattern": (alg, ctx) => {
    const sleep = ctx.vals("sleep"); const stress = ctx.vals("stress")
    const recovery = ctx.vals("recovery_score")
    if (sleep.length < 28) return null
    const week1 = sleep.slice(-28, -21).reduce((a, b) => a + b, 0) / 7
    const week2 = sleep.slice(-21, -14).reduce((a, b) => a + b, 0) / 7
    const week3 = sleep.slice(-14, -7).reduce((a, b) => a + b, 0) / 7
    const week4 = sleep.slice(-7).reduce((a, b) => a + b, 0) / 7
    const pattern = [week1, week2, week3, week4]
    const peakWeek = pattern.indexOf(Math.max(...pattern)) + 1
    const lowWeek = pattern.indexOf(Math.min(...pattern)) + 1
    const variance = stddev(pattern)
    const cyclical = variance > 15
    const sev: InsightSeverity = cyclical ? "info" : "positive"
    return ctx.makeInsight(alg, sev, `${cyclical ? `Cyclical energy pattern detected. Peak energy week ~${peakWeek}, low energy week ~${lowWeek} of your cycle. Plan demanding activities for peak weeks and allow more recovery during low weeks.` : "Energy levels are relatively stable across weeks — no strong cyclical pattern detected."}`, Math.round(variance), "min variance", { low: 10, high: 40 }, { weeklyAvgs: pattern.map(v => Math.round(v)), peakWeek, lowWeek })
  },

  "pms-symptom-predictor": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const stress = ctx.vals("stress"); const sleep = ctx.vals("sleep")
    if (rhr.length < 21 || hrv.length < 21) return null
    const rhrSlope = linearSlope(rhr.slice(-7))
    const hrvSlope = linearSlope(hrv.slice(-7))
    let risk = 0
    if (rhrSlope > 0.3) risk += 25 // Rising RHR
    if (hrvSlope < -0.5) risk += 25 // Falling HRV
    if (stress.length >= 7) { const stressSlope = linearSlope(stress.slice(-7)); if (stressSlope > 0.5) risk += 20 }
    if (sleep.length >= 7) { const sleepSlope = linearSlope(sleep.slice(-7)); if (sleepSlope < -3) risk += 15 }
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 25 ? "positive" : risk < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `PMS symptom risk: ${risk}%. ${risk < 25 ? "Low likelihood of premenstrual symptoms based on current biomarkers." : risk < 50 ? "Moderate indicators. Consider proactive magnesium supplementation and stress management." : "Biomarkers suggest approaching premenstrual phase — increase hydration, prioritize sleep, and moderate exercise intensity."}`, risk, "%", { low: 0, high: 50 }, { rhrSlope: +rhrSlope.toFixed(2), hrvSlope: +hrvSlope.toFixed(2) })
  },

  "iron-deficiency-proxy": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const spo2 = ctx.vals("spo2")
    const sleep = ctx.vals("sleep")
    if (rhr.length < 14) return null
    let risk = 0
    const rhrTrend = linearSlope(rhr.slice(-14))
    if (rhrTrend > 0.3) risk += 20 // Rising RHR can indicate anemia
    if (spo2.length >= 7) { const avg = spo2.slice(-7).reduce((a, b) => a + b, 0) / 7; if (avg < 96) risk += 25 }
    if (sleep.length >= 14) {
      const sleepAvg = sleep.slice(-14).reduce((a, b) => a + b, 0) / 14
      if (sleepAvg > 500) risk += 15 // Excessive sleep need
    }
    // Check workout performance degradation
    const recentWorkouts = ctx.workouts.filter(w => new Date(w.startedAt) >= new Date(Date.now() - 14 * 86400000))
    const olderWorkouts = ctx.workouts.filter(w => { const d = new Date(w.startedAt); return d < new Date(Date.now() - 14 * 86400000) && d >= new Date(Date.now() - 28 * 86400000) })
    if (recentWorkouts.length > 0 && olderWorkouts.length > 0) {
      const recentAvgHR = recentWorkouts.filter(w => w.avgHeartRate).reduce((a, w) => a + (w.avgHeartRate ?? 0), 0) / recentWorkouts.length
      const olderAvgHR = olderWorkouts.filter(w => w.avgHeartRate).reduce((a, w) => a + (w.avgHeartRate ?? 0), 0) / olderWorkouts.length
      if (recentAvgHR > olderAvgHR + 5) risk += 15 // Higher HR for same effort
    }
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 20 ? "positive" : risk < 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Iron deficiency risk indicators: ${risk}%. ${risk < 20 ? "No concerning patterns detected." : risk < 45 ? "Some biomarkers warrant monitoring. Consider tracking dietary iron intake." : "Multiple indicators suggest possible iron deficiency — rising RHR, increased fatigue, performance decline. Consider blood work to check ferritin and hemoglobin levels."}`, risk, "%", { low: 0, high: 40 }, { rhrTrend: +rhrTrend.toFixed(2) })
  },

  "fertility-window-indicators": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const temp = ctx.vals("temperature")
    if (rhr.length < 28) return null
    // Basal body temperature and RHR both rise after ovulation
    const rhrMA = movingAverage(rhr.slice(-28), 3)
    const minRHRIdx = rhrMA.indexOf(Math.min(...rhrMA))
    const isPreOvulation = minRHRIdx >= rhrMA.length - 7
    const rhrVariability = stddev(rhr.slice(-7))
    let confidence = 0
    if (temp.length >= 28) {
      const tempMA = movingAverage(temp.slice(-28), 3)
      const minTempIdx = tempMA.indexOf(Math.min(...tempMA))
      if (Math.abs(minTempIdx - minRHRIdx) < 3) confidence += 40
    }
    confidence += isPreOvulation ? 40 : 20
    confidence = Math.min(100, Math.round(confidence))
    const sev: InsightSeverity = "info"
    return ctx.makeInsight(alg, sev, `Fertility indicators: ${isPreOvulation ? "Pre-ovulatory phase likely — RHR at cycle minimum." : "Post-ovulatory phase likely — elevated RHR baseline."} Confidence: ${confidence}%. Note: This is an estimate based on biometric patterns, not a medical fertility assessment.`, confidence, "% confidence", { low: 30, high: 80 }, { isPreOvulation, rhrVariability: +rhrVariability.toFixed(1) })
  },

  "menstrual-migraine-risk": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const stress = ctx.vals("stress"); const sleep = ctx.vals("sleep")
    if (rhr.length < 14 || hrv.length < 14) return null
    let risk = 0
    const rhrSwing = Math.abs(rhr[rhr.length - 1]! - rhr[rhr.length - 3]!)
    if (rhrSwing > 5) risk += 25 // Rapid RHR changes
    const hrvDrop = hrv.slice(-3).reduce((a, b) => a + b, 0) / 3 - hrv.slice(-7).reduce((a, b) => a + b, 0) / 7
    if (hrvDrop < -5) risk += 20
    if (stress.length >= 3) { const avg = stress.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg > 65) risk += 20 }
    if (sleep.length >= 3) { const avg = sleep.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avg < 360) risk += 15 }
    risk = Math.min(100, Math.round(risk))
    const sev: InsightSeverity = risk < 25 ? "positive" : risk < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Menstrual migraine risk: ${risk}%. ${risk < 25 ? "Low risk — stable biomarkers." : risk < 50 ? "Moderate risk. Stay hydrated and manage screen time." : "Elevated risk from rapid hormonal shifts indicated by RHR/HRV changes. Preemptive magnesium, hydration, and reduced triggers recommended."}`, risk, "%", { low: 0, high: 45 }, { rhrSwing: +rhrSwing.toFixed(1), hrvDrop: +hrvDrop.toFixed(1) })
  },

  "perimenopause-indicators": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const sleep = ctx.vals("sleep")
    if (rhr.length < 60 || hrv.length < 60 || sleep.length < 60) return null
    // Look for irregular patterns over 2+ months
    const rhrCV = coefficientOfVariation(rhr.slice(-60))
    const hrvCV = coefficientOfVariation(hrv.slice(-60))
    const sleepCV = coefficientOfVariation(sleep.slice(-60))
    let score = 0
    if (rhrCV > 12) score += 25 // More variable RHR
    if (hrvCV > 25) score += 25 // More variable HRV
    if (sleepCV > 20) score += 20 // More variable sleep
    // Check if cycle patterns are becoming less regular
    const monthlyRHR1 = stddev(rhr.slice(-60, -30))
    const monthlyRHR2 = stddev(rhr.slice(-30))
    if (monthlyRHR2 > monthlyRHR1 * 1.3) score += 15
    score = Math.min(100, Math.round(score))
    const sev: InsightSeverity = score < 25 ? "positive" : score < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Perimenopause indicators: ${score}/100. ${score < 25 ? "Biomarker patterns appear regular." : score < 50 ? "Some increased variability in long-term patterns. This may be normal or indicate hormonal transition." : "Pattern irregularity increasing over 2 months. Consistent with perimenopause — consider discussing with your healthcare provider for hormone panel testing."}`, score, "/100", { low: 15, high: 50 }, { rhrCV: +rhrCV.toFixed(1), hrvCV: +hrvCV.toFixed(1), sleepCV: +sleepCV.toFixed(1) })
  },
}
