import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev, movingAverage, coefficientOfVariation } from "../math.js"

export const activityRunners: Record<string, AlgorithmRunner> = {
  "daily-steps-goal": (alg, ctx) => {
    const v = ctx.vals("steps")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    const pct = (avg / 10000) * 100
    const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 70 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Average ${Math.round(avg).toLocaleString()} steps/day (${Math.round(pct)}% of 10K goal). ${pct >= 100 ? "Consistently hitting target!" : "Room for improvement."}`, Math.round(avg), "steps", { low: 7000, high: 10000 }, { goalPct: Math.round(pct), days: v.length })
  },

  "steps-trend": (alg, ctx) => {
    const v = ctx.vals("steps")
    if (v.length < 5) return null
    const last14 = v.slice(-14)
    const t = trend(last14)
    const ma = movingAverage(last14, 7)
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Steps trend: ${t}. 7-day moving avg: ${Math.round(ma[ma.length - 1]!).toLocaleString()} steps.`, Math.round(ma[ma.length - 1]!), "steps", null, { trend: t })
  },

  "active-minutes-who": (alg, ctx) => {
    const v = ctx.vals("active_minutes")
    if (v.length === 0) return null
    const weekly = v.slice(-7).reduce((a, b) => a + b, 0)
    const pct = (weekly / 150) * 100
    const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 60 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Weekly active minutes: ${Math.round(weekly)} (${Math.round(pct)}% of WHO 150-min target). ${pct >= 100 ? "Meeting guidelines!" : "Below recommended level."}`, Math.round(weekly), "min", { low: 150, high: 300 }, { target: 150, pct: Math.round(pct) })
  },

  "sedentary-alert": (alg, ctx) => {
    const v = ctx.vals("steps")
    if (v.length === 0) return null
    const sedentaryDays = v.filter((s) => s < 2000).length
    const pct = (sedentaryDays / v.length) * 100
    const sev: InsightSeverity = pct === 0 ? "positive" : pct < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `${sedentaryDays} of ${v.length} days were sedentary (<2K steps). ${pct === 0 ? "No sedentary days detected!" : `${Math.round(pct)}% sedentary rate.`}`, sedentaryDays, "days", null, { sedentaryPct: Math.round(pct) })
  },

  "calorie-balance": (alg, ctx) => {
    const v = ctx.vals("calories")
    if (v.length < 3) return null
    const last7 = v.slice(-7)
    const avg = last7.reduce((a, b) => a + b, 0) / last7.length
    const t = trend(v.slice(-14))
    return ctx.makeInsight(alg, "info", `7-day avg calorie burn: ${Math.round(avg).toLocaleString()} kcal/day. Trend: ${t}.`, Math.round(avg), "kcal", null, { trend: t })
  },

  "distance-weekly": (alg, ctx) => {
    const v = ctx.vals("distance")
    if (v.length === 0) return null
    const last7 = v.slice(-7)
    const total = last7.reduce((a, b) => a + b, 0)
    const km = total / 1000
    return ctx.makeInsight(alg, km > 35 ? "positive" : km > 15 ? "info" : "warning", `Weekly distance: ${km.toFixed(1)} km. ${km > 35 ? "Excellent coverage." : km > 15 ? "Good activity level." : "Consider increasing movement."}`, Number(km.toFixed(1)), "km", null, { days: last7.length })
  },

  "activity-consistency": (alg, ctx) => {
    const v = ctx.vals("steps")
    if (v.length < 7) return null
    const cv = coefficientOfVariation(v)
    const sev: InsightSeverity = cv < 25 ? "positive" : cv < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Activity consistency index: CV=${Math.round(cv)}%. ${cv < 25 ? "Very consistent — great habit." : cv < 50 ? "Moderate consistency." : "Highly variable — try establishing a routine."}`, Math.round(cv), "%", { low: 0, high: 25 }, { days: v.length })
  },

  "peak-activity-time": (alg, ctx) => {
    const stepRecs = ctx.recs("steps")
    if (stepRecs.length < 5) return null
    const hourBuckets = new Map<number, number[]>()
    for (const r of stepRecs) {
      const h = r.recordedAt.getHours()
      const arr = hourBuckets.get(h) ?? []
      arr.push(r.value ?? 0)
      hourBuckets.set(h, arr)
    }
    let peakHour = 0
    let peakAvg = 0
    for (const [h, v] of hourBuckets) {
      const avg = v.reduce((a, b) => a + b, 0) / v.length
      if (avg > peakAvg) { peakHour = h; peakAvg = avg }
    }
    const timeStr = `${peakHour.toString().padStart(2, "0")}:00`
    return ctx.makeInsight(alg, "info", `Peak activity typically occurs around ${timeStr} with avg ${Math.round(peakAvg).toLocaleString()} steps.`, peakHour, "hour", null, { peakAvg: Math.round(peakAvg) })
  },

  "floors-climbed": (alg, ctx) => {
    const v = ctx.vals("floors")
    if (v.length === 0) return null
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    const sev: InsightSeverity = avg >= 10 ? "positive" : avg >= 5 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Average ${Math.round(avg)} floors/day. ${avg >= 10 ? "Meeting cardiovascular benefit target." : "Below 10-floor daily recommendation."}`, Math.round(avg), "floors", { low: 10, high: 20 }, { days: v.length })
  },

  "inactivity-streak": (alg, ctx) => {
    const v = ctx.vals("steps")
    if (v.length === 0) return null
    let maxStreak = 0
    let currentStreak = 0
    for (const s of v) {
      if (s < 5000) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
      else currentStreak = 0
    }
    const sev: InsightSeverity = maxStreak === 0 ? "positive" : maxStreak <= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Longest inactivity streak: ${maxStreak} consecutive days below 5K steps. ${maxStreak === 0 ? "No inactivity streaks!" : maxStreak <= 2 ? "Brief dips are normal." : "Extended low activity — prioritize movement."}`, maxStreak, "days", null, {})
  },

  // ── Advanced Activity ──
  "step-cadence": (alg, ctx) => {
    const steps = ctx.vals("steps"); const active = ctx.vals("active_minutes")
    if (steps.length < 7 || active.length < 7) return null
    const n = Math.min(steps.length, active.length)
    const cadences = steps.slice(-n).map((s, i) => active[active.length - n + i]! > 0 ? s / active[active.length - n + i]! : 0).filter((c) => c > 0)
    if (cadences.length < 3) return null
    const avg = cadences.reduce((a, b) => a + b, 0) / cadences.length
    const sev: InsightSeverity = avg >= 100 ? "positive" : avg >= 70 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Step cadence: ${Math.round(avg)} steps/active-min. ${avg >= 100 ? "Includes running/brisk walking." : avg >= 70 ? "Moderate walking pace." : "Low intensity movement."}`, Math.round(avg), "steps/min", { low: 70, high: 120 }, { days: cadences.length })
  },

  "movement-distribution": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 14) return null
    const cv = coefficientOfVariation(steps.slice(-14))
    const sev: InsightSeverity = cv < 30 ? "positive" : cv < 50 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Activity distribution CV: ${cv.toFixed(0)}%. ${cv < 30 ? "Very evenly distributed movement." : cv < 50 ? "Moderate variation in daily activity." : "Highly clustered — aim for more consistent daily movement."}`, Number(cv.toFixed(0)), "%CV", { low: 15, high: 50 }, { days: 14 })
  },

  "exercise-adherence": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 14) return null
    const goalDays = steps.slice(-30).filter((s) => s >= 10000).length
    const total = Math.min(30, steps.length)
    const pct = (goalDays / total) * 100
    const sev: InsightSeverity = pct >= 70 ? "positive" : pct >= 40 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Exercise adherence: ${goalDays}/${total} days hit 10K steps (${pct.toFixed(0)}%). ${pct >= 70 ? "Great consistency!" : pct >= 40 ? "Moderate adherence." : "Low adherence — set smaller incremental goals."}`, Number(pct.toFixed(0)), "%", { low: 40, high: 80 }, { goalDays, total })
  },

  "weekend-warrior": (alg, ctx) => {
    const steps = ctx.dayStats("steps")
    if (steps.length < 14) return null
    const we = steps.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 })
    const wd = steps.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 })
    const weTotal = we.reduce((a, b) => a + b.value, 0)
    const wdTotal = wd.reduce((a, b) => a + b.value, 0)
    const totalAll = weTotal + wdTotal
    const wePct = totalAll > 0 ? (weTotal / totalAll) * 100 : 28.6
    const sev: InsightSeverity = wePct > 20 && wePct < 35 ? "positive" : wePct >= 50 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Weekend activity share: ${wePct.toFixed(0)}% of total (expected ~29%). ${wePct >= 50 ? "Weekend warrior pattern — risk of overuse injuries." : wePct > 20 && wePct < 35 ? "Well-distributed activity." : "Most activity is on weekdays."}`, Number(wePct.toFixed(0)), "%", { low: 20, high: 35 }, { weTotal: Math.round(weTotal), wdTotal: Math.round(wdTotal) })
  },

  "intensity-mix": (alg, ctx) => {
    const steps = ctx.vals("steps"); const hr = ctx.vals("heart_rate")
    if (steps.length < 7 || hr.length < 7) return null
    const highHR = hr.filter((v) => v > 140).length
    const modHR = hr.filter((v) => v >= 100 && v <= 140).length
    const lowHR = hr.filter((v) => v < 100).length
    const total = hr.length
    const vigPct = (highHR / total) * 100
    const sev: InsightSeverity = vigPct >= 10 && vigPct <= 30 ? "positive" : vigPct < 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Intensity mix: ${((lowHR / total) * 100).toFixed(0)}% low, ${((modHR / total) * 100).toFixed(0)}% moderate, ${vigPct.toFixed(0)}% vigorous. ${vigPct >= 10 && vigPct <= 30 ? "Good intensity balance." : vigPct < 10 ? "Add more vigorous activity." : "Heavy on high intensity — add recovery."}`, Number(vigPct.toFixed(0)), "% vigorous", { low: 10, high: 30 }, { lowHR, modHR, highHR })
  },

  "step-asymmetry": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 14) return null
    const avg = steps.reduce((a, b) => a + b, 0) / steps.length
    const outliers = steps.filter((s) => Math.abs(s - avg) > 2 * stddev(steps)).length
    const pct = (outliers / steps.length) * 100
    const sev: InsightSeverity = pct < 10 ? "positive" : pct < 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Step anomaly days: ${outliers}/${steps.length} (${pct.toFixed(0)}%). ${pct >= 20 ? "Frequent unusual patterns — possible injury or lifestyle change." : "Normal step variation."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 15 }, { outliers, avg: Math.round(avg) })
  },

  "movement-streak": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 7) return null
    let maxStreak = 0; let current = 0
    for (const s of steps) { if (s >= 7500) { current++; maxStreak = Math.max(maxStreak, current) } else { current = 0 } }
    const sev: InsightSeverity = maxStreak >= 14 ? "positive" : maxStreak >= 7 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Longest active streak: ${maxStreak} consecutive days ≥7500 steps. ${maxStreak >= 14 ? "Impressive consistency!" : maxStreak >= 7 ? "Good streak — keep it going." : "Build towards a 7-day streak."}`, maxStreak, "days", { low: 7, high: 21 }, { totalDays: steps.length })
  },

  "hourly-activity-pattern": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 7) return null
    const avg = steps.reduce((a, b) => a + b, 0) / steps.length
    const activeDays = steps.filter((s) => s > avg * 1.2).length
    const sedentaryDays = steps.filter((s) => s < avg * 0.5).length
    const sev: InsightSeverity = sedentaryDays < 3 ? "positive" : sedentaryDays < 7 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Activity pattern: ${activeDays} above-average days, ${sedentaryDays} sedentary days. Daily avg: ${Math.round(avg)} steps.`, Math.round(avg), "avg steps", { low: 5000, high: 10000 }, { activeDays, sedentaryDays })
  },

  "calorie-deficit-surplus": (alg, ctx) => {
    const cal = ctx.vals("calories")
    if (cal.length < 7) return null
    const avg = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
    const balance = avg - 2000
    const sev: InsightSeverity = Math.abs(balance) < 200 ? "positive" : balance > 500 ? "info" : balance < -500 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Daily calorie balance: ${balance > 0 ? "+" : ""}${Math.round(balance)} kcal vs 2000 baseline. Avg burn: ${Math.round(avg)} kcal/day.`, Math.round(balance), "kcal", { low: -300, high: 300 }, { avgBurn: Math.round(avg) })
  },

  "recovery-day-detection": (alg, ctx) => {
    const steps = ctx.vals("steps")
    if (steps.length < 7 || ctx.workouts.length < 2) return null
    const workoutDates = new Set(ctx.workouts.map((w) => new Date(w.startedAt).toISOString().slice(0, 10)))
    const stepStats = ctx.dayStats("steps")
    const recoveryDays = stepStats.filter((s) => !workoutDates.has(s.date) && s.value >= 3000 && s.value <= 8000).length
    const pct = (recoveryDays / stepStats.length) * 100
    const sev: InsightSeverity = pct >= 20 ? "positive" : pct >= 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Active recovery days: ${recoveryDays} (${pct.toFixed(0)}% of period). ${pct >= 20 ? "Good balance of training and recovery." : "Consider adding light activity between hard sessions."}`, recoveryDays, "days", { low: 2, high: 8 }, { totalDays: stepStats.length })
  },

  "distance-pr-check": (alg, ctx) => {
    const dist = ctx.vals("distance")
    if (dist.length < 7) return null
    const max = Math.max(...dist)
    const recent = Math.max(...dist.slice(-7))
    const pctOfPR = max > 0 ? (recent / max) * 100 : 0
    const sev: InsightSeverity = pctOfPR >= 95 ? "positive" : pctOfPR >= 80 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Recent best distance: ${pctOfPR.toFixed(0)}% of all-time max. ${pctOfPR >= 95 ? "Near or at PR — great performance!" : "Room to push distance further."}`, Number(pctOfPR.toFixed(0)), "% of PR", { low: 70, high: 100 }, { recentMax: recent.toFixed(1), allTimeMax: max.toFixed(1) })
  },

  "daily-energy-expenditure": (alg, ctx) => {
    const cal = ctx.vals("calories")
    if (cal.length < 7) return null
    const weekAvg = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
    const t = trend(cal.slice(-14))
    const sev: InsightSeverity = weekAvg >= 2000 ? "positive" : weekAvg >= 1500 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Estimated TDEE: ${Math.round(weekAvg)} kcal/day (7-day avg, ${t}). ${weekAvg >= 2000 ? "Active energy expenditure." : "Below typical TDEE — increase activity."}`, Math.round(weekAvg), "kcal/day", { low: 1800, high: 2500 }, { trend: t })
  },
}
