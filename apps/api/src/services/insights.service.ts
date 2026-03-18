import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, lte, sql, desc, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export type InsightSeverity = "info" | "positive" | "warning" | "critical"
export type InsightCategory =
  | "cardio"
  | "sleep"
  | "activity"
  | "body"
  | "recovery"
  | "respiratory"
  | "metabolic"
  | "workout"
  | "trend"
  | "anomaly"

export interface Insight {
  id: string
  algorithmId: string
  title: string
  description: string
  category: InsightCategory
  severity: InsightSeverity
  value: number | null
  unit: string | null
  referenceRange: { low: number; high: number } | null
  metadata: Record<string, unknown>
}

export interface InsightAlgorithm {
  id: string
  name: string
  description: string
  category: InsightCategory
  requiredMetrics: string[]
}

interface DayStat {
  date: string
  avg: number | null
  min: number | null
  max: number | null
  sum: number | null
  count: number
}

// ── Helpers ─────────────────────────────────────────────────────

function makeInsight(
  alg: InsightAlgorithm,
  severity: InsightSeverity,
  description: string,
  value: number | null,
  unit: string | null,
  referenceRange: { low: number; high: number } | null,
  metadata: Record<string, unknown> = {},
): Insight {
  return {
    id: `insight-${alg.id}-${Date.now()}`,
    algorithmId: alg.id,
    title: alg.name,
    description,
    category: alg.category,
    severity,
    value,
    unit,
    referenceRange,
    metadata,
  }
}

function trend(values: number[]): "rising" | "falling" | "stable" {
  if (values.length < 3) return "stable"
  const half = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, half)
  const secondHalf = values.slice(half)
  const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const diff = ((avg2 - avg1) / (avg1 || 1)) * 100
  if (diff > 5) return "rising"
  if (diff < -5) return "falling"
  return "stable"
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function movingAverage(values: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return result
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  return (stddev(values) / mean) * 100
}

function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

// ── Algorithm Definitions ───────────────────────────────────────

