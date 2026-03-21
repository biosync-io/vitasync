import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, linearSlope } from "../math.js"

export const compositeRunners: Record<string, AlgorithmRunner> = {
  "sleep-activity-corr": (alg, ctx) => {
    const steps = ctx.vals("steps"); const sleepV = ctx.vals("sleep")
    if (steps.length < 7 || sleepV.length < 7) return null
    const n = Math.min(steps.length, sleepV.length)
    const s = steps.slice(-n); const sl = sleepV.slice(-n)
    const meanS = s.reduce((a, b) => a + b, 0) / n
    const meanSl = sl.reduce((a, b) => a + b, 0) / n
    let num = 0; let denS = 0; let denSl = 0
    for (let i = 0; i < n; i++) { num += (s[i]! - meanS) * (sl[i]! - meanSl); denS += (s[i]! - meanS) ** 2; denSl += (sl[i]! - meanSl) ** 2 }
    const r = denS && denSl ? num / Math.sqrt(denS * denSl) : 0
    const sev: InsightSeverity = r > 0.3 ? "positive" : r < -0.3 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Steps-sleep correlation: r=${r.toFixed(2)}. ${r > 0.3 ? "More activity is linked to better sleep." : r < -0.3 ? "Higher activity may be disrupting sleep." : "No strong link detected."}`, Number(r.toFixed(2)), "r", { low: -0.3, high: 0.3 }, { n })
  },

  "hr-sleep-quality": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const ss = ctx.vals("sleep_score")
    if (rhr.length < 7 || ss.length < 7) return null
    const n = Math.min(rhr.length, ss.length)
    const r1 = rhr.slice(-n); const s1 = ss.slice(-n)
    const mr = r1.reduce((a, b) => a + b, 0) / n; const ms = s1.reduce((a, b) => a + b, 0) / n
    let num = 0; let d1 = 0; let d2 = 0
    for (let i = 0; i < n; i++) { num += (r1[i]! - mr) * (s1[i]! - ms); d1 += (r1[i]! - mr) ** 2; d2 += (s1[i]! - ms) ** 2 }
    const r = d1 && d2 ? num / Math.sqrt(d1 * d2) : 0
    const sev: InsightSeverity = r < -0.3 ? "positive" : r > 0.3 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `RHR-sleep quality correlation: r=${r.toFixed(2)}. ${r < -0.3 ? "Lower RHR = better sleep (expected)." : "No strong inverse relationship."}`, Number(r.toFixed(2)), "r", { low: -0.5, high: 0 }, { n })
  },

  "exercise-recovery-efficiency": (alg, ctx) => {
    const rec = ctx.vals("recovery_score")
    if (rec.length < 7 || ctx.workouts.length < 2) return null
    const dipDays: number[] = []
    for (let i = 1; i < rec.length; i++) { if (rec[i]! < rec[i - 1]! * 0.85) dipDays.push(i) }
    if (dipDays.length === 0) return ctx.makeInsight(alg, "positive", "Recovery stayed stable — no significant post-workout dips detected.", 0, "days", { low: 1, high: 3 }, {})
    const recoveryTimes = dipDays.map((d) => { let t = 1; while (d + t < rec.length && rec[d + t]! < rec[d - 1]!) t++; return t })
    const avg = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
    const sev: InsightSeverity = avg <= 1.5 ? "positive" : avg <= 3 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Average recovery rebound: ${avg.toFixed(1)} days after hard efforts. ${avg <= 1.5 ? "Excellent recovery speed." : avg <= 3 ? "Normal recovery time." : "Slow recovery — consider reducing load."}`, Number(avg.toFixed(1)), "days", { low: 1, high: 3 }, { dips: dipDays.length })
  },

  "stress-sleep-impact": (alg, ctx) => {
    const stress = ctx.vals("stress"); const sleepV = ctx.vals("sleep")
    if (stress.length < 7 || sleepV.length < 7) return null
    const n = Math.min(stress.length, sleepV.length)
    const s = stress.slice(-n); const sl = sleepV.slice(-n)
    const highStressDays = s.filter((v) => v > 70).length
    const avgSleepOnHigh = s.reduce((acc, v, i) => v > 70 ? { sum: acc.sum + sl[i]!, count: acc.count + 1 } : acc, { sum: 0, count: 0 })
    const avgSleepOnLow = s.reduce((acc, v, i) => v <= 70 ? { sum: acc.sum + sl[i]!, count: acc.count + 1 } : acc, { sum: 0, count: 0 })
    const highAvg = avgSleepOnHigh.count ? avgSleepOnHigh.sum / avgSleepOnHigh.count : 0
    const lowAvg = avgSleepOnLow.count ? avgSleepOnLow.sum / avgSleepOnLow.count : 0
    const diff = lowAvg - highAvg
    const sev: InsightSeverity = diff > 60 ? "warning" : diff > 30 ? "info" : "positive"
    return ctx.makeInsight(alg, sev, `High-stress days: ${highStressDays}/${n}. Sleep is ${diff > 0 ? `${Math.round(diff)} min shorter` : "unaffected"} on stressful days.`, Math.round(diff), "min", { low: 0, high: 60 }, { highStressDays, highAvg: Math.round(highAvg), lowAvg: Math.round(lowAvg) })
  },

  "weekend-weekday-activity": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 14) return null
    const dates = ctx.dayStats("steps").map((d) => ({ val: d.value, dow: new Date(d.date).getDay() }))
    const we = dates.filter((d) => d.dow === 0 || d.dow === 6)
    const wd = dates.filter((d) => d.dow >= 1 && d.dow <= 5)
    const weAvg = we.length ? we.reduce((a, b) => a + b.val, 0) / we.length : 0
    const wdAvg = wd.length ? wd.reduce((a, b) => a + b.val, 0) / wd.length : 0
    const ratio = wdAvg > 0 ? weAvg / wdAvg : 1
    const sev: InsightSeverity = ratio > 0.8 && ratio < 1.2 ? "positive" : ratio >= 1.5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Weekend avg: ${Math.round(weAvg)} steps, Weekday avg: ${Math.round(wdAvg)} steps (ratio: ${ratio.toFixed(2)}). ${ratio > 0.8 && ratio < 1.2 ? "Well balanced." : ratio >= 1.5 ? "Weekend warrior pattern." : "Weekdays significantly more active."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.8, high: 1.2 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
  },

  "morning-readiness": (alg, ctx) => {
    const sleepV = ctx.vals("sleep"); const readiness = ctx.vals("readiness_score")
    if (sleepV.length < 7 || readiness.length < 7) return null
    const n = Math.min(sleepV.length, readiness.length) - 1
    let correctPredictions = 0
    for (let i = 0; i < n; i++) { if ((sleepV[i]! >= 420 && readiness[i + 1]! >= 60) || (sleepV[i]! < 420 && readiness[i + 1]! < 60)) correctPredictions++ }
    const accuracy = n > 0 ? (correctPredictions / n) * 100 : 0
    const sev: InsightSeverity = accuracy >= 70 ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `Sleep predicts next-day readiness with ${accuracy.toFixed(0)}% accuracy. ${accuracy >= 70 ? "Strong predictive link — prioritize sleep." : "Other factors also influence readiness."}`, Number(accuracy.toFixed(0)), "%", { low: 50, high: 80 }, { n })
  },

  "training-adaptation": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const hrv = ctx.vals("heart_rate_variability")
    if (rhr.length < 14 || hrv.length < 14 || ctx.workouts.length < 4) return null
    const rhrTrend = linearSlope(rhr.slice(-14))
    const hrvTrend = linearSlope(hrv.slice(-14))
    const wkLoad = ctx.workouts.slice(-14).reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
    const score = (hrvTrend > 0 ? 1 : 0) + (rhrTrend < 0 ? 1 : 0) + (wkLoad > 200 ? 1 : 0)
    const sev: InsightSeverity = score >= 3 ? "positive" : score >= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Training adaptation index: ${score}/3. ${score >= 3 ? "Excellent — adapting well (HRV up, RHR down, volume maintained)." : score >= 2 ? "Good progress on most indicators." : "Limited adaptation signals — review training plan."}`, score, "/3", { low: 1, high: 3 }, { rhrTrend: rhrTrend.toFixed(3), hrvTrend: hrvTrend.toFixed(3), wkMinutes: Math.round(wkLoad) })
  },

  "holistic-wellness": (alg, ctx) => {
    const steps = ctx.vals("steps"); const sleepV = ctx.vals("sleep"); const rhr = ctx.vals("resting_heart_rate")
    if (steps.length < 7 || sleepV.length < 7 || rhr.length < 7) return null
    const stepScore = Math.min(100, (steps.slice(-7).reduce((a, b) => a + b, 0) / 7 / 10000) * 100)
    const sleepScore = Math.min(100, (sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 100)
    const rhrScore = Math.min(100, Math.max(0, 100 - (rhr.slice(-7).reduce((a, b) => a + b, 0) / 7 - 50) * 2))
    const wellness = Math.round((stepScore + sleepScore + rhrScore) / 3)
    const sev: InsightSeverity = wellness >= 75 ? "positive" : wellness >= 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Holistic wellness score: ${wellness}/100. Activity=${Math.round(stepScore)}, Sleep=${Math.round(sleepScore)}, Cardiac=${Math.round(rhrScore)}.`, wellness, "/100", { low: 50, high: 80 }, { stepScore: Math.round(stepScore), sleepScore: Math.round(sleepScore), rhrScore: Math.round(rhrScore) })
  },

  "circadian-stability": (alg, ctx) => {
    const sleepStats = ctx.dayStats("sleep")
    if (sleepStats.length < 10) return null
    const bedtimeProxy = sleepStats.map((d) => { const dt = new Date(d.date); return dt.getHours() * 60 + dt.getMinutes() })
    const sd = stddev(bedtimeProxy)
    const sev: InsightSeverity = sd < 30 ? "positive" : sd < 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Circadian stability: ±${Math.round(sd)} min bedtime variation. ${sd < 30 ? "Very consistent schedule." : sd < 60 ? "Moderate variation." : "Irregular schedule — may affect sleep quality."}`, Math.round(sd), "min", { low: 15, high: 60 }, { days: sleepStats.length })
  },

  "overtraining-risk": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length < 14 || ctx.workouts.length < 4) return null
    const rhrTrend = linearSlope(rhr.slice(-14))
    const recentRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
    const baselineRHR = rhr.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
    const rhrElevation = recentRHR - baselineRHR
    const weekWorkouts = ctx.workouts.filter((w) => new Date(w.startedAt) >= new Date(Date.now() - 7 * 86400000)).length
    let risk = 0
    if (rhrTrend > 0.2) risk++
    if (rhrElevation > 5) risk++
    if (weekWorkouts > 6) risk++
    const sev: InsightSeverity = risk === 0 ? "positive" : risk <= 1 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Overtraining risk: ${risk}/3 flags. ${risk === 0 ? "No signs of overtraining." : risk <= 1 ? "Minor overreach signals." : "Multiple overtraining indicators — consider a recovery week."}`, risk, "/3", { low: 0, high: 2 }, { rhrElevation: rhrElevation.toFixed(1), weekWorkouts, rhrTrend: rhrTrend.toFixed(3) })
  },

  "detraining-risk": (alg, ctx) => {
    if (ctx.workouts.length === 0) return null
    const sorted = [...ctx.workouts].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    const lastWorkout = new Date(sorted[0]!.startedAt)
    const daysSince = Math.floor((Date.now() - lastWorkout.getTime()) / 86400000)
    const twoWeekCount = ctx.workouts.filter((w) => new Date(w.startedAt) >= new Date(Date.now() - 14 * 86400000)).length
    const sev: InsightSeverity = daysSince <= 3 && twoWeekCount >= 4 ? "positive" : daysSince <= 7 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Last workout: ${daysSince} days ago. ${twoWeekCount} sessions in past 14 days. ${daysSince > 14 ? "Detraining likely occurring." : daysSince > 7 ? "Fitness may start declining." : "Training recency OK."}`, daysSince, "days", { low: 0, high: 7 }, { twoWeekCount })
  },

  "fitness-fatigue": (alg, ctx) => {
    if (ctx.workouts.length < 14) return null
    const now = Date.now()
    let ctl = 0; let atl = 0
    const dailyLoad: number[] = Array(42).fill(0)
    for (const w of ctx.workouts) {
      const daysAgo = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000)
      if (daysAgo < 42) dailyLoad[daysAgo]! += (w.durationSeconds || 0) / 60 * (w.avgHeartRate ? w.avgHeartRate / 150 : 1)
    }
    for (let i = 41; i >= 0; i--) { ctl = ctl + (dailyLoad[i]! - ctl) / 42; atl = atl + (dailyLoad[i]! - atl) / 7 }
    const tsb = ctl - atl
    const sev: InsightSeverity = tsb > 10 ? "positive" : tsb > -10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Training balance: CTL=${ctl.toFixed(0)}, ATL=${atl.toFixed(0)}, TSB=${tsb.toFixed(0)}. ${tsb > 10 ? "Fresh — ready for hard effort." : tsb > -10 ? "Balanced fatigue/fitness." : "Fatigued — recovery recommended."}`, Number(tsb.toFixed(0)), "TSB", { low: -15, high: 15 }, { ctl: ctl.toFixed(1), atl: atl.toFixed(1) })
  },

  "sleep-workout-timing": (alg, ctx) => {
    const sleepV = ctx.vals("sleep")
    if (sleepV.length < 7 || ctx.workouts.length < 4) return null
    const sleepStats = ctx.dayStats("sleep")
    const workoutDates = new Set(ctx.workouts.map((w) => new Date(w.startedAt).toISOString().slice(0, 10)))
    const sleepOnWorkout = sleepStats.filter((s) => workoutDates.has(s.date)).map((s) => s.value)
    const sleepOnRest = sleepStats.filter((s) => !workoutDates.has(s.date)).map((s) => s.value)
    const avgWk = sleepOnWorkout.length ? sleepOnWorkout.reduce((a, b) => a + b, 0) / sleepOnWorkout.length : 0
    const avgRest = sleepOnRest.length ? sleepOnRest.reduce((a, b) => a + b, 0) / sleepOnRest.length : 0
    const diff = avgWk - avgRest
    const sev: InsightSeverity = diff > 15 ? "positive" : diff > -15 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sleep on workout days: ${Math.round(avgWk)} min vs rest days: ${Math.round(avgRest)} min (${diff > 0 ? "+" : ""}${Math.round(diff)} min). ${diff > 15 ? "Exercise improves your sleep." : diff < -15 ? "Exercise may be disrupting sleep — try earlier workouts." : "No significant impact."}`, Math.round(diff), "min", { low: -30, high: 30 }, { workoutDays: sleepOnWorkout.length, restDays: sleepOnRest.length })
  },

  "metabolic-efficiency": (alg, ctx) => {
    const cal = ctx.vals("calories"); const active = ctx.vals("active_minutes")
    if (cal.length < 7 || active.length < 7) return null
    const n = Math.min(cal.length, active.length)
    const efficiency = cal.slice(-n).map((c, i) => active[active.length - n + i]! > 0 ? c / active[active.length - n + i]! : 0).filter((e) => e > 0)
    if (efficiency.length < 3) return null
    const avg = efficiency.reduce((a, b) => a + b, 0) / efficiency.length
    const t = trend(efficiency)
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "stable" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Metabolic efficiency: ${avg.toFixed(1)} cal/active-min (${t}). ${t === "rising" ? "Burning more efficiently." : "Stable metabolic output."}`, Number(avg.toFixed(1)), "cal/min", { low: 5, high: 15 }, { trend: t, days: efficiency.length })
  },

  "hydration-proxy": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate"); const temp = ctx.vals("temperature")
    if (rhr.length < 5 || temp.length < 5) return null
    const recentRHR = rhr.slice(-5).reduce((a, b) => a + b, 0) / 5
    const baseRHR = rhr.slice(0, Math.min(14, rhr.length)).reduce((a, b) => a + b, 0) / Math.min(14, rhr.length)
    const recentTemp = temp.slice(-5).reduce((a, b) => a + b, 0) / 5
    const elevation = recentRHR - baseRHR
    const risk = elevation > 5 && recentTemp > 37 ? "high" : elevation > 3 ? "moderate" : "low"
    const sev: InsightSeverity = risk === "low" ? "positive" : risk === "moderate" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Hydration proxy: ${risk} dehydration risk. RHR elevated ${elevation.toFixed(1)} bpm above baseline. ${risk === "high" ? "Increase fluid intake." : "Hydration appears adequate."}`, Number(elevation.toFixed(1)), "bpm above baseline", { low: 0, high: 5 }, { risk, recentTemp: recentTemp.toFixed(1) })
  },
}
