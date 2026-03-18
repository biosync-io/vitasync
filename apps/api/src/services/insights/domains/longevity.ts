import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope, coefficientOfVariation } from "../math.js"

export const longevityRunners: Record<string, AlgorithmRunner> = {
  "biological-age": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const sleep = ctx.vals("sleep"); const steps = ctx.vals("steps")
    if (rhr.length < 7 || hrv.length < 7 || sleep.length < 7 || steps.length < 7) return null
    const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, rhr.length)
    const avgHRV = hrv.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, hrv.length)
    const avgSleep = sleep.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, sleep.length)
    const avgSteps = steps.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, steps.length)
    // Multi-biomarker biological age model: lower RHR, higher HRV, optimal sleep, higher activity = younger
    const rhrPenalty = Math.max(0, (avgRHR - 55) * 0.3)
    const hrvBonus = Math.max(0, (avgHRV - 30) * -0.15)
    const sleepScore = avgSleep >= 420 && avgSleep <= 540 ? -2 : Math.abs(avgSleep - 480) * 0.01
    const activityBonus = Math.min(0, -(avgSteps - 5000) * 0.0003)
    const offset = rhrPenalty + hrvBonus + sleepScore + activityBonus
    const bioAge = Math.round(35 + offset) // Normalized around baseline of 35
    const sev: InsightSeverity = offset < -2 ? "positive" : offset < 3 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated biological age: ${bioAge} years. ${offset < -2 ? "Your biomarkers suggest you're aging slower than average — excellent lifestyle habits." : offset < 3 ? "Average aging trajectory. Optimize sleep and activity for improvement." : "Accelerated aging signals detected — prioritize recovery and cardiovascular exercise."}`, bioAge, "years", { low: 25, high: 50 }, { rhrPenalty: +rhrPenalty.toFixed(1), hrvBonus: +hrvBonus.toFixed(1), sleepScore: +sleepScore.toFixed(1), activityBonus: +activityBonus.toFixed(1) })
  },

  "longevity-score": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const sleep = ctx.vals("sleep"); const steps = ctx.vals("steps"); const spo2 = ctx.vals("spo2")
    if (rhr.length < 7 || sleep.length < 7 || steps.length < 7) return null
    let score = 50
    const avgRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
    if (avgRHR < 60) score += 15; else if (avgRHR < 70) score += 8; else if (avgRHR > 80) score -= 10
    if (hrv.length >= 7) { const avgHRV = hrv.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, hrv.length); if (avgHRV > 50) score += 12; else if (avgHRV > 30) score += 5 }
    const avgSleep = sleep.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, sleep.length)
    if (avgSleep >= 420 && avgSleep <= 540) score += 12; else if (avgSleep >= 360) score += 5; else score -= 8
    const avgSteps = steps.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, steps.length)
    if (avgSteps >= 10000) score += 12; else if (avgSteps >= 7500) score += 8; else if (avgSteps < 3000) score -= 10
    if (spo2.length >= 3) { const avgSpo2 = spo2.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, spo2.length); if (avgSpo2 >= 97) score += 5; else if (avgSpo2 < 94) score -= 8 }
    score = Math.max(0, Math.min(100, score))
    const sev: InsightSeverity = score >= 75 ? "positive" : score >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Longevity index: ${score}/100. ${score >= 75 ? "Outstanding — your health metrics align with longevity research markers." : score >= 50 ? "Good foundation. Focus on the lowest-scoring areas for significant gains." : "Multiple risk factors detected. Small improvements in RHR, sleep, and activity can shift your trajectory."}`, score, "/100", { low: 40, high: 80 }, { avgRHR: Math.round(avgRHR), avgSleep: Math.round(avgSleep), avgSteps: Math.round(avgSteps) })
  },

  "aging-velocity": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    if (rhr.length < 21 || hrv.length < 21) return null
    const rhrSlope = linearSlope(rhr.slice(-21))
    const hrvSlope = linearSlope(hrv.slice(-21))
    // Rising RHR + falling HRV = accelerated aging; opposite = decelerated
    const velocity = rhrSlope * 2 - hrvSlope * 1.5
    const sev: InsightSeverity = velocity < -0.5 ? "positive" : velocity < 0.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Aging velocity: ${velocity > 0 ? "accelerating" : "decelerating"} (${velocity.toFixed(2)}/day). ${velocity < -0.5 ? "Your biomarkers are improving — biological clock is slowing." : velocity < 0.5 ? "Stable trajectory — maintain current habits." : "Biomarker trends suggest accelerated wear. Prioritize recovery."}`, Number(velocity.toFixed(2)), "rate", { low: -1, high: 1 }, { rhrSlope: +rhrSlope.toFixed(4), hrvSlope: +hrvSlope.toFixed(4) })
  },

  "cardiovascular-reserve": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 7 || ctx.workouts.length < 2) return null
    const avgRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
    const maxHRs = ctx.workouts.filter(w => w.maxHeartRate).map(w => w.maxHeartRate!)
    if (maxHRs.length === 0) return null
    const peakHR = Math.max(...maxHRs)
    const reserve = peakHR - avgRHR
    const sev: InsightSeverity = reserve > 100 ? "positive" : reserve > 70 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Cardiovascular reserve: ${Math.round(reserve)} bpm (peak ${peakHR} - resting ${Math.round(avgRHR)}). ${reserve > 100 ? "Excellent cardiac capacity — strong longevity marker." : reserve > 70 ? "Adequate reserve. Interval training can improve this." : "Limited cardiac reserve — may benefit from progressive aerobic training."}`, Math.round(reserve), "bpm", { low: 70, high: 120 }, { peakHR, avgRHR: Math.round(avgRHR) })
  },

  "hrv-age-gap": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability")
    if (hrv.length < 14) return null
    const avgHRV = hrv.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, hrv.length)
    // Age-expected HRV declines ~1ms/year after 25. Average 30yo: ~45ms
    const expectedHRV = 45 // Baseline for comparison
    const gap = avgHRV - expectedHRV
    const yearsYounger = Math.round(gap * 0.8) // Rough: each 1ms HRV = ~0.8 years biological age difference
    const sev: InsightSeverity = yearsYounger > 5 ? "positive" : yearsYounger > -5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `HRV age gap: ${yearsYounger > 0 ? "+" : ""}${yearsYounger} years ${yearsYounger > 0 ? "younger" : "older"} than baseline. Average HRV: ${avgHRV.toFixed(1)}ms. ${yearsYounger > 5 ? "Exceptional autonomic health." : yearsYounger > -5 ? "Typical HRV for your activity level." : "Low HRV — stress management and aerobic exercise can improve this."}`, yearsYounger, "years", { low: -10, high: 15 }, { avgHRV: +avgHRV.toFixed(1), expectedHRV })
  },

  "sleep-longevity-alignment": (alg, ctx) => {
    const sleep = ctx.vals("sleep")
    if (sleep.length < 14) return null
    const avgMin = sleep.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, sleep.length)
    const avgHrs = avgMin / 60
    // Longevity sweet spot: 7-8 hours. Both <6 and >9 associated with higher mortality
    const deviation = Math.abs(avgHrs - 7.5)
    const alignment = Math.max(0, Math.round(100 - deviation * 30))
    const sev: InsightSeverity = alignment >= 80 ? "positive" : alignment >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep-longevity alignment: ${alignment}%. Average: ${avgHrs.toFixed(1)}h/night. ${alignment >= 80 ? "Perfectly in the 7-8h longevity sweet spot." : alignment >= 50 ? "Close to optimal. Research shows 7-8h is the longevity goldilocks zone." : "Outside optimal range. Both too little and too much sleep correlate with reduced lifespan."}`, alignment, "%", { low: 50, high: 90 }, { avgHrs: +avgHrs.toFixed(1), optimalRange: "7-8h" })
  },

  "resting-metabolic-health": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const bp = ctx.vals("blood_pressure")
    const glucose = ctx.vals("blood_glucose"); const weight = ctx.vals("weight")
    let signals = 0; let total = 0
    if (rhr.length >= 7) { const avg = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7; total++; if (avg < 72) signals++ }
    if (bp.length >= 3) { const avg = bp.slice(-3).reduce((a, b) => a + b, 0) / 3; total++; if (avg < 130) signals++ }
    if (glucose.length >= 3) { const avg = glucose.slice(-3).reduce((a, b) => a + b, 0) / 3; total++; if (avg < 100) signals++ }
    if (weight.length >= 7) { const cv = coefficientOfVariation(weight.slice(-14)); total++; if (cv < 2) signals++ }
    if (total < 2) return null
    const pct = Math.round((signals / total) * 100)
    const sev: InsightSeverity = pct >= 75 ? "positive" : pct >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Metabolic health markers: ${signals}/${total} optimal. ${pct >= 75 ? "Excellent metabolic health — reduces chronic disease risk significantly." : pct >= 50 ? "Mixed metabolic signals. Target the weakest markers." : "Multiple metabolic risk factors flagged."}`, pct, "%", { low: 50, high: 100 }, { signals, total })
  },

  "recovery-resilience": (alg, ctx) => {
    const recovery = ctx.vals("recovery_score")
    if (recovery.length < 14) return null
    const dips = recovery.filter(v => v < 50).length
    const bouncebacks = recovery.reduce((count, v, i) => {
      if (i > 0 && recovery[i - 1]! < 50 && v >= 60) return count + 1
      return count
    }, 0)
    const resilience = dips > 0 ? Math.round((bouncebacks / dips) * 100) : 100
    const sev: InsightSeverity = resilience >= 70 ? "positive" : resilience >= 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Recovery resilience: ${resilience}% bounce-back rate. ${bouncebacks}/${dips} dips recovered within 24h. ${resilience >= 70 ? "High resilience — your body rebounds quickly from stress." : resilience >= 40 ? "Moderate resilience. Adequate sleep post-hard days can improve this." : "Low bounce-back rate — may indicate chronic fatigue or under-recovery."}`, resilience, "%", { low: 40, high: 80 }, { dips, bouncebacks })
  },

  "inflammation-proxy": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    const temp = ctx.vals("temperature")
    if (rhr.length < 14 || hrv.length < 14) return null
    const rhrBase = rhr.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const rhrRecent = rhr.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
    const hrvBase = hrv.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const hrvRecent = hrv.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, hrv.length)
    let score = 0
    if (rhrRecent > rhrBase + 3) score += 30
    if (hrvRecent < hrvBase * 0.85) score += 35
    if (temp.length >= 3) { const avgTemp = temp.slice(-3).reduce((a, b) => a + b, 0) / 3; if (avgTemp > 37.2) score += 35 }
    const sev: InsightSeverity = score < 20 ? "positive" : score < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Systemic inflammation proxy: ${score}/100. ${score < 20 ? "Low inflammation markers — excellent for long-term health." : score < 50 ? "Mild elevation in inflammatory biomarkers." : "Elevated inflammation signals: RHR up, HRV down" + (temp.length >= 3 ? ", temperature elevated" : "") + ". Rest and anti-inflammatory nutrition recommended."}`, score, "/100", { low: 0, high: 50 }, { rhrDelta: +(rhrRecent - rhrBase).toFixed(1), hrvRatio: +(hrvRecent / hrvBase).toFixed(2) })
  },

  "fitness-age": (alg, ctx) => {
    const steps = ctx.vals("steps"); const rhr = ctx.vals("resting_heart_rate")
    if (steps.length < 14 || rhr.length < 14 || ctx.workouts.length < 3) return null
    const avgSteps = steps.slice(-14).reduce((a, b) => a + b, 0) / 14
    const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const weeklyWorkouts = ctx.workouts.length / 2 // Normalized to per-week over 14 days
    let age = 40 // Baseline
    age -= Math.min(8, (avgSteps - 5000) * 0.001) // More steps = younger
    age -= Math.min(5, (65 - avgRHR) * 0.5) // Lower RHR = younger
    age -= Math.min(7, (weeklyWorkouts - 2) * 2) // More workouts = younger
    age = Math.max(18, Math.round(age))
    const sev: InsightSeverity = age < 30 ? "positive" : age < 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated fitness age: ${age} years. ${age < 30 ? "Elite fitness level — consistent with athletes 10+ years younger." : age < 40 ? "Good functional fitness. Increase workout intensity for further gains." : "Room for improvement — progressive exercise can reduce fitness age significantly."}`, age, "years", { low: 20, high: 45 }, { avgSteps: Math.round(avgSteps), avgRHR: Math.round(avgRHR), weeklyWorkouts: +weeklyWorkouts.toFixed(1) })
  },
}
