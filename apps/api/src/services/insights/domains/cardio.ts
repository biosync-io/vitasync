import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, coefficientOfVariation, linearSlope } from "../math.js"

export const cardioRunners: Record<string, AlgorithmRunner> = {
  "rhr-zone": (alg, ctx) => {
    const v = ctx.vals("resting_heart_rate")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    let zone: string
    let sev: InsightSeverity
    if (avg < 50) { zone = "Athlete"; sev = "positive" }
    else if (avg < 60) { zone = "Excellent"; sev = "positive" }
    else if (avg < 70) { zone = "Good"; sev = "info" }
    else if (avg < 80) { zone = "Above Average"; sev = "warning" }
    else { zone = "Poor"; sev = "critical" }
    return ctx.makeInsight(alg, sev, `Your average resting HR is ${Math.round(avg)} bpm — classified as "${zone}".`, Math.round(avg), "bpm", { low: 50, high: 80 }, { zone, samples: v.length })
  },

  "rhr-trend": (alg, ctx) => {
    const v = ctx.vals("resting_heart_rate")
    if (v.length < 5) return null
    const last14 = v.slice(-14)
    const t = trend(last14)
    const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Resting HR is ${t} over the past ${last14.length} days. ${t === "rising" ? "Rising RHR may indicate fatigue or stress." : t === "falling" ? "Falling RHR suggests improving cardiovascular fitness." : "RHR is stable."}`, Math.round(last14[last14.length - 1]!), "bpm", null, { trend: t, dataPoints: last14.length })
  },

  "hr-recovery": (alg, ctx) => {
    if (ctx.workouts.length === 0) return null
    const maxHRs = ctx.workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
    const avgMaxHR = maxHRs.length > 0 ? maxHRs.reduce((a, b) => a + b, 0) / maxHRs.length : null
    const rhr = ctx.vals("resting_heart_rate")
    const avgRHR = rhr.length > 0 ? rhr.reduce((a, b) => a + b, 0) / rhr.length : null
    if (!avgMaxHR || !avgRHR) return null
    const recovery = avgMaxHR - avgRHR
    const sev: InsightSeverity = recovery > 60 ? "positive" : recovery > 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated HR recovery capacity: ${Math.round(recovery)} bpm. ${recovery > 60 ? "Excellent cardiac recovery." : recovery > 40 ? "Good recovery capacity." : "Consider improving aerobic base."}`, Math.round(recovery), "bpm", { low: 40, high: 70 }, { avgMaxHR: Math.round(avgMaxHR), avgRHR: Math.round(avgRHR) })
  },

  "hrv-baseline": (alg, ctx) => {
    const v = ctx.vals("heart_rate_variability")
    if (v.length < 7) return null
    const baseline = v.slice(0, -7)
    const recent = v.slice(-7)
    const bMean = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : recent.reduce((a, b) => a + b, 0) / recent.length
    const rMean = recent.reduce((a, b) => a + b, 0) / recent.length
    const deviationPct = ((rMean - bMean) / (bMean || 1)) * 100
    const sev: InsightSeverity = deviationPct < -15 ? "warning" : deviationPct > 10 ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `HRV is ${deviationPct > 0 ? "+" : ""}${Math.round(deviationPct)}% vs your 30-day baseline (${Math.round(bMean)} ms). ${deviationPct < -15 ? "Significant drop — consider rest." : deviationPct > 10 ? "Above baseline — great recovery." : "Within normal range."}`, Math.round(rMean), "ms", null, { baseline: Math.round(bMean), deviation: Math.round(deviationPct) })
  },

  "hrv-trend": (alg, ctx) => {
    const v = ctx.vals("heart_rate_variability")
    if (v.length < 5) return null
    const last14 = v.slice(-14)
    const t = trend(last14)
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `HRV trend is ${t} over ${last14.length} days. ${t === "rising" ? "Improving autonomic balance." : t === "falling" ? "Declining HRV may reflect stress accumulation." : "Stable autonomic function."}`, Math.round(last14[last14.length - 1]!), "ms", null, { trend: t })
  },

  "hrv-coherence": (alg, ctx) => {
    const v = ctx.vals("heart_rate_variability")
    if (v.length < 7) return null
    const cv = coefficientOfVariation(v)
    const sev: InsightSeverity = cv < 10 ? "positive" : cv < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `HRV coherence: CV=${Math.round(cv)}%. ${cv < 10 ? "High coherence — consistent autonomic function." : cv < 20 ? "Moderate coherence." : "High variability — erratic recovery patterns."}`, Math.round(cv), "%", { low: 0, high: 20 }, { samples: v.length })
  },

  "max-hr-estimate": (alg, ctx) => {
    const hrVals = ctx.vals("heart_rate")
    if (hrVals.length === 0) return null
    const maxObserved = Math.max(...hrVals)
    const sev: InsightSeverity = maxObserved > 180 ? "warning" : maxObserved > 150 ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Peak recorded HR: ${maxObserved} bpm. ${maxObserved > 180 ? "High-intensity peaks detected." : "Moderate intensity levels observed."}`, maxObserved, "bpm", null, { maxObserved })
  },

  "hr-zones-dist": (alg, ctx) => {
    const hrVals = ctx.vals("heart_rate")
    if (hrVals.length < 10) return null
    const zones = { rest: 0, fatBurn: 0, cardio: 0, peak: 0 }
    for (const hr of hrVals) {
      if (hr < 100) zones.rest++
      else if (hr < 140) zones.fatBurn++
      else if (hr < 170) zones.cardio++
      else zones.peak++
    }
    const total = hrVals.length
    const pcts = { rest: Math.round((zones.rest / total) * 100), fatBurn: Math.round((zones.fatBurn / total) * 100), cardio: Math.round((zones.cardio / total) * 100), peak: Math.round((zones.peak / total) * 100) }
    return ctx.makeInsight(alg, "info", `HR zone distribution: ${pcts.rest}% rest, ${pcts.fatBurn}% fat-burn, ${pcts.cardio}% cardio, ${pcts.peak}% peak.`, pcts.cardio + pcts.peak, "%", null, pcts)
  },

  "cardiac-drift": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const longWorkouts = ctx.workouts.filter((w) => (w.durationSeconds ?? 0) > 1800 && w.avgHeartRate && w.maxHeartRate)
    if (longWorkouts.length === 0) return null
    const drifts = longWorkouts.map((w) => ((w.maxHeartRate! - w.avgHeartRate!) / w.avgHeartRate!) * 100)
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
    const sev: InsightSeverity = avgDrift > 15 ? "warning" : avgDrift > 8 ? "info" : "positive"
    return ctx.makeInsight(alg, sev, `Average cardiac drift: ${Math.round(avgDrift)}% in long sessions. ${avgDrift > 15 ? "Significant decoupling — dehydration or insufficient base fitness." : "Normal drift range."}`, Math.round(avgDrift), "%", { low: 0, high: 15 }, { workoutsAnalyzed: longWorkouts.length })
  },

  "rhr-anomaly": (alg, ctx) => {
    const v = ctx.vals("resting_heart_rate")
    if (v.length < 10) return null
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    const sd = stddev(v)
    const latest = v[v.length - 1]!
    const zScore = sd > 0 ? (latest - mean) / sd : 0
    const sev: InsightSeverity = Math.abs(zScore) > 2 ? "critical" : Math.abs(zScore) > 1.5 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Latest RHR z-score: ${zScore.toFixed(1)} (${latest} bpm vs mean ${Math.round(mean)}). ${Math.abs(zScore) > 2 ? "Significant anomaly detected!" : "Within expected range."}`, latest, "bpm", { low: Math.round(mean - 2 * sd), high: Math.round(mean + 2 * sd) }, { zScore: Number(zScore.toFixed(2)), mean: Math.round(mean), stddev: Math.round(sd) })
  },

  // ── Advanced Cardio ──
  "hrv-rmssd-proxy": (alg, ctx) => {
    const hrv = ctx.vals("heart_rate_variability")
    if (hrv.length < 14) return null
    const weekSD = stddev(hrv.slice(-7))
    const prevSD = stddev(hrv.slice(-14, -7))
    const change = weekSD - prevSD
    const sev: InsightSeverity = weekSD < 10 ? "positive" : weekSD < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `HRV stability (SD): ${weekSD.toFixed(1)} ms this week vs ${prevSD.toFixed(1)} ms prior. ${weekSD < 10 ? "Very stable autonomic function." : "Higher variability in HRV readings."}`, Number(weekSD.toFixed(1)), "ms SD", { low: 5, high: 20 }, { change: change.toFixed(1) })
  },

  "rhr-seasonal": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 30) return null
    const first = rhr.slice(0, 14).reduce((a, b) => a + b, 0) / 14
    const last = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const shift = last - first
    const sev: InsightSeverity = Math.abs(shift) < 2 ? "positive" : Math.abs(shift) < 5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `RHR shifted ${shift > 0 ? "+" : ""}${shift.toFixed(1)} bpm over ${rhr.length} days. ${Math.abs(shift) < 2 ? "Stable." : "Seasonal or fitness-related shift detected."}`, Number(shift.toFixed(1)), "bpm", { low: -3, high: 3 }, { firstHalf: first.toFixed(0), secondHalf: last.toFixed(0) })
  },

  "autonomic-balance": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    if (rhr.length < 7 || hrv.length < 7) return null
    const avgRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const avgHRV = hrv.slice(-7).reduce((a, b) => a + b, 0) / 7
    const balance = avgHRV / avgRHR
    const sev: InsightSeverity = balance > 1.0 ? "positive" : balance > 0.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Autonomic balance (HRV/RHR): ${balance.toFixed(2)}. ${balance > 1.0 ? "Parasympathetic-dominant — well recovered." : balance > 0.5 ? "Balanced autonomic state." : "Sympathetic-dominant — stress or fatigue indicated."}`, Number(balance.toFixed(2)), "ratio", { low: 0.5, high: 1.5 }, { avgRHR: Math.round(avgRHR), avgHRV: Math.round(avgHRV) })
  },

  "aerobic-threshold": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const hrWorkouts = ctx.workouts.filter((w) => w.avgHeartRate && w.maxHeartRate)
    if (hrWorkouts.length < 3) return null
    const maxHRs = hrWorkouts.map((w) => w.maxHeartRate!)
    const estMax = Math.max(...maxHRs)
    const avgExercise = hrWorkouts.map((w) => w.avgHeartRate!).reduce((a, b) => a + b, 0) / hrWorkouts.length
    const atPct = (avgExercise / estMax) * 100
    const sev: InsightSeverity = atPct < 75 ? "positive" : atPct < 85 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Avg exercise HR is ${atPct.toFixed(0)}% of max (${Math.round(avgExercise)}/${estMax} bpm). ${atPct < 75 ? "Mostly aerobic zone training." : atPct < 85 ? "Mixed aerobic/anaerobic." : "Predominantly high-intensity."}`, Number(atPct.toFixed(0)), "% max HR", { low: 60, high: 85 }, { avgExercise: Math.round(avgExercise), estMax })
  },

  "hr-drift-rate": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const longWorkouts = ctx.workouts.filter((w) => (w.durationSeconds || 0) > 1800 && w.avgHeartRate)
    if (longWorkouts.length < 2) return null
    const drifts = longWorkouts.map((w) => { const dur = (w.durationSeconds || 0) / 3600; return w.maxHeartRate && w.avgHeartRate ? (w.maxHeartRate - w.avgHeartRate) / dur : 0 }).filter((d) => d > 0)
    if (drifts.length === 0) return null
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
    const sev: InsightSeverity = avgDrift < 10 ? "positive" : avgDrift < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `HR drift: ${avgDrift.toFixed(1)} bpm/hour during sustained efforts. ${avgDrift < 10 ? "Minimal drift — excellent aerobic base." : avgDrift < 20 ? "Moderate drift." : "High drift — aerobic base needs development."}`, Number(avgDrift.toFixed(1)), "bpm/hr", { low: 5, high: 20 }, { workouts: drifts.length })
  },

  "post-exercise-recovery-1min": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const hrWorkouts = ctx.workouts.filter((w) => w.maxHeartRate && w.avgHeartRate)
    if (hrWorkouts.length < 2) return null
    const recoveryEst = hrWorkouts.map((w) => (w.maxHeartRate! - w.avgHeartRate!) * 0.6)
    const avg = recoveryEst.reduce((a, b) => a + b, 0) / recoveryEst.length
    const sev: InsightSeverity = avg > 30 ? "positive" : avg > 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated 1-min HR recovery: ~${Math.round(avg)} bpm. ${avg > 30 ? "Excellent cardiac recovery." : avg > 20 ? "Normal recovery." : "Slow recovery — improve aerobic fitness."}`, Math.round(avg), "bpm", { low: 20, high: 40 }, { samples: recoveryEst.length })
  },

  "morning-rhr-spike": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 7) return null
    const baseline = rhr.slice(0, -3).reduce((a, b) => a + b, 0) / (rhr.length - 3)
    const recent = rhr.slice(-3).reduce((a, b) => a + b, 0) / 3
    const spike = recent - baseline
    const sev: InsightSeverity = spike < 3 ? "positive" : spike < 7 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `RHR ${spike > 0 ? "elevated" : "normal"}: ${spike > 0 ? "+" : ""}${spike.toFixed(1)} bpm vs baseline. ${spike >= 7 ? "Possible illness, stress, or poor recovery." : spike >= 3 ? "Slight elevation — monitor closely." : "RHR within normal range."}`, Number(spike.toFixed(1)), "bpm", { low: 0, high: 5 }, { baseline: Math.round(baseline), recent: Math.round(recent) })
  },

  "hr-circadian": (alg, ctx) => {
    const hr = ctx.vals("heart_rate")
    if (hr.length < 24) return null
    const min = Math.min(...hr.slice(-24)); const max = Math.max(...hr.slice(-24))
    const range = max - min
    const sev: InsightSeverity = range > 30 && range < 80 ? "positive" : range >= 80 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `24h HR range: ${min}-${max} bpm (span: ${range}). ${range > 30 && range < 80 ? "Normal circadian HR variation." : range >= 80 ? "Wide range — high activity peaks or stress." : "Narrow range — limited activity variation."}`, range, "bpm range", { low: 30, high: 80 }, { min, max })
  },

  "bradycardia-flag": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 7) return null
    const avg = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const daysBelow50 = rhr.slice(-7).filter((v) => v < 50).length
    const sev: InsightSeverity = daysBelow50 === 0 ? "positive" : daysBelow50 <= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `RHR below 50 bpm on ${daysBelow50}/7 days (avg: ${avg.toFixed(0)} bpm). ${daysBelow50 >= 3 ? "Recurrent low HR — normal for athletes, consult doctor if symptomatic." : "RHR in normal range."}`, Math.round(avg), "bpm", { low: 50, high: 100 }, { daysBelow50 })
  },

  "tachycardia-flag": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 7) return null
    const avg = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
    const daysAbove100 = rhr.slice(-7).filter((v) => v > 100).length
    const sev: InsightSeverity = daysAbove100 === 0 ? "positive" : daysAbove100 <= 2 ? "info" : "critical"
    return ctx.makeInsight(alg, sev, `RHR above 100 bpm on ${daysAbove100}/7 days (avg: ${avg.toFixed(0)} bpm). ${daysAbove100 >= 3 ? "Persistent elevated RHR — medical evaluation recommended." : "RHR within normal range."}`, Math.round(avg), "bpm", { low: 50, high: 100 }, { daysAbove100 })
  },

  "hr-exercise-reactivity": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const hrWorkouts = ctx.workouts.filter((w) => w.avgHeartRate && w.maxHeartRate)
    if (hrWorkouts.length < 2) return null
    const rhr = ctx.vals("resting_heart_rate")
    const avgRHR = rhr.length > 0 ? rhr.reduce((a, b) => a + b, 0) / rhr.length : 60
    const reactivity = hrWorkouts.map((w) => w.maxHeartRate! - avgRHR)
    const avgReact = reactivity.reduce((a, b) => a + b, 0) / reactivity.length
    const sev: InsightSeverity = avgReact > 80 ? "positive" : avgReact > 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `HR reactivity: ${Math.round(avgReact)} bpm rise from rest to peak. ${avgReact > 80 ? "Strong chronotropic response." : avgReact > 50 ? "Normal HR response to exercise." : "Blunted HR response — discuss with a healthcare provider if on no medications."}`, Math.round(avgReact), "bpm", { low: 50, high: 100 }, { avgRHR: Math.round(avgRHR), samples: hrWorkouts.length })
  },

  "cardiovascular-age": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const steps = ctx.vals("steps")
    if (rhr.length < 14 || steps.length < 14) return null
    const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
    const avgSteps = steps.slice(-14).reduce((a, b) => a + b, 0) / 14
    const activityBonus = Math.min(10, avgSteps / 2000)
    const cardioAge = Math.round(avgRHR * 0.6 - activityBonus + 20)
    const sev: InsightSeverity = cardioAge <= 35 ? "positive" : cardioAge <= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated cardiovascular age: ${cardioAge} years. ${cardioAge <= 35 ? "Excellent cardiovascular fitness." : cardioAge <= 50 ? "Average cardiovascular health." : "Room for improvement — increase activity, reduce RHR."}`, cardioAge, "years", { low: 25, high: 55 }, { avgRHR: Math.round(avgRHR), avgSteps: Math.round(avgSteps) })
  },

  "parasympathetic-reactivation": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const hrWork = ctx.workouts.filter((w) => w.maxHeartRate && w.avgHeartRate)
    if (hrWork.length < 2) return null
    const dropPct = hrWork.map((w) => ((w.maxHeartRate! - w.avgHeartRate!) / w.maxHeartRate!) * 100)
    const avgDrop = dropPct.reduce((a, b) => a + b, 0) / dropPct.length
    const sev: InsightSeverity = avgDrop > 15 ? "positive" : avgDrop > 8 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Post-exercise HR drop: ${avgDrop.toFixed(1)}% from peak. ${avgDrop > 15 ? "Fast parasympathetic reactivation." : avgDrop > 8 ? "Normal vagal reactivation." : "Slow reactivation — aerobic conditioning may help."}`, Number(avgDrop.toFixed(1)), "%", { low: 8, high: 20 }, { samples: hrWork.length })
  },
}