export const ALGORITHMS: InsightAlgorithm[] = [
  // ── Cardio (1-10) ──
  { id: "rhr-zone", name: "Resting Heart Rate Zone", description: "Classifies resting HR into clinical zones (athlete/excellent/good/above average/poor)", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "rhr-trend", name: "Resting HR Trend", description: "Detects rising/falling RHR trends over the past 14 days", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "hr-recovery", name: "Heart Rate Recovery", description: "Estimates cardiac recovery capacity from post-workout HR drop", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "hrv-baseline", name: "HRV Baseline Status", description: "Compares current HRV to 30-day rolling baseline (Bayesian deviation)", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "hrv-trend", name: "HRV 14-Day Trend", description: "Tracks autonomic nervous system adaptation via HRV slope", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "hrv-coherence", name: "HRV Coherence Score", description: "Measures the coefficient of variation of daily HRV — low CV = high coherence", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "max-hr-estimate", name: "Estimated Max HR Utilization", description: "Percentage of age-predicted max HR reached during workouts", category: "cardio", requiredMetrics: ["heart_rate"] },
  { id: "hr-zones-dist", name: "HR Zone Distribution", description: "Breakdown of time spent in fat-burn, cardio, and peak zones", category: "cardio", requiredMetrics: ["heart_rate"] },
  { id: "cardiac-drift", name: "Cardiac Drift Detection", description: "Detects abnormal HR rise during steady-state exercise (decoupling)", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "rhr-anomaly", name: "Resting HR Anomaly", description: "Z-score anomaly detection on daily RHR", category: "cardio", requiredMetrics: ["resting_heart_rate"] },

  // ── Sleep (11-20) ──
  { id: "sleep-duration", name: "Sleep Duration Assessment", description: "Classifies nightly sleep vs CDC/NSF recommendations (7-9h adults)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-efficiency", name: "Sleep Efficiency", description: "Ratio of actual sleep to time in bed — targets >85%", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "deep-sleep-ratio", name: "Deep Sleep Ratio", description: "Evaluates SWS proportion — optimal is 15-25% of total sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "rem-sleep-ratio", name: "REM Sleep Ratio", description: "Evaluates REM proportion — optimal is 20-25% of total sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-consistency", name: "Sleep Schedule Consistency", description: "Measures bedtime/wake-time variability (social jet lag indicator)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-debt", name: "Cumulative Sleep Debt", description: "Tracks cumulative sleep deficit over 7 days vs 8h target", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-latency", name: "Sleep Onset Latency", description: "Estimates time to fall asleep — healthy is <20 minutes", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "awakening-freq", name: "Night Awakening Frequency", description: "Counts nocturnal awakenings — frequent awakenings impact restorative sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-score-trend", name: "Sleep Score Trend", description: "14-day trend analysis of composite sleep score", category: "sleep", requiredMetrics: ["sleep_score"] },
  { id: "sleep-hr-dip", name: "Nocturnal HR Dipping", description: "Evaluates the physiological heart rate dip during sleep (10-20% is normal)", category: "sleep", requiredMetrics: ["sleep", "heart_rate"] },

  // ── Activity (21-30) ──
  { id: "daily-steps-goal", name: "Daily Steps Goal", description: "Progress toward 10,000-step daily target with percentile ranking", category: "activity", requiredMetrics: ["steps"] },
  { id: "steps-trend", name: "Steps 14-Day Trend", description: "Moving-average trend of daily step count", category: "activity", requiredMetrics: ["steps"] },
  { id: "active-minutes-who", name: "WHO Activity Guidelines", description: "Evaluates weekly moderate+vigorous minutes vs WHO 150-min target", category: "activity", requiredMetrics: ["active_minutes"] },
  { id: "sedentary-alert", name: "Sedentary Behavior Alert", description: "Flags days with extremely low step counts (<2000 steps)", category: "activity", requiredMetrics: ["steps"] },
  { id: "calorie-balance", name: "Calorie Expenditure Trend", description: "7-day rolling average of total calorie burn", category: "activity", requiredMetrics: ["calories"] },
  { id: "distance-weekly", name: "Weekly Distance Accumulation", description: "Total distance covered in the past 7 days with trend", category: "activity", requiredMetrics: ["distance"] },
  { id: "activity-consistency", name: "Activity Consistency Index", description: "Coefficient of variation of daily steps — lower = more consistent", category: "activity", requiredMetrics: ["steps"] },
  { id: "peak-activity-time", name: "Peak Activity Time", description: "Identifies the time of day with highest average step count", category: "activity", requiredMetrics: ["steps"] },
  { id: "floors-climbed", name: "Floors Climbed Assessment", description: "Daily floor count vs 10-floor recommendation for cardiovascular benefit", category: "activity", requiredMetrics: ["floors"] },
  { id: "inactivity-streak", name: "Inactivity Streak Detection", description: "Consecutive days below 5000 steps", category: "activity", requiredMetrics: ["steps"] },

  // ── Body Metrics (31-37) ──
  { id: "bmi-classification", name: "BMI Classification", description: "WHO BMI category (underweight/normal/overweight/obese)", category: "body", requiredMetrics: ["bmi"] },
  { id: "weight-trend", name: "Weight 30-Day Trend", description: "Linear regression on daily weight to detect gain/loss trajectory", category: "body", requiredMetrics: ["weight"] },
  { id: "body-fat-zone", name: "Body Fat Percentage Zone", description: "Classifies body fat into athletic/fitness/acceptable/obese ranges", category: "body", requiredMetrics: ["body_fat"] },
  { id: "weight-volatility", name: "Weight Volatility", description: "Day-to-day weight fluctuation — high volatility may indicate fluid retention", category: "body", requiredMetrics: ["weight"] },
  { id: "bp-classification", name: "Blood Pressure Classification", description: "AHA blood pressure category (normal/elevated/stage1/stage2/crisis)", category: "body", requiredMetrics: ["blood_pressure"] },
  { id: "bp-trend", name: "Blood Pressure Trend", description: "14-day systolic/diastolic trend analysis", category: "body", requiredMetrics: ["blood_pressure"] },
  { id: "temp-anomaly", name: "Body Temperature Anomaly", description: "Flags body temperature readings outside 36.1-37.2°C normal range", category: "body", requiredMetrics: ["temperature"] },

  // ── Recovery & Readiness (38-43) ──
  { id: "recovery-status", name: "Recovery Score Status", description: "Categorizes current recovery level (poor/moderate/good/optimal)", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "recovery-trend", name: "Recovery Score Trend", description: "7-day recovery trajectory with momentum indicator", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "readiness-status", name: "Readiness Score Status", description: "Evaluates physical readiness for intense training", category: "recovery", requiredMetrics: ["readiness_score"] },
  { id: "strain-balance", name: "Strain vs Recovery Balance", description: "Compares cumulative strain against recovery capacity", category: "recovery", requiredMetrics: ["strain_score", "recovery_score"] },
  { id: "stress-level", name: "Stress Level Assessment", description: "Classifies average daily stress score (low/moderate/high/very high)", category: "recovery", requiredMetrics: ["stress"] },
  { id: "stress-trend", name: "Stress 14-Day Trend", description: "Trend analysis of daily stress levels", category: "recovery", requiredMetrics: ["stress"] },

  // ── Respiratory & SpO2 (44-48) ──
  { id: "spo2-status", name: "Blood Oxygen Status", description: "Classifies SpO2 level (normal ≥95%, low 90-94%, critical <90%)", category: "respiratory", requiredMetrics: ["spo2"] },
  { id: "spo2-trend", name: "SpO2 7-Day Trend", description: "Tracks blood oxygen saturation trend", category: "respiratory", requiredMetrics: ["spo2"] },
  { id: "resp-rate-status", name: "Respiratory Rate Status", description: "Classifies breathing rate (normal 12-20 brpm)", category: "respiratory", requiredMetrics: ["respiratory_rate"] },
  { id: "resp-rate-trend", name: "Respiratory Rate Trend", description: "14-day trend analysis of respiration rate", category: "respiratory", requiredMetrics: ["respiratory_rate"] },
  { id: "resp-sleep-corr", name: "Respiratory-Sleep Correlation", description: "Correlates respiratory rate changes with sleep quality", category: "respiratory", requiredMetrics: ["respiratory_rate", "sleep"] },

  // ── Metabolic (49-51) ──
  { id: "glucose-status", name: "Blood Glucose Status", description: "Classifies fasting glucose (normal <100, prediabetic 100-125, diabetic ≥126 mg/dL)", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "glucose-variability", name: "Glucose Variability Index", description: "Coefficient of variation of blood glucose — high CV suggests poor glycemic control", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "glucose-trend", name: "Glucose 14-Day Trend", description: "Trend analysis of blood glucose levels", category: "metabolic", requiredMetrics: ["blood_glucose"] },

  // ── Workout Performance (52-55) ──
  { id: "training-load", name: "Acute Training Load", description: "7-day cumulative workout duration weighted by intensity (TRIMP-like)", category: "workout", requiredMetrics: ["workout"] },
  { id: "training-monotony", name: "Training Monotony", description: "Variability of daily training load — high monotony increases overtraining risk", category: "workout", requiredMetrics: ["workout"] },
  { id: "workout-frequency", name: "Workout Frequency", description: "Weekly workout count with consistency analysis", category: "workout", requiredMetrics: ["workout"] },
  { id: "vo2max-estimate", name: "Estimated VO2max Proxy", description: "Estimates aerobic fitness from resting HR and activity level (Cooper/Uth formula proxy)", category: "workout", requiredMetrics: ["resting_heart_rate", "workout"] },

  // ── Cross-Domain / Composite (56-70) ──
  { id: "sleep-activity-corr", name: "Sleep-Activity Correlation", description: "Correlates daily step count with subsequent night's sleep quality", category: "trend", requiredMetrics: ["steps", "sleep"] },
  { id: "hr-sleep-quality", name: "HR-Sleep Quality Link", description: "Correlates resting HR variations with sleep score changes", category: "trend", requiredMetrics: ["resting_heart_rate", "sleep_score"] },
  { id: "exercise-recovery-efficiency", name: "Exercise Recovery Efficiency", description: "Measures how quickly recovery score rebounds after hard workouts", category: "recovery", requiredMetrics: ["recovery_score", "workout"] },
  { id: "stress-sleep-impact", name: "Stress-Sleep Impact", description: "Quantifies the impact of daily stress on sleep duration", category: "trend", requiredMetrics: ["stress", "sleep"] },
  { id: "weekend-weekday-activity", name: "Weekend vs Weekday Activity", description: "Compares average weekend activity to weekday patterns", category: "activity", requiredMetrics: ["steps"] },
  { id: "morning-readiness", name: "Morning Readiness Prediction", description: "Predicts readiness from previous night's sleep metrics", category: "recovery", requiredMetrics: ["sleep", "readiness_score"] },
  { id: "training-adaptation", name: "Training Adaptation Index", description: "Composite index from RHR trend + HRV trend + workout progression", category: "workout", requiredMetrics: ["resting_heart_rate", "heart_rate_variability", "workout"] },
  { id: "holistic-wellness", name: "Holistic Wellness Score", description: "Composite 0-100 score from sleep, activity, HR, and recovery metrics", category: "trend", requiredMetrics: ["steps", "sleep", "resting_heart_rate"] },
  { id: "circadian-stability", name: "Circadian Rhythm Stability", description: "Measures consistency of daily activity onset and sleep timing", category: "sleep", requiredMetrics: ["steps", "sleep"] },
  { id: "overtraining-risk", name: "Overtraining Risk Score", description: "Multi-factor overtraining risk from HR trend + recovery + training load", category: "workout", requiredMetrics: ["resting_heart_rate", "workout"] },
  { id: "detraining-risk", name: "Detraining Risk Detection", description: "Detects prolonged reduction in training stimulus over 14+ days", category: "workout", requiredMetrics: ["workout"] },
  { id: "fitness-fatigue", name: "Fitness-Fatigue Balance", description: "Banister impulse-response model proxy (chronic vs acute load)", category: "workout", requiredMetrics: ["workout"] },
  { id: "sleep-workout-timing", name: "Sleep-Workout Timing", description: "Analyzes if workout timing affects sleep quality", category: "trend", requiredMetrics: ["sleep", "workout"] },
  { id: "metabolic-efficiency", name: "Metabolic Efficiency Index", description: "Calories burned per active minute — trends in metabolic efficiency", category: "metabolic", requiredMetrics: ["calories", "active_minutes"] },
  { id: "hydration-proxy", name: "Hydration Status Proxy", description: "Estimates hydration status from RHR elevation + temperature", category: "body", requiredMetrics: ["resting_heart_rate", "temperature"] },

  // ── Advanced Cardio (71-83) ──
  { id: "hrv-rmssd-proxy", name: "HRV RMSSD Stability", description: "Tracks HRV stability using rolling standard deviation of daily values", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "rhr-seasonal", name: "RHR Seasonal Variation", description: "Detects seasonal patterns in resting heart rate", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "autonomic-balance", name: "Cardiac Autonomic Balance", description: "Sympathetic/parasympathetic proxy from combined HR and HRV data", category: "cardio", requiredMetrics: ["resting_heart_rate", "heart_rate_variability"] },
  { id: "aerobic-threshold", name: "Aerobic Threshold Estimate", description: "Estimated aerobic threshold from workout HR distribution", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "hr-drift-rate", name: "HR Drift Rate", description: "Rate of cardiac drift per hour during sustained exercise", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "post-exercise-recovery-1min", name: "1-Minute HR Recovery", description: "Estimates 1-minute post-exercise HR recovery from workout data", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "morning-rhr-spike", name: "Morning RHR Elevation", description: "Detects abnormal morning RHR spikes suggesting illness or stress", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "hr-circadian", name: "HR Circadian Pattern", description: "Analyzes 24-hour heart rate pattern and nocturnal dipping", category: "cardio", requiredMetrics: ["heart_rate"] },
  { id: "bradycardia-flag", name: "Bradycardia Detection", description: "Flags resting heart rate consistently below 50 bpm in non-athletes", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "tachycardia-flag", name: "Tachycardia Detection", description: "Flags resting heart rate consistently above 100 bpm", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "hr-exercise-reactivity", name: "HR Exercise Reactivity", description: "How quickly HR rises at exercise onset — chronotropic competence proxy", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "cardiovascular-age", name: "Cardiovascular Age Estimate", description: "Estimated cardiovascular age from RHR and activity metrics", category: "cardio", requiredMetrics: ["resting_heart_rate", "steps"] },
  { id: "parasympathetic-reactivation", name: "Parasympathetic Reactivation", description: "Post-exercise vagal reactivation speed from HR recovery patterns", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },

  // ── Advanced Sleep (84-95) ──
  { id: "sleep-architecture", name: "Sleep Architecture Score", description: "Composite score of sleep stage proportions vs ideal distribution", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "rem-latency", name: "REM Sleep Latency", description: "Estimates time from sleep onset to first REM period", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-fragmentation", name: "Sleep Fragmentation Index", description: "Quantifies sleep disruption beyond simple awakening count", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "circadian-phase-shift", name: "Circadian Phase Shift", description: "Detects gradual bedtime/waketime shifts over 14 days", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "weekend-sleep-rebound", name: "Weekend Sleep Rebound", description: "Compares weekend vs weekday sleep duration — social jet lag indicator", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-regularity-index", name: "Sleep Regularity Index", description: "Probability of consistent sleep/wake state across days (SRI)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sws-adequacy", name: "Slow-Wave Sleep Adequacy", description: "Deep sleep minutes vs age-adjusted targets for physical restoration", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-onset-var", name: "Sleep Onset Variability", description: "Night-to-night variation in sleep onset times", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "terminal-wakefulness", name: "Terminal Wakefulness Detection", description: "Detects patterns of early morning awakening (waking 2+ hours early)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-pressure", name: "Sleep Pressure Accumulation", description: "Estimated adenosine-driven sleep pressure from wake duration", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "rem-deficit", name: "REM Sleep Deficit", description: "Cumulative REM sleep shortfall over 7 days vs 90-min target", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "light-sleep-excess", name: "Light Sleep Proportion", description: "Flags excessive light sleep (>60%) at expense of restorative stages", category: "sleep", requiredMetrics: ["sleep"] },

  // ── Advanced Activity (96-107) ──
  { id: "step-cadence", name: "Step Cadence Analysis", description: "Average steps per active minute — indicates walking vs running", category: "activity", requiredMetrics: ["steps", "active_minutes"] },
  { id: "movement-distribution", name: "Daily Movement Distribution", description: "Even vs clustered activity pattern analysis (MVPA bouts)", category: "activity", requiredMetrics: ["steps"] },
  { id: "exercise-adherence", name: "Exercise Adherence Rate", description: "Percentage of days meeting 10K step or 30-min activity goal", category: "activity", requiredMetrics: ["steps"] },
  { id: "weekend-warrior", name: "Weekend Warrior Index", description: "Activity concentration on weekends vs evenly spread across week", category: "activity", requiredMetrics: ["steps"] },
  { id: "intensity-mix", name: "Activity Intensity Mix", description: "Proportion of low, moderate, and vigorous activity", category: "activity", requiredMetrics: ["steps", "heart_rate"] },
  { id: "step-asymmetry", name: "Step Count Anomaly Detection", description: "Detects unusually asymmetric daily step patterns (possible injury)", category: "anomaly", requiredMetrics: ["steps"] },
  { id: "movement-streak", name: "Active Movement Streak", description: "Longest consecutive days above 7500 steps", category: "activity", requiredMetrics: ["steps"] },
  { id: "hourly-activity-pattern", name: "Hourly Activity Heatmap", description: "Activity intensity distribution across hours of the day", category: "activity", requiredMetrics: ["steps"] },
  { id: "calorie-deficit-surplus", name: "Daily Calorie Balance", description: "Estimated calorie surplus/deficit from burn vs 2000 kcal baseline", category: "metabolic", requiredMetrics: ["calories"] },
  { id: "recovery-day-detection", name: "Active Recovery Days", description: "Identifies light activity days between hard training sessions", category: "recovery", requiredMetrics: ["steps", "workout"] },
  { id: "distance-pr-check", name: "Distance Personal Record Check", description: "Checks if recent distances approach or exceed personal records", category: "activity", requiredMetrics: ["distance"] },
  { id: "daily-energy-expenditure", name: "Total Daily Energy Expenditure", description: "7-day TDEE estimation from calorie burn data", category: "metabolic", requiredMetrics: ["calories"] },

  // ── Advanced Body Composition (108-115) ──
  { id: "body-composition-trend", name: "Body Composition Trend", description: "Combined weight + body fat trajectory analysis", category: "body", requiredMetrics: ["weight", "body_fat"] },
  { id: "lean-mass-estimate", name: "Lean Mass Estimate", description: "Estimated lean body mass from weight and body fat percentage", category: "body", requiredMetrics: ["weight", "body_fat"] },
  { id: "bmi-trend", name: "BMI Trend Analysis", description: "30-day BMI trajectory with rate of change", category: "body", requiredMetrics: ["bmi"] },
  { id: "weight-goal-projection", name: "Weight Goal Projection", description: "Projects days to reach target weight at current weekly rate", category: "body", requiredMetrics: ["weight"] },
  { id: "fluid-retention-pattern", name: "Fluid Retention Pattern", description: "Detects periodic weight spikes suggesting fluid retention cycles", category: "body", requiredMetrics: ["weight"] },
  { id: "metabolic-rate-estimate", name: "Basal Metabolic Rate Estimate", description: "Estimated BMR from weight and activity level", category: "metabolic", requiredMetrics: ["weight", "calories"] },
  { id: "body-fat-trend", name: "Body Fat Trend", description: "30-day body fat percentage trend with linear projection", category: "body", requiredMetrics: ["body_fat"] },
  { id: "weight-plateau", name: "Weight Plateau Detection", description: "Detects weight loss/gain plateaus over 14+ days", category: "body", requiredMetrics: ["weight"] },

  // ── Advanced Recovery & Stress (116-127) ──
  { id: "recovery-time-needed", name: "Recovery Time Estimate", description: "Estimated recovery hours needed based on recent strain load", category: "recovery", requiredMetrics: ["strain_score", "recovery_score"] },
  { id: "stress-recovery-ratio", name: "Stress-Recovery Ratio", description: "Balance between cumulative stress and recovery over 7 days", category: "recovery", requiredMetrics: ["stress", "recovery_score"] },
  { id: "allostatic-load", name: "Allostatic Load Estimate", description: "Cumulative physiological stress burden from multiple biomarkers", category: "recovery", requiredMetrics: ["stress", "resting_heart_rate", "sleep"] },
  { id: "burnout-risk", name: "Burnout Risk Indicator", description: "Multi-week stress accumulation + declining recovery pattern", category: "recovery", requiredMetrics: ["stress", "recovery_score"] },
  { id: "recovery-velocity", name: "Recovery Velocity", description: "Speed of recovery score improvement after dips below 50%", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "stress-reactivity", name: "Stress Reactivity Index", description: "Magnitude of stress spikes relative to personal baseline", category: "recovery", requiredMetrics: ["stress"] },
  { id: "weekend-recovery", name: "Weekend Recovery Pattern", description: "Compares weekend vs weekday recovery scores", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "stress-habituation", name: "Stress Habituation Trend", description: "Whether stress response is adapting (declining) over time", category: "recovery", requiredMetrics: ["stress"] },
  { id: "composite-recovery", name: "Neural Recovery Index", description: "Composite recovery from HRV + sleep quality + stress level", category: "recovery", requiredMetrics: ["heart_rate_variability", "sleep", "stress"] },
  { id: "readiness-prediction", name: "Readiness Prediction", description: "Predicts next-day readiness from current recovery + sleep + strain", category: "recovery", requiredMetrics: ["recovery_score", "sleep", "strain_score"] },
  { id: "strain-accumulation", name: "Strain Accumulation Alert", description: "Warns when 7-day cumulative strain exceeds recovery capacity", category: "recovery", requiredMetrics: ["strain_score"] },
  { id: "recovery-consistency", name: "Recovery Consistency Index", description: "Variability in daily recovery scores — low CV = stable recovery", category: "recovery", requiredMetrics: ["recovery_score"] },

  // ── Advanced Respiratory & SpO2 (128-135) ──
  { id: "sleep-breathing", name: "Sleep Breathing Quality", description: "Respiratory rate variability during sleep periods", category: "respiratory", requiredMetrics: ["respiratory_rate", "sleep"] },
  { id: "respiratory-fitness", name: "Respiratory Fitness Index", description: "Respiratory rate improvement trend correlated with fitness gains", category: "respiratory", requiredMetrics: ["respiratory_rate", "workout"] },
  { id: "dyspnea-risk", name: "Dyspnea Risk Score", description: "Risk estimation from elevated respiratory rate + low SpO2", category: "respiratory", requiredMetrics: ["respiratory_rate", "spo2"] },
  { id: "nocturnal-desat", name: "Nocturnal Desaturation", description: "Detects SpO2 drops during sleep indicative of sleep-disordered breathing", category: "respiratory", requiredMetrics: ["spo2", "sleep"] },
  { id: "breathing-efficiency", name: "Breathing Efficiency Ratio", description: "Respiratory rate to heart rate ratio during exercise", category: "respiratory", requiredMetrics: ["respiratory_rate", "heart_rate"] },
  { id: "respiratory-reserve", name: "Respiratory Reserve", description: "Gap between resting and peak exercise respiratory rate", category: "respiratory", requiredMetrics: ["respiratory_rate"] },
  { id: "spo2-variability", name: "SpO2 Variability", description: "Day-to-day SpO2 fluctuation — high variability may indicate issues", category: "respiratory", requiredMetrics: ["spo2"] },
  { id: "ventilatory-threshold", name: "Ventilatory Threshold Proxy", description: "Estimated ventilatory threshold from respiratory rate during exercise", category: "respiratory", requiredMetrics: ["respiratory_rate", "heart_rate", "workout"] },

  // ── Advanced Metabolic (136-143) ──
  { id: "glucose-meal-response", name: "Post-Meal Glucose Response", description: "Detects glucose spikes suggesting large post-meal glycemic responses", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "fasting-glucose-trend", name: "Fasting Glucose Trend", description: "Trend of morning/fasting glucose readings over 14 days", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "dawn-phenomenon", name: "Dawn Phenomenon Detection", description: "Detects early morning glucose rise pattern (4-8 AM elevation)", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "glucose-exercise-response", name: "Post-Exercise Glucose", description: "Glucose changes in the hours following workouts", category: "metabolic", requiredMetrics: ["blood_glucose", "workout"] },
  { id: "time-in-range", name: "Time in Glucose Range", description: "Percentage of glucose readings within 70-180 mg/dL target range", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "hypoglycemia-risk", name: "Hypoglycemia Risk", description: "Frequency and severity of low glucose readings (<70 mg/dL)", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "insulin-sensitivity-proxy", name: "Insulin Sensitivity Proxy", description: "Glucose variability as a proxy for insulin sensitivity", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "calorie-burn-efficiency", name: "Calorie Burn Efficiency", description: "Calories burned per kg of body weight during activity", category: "metabolic", requiredMetrics: ["calories", "weight"] },

  // ── Advanced Workout Performance (144-155) ──
  { id: "training-intensity-dist", name: "Training Intensity Distribution", description: "Polarized vs threshold vs pyramidal training analysis from HR zones", category: "workout", requiredMetrics: ["heart_rate", "workout"] },
  { id: "aerobic-decoupling", name: "Aerobic Decoupling Rate", description: "Pace:HR ratio drift over long efforts — aerobic fitness indicator", category: "workout", requiredMetrics: ["heart_rate", "workout"] },
  { id: "training-stress-score", name: "Training Stress Score", description: "Normalized per-session training stress from duration and intensity", category: "workout", requiredMetrics: ["workout"] },
  { id: "chronic-training-load", name: "Chronic Training Load (CTL)", description: "42-day exponentially weighted average of daily training stress", category: "workout", requiredMetrics: ["workout"] },
  { id: "acute-chronic-ratio", name: "Acute:Chronic Workload Ratio", description: "7-day vs 28-day load ratio — injury risk indicator (sweet spot: 0.8-1.3)", category: "workout", requiredMetrics: ["workout"] },
  { id: "performance-efficiency", name: "Performance Efficiency Factor", description: "Normalized speed per unit of heart rate — running/cycling efficiency", category: "workout", requiredMetrics: ["heart_rate", "workout"] },
  { id: "progressive-overload", name: "Progressive Overload Tracking", description: "Whether training stimulus is progressively increasing over 4 weeks", category: "workout", requiredMetrics: ["workout"] },
  { id: "workout-completion", name: "Workout Completion Rate", description: "Ratio of actual to typical workout duration — consistency metric", category: "workout", requiredMetrics: ["workout"] },
  { id: "sport-diversity", name: "Sport Diversity Index", description: "Variety of workout types — cross-training reduces injury risk", category: "workout", requiredMetrics: ["workout"] },
  { id: "training-periodization", name: "Training Periodization Analysis", description: "Detects build/recovery weeks in macro training cycle", category: "workout", requiredMetrics: ["workout"] },
  { id: "race-readiness", name: "Race Readiness Score", description: "Composite readiness from fitness + freshness + recovery for peak performance", category: "workout", requiredMetrics: ["workout", "recovery_score", "resting_heart_rate"] },
  { id: "endurance-index", name: "Endurance Index", description: "Ratio of long (>45min) to short workouts — endurance capacity indicator", category: "workout", requiredMetrics: ["workout"] },
]

// ── Service ─────────────────────────────────────────────────────

export class InsightsService {
  private get db() {
    return getDb()
  }

  /** Return available algorithm definitions. */
  listAlgorithms(): InsightAlgorithm[] {
    return ALGORITHMS
  }

  /** Run all applicable algorithms for a user and return insights. */
  async generateInsights(
    userId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<Insight[]> {
    const to = opts.to ?? new Date()
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all metrics in the range in one query
    const rows = await this.db
      .select({
        metricType: healthMetrics.metricType,
        recordedAt: healthMetrics.recordedAt,
        value: healthMetrics.value,
        data: healthMetrics.data,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          gte(healthMetrics.recordedAt, from),
          lte(healthMetrics.recordedAt, to),
        ),
      )
      .orderBy(asc(healthMetrics.recordedAt))

    // Group by metric type
    const byType = new Map<string, Array<{ recordedAt: Date; value: number | null; data: Record<string, unknown> | null }>>()
    for (const r of rows) {
      const arr = byType.get(r.metricType) ?? []
      arr.push({ recordedAt: new Date(r.recordedAt), value: r.value, data: r.data as Record<string, unknown> | null })
      byType.set(r.metricType, arr)
    }

    // Fetch workout events
    const workoutRows = await this.db
      .select({
        startedAt: events.startedAt,
        endedAt: events.endedAt,
        durationSeconds: events.durationSeconds,
        avgHeartRate: events.avgHeartRate,
        maxHeartRate: events.maxHeartRate,
        caloriesKcal: events.caloriesKcal,
        distanceMeters: events.distanceMeters,
        data: events.data,
      })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.eventType, "workout"),
          gte(events.startedAt, from),
          lte(events.startedAt, to),
        ),
      )
      .orderBy(asc(events.startedAt))

    const insights: Insight[] = []

    for (const alg of ALGORITHMS) {
      try {
        const insight = this.runAlgorithm(alg, byType, workoutRows)
        if (insight) insights.push(insight)
      } catch {
        // Skip algorithm if it fails
      }
    }

    return insights
  }

  private runAlgorithm(
    alg: InsightAlgorithm,
    byType: Map<string, Array<{ recordedAt: Date; value: number | null; data: Record<string, unknown> | null }>>,
    workouts: Array<{ startedAt: Date; endedAt: Date | null; durationSeconds: number | null; avgHeartRate: number | null; maxHeartRate: number | null; caloriesKcal: number | null; distanceMeters: number | null; data: unknown }>,
  ): Insight | null {
    const vals = (type: string) => (byType.get(type) ?? []).filter((r) => r.value != null).map((r) => r.value!)
    const recs = (type: string) => byType.get(type) ?? []
    const sorted = (v: number[]) => [...v].sort((a, b) => a - b)

    switch (alg.id) {
      // ── Cardio ──────────────────────────────────────────────
      case "rhr-zone": {
        const v = vals("resting_heart_rate")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let zone: string
        let sev: InsightSeverity
        if (avg < 50) { zone = "Athlete"; sev = "positive" }
        else if (avg < 60) { zone = "Excellent"; sev = "positive" }
        else if (avg < 70) { zone = "Good"; sev = "info" }
        else if (avg < 80) { zone = "Above Average"; sev = "warning" }
        else { zone = "Poor"; sev = "critical" }
        return makeInsight(alg, sev, `Your average resting HR is ${Math.round(avg)} bpm — classified as "${zone}".`, Math.round(avg), "bpm", { low: 50, high: 80 }, { zone, samples: v.length })
      }

      case "rhr-trend": {
        const v = vals("resting_heart_rate")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Resting HR is ${t} over the past ${last14.length} days. ${t === "rising" ? "Rising RHR may indicate fatigue or stress." : t === "falling" ? "Falling RHR suggests improving cardiovascular fitness." : "RHR is stable."}`, Math.round(last14[last14.length - 1]!), "bpm", null, { trend: t, dataPoints: last14.length })
      }

      case "hr-recovery": {
        if (workouts.length === 0) return null
        const maxHRs = workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
        const avgMaxHR = maxHRs.length > 0 ? maxHRs.reduce((a, b) => a + b, 0) / maxHRs.length : null
        const rhr = vals("resting_heart_rate")
        const avgRHR = rhr.length > 0 ? rhr.reduce((a, b) => a + b, 0) / rhr.length : null
        if (!avgMaxHR || !avgRHR) return null
        const recovery = avgMaxHR - avgRHR
        const sev: InsightSeverity = recovery > 60 ? "positive" : recovery > 40 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated HR recovery capacity: ${Math.round(recovery)} bpm. ${recovery > 60 ? "Excellent cardiac recovery." : recovery > 40 ? "Good recovery capacity." : "Consider improving aerobic base."}`, Math.round(recovery), "bpm", { low: 40, high: 70 }, { avgMaxHR: Math.round(avgMaxHR), avgRHR: Math.round(avgRHR) })
      }

      case "hrv-baseline": {
        const v = vals("heart_rate_variability")
        if (v.length < 7) return null
        const baseline = v.slice(0, -7)
        const recent = v.slice(-7)
        const bMean = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : recent.reduce((a, b) => a + b, 0) / recent.length
        const rMean = recent.reduce((a, b) => a + b, 0) / recent.length
        const deviationPct = ((rMean - bMean) / (bMean || 1)) * 100
        const sev: InsightSeverity = deviationPct < -15 ? "warning" : deviationPct > 10 ? "positive" : "info"
        return makeInsight(alg, sev, `HRV is ${deviationPct > 0 ? "+" : ""}${Math.round(deviationPct)}% vs your 30-day baseline (${Math.round(bMean)} ms). ${deviationPct < -15 ? "Significant drop — consider rest." : deviationPct > 10 ? "Above baseline — great recovery." : "Within normal range."}`, Math.round(rMean), "ms", null, { baseline: Math.round(bMean), deviation: Math.round(deviationPct) })
      }

      case "hrv-trend": {
        const v = vals("heart_rate_variability")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `HRV trend is ${t} over ${last14.length} days. ${t === "rising" ? "Improving autonomic balance." : t === "falling" ? "Declining HRV may reflect stress accumulation." : "Stable autonomic function."}`, Math.round(last14[last14.length - 1]!), "ms", null, { trend: t })
      }

      case "hrv-coherence": {
        const v = vals("heart_rate_variability")
        if (v.length < 7) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 10 ? "positive" : cv < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `HRV coherence: CV=${Math.round(cv)}%. ${cv < 10 ? "High coherence — consistent autonomic function." : cv < 20 ? "Moderate coherence." : "High variability — erratic recovery patterns."}`, Math.round(cv), "%", { low: 0, high: 20 }, { samples: v.length })
      }

      case "max-hr-estimate": {
        const hrVals = vals("heart_rate")
        if (hrVals.length === 0) return null
        const maxObserved = Math.max(...hrVals)
        const sev: InsightSeverity = maxObserved > 180 ? "warning" : maxObserved > 150 ? "positive" : "info"
        return makeInsight(alg, sev, `Peak recorded HR: ${maxObserved} bpm. ${maxObserved > 180 ? "High-intensity peaks detected." : "Moderate intensity levels observed."}`, maxObserved, "bpm", null, { maxObserved })
      }

      case "hr-zones-dist": {
        const hrVals = vals("heart_rate")
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
        return makeInsight(alg, "info", `HR zone distribution: ${pcts.rest}% rest, ${pcts.fatBurn}% fat-burn, ${pcts.cardio}% cardio, ${pcts.peak}% peak.`, pcts.cardio + pcts.peak, "%", null, pcts)
      }

      case "cardiac-drift": {
        if (workouts.length < 3) return null
        const longWorkouts = workouts.filter((w) => (w.durationSeconds ?? 0) > 1800 && w.avgHeartRate && w.maxHeartRate)
        if (longWorkouts.length === 0) return null
        const drifts = longWorkouts.map((w) => ((w.maxHeartRate! - w.avgHeartRate!) / w.avgHeartRate!) * 100)
        const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
        const sev: InsightSeverity = avgDrift > 15 ? "warning" : avgDrift > 8 ? "info" : "positive"
        return makeInsight(alg, sev, `Average cardiac drift: ${Math.round(avgDrift)}% in long sessions. ${avgDrift > 15 ? "Significant decoupling — dehydration or insufficient base fitness." : "Normal drift range."}`, Math.round(avgDrift), "%", { low: 0, high: 15 }, { workoutsAnalyzed: longWorkouts.length })
      }

      case "rhr-anomaly": {
        const v = vals("resting_heart_rate")
        if (v.length < 10) return null
        const mean = v.reduce((a, b) => a + b, 0) / v.length
        const sd = stddev(v)
        const latest = v[v.length - 1]!
        const zScore = sd > 0 ? (latest - mean) / sd : 0
        const sev: InsightSeverity = Math.abs(zScore) > 2 ? "critical" : Math.abs(zScore) > 1.5 ? "warning" : "info"
        return makeInsight(alg, sev, `Latest RHR z-score: ${zScore.toFixed(1)} (${latest} bpm vs mean ${Math.round(mean)}). ${Math.abs(zScore) > 2 ? "Significant anomaly detected!" : "Within expected range."}`, latest, "bpm", { low: Math.round(mean - 2 * sd), high: Math.round(mean + 2 * sd) }, { zScore: Number(zScore.toFixed(2)), mean: Math.round(mean), stddev: Math.round(sd) })
      }

      // ── Sleep ───────────────────────────────────────────────
      case "sleep-duration": {
        const sleepRecs = recs("sleep")
        if (sleepRecs.length === 0) return null
        const durations = sleepRecs.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0)).filter((d) => d > 0)
        if (durations.length === 0) return null
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length
        const hours = avg / 60
        const sev: InsightSeverity = hours >= 7 && hours <= 9 ? "positive" : hours >= 6 ? "warning" : "critical"
        return makeInsight(alg, sev, `Average sleep: ${hours.toFixed(1)}h/night. ${hours >= 7 ? "Meeting CDC recommendation of 7-9 hours." : hours >= 6 ? "Slightly below recommendation." : "Significantly below recommended 7-9 hours."}`, Math.round(avg), "min", { low: 420, high: 540 }, { avgHours: Number(hours.toFixed(1)), nights: durations.length })
      }

      case "sleep-efficiency": {
        const sleepRecs = recs("sleep")
        if (sleepRecs.length === 0) return null
        const efficiencies = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; startTime?: string; endTime?: string; stages?: { awake?: number } } | null
          if (!d?.durationMinutes) return null
          const awake = d.stages?.awake ?? 0
          const totalTime = d.durationMinutes + awake
          return totalTime > 0 ? (d.durationMinutes / totalTime) * 100 : null
        }).filter((e): e is number => e != null)
        if (efficiencies.length === 0) return null
        const avg = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
        const sev: InsightSeverity = avg >= 85 ? "positive" : avg >= 75 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep efficiency: ${Math.round(avg)}%. ${avg >= 85 ? "Excellent — minimal wakefulness." : "Below 85% target — fragmented sleep."}`, Math.round(avg), "%", { low: 85, high: 100 }, { nights: efficiencies.length })
      }

      case "deep-sleep-ratio": {
        const sleepRecs = recs("sleep")
        const ratios = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; stages?: { deep?: number } } | null
          if (!d?.stages?.deep || !d.durationMinutes) return null
          return (d.stages.deep / d.durationMinutes) * 100
        }).filter((r): r is number => r != null)
        if (ratios.length === 0) return null
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
        const sev: InsightSeverity = avg >= 15 && avg <= 25 ? "positive" : avg >= 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Deep sleep: ${Math.round(avg)}% of total. ${avg >= 15 && avg <= 25 ? "Optimal range for physical restoration." : avg < 15 ? "Below optimal — may impact recovery." : "Above typical range."}`, Math.round(avg), "%", { low: 15, high: 25 }, { nights: ratios.length })
      }

      case "rem-sleep-ratio": {
        const sleepRecs = recs("sleep")
        const ratios = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; stages?: { rem?: number } } | null
          if (!d?.stages?.rem || !d.durationMinutes) return null
          return (d.stages.rem / d.durationMinutes) * 100
        }).filter((r): r is number => r != null)
        if (ratios.length === 0) return null
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
        const sev: InsightSeverity = avg >= 20 && avg <= 25 ? "positive" : avg >= 15 ? "info" : "warning"
        return makeInsight(alg, sev, `REM sleep: ${Math.round(avg)}% of total. ${avg >= 20 ? "Good for memory consolidation and learning." : "Below optimal — may impact cognitive recovery."}`, Math.round(avg), "%", { low: 20, high: 25 }, { nights: ratios.length })
      }

      case "sleep-consistency": {
        const sleepRecs = recs("sleep")
        const bedtimes = sleepRecs.map((r) => {
          const d = r.data as { startTime?: string } | null
          if (!d?.startTime) return null
          const dt = new Date(d.startTime)
          return dt.getHours() * 60 + dt.getMinutes()
        }).filter((t): t is number => t != null)
        if (bedtimes.length < 5) return null
        const sd = stddev(bedtimes)
        const sev: InsightSeverity = sd < 30 ? "positive" : sd < 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Bedtime variability: ±${Math.round(sd)} min. ${sd < 30 ? "Very consistent sleep schedule." : sd < 60 ? "Moderate consistency." : "Highly irregular — social jet lag risk."}`, Math.round(sd), "min", { low: 0, high: 30 }, { nights: bedtimes.length })
      }

      case "sleep-debt": {
        const sleepRecs = recs("sleep")
        const last7 = sleepRecs.slice(-7)
        const durations = last7.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0))
        if (durations.length === 0) return null
        const totalSleep = durations.reduce((a, b) => a + b, 0)
        const target = durations.length * 480
        const debt = target - totalSleep
        const sev: InsightSeverity = debt <= 0 ? "positive" : debt < 120 ? "info" : debt < 300 ? "warning" : "critical"
        return makeInsight(alg, sev, `Sleep debt: ${debt > 0 ? Math.round(debt) : 0} min over ${durations.length} days. ${debt <= 0 ? "No sleep debt — well rested." : `Deficit of ${(debt / 60).toFixed(1)}h vs 8h/night target.`}`, Math.max(0, Math.round(debt)), "min", null, { totalSleep: Math.round(totalSleep), target, days: durations.length })
      }

      case "sleep-latency": {
        const sleepRecs = recs("sleep")
        const latencies = sleepRecs.map((r) => {
          const d = r.data as { startTime?: string; stages?: { awake?: number } } | null
          return d?.stages?.awake != null ? Math.min(d.stages.awake, 60) : null
        }).filter((l): l is number => l != null)
        if (latencies.length === 0) return null
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
        const sev: InsightSeverity = avg <= 15 ? "positive" : avg <= 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Average sleep onset: ~${Math.round(avg)} min. ${avg <= 15 ? "Healthy — falling asleep quickly." : avg <= 30 ? "Within normal range." : "Prolonged latency — consider sleep hygiene improvements."}`, Math.round(avg), "min", { low: 0, high: 20 }, { nights: latencies.length })
      }

      case "awakening-freq": {
        const sleepRecs = recs("sleep")
        const awakenings = sleepRecs.map((r) => (r.data as { awakenings?: number } | null)?.awakenings).filter((a): a is number => a != null)
        if (awakenings.length === 0) return null
        const avg = awakenings.reduce((a, b) => a + b, 0) / awakenings.length
        const sev: InsightSeverity = avg <= 2 ? "positive" : avg <= 5 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg)} awakenings/night. ${avg <= 2 ? "Minimal disruption." : avg <= 5 ? "Moderate — common range." : "Frequent awakenings may impair deep sleep."}`, Math.round(avg), "count", { low: 0, high: 3 }, { nights: awakenings.length })
      }

      case "sleep-score-trend": {
        const v = vals("sleep_score")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const avg = last14.reduce((a, b) => a + b, 0) / last14.length
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Sleep score trend: ${t} (avg ${Math.round(avg)}). ${t === "rising" ? "Improving sleep quality." : t === "falling" ? "Declining — review sleep habits." : "Stable sleep quality."}`, Math.round(avg), "score", { low: 70, high: 100 }, { trend: t })
      }

      case "sleep-hr-dip": {
        const sleepRecs = recs("sleep")
        const hrVals = vals("heart_rate")
        const rhrVals = vals("resting_heart_rate")
        if (sleepRecs.length === 0 || (hrVals.length === 0 && rhrVals.length === 0)) return null
        const sleepHRs = sleepRecs.map((r) => (r.data as { heartRateAvg?: number } | null)?.heartRateAvg).filter((h): h is number => h != null)
        if (sleepHRs.length === 0) return null
        const avgSleepHR = sleepHRs.reduce((a, b) => a + b, 0) / sleepHRs.length
        const dayHR = rhrVals.length > 0 ? rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length : hrVals.reduce((a, b) => a + b, 0) / hrVals.length
        const dipPct = ((dayHR - avgSleepHR) / dayHR) * 100
        const sev: InsightSeverity = dipPct >= 10 && dipPct <= 20 ? "positive" : dipPct < 10 ? "warning" : "info"
        return makeInsight(alg, sev, `Nocturnal HR dip: ${Math.round(dipPct)}%. ${dipPct >= 10 && dipPct <= 20 ? "Normal physiological dipping pattern." : dipPct < 10 ? "Non-dipping pattern — may indicate autonomic dysfunction." : "Enhanced dipping."}`, Math.round(dipPct), "%", { low: 10, high: 20 }, { avgSleepHR: Math.round(avgSleepHR), dayHR: Math.round(dayHR) })
      }

      // ── Activity ────────────────────────────────────────────
      case "daily-steps-goal": {
        const v = vals("steps")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const pct = (avg / 10000) * 100
        const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 70 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg).toLocaleString()} steps/day (${Math.round(pct)}% of 10K goal). ${pct >= 100 ? "Consistently hitting target!" : "Room for improvement."}`, Math.round(avg), "steps", { low: 7000, high: 10000 }, { goalPct: Math.round(pct), days: v.length })
      }

      case "steps-trend": {
        const v = vals("steps")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const ma = movingAverage(last14, 7)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Steps trend: ${t}. 7-day moving avg: ${Math.round(ma[ma.length - 1]!).toLocaleString()} steps.`, Math.round(ma[ma.length - 1]!), "steps", null, { trend: t })
      }

      case "active-minutes-who": {
        const v = vals("active_minutes")
        if (v.length === 0) return null
        const weekly = v.slice(-7).reduce((a, b) => a + b, 0)
        const pct = (weekly / 150) * 100
        const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Weekly active minutes: ${Math.round(weekly)} (${Math.round(pct)}% of WHO 150-min target). ${pct >= 100 ? "Meeting guidelines!" : "Below recommended level."}`, Math.round(weekly), "min", { low: 150, high: 300 }, { target: 150, pct: Math.round(pct) })
      }

      case "sedentary-alert": {
        const v = vals("steps")
        if (v.length === 0) return null
        const sedentaryDays = v.filter((s) => s < 2000).length
        const pct = (sedentaryDays / v.length) * 100
        const sev: InsightSeverity = pct === 0 ? "positive" : pct < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `${sedentaryDays} of ${v.length} days were sedentary (<2K steps). ${pct === 0 ? "No sedentary days detected!" : `${Math.round(pct)}% sedentary rate.`}`, sedentaryDays, "days", null, { sedentaryPct: Math.round(pct) })
      }

      case "calorie-balance": {
        const v = vals("calories")
        if (v.length < 3) return null
        const last7 = v.slice(-7)
        const avg = last7.reduce((a, b) => a + b, 0) / last7.length
        const t = trend(v.slice(-14))
        return makeInsight(alg, "info", `7-day avg calorie burn: ${Math.round(avg).toLocaleString()} kcal/day. Trend: ${t}.`, Math.round(avg), "kcal", null, { trend: t })
      }

      case "distance-weekly": {
        const v = vals("distance")
        if (v.length === 0) return null
        const last7 = v.slice(-7)
        const total = last7.reduce((a, b) => a + b, 0)
        const km = total / 1000
        return makeInsight(alg, km > 35 ? "positive" : km > 15 ? "info" : "warning", `Weekly distance: ${km.toFixed(1)} km. ${km > 35 ? "Excellent coverage." : km > 15 ? "Good activity level." : "Consider increasing movement."}`, Number(km.toFixed(1)), "km", null, { days: last7.length })
      }

      case "activity-consistency": {
        const v = vals("steps")
        if (v.length < 7) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 25 ? "positive" : cv < 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Activity consistency index: CV=${Math.round(cv)}%. ${cv < 25 ? "Very consistent — great habit." : cv < 50 ? "Moderate consistency." : "Highly variable — try establishing a routine."}`, Math.round(cv), "%", { low: 0, high: 25 }, { days: v.length })
      }

      case "peak-activity-time": {
        const stepRecs = recs("steps")
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
        for (const [h, vals] of hourBuckets) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length
          if (avg > peakAvg) { peakHour = h; peakAvg = avg }
        }
        const timeStr = `${peakHour.toString().padStart(2, "0")}:00`
        return makeInsight(alg, "info", `Peak activity typically occurs around ${timeStr} with avg ${Math.round(peakAvg).toLocaleString()} steps.`, peakHour, "hour", null, { peakAvg: Math.round(peakAvg) })
      }

      case "floors-climbed": {
        const v = vals("floors")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const sev: InsightSeverity = avg >= 10 ? "positive" : avg >= 5 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg)} floors/day. ${avg >= 10 ? "Meeting cardiovascular benefit target." : "Below 10-floor daily recommendation."}`, Math.round(avg), "floors", { low: 10, high: 20 }, { days: v.length })
      }

      case "inactivity-streak": {
        const v = vals("steps")
        if (v.length === 0) return null
        let maxStreak = 0
        let currentStreak = 0
        for (const s of v) {
          if (s < 5000) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
          else currentStreak = 0
        }
        const sev: InsightSeverity = maxStreak === 0 ? "positive" : maxStreak <= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `Longest inactivity streak: ${maxStreak} consecutive days below 5K steps. ${maxStreak === 0 ? "No inactivity streaks!" : maxStreak <= 2 ? "Brief dips are normal." : "Extended low activity — prioritize movement."}`, maxStreak, "days", null, {})
      }

      // ── Body ────────────────────────────────────────────────
      case "bmi-classification": {
        const v = vals("bmi")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let cat: string
        let sev: InsightSeverity
        if (latest < 18.5) { cat = "Underweight"; sev = "warning" }
        else if (latest < 25) { cat = "Normal"; sev = "positive" }
        else if (latest < 30) { cat = "Overweight"; sev = "warning" }
        else { cat = "Obese"; sev = "critical" }
        return makeInsight(alg, sev, `BMI: ${latest.toFixed(1)} — ${cat}.`, Number(latest.toFixed(1)), "kg/m²", { low: 18.5, high: 25 }, { category: cat })
      }

      case "weight-trend": {
        const v = vals("weight")
        if (v.length < 5) return null
        const slope = linearSlope(v)
        const weeklyChange = slope * 7
        const sev: InsightSeverity = Math.abs(weeklyChange) < 0.2 ? "info" : Math.abs(weeklyChange) < 0.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Weight trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(2)} kg/week. ${Math.abs(weeklyChange) < 0.2 ? "Stable weight." : weeklyChange > 0 ? "Gaining trend." : "Losing trend."}`, Number(weeklyChange.toFixed(2)), "kg/week", null, { slope: Number(slope.toFixed(4)), samples: v.length, latest: v[v.length - 1] })
      }

      case "body-fat-zone": {
        const v = vals("body_fat")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let zone: string
        let sev: InsightSeverity
        if (latest < 14) { zone = "Athletic"; sev = "positive" }
        else if (latest < 21) { zone = "Fitness"; sev = "positive" }
        else if (latest < 25) { zone = "Acceptable"; sev = "info" }
        else { zone = "Above recommended"; sev = "warning" }
        return makeInsight(alg, sev, `Body fat: ${latest.toFixed(1)}% — ${zone} range.`, Number(latest.toFixed(1)), "%", { low: 10, high: 25 }, { zone })
      }

      case "weight-volatility": {
        const v = vals("weight")
        if (v.length < 5) return null
        const diffs = []
        for (let i = 1; i < v.length; i++) diffs.push(Math.abs(v[i]! - v[i - 1]!))
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
        const sev: InsightSeverity = avg < 0.5 ? "positive" : avg < 1.0 ? "info" : "warning"
        return makeInsight(alg, sev, `Day-to-day weight fluctuation: ±${avg.toFixed(2)} kg. ${avg < 0.5 ? "Very stable." : avg < 1.0 ? "Normal fluctuation." : "High volatility — may indicate fluid retention."}`, Number(avg.toFixed(2)), "kg", { low: 0, high: 0.5 }, {})
      }

      case "bp-classification": {
        const bpRecs = recs("blood_pressure")
        if (bpRecs.length === 0) return null
        const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
        const diastolics = bpRecs.map((r) => (r.data as { diastolic?: number } | null)?.diastolic).filter((v): v is number => v != null)
        if (systolics.length === 0) return null
        const avgSys = systolics.reduce((a, b) => a + b, 0) / systolics.length
        const avgDia = diastolics.length > 0 ? diastolics.reduce((a, b) => a + b, 0) / diastolics.length : 0
        let cat: string
        let sev: InsightSeverity
        if (avgSys < 120 && avgDia < 80) { cat = "Normal"; sev = "positive" }
        else if (avgSys < 130) { cat = "Elevated"; sev = "info" }
        else if (avgSys < 140) { cat = "Stage 1 Hypertension"; sev = "warning" }
        else if (avgSys < 180) { cat = "Stage 2 Hypertension"; sev = "critical" }
        else { cat = "Hypertensive Crisis"; sev = "critical" }
        return makeInsight(alg, sev, `Blood pressure: ${Math.round(avgSys)}/${Math.round(avgDia)} mmHg — ${cat} (AHA classification).`, Math.round(avgSys), "mmHg", { low: 90, high: 120 }, { category: cat, systolic: Math.round(avgSys), diastolic: Math.round(avgDia) })
      }

      case "bp-trend": {
        const bpRecs = recs("blood_pressure")
        const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
        if (systolics.length < 5) return null
        const t = trend(systolics.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Blood pressure trend: ${t}. ${t === "rising" ? "Monitor closely — consult physician if persistent." : "Stable or improving."}`, systolics[systolics.length - 1]!, "mmHg", null, { trend: t })
      }

      case "temp-anomaly": {
        const v = vals("temperature")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 36.1 && latest <= 37.2 ? "positive" : latest < 38.0 ? "warning" : "critical"
        return makeInsight(alg, sev, `Body temperature: ${latest.toFixed(1)}°C. ${latest >= 36.1 && latest <= 37.2 ? "Normal range." : latest < 36.1 ? "Below normal — monitor for hypothermia." : "Elevated — possible fever."}`, Number(latest.toFixed(1)), "°C", { low: 36.1, high: 37.2 }, {})
      }

      // ── Recovery ────────────────────────────────────────────
      case "recovery-status": {
        const v = vals("recovery_score")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let cat: string
        let sev: InsightSeverity
        if (latest >= 80) { cat = "Optimal"; sev = "positive" }
        else if (latest >= 60) { cat = "Good"; sev = "info" }
        else if (latest >= 40) { cat = "Moderate"; sev = "warning" }
        else { cat = "Poor"; sev = "critical" }
        return makeInsight(alg, sev, `Recovery: ${Math.round(latest)}/100 — ${cat}. ${latest >= 60 ? "Ready for training." : "Consider lighter activity."}`, Math.round(latest), "score", { low: 60, high: 100 }, { category: cat })
      }

      case "recovery-trend": {
        const v = vals("recovery_score")
        if (v.length < 3) return null
        const last7 = v.slice(-7)
        const t = trend(last7)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Recovery trend: ${t} over ${last7.length} days.`, Math.round(last7[last7.length - 1]!), "score", null, { trend: t })
      }

      case "readiness-status": {
        const v = vals("readiness_score")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 75 ? "positive" : latest >= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Readiness: ${Math.round(latest)}/100. ${latest >= 75 ? "Primed for high-intensity training." : latest >= 50 ? "Moderate readiness — standard training OK." : "Low readiness — prioritize recovery."}`, Math.round(latest), "score", { low: 50, high: 100 }, {})
      }

      case "strain-balance": {
        const strainV = vals("strain_score")
        const recoveryV = vals("recovery_score")
        if (strainV.length === 0 || recoveryV.length === 0) return null
        const avgStrain = strainV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(strainV.length, 7)
        const avgRecovery = recoveryV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(recoveryV.length, 7)
        const ratio = avgRecovery > 0 ? avgStrain / avgRecovery : 0
        const sev: InsightSeverity = ratio < 0.8 ? "positive" : ratio < 1.2 ? "info" : "warning"
        return makeInsight(alg, sev, `Strain/Recovery ratio: ${ratio.toFixed(2)}. ${ratio < 0.8 ? "Well recovered — capacity for more." : ratio < 1.2 ? "Balanced load." : "Strain exceeding recovery — overtraining risk."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.5, high: 1.0 }, { avgStrain: Math.round(avgStrain), avgRecovery: Math.round(avgRecovery) })
      }

      case "stress-level": {
        const v = vals("stress")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let cat: string
        let sev: InsightSeverity
        if (avg < 25) { cat = "Low"; sev = "positive" }
        else if (avg < 50) { cat = "Moderate"; sev = "info" }
        else if (avg < 75) { cat = "High"; sev = "warning" }
        else { cat = "Very High"; sev = "critical" }
        return makeInsight(alg, sev, `Average stress: ${Math.round(avg)}/100 — ${cat}. ${avg >= 50 ? "Consider stress management techniques." : "Stress levels well managed."}`, Math.round(avg), "score", { low: 0, high: 50 }, { category: cat })
      }

      case "stress-trend": {
        const v = vals("stress")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Stress trend: ${t}. ${t === "rising" ? "Increasing stress — monitor closely." : t === "falling" ? "Decreasing stress — good progress." : "Stable stress levels."}`, Math.round(v[v.length - 1]!), "score", null, { trend: t })
      }

      // ── Respiratory ─────────────────────────────────────────
      case "spo2-status": {
        const v = vals("spo2")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 95 ? "positive" : latest >= 90 ? "warning" : "critical"
        return makeInsight(alg, sev, `SpO2: ${Math.round(latest)}%. ${latest >= 95 ? "Normal blood oxygen." : latest >= 90 ? "Below normal — monitor for respiratory issues." : "Critically low — seek medical attention."}`, Math.round(latest), "%", { low: 95, high: 100 }, {})
      }

      case "spo2-trend": {
        const v = vals("spo2")
        if (v.length < 3) return null
        const t = trend(v.slice(-7))
        const sev: InsightSeverity = t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `SpO2 trend: ${t}. ${t === "falling" ? "Declining — watch for respiratory symptoms." : "Stable oxygen levels."}`, Math.round(v[v.length - 1]!), "%", null, { trend: t })
      }

      case "resp-rate-status": {
        const v = vals("respiratory_rate")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const sev: InsightSeverity = avg >= 12 && avg <= 20 ? "positive" : avg >= 10 && avg <= 24 ? "info" : "warning"
        return makeInsight(alg, sev, `Respiratory rate: ${avg.toFixed(1)} brpm. ${avg >= 12 && avg <= 20 ? "Normal adult range." : "Outside normal 12-20 brpm range."}`, Number(avg.toFixed(1)), "brpm", { low: 12, high: 20 }, {})
      }

      case "resp-rate-trend": {
        const v = vals("respiratory_rate")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : "info"
        return makeInsight(alg, sev, `Respiratory rate trend: ${t}. ${t === "rising" ? "Increasing — may indicate stress or illness." : "Stable breathing patterns."}`, Number(v[v.length - 1]!.toFixed(1)), "brpm", null, { trend: t })
      }

      case "resp-sleep-corr": {
        const respV = vals("respiratory_rate")
        const sleepRecs = recs("sleep")
        if (respV.length < 5 || sleepRecs.length < 5) return null
        const sleepScores = sleepRecs.map((r) => (r.data as { score?: number } | null)?.score).filter((s): s is number => s != null)
        if (sleepScores.length < 3) return null
        const respTrend = trend(respV.slice(-7))
        const sleepTrend = trend(sleepScores.slice(-7))
        const correlated = (respTrend === "rising" && sleepTrend === "falling") || (respTrend === "falling" && sleepTrend === "rising")
        return makeInsight(alg, correlated ? "warning" : "info", `Respiratory rate is ${respTrend}, sleep quality is ${sleepTrend}. ${correlated ? "Inverse correlation detected — elevated breathing may impair sleep." : "No significant correlation."}`, null, null, null, { respTrend, sleepTrend, correlated })
      }

      // ── Metabolic ───────────────────────────────────────────
      case "glucose-status": {
        const v = vals("blood_glucose")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let cat: string
        let sev: InsightSeverity
        if (avg < 100) { cat = "Normal"; sev = "positive" }
        else if (avg < 126) { cat = "Prediabetic"; sev = "warning" }
        else { cat = "Diabetic range"; sev = "critical" }
        return makeInsight(alg, sev, `Avg blood glucose: ${Math.round(avg)} mg/dL — ${cat}. ${avg >= 100 ? "Consult healthcare provider." : "Within healthy range."}`, Math.round(avg), "mg/dL", { low: 70, high: 100 }, { category: cat })
      }

      case "glucose-variability": {
        const v = vals("blood_glucose")
        if (v.length < 5) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 20 ? "positive" : cv < 36 ? "info" : "warning"
        return makeInsight(alg, sev, `Glucose variability: CV=${Math.round(cv)}%. ${cv < 20 ? "Excellent glycemic control." : cv < 36 ? "Moderate variability." : "High variability — poor glycemic control."}`, Math.round(cv), "%", { low: 0, high: 36 }, {})
      }

      case "glucose-trend": {
        const v = vals("blood_glucose")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Blood glucose trend: ${t}. ${t === "rising" ? "Rising levels — review dietary patterns." : "Stable or improving."}`, Math.round(v[v.length - 1]!), "mg/dL", null, { trend: t })
      }

      // ── Workout Performance ─────────────────────────────────
      case "training-load": {
        if (workouts.length === 0) return null
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const recent = workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
        let trimp = 0
        for (const w of recent) {
          const dur = (w.durationSeconds ?? 0) / 60
          const hr = w.avgHeartRate ?? 120
          const intensity = hr / 180
          trimp += dur * intensity
        }
        const sev: InsightSeverity = trimp > 500 ? "warning" : trimp > 200 ? "positive" : "info"
        return makeInsight(alg, sev, `7-day training load (TRIMP proxy): ${Math.round(trimp)}. ${trimp > 500 ? "High load — ensure adequate recovery." : trimp > 200 ? "Good training stimulus." : "Light training week."}`, Math.round(trimp), "TRIMP", null, { workouts: recent.length })
      }

      case "training-monotony": {
        if (workouts.length < 5) return null
        const dailyLoads: number[] = []
        const dayMap = new Map<string, number>()
        for (const w of workouts) {
          const day = new Date(w.startedAt).toISOString().slice(0, 10)
          dayMap.set(day, (dayMap.get(day) ?? 0) + ((w.durationSeconds ?? 0) / 60))
        }
        for (const v of dayMap.values()) dailyLoads.push(v)
        if (dailyLoads.length < 3) return null
        const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length
        const sd = stddev(dailyLoads)
        const monotony = sd > 0 ? mean / sd : 0
        const sev: InsightSeverity = monotony > 2 ? "warning" : "info"
        return makeInsight(alg, sev, `Training monotony: ${monotony.toFixed(1)}. ${monotony > 2 ? "High monotony increases overtraining/illness risk — vary sessions." : "Good training variety."}`, Number(monotony.toFixed(1)), "index", null, { days: dailyLoads.length })
      }

      case "workout-frequency": {
        if (workouts.length === 0) return null
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const recent = workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
        const count = recent.length
        const sev: InsightSeverity = count >= 4 ? "positive" : count >= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `${count} workouts this week. ${count >= 4 ? "Great consistency!" : count >= 2 ? "Moderate frequency." : "Low frequency — aim for 3-5 sessions/week."}`, count, "sessions", { low: 3, high: 5 }, { totalPeriod: workouts.length })
      }

      case "vo2max-estimate": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length === 0 || workouts.length === 0) return null
        const avgRHR = rhr.reduce((a, b) => a + b, 0) / rhr.length
        // Uth et al. formula: VO2max ≈ 15.3 × (MHR / RHR)
        // Using estimated MHR from workout max HRs
        const maxHRs = workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
        if (maxHRs.length === 0) return null
        const estMaxHR = Math.max(...maxHRs)
        const vo2max = 15.3 * (estMaxHR / avgRHR)
        let cat: string
        let sev: InsightSeverity
        if (vo2max >= 50) { cat = "Excellent"; sev = "positive" }
        else if (vo2max >= 40) { cat = "Good"; sev = "info" }
        else if (vo2max >= 30) { cat = "Fair"; sev = "info" }
        else { cat = "Poor"; sev = "warning" }
        return makeInsight(alg, sev, `Estimated VO2max: ${vo2max.toFixed(1)} mL/kg/min — ${cat}. ${vo2max >= 50 ? "Elite aerobic fitness." : "Room for cardiovascular improvement."}`, Number(vo2max.toFixed(1)), "mL/kg/min", { low: 30, high: 50 }, { category: cat, estMaxHR, avgRHR: Math.round(avgRHR) })
      }

      // ── Cross-Domain / Composite ──
      case "sleep-activity-corr": {
        const steps = vals("steps"); const sleepV = vals("sleep")
        if (steps.length < 7 || sleepV.length < 7) return null
        const n = Math.min(steps.length, sleepV.length)
        const s = steps.slice(-n); const sl = sleepV.slice(-n)
        const meanS = s.reduce((a, b) => a + b, 0) / n
        const meanSl = sl.reduce((a, b) => a + b, 0) / n
        let num = 0; let denS = 0; let denSl = 0
        for (let i = 0; i < n; i++) { num += (s[i] - meanS) * (sl[i] - meanSl); denS += (s[i] - meanS) ** 2; denSl += (sl[i] - meanSl) ** 2 }
        const r = denS && denSl ? num / Math.sqrt(denS * denSl) : 0
        const sev: InsightSeverity = r > 0.3 ? "positive" : r < -0.3 ? "warning" : "info"
        return makeInsight(alg, sev, `Steps-sleep correlation: r=${r.toFixed(2)}. ${r > 0.3 ? "More activity is linked to better sleep." : r < -0.3 ? "Higher activity may be disrupting sleep." : "No strong link detected."}`, Number(r.toFixed(2)), "r", { low: -0.3, high: 0.3 }, { n })
      }

      case "hr-sleep-quality": {
        const rhr = vals("resting_heart_rate"); const ss = vals("sleep_score")
        if (rhr.length < 7 || ss.length < 7) return null
        const n = Math.min(rhr.length, ss.length)
        const r1 = rhr.slice(-n); const s1 = ss.slice(-n)
        const mr = r1.reduce((a, b) => a + b, 0) / n; const ms = s1.reduce((a, b) => a + b, 0) / n
        let num = 0; let d1 = 0; let d2 = 0
        for (let i = 0; i < n; i++) { num += (r1[i] - mr) * (s1[i] - ms); d1 += (r1[i] - mr) ** 2; d2 += (s1[i] - ms) ** 2 }
        const r = d1 && d2 ? num / Math.sqrt(d1 * d2) : 0
        const sev: InsightSeverity = r < -0.3 ? "positive" : r > 0.3 ? "warning" : "info"
        return makeInsight(alg, sev, `RHR-sleep quality correlation: r=${r.toFixed(2)}. ${r < -0.3 ? "Lower RHR = better sleep (expected)." : "No strong inverse relationship."}`, Number(r.toFixed(2)), "r", { low: -0.5, high: 0 }, { n })
      }

      case "exercise-recovery-efficiency": {
        const rec = vals("recovery_score")
        if (rec.length < 7 || workouts.length < 2) return null
        const dipDays: number[] = []
        for (let i = 1; i < rec.length; i++) { if (rec[i] < rec[i - 1] * 0.85) dipDays.push(i) }
        if (dipDays.length === 0) return makeInsight(alg, "positive", "Recovery stayed stable — no significant post-workout dips detected.", 0, "days", { low: 1, high: 3 }, {})
        const recoveryTimes = dipDays.map((d) => { let t = 1; while (d + t < rec.length && rec[d + t] < rec[d - 1]) t++; return t })
        const avg = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        const sev: InsightSeverity = avg <= 1.5 ? "positive" : avg <= 3 ? "info" : "warning"
        return makeInsight(alg, sev, `Average recovery rebound: ${avg.toFixed(1)} days after hard efforts. ${avg <= 1.5 ? "Excellent recovery speed." : avg <= 3 ? "Normal recovery time." : "Slow recovery — consider reducing load."}`, Number(avg.toFixed(1)), "days", { low: 1, high: 3 }, { dips: dipDays.length })
      }

      case "stress-sleep-impact": {
        const stress = vals("stress"); const sleepV = vals("sleep")
        if (stress.length < 7 || sleepV.length < 7) return null
        const n = Math.min(stress.length, sleepV.length)
        const s = stress.slice(-n); const sl = sleepV.slice(-n)
        const highStressDays = s.filter((v) => v > 70).length
        const avgSleepOnHigh = s.reduce((acc, v, i) => v > 70 ? { sum: acc.sum + sl[i], count: acc.count + 1 } : acc, { sum: 0, count: 0 })
        const avgSleepOnLow = s.reduce((acc, v, i) => v <= 70 ? { sum: acc.sum + sl[i], count: acc.count + 1 } : acc, { sum: 0, count: 0 })
        const highAvg = avgSleepOnHigh.count ? avgSleepOnHigh.sum / avgSleepOnHigh.count : 0
        const lowAvg = avgSleepOnLow.count ? avgSleepOnLow.sum / avgSleepOnLow.count : 0
        const diff = lowAvg - highAvg
        const sev: InsightSeverity = diff > 60 ? "warning" : diff > 30 ? "info" : "positive"
        return makeInsight(alg, sev, `High-stress days: ${highStressDays}/${n}. Sleep is ${diff > 0 ? `${Math.round(diff)} min shorter` : "unaffected"} on stressful days.`, Math.round(diff), "min", { low: 0, high: 60 }, { highStressDays, highAvg: Math.round(highAvg), lowAvg: Math.round(lowAvg) })
      }

      case "weekend-weekday-activity": {
        const steps = vals("steps")
        if (steps.length < 14) return null
        const dates = dayStats("steps").map((d) => ({ val: d.value, dow: new Date(d.date).getDay() }))
        const we = dates.filter((d) => d.dow === 0 || d.dow === 6)
        const wd = dates.filter((d) => d.dow >= 1 && d.dow <= 5)
        const weAvg = we.length ? we.reduce((a, b) => a + b.val, 0) / we.length : 0
        const wdAvg = wd.length ? wd.reduce((a, b) => a + b.val, 0) / wd.length : 0
        const ratio = wdAvg > 0 ? weAvg / wdAvg : 1
        const sev: InsightSeverity = ratio > 0.8 && ratio < 1.2 ? "positive" : ratio >= 1.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Weekend avg: ${Math.round(weAvg)} steps, Weekday avg: ${Math.round(wdAvg)} steps (ratio: ${ratio.toFixed(2)}). ${ratio > 0.8 && ratio < 1.2 ? "Well balanced." : ratio >= 1.5 ? "Weekend warrior pattern." : "Weekdays significantly more active."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.8, high: 1.2 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
      }

      case "morning-readiness": {
        const sleepV = vals("sleep"); const readiness = vals("readiness_score")
        if (sleepV.length < 7 || readiness.length < 7) return null
        const n = Math.min(sleepV.length, readiness.length) - 1
        let correctPredictions = 0
        for (let i = 0; i < n; i++) { if ((sleepV[i] >= 420 && readiness[i + 1] >= 60) || (sleepV[i] < 420 && readiness[i + 1] < 60)) correctPredictions++ }
        const accuracy = n > 0 ? (correctPredictions / n) * 100 : 0
        const sev: InsightSeverity = accuracy >= 70 ? "positive" : "info"
        return makeInsight(alg, sev, `Sleep predicts next-day readiness with ${accuracy.toFixed(0)}% accuracy. ${accuracy >= 70 ? "Strong predictive link — prioritize sleep." : "Other factors also influence readiness."}`, Number(accuracy.toFixed(0)), "%", { low: 50, high: 80 }, { n })
      }

      case "training-adaptation": {
        const rhr = vals("resting_heart_rate"); const hrv = vals("heart_rate_variability")
        if (rhr.length < 14 || hrv.length < 14 || workouts.length < 4) return null
        const rhrTrend = linearSlope(rhr.slice(-14))
        const hrvTrend = linearSlope(hrv.slice(-14))
        const wkLoad = workouts.slice(-14).reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
        const score = (hrvTrend > 0 ? 1 : 0) + (rhrTrend < 0 ? 1 : 0) + (wkLoad > 200 ? 1 : 0)
        const sev: InsightSeverity = score >= 3 ? "positive" : score >= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `Training adaptation index: ${score}/3. ${score >= 3 ? "Excellent — adapting well (HRV up, RHR down, volume maintained)." : score >= 2 ? "Good progress on most indicators." : "Limited adaptation signals — review training plan."}`, score, "/3", { low: 1, high: 3 }, { rhrTrend: rhrTrend.toFixed(3), hrvTrend: hrvTrend.toFixed(3), wkMinutes: Math.round(wkLoad) })
      }

      case "holistic-wellness": {
        const steps = vals("steps"); const sleepV = vals("sleep"); const rhr = vals("resting_heart_rate")
        if (steps.length < 7 || sleepV.length < 7 || rhr.length < 7) return null
        const stepScore = Math.min(100, (steps.slice(-7).reduce((a, b) => a + b, 0) / 7 / 10000) * 100)
        const sleepScore = Math.min(100, (sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 100)
        const rhrScore = Math.min(100, Math.max(0, 100 - (rhr.slice(-7).reduce((a, b) => a + b, 0) / 7 - 50) * 2))
        const wellness = Math.round((stepScore + sleepScore + rhrScore) / 3)
        const sev: InsightSeverity = wellness >= 75 ? "positive" : wellness >= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Holistic wellness score: ${wellness}/100. Activity=${Math.round(stepScore)}, Sleep=${Math.round(sleepScore)}, Cardiac=${Math.round(rhrScore)}.`, wellness, "/100", { low: 50, high: 80 }, { stepScore: Math.round(stepScore), sleepScore: Math.round(sleepScore), rhrScore: Math.round(rhrScore) })
      }

      case "circadian-stability": {
        const sleepStats = dayStats("sleep")
        if (sleepStats.length < 10) return null
        const bedtimeProxy = sleepStats.map((d) => { const dt = new Date(d.date); return dt.getHours() * 60 + dt.getMinutes() })
        const sd = stddev(bedtimeProxy)
        const sev: InsightSeverity = sd < 30 ? "positive" : sd < 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Circadian stability: ±${Math.round(sd)} min bedtime variation. ${sd < 30 ? "Very consistent schedule." : sd < 60 ? "Moderate variation." : "Irregular schedule — may affect sleep quality."}`, Math.round(sd), "min", { low: 15, high: 60 }, { days: sleepStats.length })
      }

      case "overtraining-risk": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length < 14 || workouts.length < 4) return null
        const rhrTrend = linearSlope(rhr.slice(-14))
        const recentRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
        const baselineRHR = rhr.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, rhr.length)
        const rhrElevation = recentRHR - baselineRHR
        const weekWorkouts = workouts.filter((w) => new Date(w.startedAt) >= new Date(Date.now() - 7 * 86400000)).length
        let risk = 0
        if (rhrTrend > 0.2) risk++
        if (rhrElevation > 5) risk++
        if (weekWorkouts > 6) risk++
        const sev: InsightSeverity = risk === 0 ? "positive" : risk <= 1 ? "info" : "warning"
        return makeInsight(alg, sev, `Overtraining risk: ${risk}/3 flags. ${risk === 0 ? "No signs of overtraining." : risk <= 1 ? "Minor overreach signals." : "Multiple overtraining indicators — consider a recovery week."}`, risk, "/3", { low: 0, high: 2 }, { rhrElevation: rhrElevation.toFixed(1), weekWorkouts, rhrTrend: rhrTrend.toFixed(3) })
      }

      case "detraining-risk": {
        if (workouts.length === 0) return null
        const sorted = [...workouts].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        const lastWorkout = new Date(sorted[0].startedAt)
        const daysSince = Math.floor((Date.now() - lastWorkout.getTime()) / 86400000)
        const twoWeekCount = workouts.filter((w) => new Date(w.startedAt) >= new Date(Date.now() - 14 * 86400000)).length
        const sev: InsightSeverity = daysSince <= 3 && twoWeekCount >= 4 ? "positive" : daysSince <= 7 ? "info" : "warning"
        return makeInsight(alg, sev, `Last workout: ${daysSince} days ago. ${twoWeekCount} sessions in past 14 days. ${daysSince > 14 ? "Detraining likely occurring." : daysSince > 7 ? "Fitness may start declining." : "Training recency OK."}`, daysSince, "days", { low: 0, high: 7 }, { twoWeekCount })
      }

      case "fitness-fatigue": {
        if (workouts.length < 14) return null
        const now = Date.now()
        let ctl = 0; let atl = 0
        const dailyLoad: number[] = Array(42).fill(0)
        for (const w of workouts) {
          const daysAgo = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000)
          if (daysAgo < 42) dailyLoad[daysAgo] += (w.durationSeconds || 0) / 60 * (w.averageHeartRate ? w.averageHeartRate / 150 : 1)
        }
        for (let i = 41; i >= 0; i--) { ctl = ctl + (dailyLoad[i] - ctl) / 42; atl = atl + (dailyLoad[i] - atl) / 7 }
        const tsb = ctl - atl
        const sev: InsightSeverity = tsb > 10 ? "positive" : tsb > -10 ? "info" : "warning"
        return makeInsight(alg, sev, `Training balance: CTL=${ctl.toFixed(0)}, ATL=${atl.toFixed(0)}, TSB=${tsb.toFixed(0)}. ${tsb > 10 ? "Fresh — ready for hard effort." : tsb > -10 ? "Balanced fatigue/fitness." : "Fatigued — recovery recommended."}`, Number(tsb.toFixed(0)), "TSB", { low: -15, high: 15 }, { ctl: ctl.toFixed(1), atl: atl.toFixed(1) })
      }

      case "sleep-workout-timing": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7 || workouts.length < 4) return null
        const sleepStats = dayStats("sleep")
        const workoutDates = new Set(workouts.map((w) => new Date(w.startedAt).toISOString().slice(0, 10)))
        const sleepOnWorkout = sleepStats.filter((s) => workoutDates.has(s.date)).map((s) => s.value)
        const sleepOnRest = sleepStats.filter((s) => !workoutDates.has(s.date)).map((s) => s.value)
        const avgWk = sleepOnWorkout.length ? sleepOnWorkout.reduce((a, b) => a + b, 0) / sleepOnWorkout.length : 0
        const avgRest = sleepOnRest.length ? sleepOnRest.reduce((a, b) => a + b, 0) / sleepOnRest.length : 0
        const diff = avgWk - avgRest
        const sev: InsightSeverity = diff > 15 ? "positive" : diff > -15 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep on workout days: ${Math.round(avgWk)} min vs rest days: ${Math.round(avgRest)} min (${diff > 0 ? "+" : ""}${Math.round(diff)} min). ${diff > 15 ? "Exercise improves your sleep." : diff < -15 ? "Exercise may be disrupting sleep — try earlier workouts." : "No significant impact."}`, Math.round(diff), "min", { low: -30, high: 30 }, { workoutDays: sleepOnWorkout.length, restDays: sleepOnRest.length })
      }

      case "metabolic-efficiency": {
        const cal = vals("calories"); const active = vals("active_minutes")
        if (cal.length < 7 || active.length < 7) return null
        const n = Math.min(cal.length, active.length)
        const efficiency = cal.slice(-n).map((c, i) => active[active.length - n + i] > 0 ? c / active[active.length - n + i] : 0).filter((e) => e > 0)
        if (efficiency.length < 3) return null
        const avg = efficiency.reduce((a, b) => a + b, 0) / efficiency.length
        const t = trend(efficiency)
        const sev: InsightSeverity = t === "improving" ? "positive" : t === "stable" ? "info" : "warning"
        return makeInsight(alg, sev, `Metabolic efficiency: ${avg.toFixed(1)} cal/active-min (${t}). ${t === "improving" ? "Burning more efficiently." : "Stable metabolic output."}`, Number(avg.toFixed(1)), "cal/min", { low: 5, high: 15 }, { trend: t, days: efficiency.length })
      }

      case "hydration-proxy": {
        const rhr = vals("resting_heart_rate"); const temp = vals("temperature")
        if (rhr.length < 5 || temp.length < 5) return null
        const recentRHR = rhr.slice(-5).reduce((a, b) => a + b, 0) / 5
        const baseRHR = rhr.slice(0, Math.min(14, rhr.length)).reduce((a, b) => a + b, 0) / Math.min(14, rhr.length)
        const recentTemp = temp.slice(-5).reduce((a, b) => a + b, 0) / 5
        const elevation = recentRHR - baseRHR
        const risk = elevation > 5 && recentTemp > 37 ? "high" : elevation > 3 ? "moderate" : "low"
        const sev: InsightSeverity = risk === "low" ? "positive" : risk === "moderate" ? "info" : "warning"
        return makeInsight(alg, sev, `Hydration proxy: ${risk} dehydration risk. RHR elevated ${elevation.toFixed(1)} bpm above baseline. ${risk === "high" ? "Increase fluid intake." : "Hydration appears adequate."}`, Number(elevation.toFixed(1)), "bpm above baseline", { low: 0, high: 5 }, { risk, recentTemp: recentTemp.toFixed(1) })
      }

      // ── Advanced Cardio ──
      case "hrv-rmssd-proxy": {
        const hrv = vals("heart_rate_variability")
        if (hrv.length < 14) return null
        const weekSD = stddev(hrv.slice(-7))
        const prevSD = stddev(hrv.slice(-14, -7))
        const change = weekSD - prevSD
        const sev: InsightSeverity = weekSD < 10 ? "positive" : weekSD < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `HRV stability (SD): ${weekSD.toFixed(1)} ms this week vs ${prevSD.toFixed(1)} ms prior. ${weekSD < 10 ? "Very stable autonomic function." : "Higher variability in HRV readings."}`, Number(weekSD.toFixed(1)), "ms SD", { low: 5, high: 20 }, { change: change.toFixed(1) })
      }

      case "rhr-seasonal": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length < 30) return null
        const first = rhr.slice(0, 14).reduce((a, b) => a + b, 0) / 14
        const last = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
        const shift = last - first
        const sev: InsightSeverity = Math.abs(shift) < 2 ? "positive" : Math.abs(shift) < 5 ? "info" : "warning"
        return makeInsight(alg, sev, `RHR shifted ${shift > 0 ? "+" : ""}${shift.toFixed(1)} bpm over ${rhr.length} days. ${Math.abs(shift) < 2 ? "Stable." : "Seasonal or fitness-related shift detected."}`, Number(shift.toFixed(1)), "bpm", { low: -3, high: 3 }, { firstHalf: first.toFixed(0), secondHalf: last.toFixed(0) })
      }

      case "autonomic-balance": {
        const rhr = vals("resting_heart_rate"); const hrv = vals("heart_rate_variability")
        if (rhr.length < 7 || hrv.length < 7) return null
        const avgRHR = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
        const avgHRV = hrv.slice(-7).reduce((a, b) => a + b, 0) / 7
        const balance = avgHRV / avgRHR
        const sev: InsightSeverity = balance > 1.0 ? "positive" : balance > 0.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Autonomic balance (HRV/RHR): ${balance.toFixed(2)}. ${balance > 1.0 ? "Parasympathetic-dominant — well recovered." : balance > 0.5 ? "Balanced autonomic state." : "Sympathetic-dominant — stress or fatigue indicated."}`, Number(balance.toFixed(2)), "ratio", { low: 0.5, high: 1.5 }, { avgRHR: Math.round(avgRHR), avgHRV: Math.round(avgHRV) })
      }

      case "aerobic-threshold": {
        if (workouts.length < 3) return null
        const hrWorkouts = workouts.filter((w) => w.averageHeartRate && w.maxHeartRate)
        if (hrWorkouts.length < 3) return null
        const maxHRs = hrWorkouts.map((w) => w.maxHeartRate!)
        const estMax = Math.max(...maxHRs)
        const avgExercise = hrWorkouts.map((w) => w.averageHeartRate!).reduce((a, b) => a + b, 0) / hrWorkouts.length
        const atPct = (avgExercise / estMax) * 100
        const sev: InsightSeverity = atPct < 75 ? "positive" : atPct < 85 ? "info" : "warning"
        return makeInsight(alg, sev, `Avg exercise HR is ${atPct.toFixed(0)}% of max (${Math.round(avgExercise)}/${estMax} bpm). ${atPct < 75 ? "Mostly aerobic zone training." : atPct < 85 ? "Mixed aerobic/anaerobic." : "Predominantly high-intensity."}`, Number(atPct.toFixed(0)), "% max HR", { low: 60, high: 85 }, { avgExercise: Math.round(avgExercise), estMax })
      }

      case "hr-drift-rate": {
        if (workouts.length < 3) return null
        const longWorkouts = workouts.filter((w) => (w.durationSeconds || 0) > 1800 && w.averageHeartRate)
        if (longWorkouts.length < 2) return null
        const drifts = longWorkouts.map((w) => { const dur = (w.durationSeconds || 0) / 3600; return w.maxHeartRate && w.averageHeartRate ? (w.maxHeartRate - w.averageHeartRate) / dur : 0 }).filter((d) => d > 0)
        if (drifts.length === 0) return null
        const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
        const sev: InsightSeverity = avgDrift < 10 ? "positive" : avgDrift < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `HR drift: ${avgDrift.toFixed(1)} bpm/hour during sustained efforts. ${avgDrift < 10 ? "Minimal drift — excellent aerobic base." : avgDrift < 20 ? "Moderate drift." : "High drift — aerobic base needs development."}`, Number(avgDrift.toFixed(1)), "bpm/hr", { low: 5, high: 20 }, { workouts: drifts.length })
      }

      case "post-exercise-recovery-1min": {
        if (workouts.length < 3) return null
        const hrWorkouts = workouts.filter((w) => w.maxHeartRate && w.averageHeartRate)
        if (hrWorkouts.length < 2) return null
        const recoveryEst = hrWorkouts.map((w) => (w.maxHeartRate! - w.averageHeartRate!) * 0.6)
        const avg = recoveryEst.reduce((a, b) => a + b, 0) / recoveryEst.length
        const sev: InsightSeverity = avg > 30 ? "positive" : avg > 20 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated 1-min HR recovery: ~${Math.round(avg)} bpm. ${avg > 30 ? "Excellent cardiac recovery." : avg > 20 ? "Normal recovery." : "Slow recovery — improve aerobic fitness."}`, Math.round(avg), "bpm", { low: 20, high: 40 }, { samples: recoveryEst.length })
      }

      case "morning-rhr-spike": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length < 7) return null
        const baseline = rhr.slice(0, -3).reduce((a, b) => a + b, 0) / (rhr.length - 3)
        const recent = rhr.slice(-3).reduce((a, b) => a + b, 0) / 3
        const spike = recent - baseline
        const sev: InsightSeverity = spike < 3 ? "positive" : spike < 7 ? "info" : "warning"
        return makeInsight(alg, sev, `RHR ${spike > 0 ? "elevated" : "normal"}: ${spike > 0 ? "+" : ""}${spike.toFixed(1)} bpm vs baseline. ${spike >= 7 ? "Possible illness, stress, or poor recovery." : spike >= 3 ? "Slight elevation — monitor closely." : "RHR within normal range."}`, Number(spike.toFixed(1)), "bpm", { low: 0, high: 5 }, { baseline: Math.round(baseline), recent: Math.round(recent) })
      }

      case "hr-circadian": {
        const hr = vals("heart_rate")
        if (hr.length < 24) return null
        const min = Math.min(...hr.slice(-24)); const max = Math.max(...hr.slice(-24))
        const range = max - min
        const sev: InsightSeverity = range > 30 && range < 80 ? "positive" : range >= 80 ? "info" : "warning"
        return makeInsight(alg, sev, `24h HR range: ${min}-${max} bpm (span: ${range}). ${range > 30 && range < 80 ? "Normal circadian HR variation." : range >= 80 ? "Wide range — high activity peaks or stress." : "Narrow range — limited activity variation."}`, range, "bpm range", { low: 30, high: 80 }, { min, max })
      }

      case "bradycardia-flag": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length < 7) return null
        const avg = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
        const daysBelow50 = rhr.slice(-7).filter((v) => v < 50).length
        const sev: InsightSeverity = daysBelow50 === 0 ? "positive" : daysBelow50 <= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `RHR below 50 bpm on ${daysBelow50}/7 days (avg: ${avg.toFixed(0)} bpm). ${daysBelow50 >= 3 ? "Recurrent low HR — normal for athletes, consult doctor if symptomatic." : "RHR in normal range."}`, Math.round(avg), "bpm", { low: 50, high: 100 }, { daysBelow50 })
      }

      case "tachycardia-flag": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length < 7) return null
        const avg = rhr.slice(-7).reduce((a, b) => a + b, 0) / 7
        const daysAbove100 = rhr.slice(-7).filter((v) => v > 100).length
        const sev: InsightSeverity = daysAbove100 === 0 ? "positive" : daysAbove100 <= 2 ? "info" : "critical"
        return makeInsight(alg, sev, `RHR above 100 bpm on ${daysAbove100}/7 days (avg: ${avg.toFixed(0)} bpm). ${daysAbove100 >= 3 ? "Persistent elevated RHR — medical evaluation recommended." : "RHR within normal range."}`, Math.round(avg), "bpm", { low: 50, high: 100 }, { daysAbove100 })
      }

      case "hr-exercise-reactivity": {
        if (workouts.length < 3) return null
        const hrWorkouts = workouts.filter((w) => w.averageHeartRate && w.maxHeartRate)
        if (hrWorkouts.length < 2) return null
        const rhr = vals("resting_heart_rate")
        const avgRHR = rhr.length > 0 ? rhr.reduce((a, b) => a + b, 0) / rhr.length : 60
        const reactivity = hrWorkouts.map((w) => w.maxHeartRate! - avgRHR)
        const avgReact = reactivity.reduce((a, b) => a + b, 0) / reactivity.length
        const sev: InsightSeverity = avgReact > 80 ? "positive" : avgReact > 50 ? "info" : "warning"
        return makeInsight(alg, sev, `HR reactivity: ${Math.round(avgReact)} bpm rise from rest to peak. ${avgReact > 80 ? "Strong chronotropic response." : avgReact > 50 ? "Normal HR response to exercise." : "Blunted HR response — discuss with a healthcare provider if on no medications."}`, Math.round(avgReact), "bpm", { low: 50, high: 100 }, { avgRHR: Math.round(avgRHR), samples: hrWorkouts.length })
      }

      case "cardiovascular-age": {
        const rhr = vals("resting_heart_rate"); const steps = vals("steps")
        if (rhr.length < 14 || steps.length < 14) return null
        const avgRHR = rhr.slice(-14).reduce((a, b) => a + b, 0) / 14
        const avgSteps = steps.slice(-14).reduce((a, b) => a + b, 0) / 14
        const activityBonus = Math.min(10, avgSteps / 2000)
        const cardioAge = Math.round(avgRHR * 0.6 - activityBonus + 20)
        const sev: InsightSeverity = cardioAge <= 35 ? "positive" : cardioAge <= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated cardiovascular age: ${cardioAge} years. ${cardioAge <= 35 ? "Excellent cardiovascular fitness." : cardioAge <= 50 ? "Average cardiovascular health." : "Room for improvement — increase activity, reduce RHR."}`, cardioAge, "years", { low: 25, high: 55 }, { avgRHR: Math.round(avgRHR), avgSteps: Math.round(avgSteps) })
      }

      case "parasympathetic-reactivation": {
        if (workouts.length < 3) return null
        const hrWork = workouts.filter((w) => w.maxHeartRate && w.averageHeartRate)
        if (hrWork.length < 2) return null
        const dropPct = hrWork.map((w) => ((w.maxHeartRate! - w.averageHeartRate!) / w.maxHeartRate!) * 100)
        const avgDrop = dropPct.reduce((a, b) => a + b, 0) / dropPct.length
        const sev: InsightSeverity = avgDrop > 15 ? "positive" : avgDrop > 8 ? "info" : "warning"
        return makeInsight(alg, sev, `Post-exercise HR drop: ${avgDrop.toFixed(1)}% from peak. ${avgDrop > 15 ? "Fast parasympathetic reactivation." : avgDrop > 8 ? "Normal vagal reactivation." : "Slow reactivation — aerobic conditioning may help."}`, Number(avgDrop.toFixed(1)), "%", { low: 8, high: 20 }, { samples: hrWork.length })
      }

      // ── Advanced Sleep ──
      case "sleep-architecture": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const avgMin = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
        const idealDeep = avgMin * 0.2; const idealREM = avgMin * 0.25; const idealLight = avgMin * 0.55
        const score = Math.min(100, Math.round((avgMin / 480) * 100))
        const sev: InsightSeverity = score >= 80 ? "positive" : score >= 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep architecture score: ${score}/100. Avg ${Math.round(avgMin)} min/night (ideal targets: ~${Math.round(idealDeep)} deep, ~${Math.round(idealREM)} REM, ~${Math.round(idealLight)} light).`, score, "/100", { low: 60, high: 90 }, { avgMin: Math.round(avgMin) })
      }

      case "rem-latency": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const avgSleep = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
        const estimatedLatency = Math.max(15, 90 - (avgSleep / 480) * 30)
        const sev: InsightSeverity = estimatedLatency < 70 ? "positive" : estimatedLatency < 90 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated REM latency: ~${Math.round(estimatedLatency)} min. ${estimatedLatency < 70 ? "Normal — REM onset within expected range." : "Possibly delayed REM — sufficient sleep duration helps."}`, Math.round(estimatedLatency), "min", { low: 60, high: 90 }, { avgSleep: Math.round(avgSleep) })
      }

      case "sleep-fragmentation": {
        const sleepV = vals("sleep"); const ss = vals("sleep_score")
        if (sleepV.length < 7) return null
        const avgDuration = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
        const avgScore = ss.length >= 7 ? ss.slice(-7).reduce((a, b) => a + b, 0) / 7 : 75
        const fragIndex = Math.max(0, 100 - avgScore - (avgDuration > 420 ? 0 : 10))
        const sev: InsightSeverity = fragIndex < 20 ? "positive" : fragIndex < 40 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep fragmentation index: ${fragIndex.toFixed(0)}. ${fragIndex < 20 ? "Minimal disruption — consolidated sleep." : fragIndex < 40 ? "Moderate fragmentation." : "High fragmentation — consider sleep environment changes."}`, Math.round(fragIndex), "index", { low: 0, high: 40 }, { avgDuration: Math.round(avgDuration), avgScore: Math.round(avgScore) })
      }

      case "circadian-phase-shift": {
        const sleepStats = dayStats("sleep")
        if (sleepStats.length < 14) return null
        const first7 = sleepStats.slice(0, 7).map((d) => new Date(d.date).getHours() * 60 + new Date(d.date).getMinutes())
        const last7 = sleepStats.slice(-7).map((d) => new Date(d.date).getHours() * 60 + new Date(d.date).getMinutes())
        const avgFirst = first7.reduce((a, b) => a + b, 0) / first7.length
        const avgLast = last7.reduce((a, b) => a + b, 0) / last7.length
        const shift = avgLast - avgFirst
        const sev: InsightSeverity = Math.abs(shift) < 15 ? "positive" : Math.abs(shift) < 45 ? "info" : "warning"
        return makeInsight(alg, sev, `Circadian shift: ${shift > 0 ? "+" : ""}${Math.round(shift)} min over 14 days. ${Math.abs(shift) < 15 ? "Stable circadian phase." : Math.abs(shift) < 45 ? "Moderate phase drift." : "Significant phase shift — may affect sleep quality."}`, Math.round(shift), "min", { low: -30, high: 30 }, { avgFirst: Math.round(avgFirst), avgLast: Math.round(avgLast) })
      }

      case "weekend-sleep-rebound": {
        const sleepStats = dayStats("sleep")
        if (sleepStats.length < 14) return null
        const weekendSleep = sleepStats.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 }).map((d) => d.value)
        const weekdaySleep = sleepStats.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 }).map((d) => d.value)
        if (weekendSleep.length < 2 || weekdaySleep.length < 5) return null
        const weAvg = weekendSleep.reduce((a, b) => a + b, 0) / weekendSleep.length
        const wdAvg = weekdaySleep.reduce((a, b) => a + b, 0) / weekdaySleep.length
        const rebound = weAvg - wdAvg
        const sev: InsightSeverity = Math.abs(rebound) < 30 ? "positive" : rebound > 60 ? "warning" : "info"
        return makeInsight(alg, sev, `Weekend sleep: +${Math.round(rebound)} min vs weekdays. ${Math.abs(rebound) < 30 ? "Minimal social jet lag." : rebound > 60 ? "Significant weekend rebound — suggests weekday sleep debt." : "Moderate rebound."}`, Math.round(rebound), "min", { low: 0, high: 45 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
      }

      case "sleep-regularity-index": {
        const sleepV = vals("sleep")
        if (sleepV.length < 14) return null
        const mean = sleepV.reduce((a, b) => a + b, 0) / sleepV.length
        let matches = 0
        for (let i = 1; i < sleepV.length; i++) { if ((sleepV[i] > mean && sleepV[i - 1] > mean) || (sleepV[i] <= mean && sleepV[i - 1] <= mean)) matches++ }
        const sri = (matches / (sleepV.length - 1)) * 100
        const sev: InsightSeverity = sri >= 80 ? "positive" : sri >= 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep regularity index: ${sri.toFixed(0)}%. ${sri >= 80 ? "Highly regular sleep pattern." : sri >= 60 ? "Moderately regular." : "Irregular — consistency improves sleep quality."}`, Number(sri.toFixed(0)), "%", { low: 60, high: 90 }, { days: sleepV.length })
      }

      case "sws-adequacy": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const avgTotal = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
        const estDeep = avgTotal * 0.15
        const targetDeep = 90
        const pct = (estDeep / targetDeep) * 100
        const sev: InsightSeverity = pct >= 80 ? "positive" : pct >= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated deep sleep: ~${Math.round(estDeep)} min/night (target: ${targetDeep} min, ${pct.toFixed(0)}%). ${pct >= 80 ? "Adequate restorative sleep." : "More total sleep may increase deep sleep."}`, Math.round(estDeep), "min", { low: 60, high: 100 }, { totalSleep: Math.round(avgTotal) })
      }

      case "sleep-onset-var": {
        const sleepStats = dayStats("sleep")
        if (sleepStats.length < 7) return null
        const onsets = sleepStats.map((d) => { const dt = new Date(d.date); return dt.getHours() * 60 + dt.getMinutes() })
        const sd = stddev(onsets)
        const sev: InsightSeverity = sd < 20 ? "positive" : sd < 45 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep onset variability: ±${Math.round(sd)} min. ${sd < 20 ? "Very consistent bedtime." : sd < 45 ? "Moderate variability." : "Highly variable — a consistent bedtime improves sleep quality."}`, Math.round(sd), "min", { low: 10, high: 45 }, { days: onsets.length })
      }

      case "terminal-wakefulness": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const shortNights = sleepV.slice(-14).filter((v) => v < 360).length
        const pct = (shortNights / Math.min(14, sleepV.length)) * 100
        const sev: InsightSeverity = pct < 15 ? "positive" : pct < 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Short sleep nights (<6h): ${shortNights}/${Math.min(14, sleepV.length)} (${pct.toFixed(0)}%). ${pct >= 30 ? "Frequent short nights — possible terminal wakefulness pattern." : "Sleep duration generally adequate."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 25 }, { shortNights })
      }

      case "sleep-pressure": {
        const sleepV = vals("sleep")
        if (sleepV.length < 3) return null
        const lastSleep = sleepV[sleepV.length - 1]
        const wakeDuration = Math.max(0, 1440 - lastSleep)
        const pressure = Math.min(100, (wakeDuration / 960) * 100)
        const sev: InsightSeverity = pressure < 70 ? "positive" : pressure < 90 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep pressure: ${pressure.toFixed(0)}/100 (${Math.round(wakeDuration / 60)}h wake estimated). ${pressure >= 90 ? "High pressure — sleep soon for best quality." : "Manageable sleep pressure."}`, Math.round(pressure), "/100", { low: 40, high: 85 }, { wakeDuration: Math.round(wakeDuration) })
      }

      case "rem-deficit": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const totalSleep = sleepV.slice(-7).reduce((a, b) => a + b, 0)
        const estREM = totalSleep * 0.22
        const targetREM = 90 * 7
        const deficit = targetREM - estREM
        const sev: InsightSeverity = deficit < 60 ? "positive" : deficit < 150 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated 7-day REM: ~${Math.round(estREM)} min (target: ${targetREM} min). ${deficit > 0 ? `Deficit: ${Math.round(deficit)} min.` : "Meeting target."} ${deficit >= 150 ? "More sleep duration needed for adequate REM." : ""}`, Math.round(deficit), "min deficit", { low: 0, high: 120 }, { estREM: Math.round(estREM) })
      }

      case "light-sleep-excess": {
        const sleepV = vals("sleep")
        if (sleepV.length < 7) return null
        const avgTotal = sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7
        const estLight = avgTotal * 0.55
        const lightPct = (estLight / avgTotal) * 100
        const sev: InsightSeverity = lightPct < 55 ? "positive" : lightPct < 65 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated light sleep: ${lightPct.toFixed(0)}% of total. ${lightPct >= 65 ? "Possibly excessive light sleep — deep sleep and REM may be insufficient." : "Normal sleep stage distribution."}`, Number(lightPct.toFixed(0)), "%", { low: 40, high: 60 }, { avgTotal: Math.round(avgTotal) })
      }

      // ── Advanced Activity ──
      case "step-cadence": {
        const steps = vals("steps"); const active = vals("active_minutes")
        if (steps.length < 7 || active.length < 7) return null
        const n = Math.min(steps.length, active.length)
        const cadences = steps.slice(-n).map((s, i) => active[active.length - n + i] > 0 ? s / active[active.length - n + i] : 0).filter((c) => c > 0)
        if (cadences.length < 3) return null
        const avg = cadences.reduce((a, b) => a + b, 0) / cadences.length
        const sev: InsightSeverity = avg >= 100 ? "positive" : avg >= 70 ? "info" : "warning"
        return makeInsight(alg, sev, `Step cadence: ${Math.round(avg)} steps/active-min. ${avg >= 100 ? "Includes running/brisk walking." : avg >= 70 ? "Moderate walking pace." : "Low intensity movement."}`, Math.round(avg), "steps/min", { low: 70, high: 120 }, { days: cadences.length })
      }

      case "movement-distribution": {
        const steps = vals("steps")
        if (steps.length < 14) return null
        const cv = coefficientOfVariation(steps.slice(-14))
        const sev: InsightSeverity = cv < 30 ? "positive" : cv < 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Activity distribution CV: ${cv.toFixed(0)}%. ${cv < 30 ? "Very evenly distributed movement." : cv < 50 ? "Moderate variation in daily activity." : "Highly clustered — aim for more consistent daily movement."}`, Number(cv.toFixed(0)), "%CV", { low: 15, high: 50 }, { days: 14 })
      }

      case "exercise-adherence": {
        const steps = vals("steps")
        if (steps.length < 14) return null
        const goalDays = steps.slice(-30).filter((s) => s >= 10000).length
        const total = Math.min(30, steps.length)
        const pct = (goalDays / total) * 100
        const sev: InsightSeverity = pct >= 70 ? "positive" : pct >= 40 ? "info" : "warning"
        return makeInsight(alg, sev, `Exercise adherence: ${goalDays}/${total} days hit 10K steps (${pct.toFixed(0)}%). ${pct >= 70 ? "Great consistency!" : pct >= 40 ? "Moderate adherence." : "Low adherence — set smaller incremental goals."}`, Number(pct.toFixed(0)), "%", { low: 40, high: 80 }, { goalDays, total })
      }

      case "weekend-warrior": {
        const steps = dayStats("steps")
        if (steps.length < 14) return null
        const we = steps.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 })
        const wd = steps.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 })
        const weTotal = we.reduce((a, b) => a + b.value, 0)
        const wdTotal = wd.reduce((a, b) => a + b.value, 0)
        const totalAll = weTotal + wdTotal
        const wePct = totalAll > 0 ? (weTotal / totalAll) * 100 : 28.6
        const sev: InsightSeverity = wePct > 20 && wePct < 35 ? "positive" : wePct >= 50 ? "warning" : "info"
        return makeInsight(alg, sev, `Weekend activity share: ${wePct.toFixed(0)}% of total (expected ~29%). ${wePct >= 50 ? "Weekend warrior pattern — risk of overuse injuries." : wePct > 20 && wePct < 35 ? "Well-distributed activity." : "Most activity is on weekdays."}`, Number(wePct.toFixed(0)), "%", { low: 20, high: 35 }, { weTotal: Math.round(weTotal), wdTotal: Math.round(wdTotal) })
      }

      case "intensity-mix": {
        const steps = vals("steps"); const hr = vals("heart_rate")
        if (steps.length < 7 || hr.length < 7) return null
        const highHR = hr.filter((v) => v > 140).length
        const modHR = hr.filter((v) => v >= 100 && v <= 140).length
        const lowHR = hr.filter((v) => v < 100).length
        const total = hr.length
        const vigPct = (highHR / total) * 100
        const sev: InsightSeverity = vigPct >= 10 && vigPct <= 30 ? "positive" : vigPct < 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Intensity mix: ${((lowHR / total) * 100).toFixed(0)}% low, ${((modHR / total) * 100).toFixed(0)}% moderate, ${vigPct.toFixed(0)}% vigorous. ${vigPct >= 10 && vigPct <= 30 ? "Good intensity balance." : vigPct < 10 ? "Add more vigorous activity." : "Heavy on high intensity — add recovery."}`, Number(vigPct.toFixed(0)), "% vigorous", { low: 10, high: 30 }, { lowHR, modHR, highHR })
      }

      case "step-asymmetry": {
        const steps = vals("steps")
        if (steps.length < 14) return null
        const avg = steps.reduce((a, b) => a + b, 0) / steps.length
        const outliers = steps.filter((s) => Math.abs(s - avg) > 2 * stddev(steps)).length
        const pct = (outliers / steps.length) * 100
        const sev: InsightSeverity = pct < 10 ? "positive" : pct < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `Step anomaly days: ${outliers}/${steps.length} (${pct.toFixed(0)}%). ${pct >= 20 ? "Frequent unusual patterns — possible injury or lifestyle change." : "Normal step variation."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 15 }, { outliers, avg: Math.round(avg) })
      }

      case "movement-streak": {
        const steps = vals("steps")
        if (steps.length < 7) return null
        let maxStreak = 0; let current = 0
        for (const s of steps) { if (s >= 7500) { current++; maxStreak = Math.max(maxStreak, current) } else { current = 0 } }
        const sev: InsightSeverity = maxStreak >= 14 ? "positive" : maxStreak >= 7 ? "info" : "warning"
        return makeInsight(alg, sev, `Longest active streak: ${maxStreak} consecutive days ≥7500 steps. ${maxStreak >= 14 ? "Impressive consistency!" : maxStreak >= 7 ? "Good streak — keep it going." : "Build towards a 7-day streak."}`, maxStreak, "days", { low: 7, high: 21 }, { totalDays: steps.length })
      }

      case "hourly-activity-pattern": {
        const steps = vals("steps")
        if (steps.length < 7) return null
        const avg = steps.reduce((a, b) => a + b, 0) / steps.length
        const activeDays = steps.filter((s) => s > avg * 1.2).length
        const sedentaryDays = steps.filter((s) => s < avg * 0.5).length
        const sev: InsightSeverity = sedentaryDays < 3 ? "positive" : sedentaryDays < 7 ? "info" : "warning"
        return makeInsight(alg, sev, `Activity pattern: ${activeDays} above-average days, ${sedentaryDays} sedentary days. Daily avg: ${Math.round(avg)} steps.`, Math.round(avg), "avg steps", { low: 5000, high: 10000 }, { activeDays, sedentaryDays })
      }

      case "calorie-deficit-surplus": {
        const cal = vals("calories")
        if (cal.length < 7) return null
        const avg = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
        const balance = avg - 2000
        const sev: InsightSeverity = Math.abs(balance) < 200 ? "positive" : balance > 500 ? "info" : balance < -500 ? "warning" : "info"
        return makeInsight(alg, sev, `Daily calorie balance: ${balance > 0 ? "+" : ""}${Math.round(balance)} kcal vs 2000 baseline. Avg burn: ${Math.round(avg)} kcal/day.`, Math.round(balance), "kcal", { low: -300, high: 300 }, { avgBurn: Math.round(avg) })
      }

      case "recovery-day-detection": {
        const steps = vals("steps")
        if (steps.length < 7 || workouts.length < 2) return null
        const workoutDates = new Set(workouts.map((w) => new Date(w.startedAt).toISOString().slice(0, 10)))
        const stepStats = dayStats("steps")
        const recoveryDays = stepStats.filter((s) => !workoutDates.has(s.date) && s.value >= 3000 && s.value <= 8000).length
        const pct = (recoveryDays / stepStats.length) * 100
        const sev: InsightSeverity = pct >= 20 ? "positive" : pct >= 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Active recovery days: ${recoveryDays} (${pct.toFixed(0)}% of period). ${pct >= 20 ? "Good balance of training and recovery." : "Consider adding light activity between hard sessions."}`, recoveryDays, "days", { low: 2, high: 8 }, { totalDays: stepStats.length })
      }

      case "distance-pr-check": {
        const dist = vals("distance")
        if (dist.length < 7) return null
        const max = Math.max(...dist)
        const recent = Math.max(...dist.slice(-7))
        const pctOfPR = max > 0 ? (recent / max) * 100 : 0
        const sev: InsightSeverity = pctOfPR >= 95 ? "positive" : pctOfPR >= 80 ? "info" : "warning"
        return makeInsight(alg, sev, `Recent best distance: ${pctOfPR.toFixed(0)}% of all-time max. ${pctOfPR >= 95 ? "Near or at PR — great performance!" : "Room to push distance further."}`, Number(pctOfPR.toFixed(0)), "% of PR", { low: 70, high: 100 }, { recentMax: recent.toFixed(1), allTimeMax: max.toFixed(1) })
      }

      case "daily-energy-expenditure": {
        const cal = vals("calories")
        if (cal.length < 7) return null
        const weekAvg = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
        const t = trend(cal.slice(-14))
        const sev: InsightSeverity = weekAvg >= 2000 ? "positive" : weekAvg >= 1500 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated TDEE: ${Math.round(weekAvg)} kcal/day (7-day avg, ${t}). ${weekAvg >= 2000 ? "Active energy expenditure." : "Below typical TDEE — increase activity."}`, Math.round(weekAvg), "kcal/day", { low: 1800, high: 2500 }, { trend: t })
      }

      // ── Advanced Body Composition ──
      case "body-composition-trend": {
        const weight = vals("weight"); const bf = vals("body_fat")
        if (weight.length < 7 || bf.length < 7) return null
        const wTrend = trend(weight.slice(-14)); const bfTrend = trend(bf.slice(-14))
        const ideal = (wTrend === "declining" && bfTrend === "declining") || (wTrend === "improving" && bfTrend === "declining")
        const sev: InsightSeverity = ideal ? "positive" : wTrend === "stable" && bfTrend === "stable" ? "info" : "warning"
        return makeInsight(alg, sev, `Weight: ${wTrend}, Body fat: ${bfTrend}. ${ideal ? "Favorable body composition change." : "Monitor composition alongside weight."}`, bf[bf.length - 1], "%", { low: 10, high: 25 }, { wTrend, bfTrend })
      }

      case "lean-mass-estimate": {
        const weight = vals("weight"); const bf = vals("body_fat")
        if (weight.length < 3 || bf.length < 3) return null
        const w = weight[weight.length - 1]; const f = bf[bf.length - 1]
        const lean = w * (1 - f / 100)
        const prevW = weight.length > 7 ? weight[weight.length - 8] : weight[0]
        const prevF = bf.length > 7 ? bf[bf.length - 8] : bf[0]
        const prevLean = prevW * (1 - prevF / 100)
        const change = lean - prevLean
        const sev: InsightSeverity = change > 0 ? "positive" : Math.abs(change) < 0.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Lean mass: ${lean.toFixed(1)} kg (${change > 0 ? "+" : ""}${change.toFixed(1)} kg change). ${change > 0 ? "Gaining lean mass." : Math.abs(change) < 0.5 ? "Stable." : "Lean mass declining — increase protein/resistance training."}`, Number(lean.toFixed(1)), "kg", { low: 40, high: 70 }, { weight: w, bodyFat: f })
      }

      case "bmi-trend": {
        const bmi = vals("bmi")
        if (bmi.length < 7) return null
        const current = bmi[bmi.length - 1]
        const t = trend(bmi.slice(-30))
        const cat = current < 18.5 ? "Underweight" : current < 25 ? "Normal" : current < 30 ? "Overweight" : "Obese"
        const sev: InsightSeverity = current >= 18.5 && current < 25 ? "positive" : current >= 25 && current < 30 ? "info" : "warning"
        return makeInsight(alg, sev, `BMI: ${current.toFixed(1)} (${cat}, ${t}). ${current >= 18.5 && current < 25 ? "Healthy range." : `Consider lifestyle adjustments for optimal BMI.`}`, Number(current.toFixed(1)), "kg/m²", { low: 18.5, high: 25 }, { category: cat, trend: t })
      }

      case "weight-goal-projection": {
        const weight = vals("weight")
        if (weight.length < 14) return null
        const slope = linearSlope(weight.slice(-14))
        const current = weight[weight.length - 1]
        const weeklyChange = slope * 7
        const sev: InsightSeverity = Math.abs(weeklyChange) < 0.5 ? "info" : weeklyChange < -1.5 ? "warning" : "positive"
        return makeInsight(alg, sev, `Weight trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(2)} kg/week. ${Math.abs(weeklyChange) < 0.2 ? "Weight is stable." : weeklyChange < -1.5 ? "Rapid loss — ensure adequate nutrition." : "Steady progress."}`, Number(weeklyChange.toFixed(2)), "kg/week", { low: -1, high: 0.5 }, { current: current.toFixed(1), slope: slope.toFixed(4) })
      }

      case "fluid-retention-pattern": {
        const weight = vals("weight")
        if (weight.length < 14) return null
        const ma = movingAverage(weight, 3)
        const spikes = weight.filter((w, i) => i < ma.length && w > ma[i] + 1).length
        const pct = (spikes / weight.length) * 100
        const sev: InsightSeverity = pct < 10 ? "positive" : pct < 25 ? "info" : "warning"
        return makeInsight(alg, sev, `Fluid retention spikes: ${spikes} days (~${pct.toFixed(0)}%). ${pct >= 25 ? "Frequent weight spikes — possible fluid retention cycles." : "Normal weight fluctuation."}`, spikes, "days", { low: 0, high: 5 }, { totalDays: weight.length })
      }

      case "metabolic-rate-estimate": {
        const weight = vals("weight"); const cal = vals("calories")
        if (weight.length < 3 || cal.length < 7) return null
        const w = weight[weight.length - 1]
        const bmr = w * 24
        const avgCal = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
        const activityFactor = avgCal / bmr
        const sev: InsightSeverity = activityFactor >= 1.5 ? "positive" : activityFactor >= 1.2 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated BMR: ${Math.round(bmr)} kcal. Activity factor: ${activityFactor.toFixed(2)}. ${activityFactor >= 1.5 ? "Active lifestyle." : activityFactor >= 1.2 ? "Lightly active." : "Sedentary."}`, Math.round(bmr), "kcal", { low: 1200, high: 2400 }, { weight: w, activityFactor: activityFactor.toFixed(2) })
      }

      case "body-fat-trend": {
        const bf = vals("body_fat")
        if (bf.length < 7) return null
        const slope = linearSlope(bf.slice(-30))
        const current = bf[bf.length - 1]
        const monthlyChange = slope * 30
        const sev: InsightSeverity = monthlyChange < -0.5 ? "positive" : Math.abs(monthlyChange) < 0.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Body fat: ${current.toFixed(1)}% (${monthlyChange > 0 ? "+" : ""}${monthlyChange.toFixed(1)}%/month). ${monthlyChange < -0.5 ? "Decreasing — good progress." : Math.abs(monthlyChange) < 0.5 ? "Stable." : "Increasing — review diet and exercise."}`, Number(current.toFixed(1)), "%", { low: 10, high: 25 }, { monthlyChange: monthlyChange.toFixed(2) })
      }

      case "weight-plateau": {
        const weight = vals("weight")
        if (weight.length < 14) return null
        const recent = weight.slice(-14)
        const cv = coefficientOfVariation(recent)
        const slope = Math.abs(linearSlope(recent))
        const isPlateau = cv < 1 && slope < 0.02
        const sev: InsightSeverity = isPlateau ? "info" : "positive"
        return makeInsight(alg, sev, `Weight plateau: ${isPlateau ? "Yes" : "No"} (CV: ${cv.toFixed(1)}%, slope: ${slope.toFixed(3)} kg/day). ${isPlateau ? "Weight has been stable for 2 weeks — adjust plan if losing/gaining is the goal." : "Weight is actively changing."}`, Number(cv.toFixed(1)), "% CV", { low: 0, high: 3 }, { slope: slope.toFixed(3), isPlateau })
      }

      // ── Advanced Recovery & Stress ──
      case "recovery-time-needed": {
        const strain = vals("strain_score"); const rec = vals("recovery_score")
        if (strain.length < 3 || rec.length < 3) return null
        const avgStrain = strain.slice(-3).reduce((a, b) => a + b, 0) / 3
        const avgRec = rec.slice(-3).reduce((a, b) => a + b, 0) / 3
        const hoursNeeded = Math.max(12, avgStrain * 1.5 - avgRec * 0.3)
        const sev: InsightSeverity = hoursNeeded < 18 ? "positive" : hoursNeeded < 24 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated recovery needed: ${Math.round(hoursNeeded)}h. ${hoursNeeded < 18 ? "Light recovery sufficient." : hoursNeeded < 24 ? "Standard recovery period." : "Extended recovery recommended."}`, Math.round(hoursNeeded), "hours", { low: 12, high: 24 }, { avgStrain: avgStrain.toFixed(0), avgRec: avgRec.toFixed(0) })
      }

      case "stress-recovery-ratio": {
        const stress = vals("stress"); const rec = vals("recovery_score")
        if (stress.length < 7 || rec.length < 7) return null
        const avgStress = stress.slice(-7).reduce((a, b) => a + b, 0) / 7
        const avgRec = rec.slice(-7).reduce((a, b) => a + b, 0) / 7
        const ratio = avgRec > 0 ? avgStress / avgRec : 999
        const sev: InsightSeverity = ratio < 0.8 ? "positive" : ratio < 1.2 ? "info" : "warning"
        return makeInsight(alg, sev, `Stress/recovery ratio: ${ratio.toFixed(2)}. ${ratio < 0.8 ? "Recovery exceeds stress — well balanced." : ratio < 1.2 ? "Balanced." : "Stress exceeds recovery — prioritize rest."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.5, high: 1.2 }, { avgStress: Math.round(avgStress), avgRec: Math.round(avgRec) })
      }

      case "allostatic-load": {
        const stress = vals("stress"); const rhr = vals("resting_heart_rate"); const sleepV = vals("sleep")
        if (stress.length < 7 || rhr.length < 7 || sleepV.length < 7) return null
        const stressScore = Math.min(33, (stress.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
        const rhrScore = Math.min(33, Math.max(0, (rhr.slice(-7).reduce((a, b) => a + b, 0) / 7 - 50) / 50 * 33))
        const sleepScore = Math.min(33, Math.max(0, (1 - sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 33))
        const load = Math.round(stressScore + rhrScore + sleepScore)
        const sev: InsightSeverity = load < 30 ? "positive" : load < 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Allostatic load: ${load}/100. Stress=${Math.round(stressScore)}, Cardiac=${Math.round(rhrScore)}, Sleep=${Math.round(sleepScore)}. ${load < 30 ? "Low physiological burden." : load < 60 ? "Moderate stress load." : "High cumulative stress — recovery needed."}`, load, "/100", { low: 20, high: 60 }, { stressScore: Math.round(stressScore), rhrScore: Math.round(rhrScore), sleepScore: Math.round(sleepScore) })
      }

      case "burnout-risk": {
        const stress = vals("stress"); const rec = vals("recovery_score")
        if (stress.length < 14 || rec.length < 14) return null
        const stressTrend = linearSlope(stress.slice(-14))
        const recTrend = linearSlope(rec.slice(-14))
        const risk = (stressTrend > 0 ? 1 : 0) + (recTrend < 0 ? 1 : 0) + (stress.slice(-7).reduce((a, b) => a + b, 0) / 7 > 70 ? 1 : 0)
        const sev: InsightSeverity = risk === 0 ? "positive" : risk <= 1 ? "info" : "warning"
        return makeInsight(alg, sev, `Burnout risk: ${risk}/3 indicators. ${risk >= 2 ? "Rising stress + declining recovery — take preventive action." : "Manageable stress levels."}`, risk, "/3", { low: 0, high: 2 }, { stressTrend: stressTrend.toFixed(3), recTrend: recTrend.toFixed(3) })
      }

      case "recovery-velocity": {
        const rec = vals("recovery_score")
        if (rec.length < 14) return null
        const dips = []; let i = 0
        while (i < rec.length) { if (rec[i] < 50) { const start = i; while (i < rec.length && rec[i] < 50) i++; dips.push(i - start) } else { i++ } }
        const avgDipLen = dips.length > 0 ? dips.reduce((a, b) => a + b, 0) / dips.length : 0
        const sev: InsightSeverity = avgDipLen <= 2 ? "positive" : avgDipLen <= 4 ? "info" : "warning"
        return makeInsight(alg, sev, `Recovery velocity: avg ${avgDipLen.toFixed(1)} days below 50%. ${avgDipLen <= 2 ? "Quick bounce-back." : avgDipLen <= 4 ? "Moderate recovery speed." : "Slow recovery — consider rest priorities."}`, Number(avgDipLen.toFixed(1)), "days", { low: 1, high: 4 }, { dips: dips.length })
      }

      case "stress-reactivity": {
        const stress = vals("stress")
        if (stress.length < 14) return null
        const baseline = stress.slice(0, -7).reduce((a, b) => a + b, 0) / (stress.length - 7)
        const peaks = stress.slice(-7).filter((s) => s > baseline * 1.3)
        const avgPeak = peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : baseline
        const reactivity = avgPeak - baseline
        const sev: InsightSeverity = reactivity < 15 ? "positive" : reactivity < 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Stress reactivity: ${reactivity.toFixed(0)} points above baseline. ${peaks.length} spike days this week. ${reactivity >= 30 ? "High stress reactivity." : "Normal stress response."}`, Math.round(reactivity), "points", { low: 0, high: 25 }, { baseline: Math.round(baseline), spikeDays: peaks.length })
      }

      case "weekend-recovery": {
        const rec = dayStats("recovery_score")
        if (rec.length < 14) return null
        const we = rec.filter((d) => { const dow = new Date(d.date).getDay(); return dow === 0 || dow === 6 }).map((d) => d.value)
        const wd = rec.filter((d) => { const dow = new Date(d.date).getDay(); return dow >= 1 && dow <= 5 }).map((d) => d.value)
        const weAvg = we.length ? we.reduce((a, b) => a + b, 0) / we.length : 0
        const wdAvg = wd.length ? wd.reduce((a, b) => a + b, 0) / wd.length : 0
        const diff = weAvg - wdAvg
        const sev: InsightSeverity = diff > 5 ? "positive" : Math.abs(diff) < 5 ? "info" : "warning"
        return makeInsight(alg, sev, `Weekend recovery: ${Math.round(weAvg)}% vs weekday: ${Math.round(wdAvg)}% (${diff > 0 ? "+" : ""}${Math.round(diff)}%). ${diff > 5 ? "Better weekend recovery — expected pattern." : Math.abs(diff) < 5 ? "Consistent recovery." : "Weekdays have better recovery — unusual."}`, Math.round(diff), "%", { low: 0, high: 15 }, { weAvg: Math.round(weAvg), wdAvg: Math.round(wdAvg) })
      }

      case "stress-habituation": {
        const stress = vals("stress")
        if (stress.length < 21) return null
        const first = stress.slice(0, 7).reduce((a, b) => a + b, 0) / 7
        const mid = stress.slice(7, 14).reduce((a, b) => a + b, 0) / 7
        const last = stress.slice(-7).reduce((a, b) => a + b, 0) / 7
        const adapting = first > mid && mid > last
        const sev: InsightSeverity = adapting ? "positive" : last < first ? "info" : "warning"
        return makeInsight(alg, sev, `Stress habituation: Week1=${Math.round(first)}, Week2=${Math.round(mid)}, Week3=${Math.round(last)}. ${adapting ? "Progressively adapting — stress response declining." : last < first ? "Partial adaptation." : "No habituation — stress management strategies needed."}`, Math.round(last), "score", { low: 30, high: 70 }, { first: Math.round(first), mid: Math.round(mid), last: Math.round(last) })
      }

      case "composite-recovery": {
        const hrv = vals("heart_rate_variability"); const sleepV = vals("sleep"); const stress = vals("stress")
        if (hrv.length < 7 || sleepV.length < 7 || stress.length < 7) return null
        const hrvScore = Math.min(33, (hrv.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
        const sleepScore = Math.min(33, (sleepV.slice(-7).reduce((a, b) => a + b, 0) / 7 / 480) * 33)
        const stressScore = Math.min(33, (1 - stress.slice(-7).reduce((a, b) => a + b, 0) / 7 / 100) * 33)
        const nri = Math.round(hrvScore + sleepScore + stressScore)
        const sev: InsightSeverity = nri >= 70 ? "positive" : nri >= 45 ? "info" : "warning"
        return makeInsight(alg, sev, `Neural recovery index: ${nri}/100. HRV=${Math.round(hrvScore)}, Sleep=${Math.round(sleepScore)}, Stress=${Math.round(stressScore)}. ${nri >= 70 ? "Excellent neural recovery." : nri >= 45 ? "Moderate recovery." : "Poor recovery — prioritize rest."}`, nri, "/100", { low: 45, high: 80 }, { hrvScore: Math.round(hrvScore), sleepScore: Math.round(sleepScore), stressScore: Math.round(stressScore) })
      }

      case "readiness-prediction": {
        const rec = vals("recovery_score"); const sleepV = vals("sleep"); const strain = vals("strain_score")
        if (rec.length < 3 || sleepV.length < 3 || strain.length < 3) return null
        const lastRec = rec[rec.length - 1]; const lastSleep = sleepV[sleepV.length - 1]; const lastStrain = strain[strain.length - 1]
        const predicted = Math.round(lastRec * 0.4 + (lastSleep / 480) * 30 + (1 - lastStrain / 100) * 30)
        const sev: InsightSeverity = predicted >= 70 ? "positive" : predicted >= 45 ? "info" : "warning"
        return makeInsight(alg, sev, `Predicted readiness: ${predicted}/100. ${predicted >= 70 ? "Ready for hard training tomorrow." : predicted >= 45 ? "Moderate readiness — light to moderate training." : "Low readiness — prioritize recovery."}`, predicted, "/100", { low: 40, high: 75 }, { lastRec, lastSleep, lastStrain })
      }

      case "strain-accumulation": {
        const strain = vals("strain_score")
        if (strain.length < 7) return null
        const weekTotal = strain.slice(-7).reduce((a, b) => a + b, 0)
        const avgDaily = weekTotal / 7
        const sev: InsightSeverity = weekTotal < 70 ? "positive" : weekTotal < 100 ? "info" : "warning"
        return makeInsight(alg, sev, `7-day strain: ${weekTotal.toFixed(0)} (avg ${avgDaily.toFixed(0)}/day). ${weekTotal >= 100 ? "High accumulated strain — recovery day recommended." : "Manageable strain level."}`, Math.round(weekTotal), "total", { low: 50, high: 100 }, { avgDaily: avgDaily.toFixed(0) })
      }

      case "recovery-consistency": {
        const rec = vals("recovery_score")
        if (rec.length < 14) return null
        const cv = coefficientOfVariation(rec.slice(-14))
        const sev: InsightSeverity = cv < 15 ? "positive" : cv < 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Recovery consistency (CV): ${cv.toFixed(0)}%. ${cv < 15 ? "Very stable recovery." : cv < 30 ? "Moderate variation." : "Highly variable recovery — inconsistent stress/rest patterns."}`, Number(cv.toFixed(0)), "%CV", { low: 10, high: 30 }, { days: 14 })
      }

      // ── Advanced Respiratory & SpO2 ──
      case "sleep-breathing": {
        const rr = vals("respiratory_rate"); const sleepV = vals("sleep")
        if (rr.length < 7 || sleepV.length < 7) return null
        const avgRR = rr.slice(-7).reduce((a, b) => a + b, 0) / 7
        const rrSD = stddev(rr.slice(-7))
        const sev: InsightSeverity = avgRR < 16 && rrSD < 3 ? "positive" : avgRR < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep breathing: avg ${avgRR.toFixed(1)} breaths/min (SD: ${rrSD.toFixed(1)}). ${avgRR < 16 ? "Calm, regular breathing." : avgRR < 20 ? "Normal range." : "Elevated — possible stress or respiratory issue."}`, Number(avgRR.toFixed(1)), "breaths/min", { low: 12, high: 18 }, { rrSD: rrSD.toFixed(1) })
      }

      case "respiratory-fitness": {
        const rr = vals("respiratory_rate")
        if (rr.length < 14 || workouts.length < 3) return null
        const t = trend(rr.slice(-14))
        const avgRR = rr.slice(-7).reduce((a, b) => a + b, 0) / 7
        const sev: InsightSeverity = t === "declining" ? "positive" : t === "stable" ? "info" : "warning"
        return makeInsight(alg, sev, `Respiratory fitness: avg RR ${avgRR.toFixed(1)}/min (${t}). ${t === "declining" ? "Improving — lower RR indicates better fitness." : "Respiratory rate stable or rising."}`, Number(avgRR.toFixed(1)), "breaths/min", { low: 12, high: 18 }, { trend: t, workouts: workouts.length })
      }

      case "dyspnea-risk": {
        const rr = vals("respiratory_rate"); const spo2 = vals("spo2")
        if (rr.length < 5 || spo2.length < 5) return null
        const avgRR = rr.slice(-5).reduce((a, b) => a + b, 0) / 5
        const avgSpO2 = spo2.slice(-5).reduce((a, b) => a + b, 0) / 5
        const risk = (avgRR > 20 ? 1 : 0) + (avgSpO2 < 95 ? 1 : 0)
        const sev: InsightSeverity = risk === 0 ? "positive" : risk === 1 ? "info" : "warning"
        return makeInsight(alg, sev, `Respiratory risk: ${risk}/2 flags (RR: ${avgRR.toFixed(0)}, SpO2: ${avgSpO2.toFixed(0)}%). ${risk >= 2 ? "Elevated RR + low SpO2 — medical evaluation suggested." : "Respiratory parameters normal."}`, risk, "/2", { low: 0, high: 1 }, { avgRR: avgRR.toFixed(0), avgSpO2: avgSpO2.toFixed(0) })
      }

      case "nocturnal-desat": {
        const spo2 = vals("spo2")
        if (spo2.length < 7) return null
        const lowNights = spo2.filter((v) => v < 93).length
        const pct = (lowNights / spo2.length) * 100
        const sev: InsightSeverity = pct === 0 ? "positive" : pct < 15 ? "info" : "warning"
        return makeInsight(alg, sev, `Nocturnal desaturation (<93%): ${lowNights}/${spo2.length} readings (${pct.toFixed(0)}%). ${pct >= 15 ? "Frequent low SpO2 — consider sleep study." : "SpO2 generally adequate during sleep."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 10 }, { lowNights })
      }

      case "breathing-efficiency": {
        const rr = vals("respiratory_rate"); const hr = vals("heart_rate")
        if (rr.length < 7 || hr.length < 7) return null
        const n = Math.min(rr.length, hr.length)
        const ratios = rr.slice(-n).map((r, i) => hr[hr.length - n + i] > 0 ? r / hr[hr.length - n + i] : 0).filter((r) => r > 0)
        const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
        const sev: InsightSeverity = avgRatio < 0.2 ? "positive" : avgRatio < 0.3 ? "info" : "warning"
        return makeInsight(alg, sev, `Breathing efficiency (RR/HR): ${avgRatio.toFixed(3)}. ${avgRatio < 0.2 ? "Efficient breathing relative to heart rate." : "Higher ratio — respiratory conditioning may help."}`, Number(avgRatio.toFixed(3)), "ratio", { low: 0.1, high: 0.25 }, { samples: ratios.length })
      }

      case "respiratory-reserve": {
        const rr = vals("respiratory_rate")
        if (rr.length < 14) return null
        const min = Math.min(...rr); const max = Math.max(...rr)
        const reserve = max - min
        const sev: InsightSeverity = reserve > 8 ? "positive" : reserve > 4 ? "info" : "warning"
        return makeInsight(alg, sev, `Respiratory reserve: ${reserve.toFixed(0)} breaths/min range (${min.toFixed(0)}-${max.toFixed(0)}). ${reserve > 8 ? "Good respiratory dynamic range." : "Limited reserve — may indicate reduced capacity."}`, Math.round(reserve), "breaths/min", { low: 4, high: 12 }, { min: min.toFixed(0), max: max.toFixed(0) })
      }

      case "spo2-variability": {
        const spo2 = vals("spo2")
        if (spo2.length < 7) return null
        const sd = stddev(spo2.slice(-14))
        const sev: InsightSeverity = sd < 1.5 ? "positive" : sd < 3 ? "info" : "warning"
        return makeInsight(alg, sev, `SpO2 variability (SD): ${sd.toFixed(1)}%. ${sd < 1.5 ? "Very stable oxygen saturation." : sd < 3 ? "Normal variation." : "High variability — monitor for patterns."}`, Number(sd.toFixed(1)), "%SD", { low: 0.5, high: 3 }, { days: Math.min(14, spo2.length) })
      }

      case "ventilatory-threshold": {
        const rr = vals("respiratory_rate"); const hr = vals("heart_rate")
        if (rr.length < 7 || hr.length < 7 || workouts.length < 3) return null
        const maxRR = Math.max(...rr); const maxHR = Math.max(...hr)
        const vtEstimate = maxHR > 0 ? (maxRR / maxHR) * 100 : 0
        const sev: InsightSeverity = vtEstimate > 15 ? "positive" : vtEstimate > 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Ventilatory threshold proxy: ${vtEstimate.toFixed(1)}. Max RR: ${maxRR.toFixed(0)}, Max HR: ${maxHR.toFixed(0)}. ${vtEstimate > 15 ? "Good ventilatory capacity." : "Room for respiratory fitness improvement."}`, Number(vtEstimate.toFixed(1)), "index", { low: 10, high: 20 }, { maxRR: maxRR.toFixed(0), maxHR: maxHR.toFixed(0) })
      }

      // ── Advanced Metabolic ──
      case "glucose-meal-response": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 10) return null
        const spikes = glucose.filter((g) => g > 160).length
        const pct = (spikes / glucose.length) * 100
        const sev: InsightSeverity = pct < 10 ? "positive" : pct < 25 ? "info" : "warning"
        return makeInsight(alg, sev, `Post-meal glucose spikes (>160 mg/dL): ${spikes}/${glucose.length} readings (${pct.toFixed(0)}%). ${pct >= 25 ? "Frequent spikes — consider glycemic index of meals." : "Glucose responses generally controlled."}`, Number(pct.toFixed(0)), "%", { low: 0, high: 20 }, { spikes })
      }

      case "fasting-glucose-trend": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 14) return null
        const t = trend(glucose.slice(-14))
        const avg = glucose.slice(-7).reduce((a, b) => a + b, 0) / 7
        const sev: InsightSeverity = avg < 100 ? "positive" : avg < 126 ? "info" : "warning"
        return makeInsight(alg, sev, `Fasting glucose trend: ${avg.toFixed(0)} mg/dL avg (${t}). ${avg < 100 ? "Normal fasting glucose." : avg < 126 ? "Prediabetic range — lifestyle modifications recommended." : "Elevated — consult healthcare provider."}`, Math.round(avg), "mg/dL", { low: 70, high: 100 }, { trend: t })
      }

      case "dawn-phenomenon": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 7) return null
        const baseline = glucose.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, glucose.length - 3)
        const recent = glucose.slice(-3).reduce((a, b) => a + b, 0) / 3
        const rise = recent - baseline
        const detected = rise > 15
        const sev: InsightSeverity = !detected ? "positive" : rise < 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Dawn phenomenon: ${detected ? "detected" : "not detected"} (${rise > 0 ? "+" : ""}${rise.toFixed(0)} mg/dL morning rise). ${detected ? "Morning glucose elevation present." : "Normal morning glucose pattern."}`, Math.round(rise), "mg/dL", { low: 0, high: 20 }, { baseline: Math.round(baseline), recent: Math.round(recent) })
      }

      case "glucose-exercise-response": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 7 || workouts.length < 3) return null
        const avg = glucose.reduce((a, b) => a + b, 0) / glucose.length
        const t = trend(glucose.slice(-7))
        const sev: InsightSeverity = avg < 120 ? "positive" : avg < 150 ? "info" : "warning"
        return makeInsight(alg, sev, `Post-exercise glucose avg: ${avg.toFixed(0)} mg/dL (${t}). ${avg < 120 ? "Exercise effectively lowering glucose." : "Glucose remains elevated after exercise."}`, Math.round(avg), "mg/dL", { low: 70, high: 140 }, { trend: t, workouts: workouts.length })
      }

      case "time-in-range": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 7) return null
        const inRange = glucose.filter((g) => g >= 70 && g <= 180).length
        const pct = (inRange / glucose.length) * 100
        const sev: InsightSeverity = pct >= 70 ? "positive" : pct >= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Time in glucose range (70-180): ${pct.toFixed(0)}%. ${pct >= 70 ? "Excellent glycemic control." : pct >= 50 ? "Moderate control — minimize out-of-range readings." : "Significant time outside range — review management plan."}`, Number(pct.toFixed(0)), "%", { low: 50, high: 80 }, { inRange, total: glucose.length })
      }

      case "hypoglycemia-risk": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 7) return null
        const lowCount = glucose.filter((g) => g < 70).length
        const pct = (lowCount / glucose.length) * 100
        const sev: InsightSeverity = pct === 0 ? "positive" : pct < 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Hypoglycemia events (<70 mg/dL): ${lowCount}/${glucose.length} (${pct.toFixed(0)}%). ${pct >= 10 ? "Frequent low glucose — review medication and meal timing." : "Low glucose events are rare."}`, lowCount, "events", { low: 0, high: 3 }, { pct: pct.toFixed(0) })
      }

      case "insulin-sensitivity-proxy": {
        const glucose = vals("blood_glucose")
        if (glucose.length < 14) return null
        const cv = coefficientOfVariation(glucose.slice(-14))
        const sev: InsightSeverity = cv < 20 ? "positive" : cv < 36 ? "info" : "warning"
        return makeInsight(alg, sev, `Glucose variability (CV): ${cv.toFixed(0)}%. ${cv < 20 ? "Low variability — good insulin sensitivity proxy." : cv < 36 ? "Moderate variability." : "High variability — possible insulin resistance indicator."}`, Number(cv.toFixed(0)), "%CV", { low: 15, high: 36 }, { days: 14 })
      }

      case "calorie-burn-efficiency": {
        const cal = vals("calories"); const weight = vals("weight")
        if (cal.length < 7 || weight.length < 1) return null
        const w = weight[weight.length - 1]
        const avgCal = cal.slice(-7).reduce((a, b) => a + b, 0) / 7
        const perKg = w > 0 ? avgCal / w : 0
        const sev: InsightSeverity = perKg >= 30 ? "positive" : perKg >= 22 ? "info" : "warning"
        return makeInsight(alg, sev, `Calorie burn efficiency: ${perKg.toFixed(1)} kcal/kg/day. ${perKg >= 30 ? "Active metabolism." : perKg >= 22 ? "Average efficiency." : "Low burn per kg — increase activity intensity."}`, Number(perKg.toFixed(1)), "kcal/kg", { low: 22, high: 35 }, { weight: w, avgCal: Math.round(avgCal) })
      }

      // ── Advanced Workout Performance ──
      case "training-intensity-dist": {
        if (workouts.length < 5) return null
        const hrWorkouts = workouts.filter((w) => w.averageHeartRate && w.maxHeartRate)
        if (hrWorkouts.length < 3) return null
        const maxHR = Math.max(...hrWorkouts.map((w) => w.maxHeartRate!))
        const z1z2 = hrWorkouts.filter((w) => w.averageHeartRate! < maxHR * 0.75).length
        const z3 = hrWorkouts.filter((w) => w.averageHeartRate! >= maxHR * 0.75 && w.averageHeartRate! < maxHR * 0.85).length
        const z4z5 = hrWorkouts.filter((w) => w.averageHeartRate! >= maxHR * 0.85).length
        const total = hrWorkouts.length
        const polarized = (z1z2 / total > 0.7 && z4z5 / total > 0.1)
        const sev: InsightSeverity = polarized ? "positive" : z3 / total > 0.5 ? "warning" : "info"
        return makeInsight(alg, sev, `Training distribution: ${((z1z2 / total) * 100).toFixed(0)}% easy, ${((z3 / total) * 100).toFixed(0)}% moderate, ${((z4z5 / total) * 100).toFixed(0)}% hard. ${polarized ? "Polarized distribution — optimal for endurance." : z3 / total > 0.5 ? "Too much moderate — polarize more." : "Mixed distribution."}`, Number(((z1z2 / total) * 100).toFixed(0)), "% easy", { low: 60, high: 80 }, { z1z2, z3, z4z5 })
      }

      case "aerobic-decoupling": {
        if (workouts.length < 3) return null
        const longWorkouts = workouts.filter((w) => (w.durationSeconds || 0) > 2700 && w.averageHeartRate)
        if (longWorkouts.length < 2) return null
        const decoupling = longWorkouts.map((w) => { return w.maxHeartRate && w.averageHeartRate ? ((w.maxHeartRate - w.averageHeartRate) / w.averageHeartRate) * 100 : 0 }).filter((d) => d > 0)
        const avg = decoupling.reduce((a, b) => a + b, 0) / decoupling.length
        const sev: InsightSeverity = avg < 5 ? "positive" : avg < 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Aerobic decoupling: ${avg.toFixed(1)}%. ${avg < 5 ? "Minimal — excellent aerobic fitness." : avg < 10 ? "Moderate — room for improvement." : "High decoupling — more base training needed."}`, Number(avg.toFixed(1)), "%", { low: 3, high: 10 }, { samples: decoupling.length })
      }

      case "training-stress-score": {
        if (workouts.length < 3) return null
        const scores = workouts.map((w) => { const dur = (w.durationSeconds || 0) / 3600; const intensity = w.averageHeartRate ? w.averageHeartRate / 150 : 0.7; return dur * intensity * 100 })
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        const sev: InsightSeverity = avg >= 50 && avg <= 150 ? "positive" : avg > 150 ? "warning" : "info"
        return makeInsight(alg, sev, `Avg training stress: ${avg.toFixed(0)} TSS/session. ${avg >= 50 && avg <= 150 ? "Productive training stimulus." : avg > 150 ? "Very high per-session stress." : "Low training stimulus."}`, Math.round(avg), "TSS", { low: 40, high: 150 }, { sessions: scores.length })
      }

      case "chronic-training-load": {
        if (workouts.length < 14) return null
        const now = Date.now()
        const dailyLoad: number[] = Array(42).fill(0)
        for (const w of workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 42) dailyLoad[d] += (w.durationSeconds || 0) / 60 * (w.averageHeartRate ? w.averageHeartRate / 150 : 1) }
        let ctl = 0
        for (let i = 41; i >= 0; i--) ctl = ctl + (dailyLoad[i] - ctl) / 42
        const sev: InsightSeverity = ctl >= 40 ? "positive" : ctl >= 20 ? "info" : "warning"
        return makeInsight(alg, sev, `Chronic training load (CTL): ${ctl.toFixed(0)}. ${ctl >= 40 ? "Strong fitness base." : ctl >= 20 ? "Moderate fitness." : "Low CTL — gradually increase training volume."}`, Math.round(ctl), "CTL", { low: 20, high: 60 }, { days: 42 })
      }

      case "acute-chronic-ratio": {
        if (workouts.length < 14) return null
        const now = Date.now()
        const dailyLoad: number[] = Array(28).fill(0)
        for (const w of workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 28) dailyLoad[d] += (w.durationSeconds || 0) / 60 }
        const acuteLoad = dailyLoad.slice(0, 7).reduce((a, b) => a + b, 0) / 7
        const chronicLoad = dailyLoad.reduce((a, b) => a + b, 0) / 28
        const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1
        const sev: InsightSeverity = ratio >= 0.8 && ratio <= 1.3 ? "positive" : ratio > 1.5 ? "warning" : "info"
        return makeInsight(alg, sev, `Acute:Chronic ratio: ${ratio.toFixed(2)}. ${ratio >= 0.8 && ratio <= 1.3 ? "Sweet spot (0.8-1.3) — optimal injury risk." : ratio > 1.5 ? "High spike risk (>1.5) — reduce load." : "Low ratio — training under-stimulating."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.8, high: 1.3 }, { acuteLoad: acuteLoad.toFixed(0), chronicLoad: chronicLoad.toFixed(0) })
      }

      case "performance-efficiency": {
        if (workouts.length < 3) return null
        const hrWorkouts = workouts.filter((w) => w.averageHeartRate && w.distanceMeters && w.durationSeconds)
        if (hrWorkouts.length < 2) return null
        const efs = hrWorkouts.map((w) => { const speedKmH = (w.distanceMeters! / 1000) / (w.durationSeconds! / 3600); return w.averageHeartRate! > 0 ? speedKmH / w.averageHeartRate! * 100 : 0 }).filter((e) => e > 0)
        const avg = efs.reduce((a, b) => a + b, 0) / efs.length
        const t = efs.length >= 5 ? trend(efs) : "stable"
        const sev: InsightSeverity = t === "improving" ? "positive" : t === "stable" ? "info" : "warning"
        return makeInsight(alg, sev, `Performance efficiency: ${avg.toFixed(2)} (speed/HR ratio, ${t}). ${t === "improving" ? "Getting faster at same HR — fitness improving." : "Efficiency stable or declining."}`, Number(avg.toFixed(2)), "EF", { low: 3, high: 8 }, { samples: efs.length, trend: t })
      }

      case "progressive-overload": {
        if (workouts.length < 14) return null
        const now = Date.now()
        const week1 = workouts.filter((w) => { const d = (now - new Date(w.startedAt).getTime()) / 86400000; return d >= 7 && d < 14 })
        const week2 = workouts.filter((w) => { const d = (now - new Date(w.startedAt).getTime()) / 86400000; return d >= 0 && d < 7 })
        const load1 = week1.reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
        const load2 = week2.reduce((s, w) => s + (w.durationSeconds || 0) / 60, 0)
        const change = load1 > 0 ? ((load2 - load1) / load1) * 100 : 0
        const sev: InsightSeverity = change > 5 && change < 15 ? "positive" : change >= 15 ? "warning" : "info"
        return makeInsight(alg, sev, `Weekly load change: ${change > 0 ? "+" : ""}${change.toFixed(0)}%. ${change > 5 && change < 15 ? "Good progressive overload (5-15%)." : change >= 15 ? "Excessive jump (>15%) — injury risk." : "Maintaining or reducing load."}`, Number(change.toFixed(0)), "% change", { low: 5, high: 15 }, { thisWeek: Math.round(load2), lastWeek: Math.round(load1) })
      }

      case "workout-completion": {
        if (workouts.length < 5) return null
        const durations = workouts.map((w) => (w.durationSeconds || 0) / 60)
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length
        const recent = durations.slice(-5)
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
        const completionPct = avg > 0 ? (recentAvg / avg) * 100 : 100
        const sev: InsightSeverity = completionPct >= 90 ? "positive" : completionPct >= 70 ? "info" : "warning"
        return makeInsight(alg, sev, `Workout completion: ${completionPct.toFixed(0)}% of typical duration (recent: ${Math.round(recentAvg)} min, avg: ${Math.round(avg)} min). ${completionPct >= 90 ? "Consistent completion." : "Recent workouts shorter than usual."}`, Number(completionPct.toFixed(0)), "%", { low: 75, high: 100 }, { recentAvg: Math.round(recentAvg), overallAvg: Math.round(avg) })
      }

      case "sport-diversity": {
        if (workouts.length < 5) return null
        const types = new Set(workouts.map((w) => w.activityType || "unknown"))
        const diversity = types.size
        const sev: InsightSeverity = diversity >= 3 ? "positive" : diversity >= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `Sport diversity: ${diversity} different activity types. ${diversity >= 3 ? "Good cross-training — reduces injury risk." : "Limited variety — consider adding different activities."}`, diversity, "types", { low: 2, high: 5 }, { types: [...types] })
      }

      case "training-periodization": {
        if (workouts.length < 21) return null
        const now = Date.now()
        const weekLoads = [0, 0, 0]
        for (const w of workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); const wk = Math.floor(d / 7); if (wk < 3) weekLoads[wk] += (w.durationSeconds || 0) / 60 }
        const building = weekLoads[2] < weekLoads[1] && weekLoads[1] < weekLoads[0]
        const deload = weekLoads[0] < weekLoads[1] * 0.7
        const sev: InsightSeverity = building ? "positive" : deload ? "info" : "warning"
        return makeInsight(alg, sev, `Periodization: Wk1=${Math.round(weekLoads[0])}min, Wk2=${Math.round(weekLoads[1])}min, Wk3=${Math.round(weekLoads[2])}min. ${building ? "Progressive build — good periodization." : deload ? "Recovery week detected." : "No clear periodization pattern."}`, Math.round(weekLoads[0]), "min (this week)", { low: 100, high: 300 }, { weekLoads: weekLoads.map(Math.round) })
      }

      case "race-readiness": {
        if (workouts.length < 14) return null
        const rec = vals("recovery_score"); const rhr = vals("resting_heart_rate")
        const now = Date.now()
        let ctl = 0; let atl = 0
        const dailyLoad: number[] = Array(42).fill(0)
        for (const w of workouts) { const d = Math.floor((now - new Date(w.startedAt).getTime()) / 86400000); if (d < 42) dailyLoad[d] += (w.durationSeconds || 0) / 60 }
        for (let i = 41; i >= 0; i--) { ctl = ctl + (dailyLoad[i] - ctl) / 42; atl = atl + (dailyLoad[i] - atl) / 7 }
        const freshness = ctl - atl
        const recScore = rec.length >= 3 ? rec.slice(-3).reduce((a, b) => a + b, 0) / 3 / 100 * 30 : 15
        const rhrScore = rhr.length >= 7 ? Math.min(30, Math.max(0, (70 - rhr.slice(-7).reduce((a, b) => a + b, 0) / 7) * 1.5)) : 15
        const readiness = Math.round(Math.max(0, Math.min(100, freshness + recScore + rhrScore + 30)))
        const sev: InsightSeverity = readiness >= 70 ? "positive" : readiness >= 45 ? "info" : "warning"
        return makeInsight(alg, sev, `Race readiness: ${readiness}/100. Fitness=${ctl.toFixed(0)}, Freshness=${freshness.toFixed(0)}. ${readiness >= 70 ? "Peak form — go for it!" : readiness >= 45 ? "Moderate readiness." : "Not yet peaked — continue building."}`, readiness, "/100", { low: 40, high: 75 }, { ctl: ctl.toFixed(0), atl: atl.toFixed(0), freshness: freshness.toFixed(0) })
      }

      case "endurance-index": {
        if (workouts.length < 5) return null
        const longWorkouts = workouts.filter((w) => (w.durationSeconds || 0) > 2700).length
        const ratio = (longWorkouts / workouts.length) * 100
        const sev: InsightSeverity = ratio >= 30 ? "positive" : ratio >= 15 ? "info" : "warning"
        return makeInsight(alg, sev, `Endurance index: ${ratio.toFixed(0)}% of workouts >45min (${longWorkouts}/${workouts.length}). ${ratio >= 30 ? "Strong endurance focus." : "Add more long sessions for endurance gains."}`, Number(ratio.toFixed(0)), "%", { low: 15, high: 40 }, { longWorkouts, total: workouts.length })
      }

      default:
        return null
    }
  }
}
