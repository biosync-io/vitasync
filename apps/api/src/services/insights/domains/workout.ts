import type { InsightSeverity, AlgorithmContext, AlgorithmRunner } from "../types.js"
import { trend, stddev } from "../math.js"

export const workoutRunners: Record<string, AlgorithmRunner> = {
  "training-load": (alg, ctx) => {
    if (ctx.workouts.length === 0) return null
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recent = ctx.workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
    let trimp = 0
    for (const w of recent) {
      const dur = (w.durationSeconds ?? 0) / 60
      const hr = w.avgHeartRate ?? 120
      const intensity = hr / 180
      trimp += dur * intensity
    }
    const sev: InsightSeverity = trimp > 500 ? "warning" : trimp > 200 ? "positive" : "info"
    return ctx.makeInsight(alg, sev, `7-day training load (TRIMP proxy): ${Math.round(trimp)}. ${trimp > 500 ? "High load — ensure adequate recovery." : trimp > 200 ? "Good training stimulus." : "Light training week."}`, Math.round(trimp), "TRIMP", null, { workouts: recent.length })
  },

  "training-monotony": (alg, ctx) => {
    if (ctx.workouts.length < 5) return null
    const dailyLoads: number[] = []
    const dayMap = new Map<string, number>()
    for (const w of ctx.workouts) {
      const day = new Date(w.startedAt).toISOString().slice(0, 10)
      dayMap.set(day, (dayMap.get(day) ?? 0) + ((w.durationSeconds ?? 0) / 60))
    }
    for (const v of dayMap.values()) dailyLoads.push(v)
    if (dailyLoads.length < 3) return null
    const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length
    const sd = stddev(dailyLoads)
    const monotony = sd > 0 ? mean / sd : 0
    const sev: InsightSeverity = monotony > 2 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Training monotony: ${monotony.toFixed(1)}. ${monotony > 2 ? "High monotony increases overtraining/illness risk — vary sessions." : "Good training variety."}`, Number(monotony.toFixed(1)), "index", null, { days: dailyLoads.length })
  },

  "workout-frequency": (alg, ctx) => {
    if (ctx.workouts.length === 0) return null
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recent = ctx.workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
    const count = recent.length
    const sev: InsightSeverity = count >= 4 ? "positive" : count >= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `${count} workouts this week. ${count >= 4 ? "Great consistency!" : count >= 2 ? "Moderate frequency." : "Low frequency — aim for 3-5 sessions/week."}`, count, "sessions", { low: 3, high: 5 }, { totalPeriod: ctx.workouts.length })
  },

  "vo2max-estimate": (alg, ctx) => {
    const rhr = ctx.vals("resting_heart_rate")
    if (rhr.length === 0 || ctx.workouts.length === 0) return null
    const avgRHR = rhr.reduce((a, b) => a + b, 0) / rhr.length
    const maxHRs = ctx.workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
    if (maxHRs.length === 0) return null
    const estMaxHR = Math.max(...maxHRs)
    const vo2max = 15.3 * (estMaxHR / avgRHR)
    let cat: string
    let sev: InsightSeverity
    if (vo2max >= 50) { cat = "Excellent"; sev = "positive" }
    else if (vo2max >= 40) { cat = "Good"; sev = "info" }
    else if (vo2max >= 30) { cat = "Fair"; sev = "info" }
    else { cat = "Poor"; sev = "warning" }
    return ctx.makeInsight(alg, sev, `Estimated VO2max: ${vo2max.toFixed(1)} mL/kg/min — ${cat}. ${vo2max >= 50 ? "Elite aerobic fitness." : "Room for cardiovascular improvement."}`, Number(vo2max.toFixed(1)), "mL/kg/min", { low: 30, high: 50 }, { category: cat, estMaxHR, avgRHR: Math.round(avgRHR) })
  },

  // ── Advanced Workout Performance ──
  "training-intensity-dist": (alg, ctx) => {
    if (ctx.workouts.length < 5) return null
    const hrWorkouts = ctx.workouts.filter((w) => w.avgHeartRate && w.maxHeartRate)
    if (hrWorkouts.length < 3) return null
    const maxHR = Math.max(...hrWorkouts.map((w) => w.maxHeartRate!))
    const z1z2 = hrWorkouts.filter((w) => w.avgHeartRate! < maxHR * 0.75).length
    const z3 = hrWorkouts.filter((w) => w.avgHeartRate! >= maxHR * 0.75 && w.avgHeartRate! < maxHR * 0.85).length
    const z4z5 = hrWorkouts.filter((w) => w.avgHeartRate! >= maxHR * 0.85).length
    const total = hrWorkouts.length
    const polarized = (z1z2 / total > 0.7 && z4z5 / total > 0.1)
    const sev: InsightSeverity = polarized ? "positive" : z3 / total > 0.5 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Training distribution: ${((z1z2 / total) * 100).toFixed(0)}% easy, ${((z3 / total) * 100).toFixed(0)}% moderate, ${((z4z5 / total) * 100).toFixed(0)}% hard. ${polarized ? "Polarized distribution — optimal for endurance." : z3 / total > 0.5 ? "Too much moderate — polarize more." : "Mixed distribution."}`, Number(((z1z2 / total) * 100).toFixed(0)), "% easy", { low: 60, high: 80 }, { z1z2, z3, z4z5 })
  },

  "aerobic-decoupling": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const longWorkouts = ctx.workouts.filter((w) => (w.durationSeconds || 0) > 2700 && w.avgHeartRate)
    if (longWorkouts.length < 2) return null
    const decoupling = longWorkouts.map((w) => { return w.maxHeartRate && w.avgHeartRate ? ((w.maxHeartRate - w.avgHeartRate) / w.avgHeartRate) * 100 : 0 }).filter((d) => d > 0)
    const avg = decoupling.reduce((a, b) => a + b, 0) / decoupling.length
    const sev: InsightSeverity = avg < 5 ? "positive" : avg < 10 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Aerobic decoupling: ${avg.toFixed(1)}%. ${avg < 5 ? "Minimal — excellent aerobic fitness." : avg < 10 ? "Moderate — room for improvement." : "High decoupling — more base training needed."}`, Number(avg.toFixed(1)), "%", { low: 3, high: 10 }, { samples: decoupling.length })
  },

  "training-stress-score": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const scores = ctx.workouts.map((w) => { const dur = (w.durationSeconds || 0) / 3600; const intensity = w.avgHeartRate ? w.avgHeartRate / 150 : 0.7; return dur * intensity * 100 })
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const sev: InsightSeverity = avg >= 50 && avg <= 150 ? "positive" : avg > 150 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Avg training stress: ${avg.toFixed(0)} TSS/session. ${avg >= 50 && avg <= 150 ? "Productive training stimulus." : avg > 150 ? "Very high per-session stress." : "Low training stimulus."}`, Math.round(avg), "TSS", { low: 40, high: 150 }, { sessions: scores.length })
  },

  "chronic-training-load": (alg, ctx) => {
    if (ctx.workouts.length < 14) return null
    const now = Date.now()
    const dailyLoad: number[] = Array(42).fill(0)
    for (const w of ctx.workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 42) dailyLoad[d]! += (w.durationSeconds || 0) / 60 * (w.avgHeartRate ? w.avgHeartRate / 150 : 1) }
    let ctl = 0
    for (let i = 41; i >= 0; i--) ctl = ctl + (dailyLoad[i]! - ctl) / 42
    const sev: InsightSeverity = ctl >= 40 ? "positive" : ctl >= 20 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Chronic training load (CTL): ${ctl.toFixed(0)}. ${ctl >= 40 ? "Strong fitness base." : ctl >= 20 ? "Moderate fitness." : "Low CTL — gradually increase training volume."}`, Math.round(ctl), "CTL", { low: 20, high: 60 }, { days: 42 })
  },

  "acute-chronic-ratio": (alg, ctx) => {
    if (ctx.workouts.length < 14) return null
    const now = Date.now()
    const dailyLoad: number[] = Array(28).fill(0)
    for (const w of ctx.workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 28) dailyLoad[d]! += (w.durationSeconds || 0) / 60 }
    const acuteLoad = dailyLoad.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const chronicLoad = dailyLoad.reduce((a, b) => a + b, 0) / 28
    const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1
    const sev: InsightSeverity = ratio >= 0.8 && ratio <= 1.3 ? "positive" : ratio > 1.5 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Acute:Chronic ratio: ${ratio.toFixed(2)}. ${ratio >= 0.8 && ratio <= 1.3 ? "Sweet spot (0.8-1.3) — optimal injury risk." : ratio > 1.5 ? "High spike risk (>1.5) — reduce load." : "Low ratio — training under-stimulating."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.8, high: 1.3 }, { acuteLoad: acuteLoad.toFixed(0), chronicLoad: chronicLoad.toFixed(0) })
  },

  "performance-efficiency": (alg, ctx) => {
    if (ctx.workouts.length < 3) return null
    const hrWorkouts = ctx.workouts.filter((w) => w.avgHeartRate && w.distanceMeters && w.durationSeconds)
    if (hrWorkouts.length < 2) return null
    const efs = hrWorkouts.map((w) => { const speedKmH = (w.distanceMeters! / 1000) / (w.durationSeconds! / 3600); return w.avgHeartRate! > 0 ? speedKmH / w.avgHeartRate! * 100 : 0 }).filter((e) => e > 0)
    const avg = efs.reduce((a, b) => a + b, 0) / efs.length
    const t = efs.length >= 5 ? trend(efs) : "stable"
    const sev: InsightSeverity = t === "rising" ? "positive" : t === "stable" ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Performance efficiency: ${avg.toFixed(2)} (speed/HR ratio, ${t}). ${t === "rising" ? "Getting faster at same HR — fitness improving." : "Efficiency stable or declining."}`, Number(avg.toFixed(2)), "EF", { low: 3, high: 8 }, { samples: efs.length, trend: t })
  },

  "progressive-overload": (alg, ctx) => {
    if (ctx.workouts.length < 14) return null
    const now = Date.now()
    const week1 = ctx.workouts.filter((w) => { const d = (now - new Date(w.startedAt).getTime()) / 86400000; return d >= 7 && d < 14 })
    const week2 = ctx.workouts.filter((w) => { const d = (now - new Date(w.startedAt).getTime()) / 86400000; return d >= 0 && d < 7 })
    const load1 = week1.reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
    const load2 = week2.reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
    const change = load1 > 0 ? ((load2 - load1) / load1) * 100 : 0
    const sev: InsightSeverity = change > 5 && change < 15 ? "positive" : change >= 15 ? "warning" : "info"
    return ctx.makeInsight(alg, sev, `Weekly load change: ${change > 0 ? "+" : ""}${change.toFixed(0)}%. ${change > 5 && change < 15 ? "Good progressive overload (5-15%)." : change >= 15 ? "Excessive jump (>15%) — injury risk." : "Maintaining or reducing load."}`, Number(change.toFixed(0)), "% change", { low: 5, high: 15 }, { thisWeek: Math.round(load2), lastWeek: Math.round(load1) })
  },

  "workout-completion": (alg, ctx) => {
    if (ctx.workouts.length < 5) return null
    const durations = ctx.workouts.map((w) => (w.durationSeconds || 0) / 60)
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length
    const recent = durations.slice(-5)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const completionPct = avg > 0 ? (recentAvg / avg) * 100 : 100
    const sev: InsightSeverity = completionPct >= 90 ? "positive" : completionPct >= 70 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Workout completion: ${completionPct.toFixed(0)}% of typical duration (recent: ${Math.round(recentAvg)} min, avg: ${Math.round(avg)} min). ${completionPct >= 90 ? "Consistent completion." : "Recent workouts shorter than usual."}`, Number(completionPct.toFixed(0)), "%", { low: 75, high: 100 }, { recentAvg: Math.round(recentAvg), overallAvg: Math.round(avg) })
  },

  "sport-diversity": (alg, ctx) => {
    if (ctx.workouts.length < 5) return null
    const types = new Set(ctx.workouts.map((w) => ((w.data as Record<string, unknown>)?.activityType as string) || "unknown"))
    const diversity = types.size
    const sev: InsightSeverity = diversity >= 3 ? "positive" : diversity >= 2 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Sport diversity: ${diversity} different activity types. ${diversity >= 3 ? "Good cross-training — reduces injury risk." : "Limited variety — consider adding different activities."}`, diversity, "types", { low: 2, high: 5 }, { types: [...types] })
  },

  "training-periodization": (alg, ctx) => {
    if (ctx.workouts.length < 21) return null
    const now = Date.now()
    const weekLoads = [0, 0, 0]
    for (const w of ctx.workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); const wk = Math.floor(d / 7); if (wk < 3) weekLoads[wk]! += (w.durationSeconds || 0) / 60 }
    const building = weekLoads[2]! < weekLoads[1]! && weekLoads[1]! < weekLoads[0]!
    const deload = weekLoads[0]! < weekLoads[1]! * 0.7
    const sev: InsightSeverity = building ? "positive" : deload ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Periodization: Wk1=${Math.round(weekLoads[0]!)}min, Wk2=${Math.round(weekLoads[1]!)}min, Wk3=${Math.round(weekLoads[2]!)}min. ${building ? "Progressive build — good periodization." : deload ? "Recovery week detected." : "No clear periodization pattern."}`, Math.round(weekLoads[0]!), "min (this week)", { low: 100, high: 300 }, { weekLoads: weekLoads.map(Math.round) })
  },

  "race-readiness": (alg, ctx) => {
    if (ctx.workouts.length < 14) return null
    const rec = ctx.vals("recovery_score"); const rhr = ctx.vals("resting_heart_rate")
    const now = Date.now()
    let ctl = 0; let atl = 0
    const dailyLoad: number[] = Array(42).fill(0)
    for (const w of ctx.workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 42) dailyLoad[d]! += (w.durationSeconds || 0) / 60 }
    for (let i = 41; i >= 0; i--) { ctl = ctl + (dailyLoad[i]! - ctl) / 42; atl = atl + (dailyLoad[i]! - atl) / 7 }
    const freshness = ctl - atl
    const recScore = rec.length >= 3 ? rec.slice(-3).reduce((a, b) => a + b, 0) / 3 / 100 * 30 : 15
    const rhrScore = rhr.length >= 7 ? Math.min(30, Math.max(0, (70 - rhr.slice(-7).reduce((a, b) => a + b, 0) / 7) * 1.5)) : 15
    const readiness = Math.round(Math.max(0, Math.min(100, freshness + recScore + rhrScore + 30)))
    const sev: InsightSeverity = readiness >= 70 ? "positive" : readiness >= 45 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Race readiness: ${readiness}/100. Fitness=${ctl.toFixed(0)}, Freshness=${freshness.toFixed(0)}. ${readiness >= 70 ? "Peak form — go for it!" : readiness >= 45 ? "Moderate readiness." : "Not yet peaked — continue building."}`, readiness, "/100", { low: 40, high: 75 }, { ctl: ctl.toFixed(0), atl: atl.toFixed(0), freshness: freshness.toFixed(0) })
  },

  "endurance-index": (alg, ctx) => {
    if (ctx.workouts.length < 5) return null
    const longWorkouts = ctx.workouts.filter((w) => (w.durationSeconds || 0) > 2700).length
    const ratio = (longWorkouts / ctx.workouts.length) * 100
    const sev: InsightSeverity = ratio >= 30 ? "positive" : ratio >= 15 ? "info" : "warning"
    return ctx.makeInsight(alg, sev, `Endurance index: ${ratio.toFixed(0)}% of workouts >45min (${longWorkouts}/${ctx.workouts.length}). ${ratio >= 30 ? "Strong endurance focus." : "Add more long sessions for endurance gains."}`, Number(ratio.toFixed(0)), "%", { low: 15, high: 40 }, { longWorkouts, total: ctx.workouts.length })
  },
}
