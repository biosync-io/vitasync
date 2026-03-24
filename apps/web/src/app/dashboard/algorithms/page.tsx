"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, ChevronUp } from "lucide-react"

interface Algorithm {
  name: string
  module: string
  category: string
  description: string
  details: string
}

const ALGORITHMS: Algorithm[] = [
  // ── Scoring & Composite Indices ──────────────────────────────────────────
  {
    name: "Health Score",
    module: "analytics.processor",
    category: "Scoring",
    description: "Composite daily health score (0–100, graded A+ to D) from sleep, activity, cardio, recovery, and body sub-scores.",
    details: "Weighted average of five sub-scores: sleep (provider score or duration-based), activity (steps ÷ 10K + active minutes ÷ 30), cardio (resting HR brackets), recovery (readiness score), and body (composition engine). Null sub-scores are excluded and remaining weights re-normalized. Weekly smoothing applied to reduce day-to-day noise.",
  },
  {
    name: "Sleep Sub-Score",
    module: "analytics.processor",
    category: "Scoring",
    description: "Extracts sleep quality score from provider sleep_score metric or falls back to duration-based heuristic.",
    details: "Prefers provider-reported sleep_score if available. Otherwise scores by duration: 7–9h = 85, 6–7h = 65, 5–6h = 50, <5h proportional. Used as one of the five inputs to the composite Health Score.",
  },
  {
    name: "Activity Sub-Score",
    module: "analytics.processor",
    category: "Scoring",
    description: "Activity score derived from daily step count and active minutes.",
    details: "Steps component: steps ÷ 10,000 × 100, capped at 100. Active minutes component: minutes ÷ 30 × 100, capped at 100. Final score = average of both components. Targets align with WHO physical activity recommendations.",
  },
  {
    name: "Cardio Sub-Score",
    module: "analytics.processor",
    category: "Scoring",
    description: "Cardiovascular fitness score based on resting heart rate brackets.",
    details: "Scoring brackets: <50 bpm = 95 (athlete), 50–60 = 85 (excellent), 60–70 = 75 (good), 70–80 = 55 (average), 80+ = 35 (below average). Based on AHA resting heart rate fitness classifications.",
  },
  {
    name: "Weighted Average",
    module: "analytics.processor",
    category: "Statistical",
    description: "Weighted average calculator that handles null/missing sub-scores by re-normalizing remaining weights.",
    details: "Takes an array of [value, weight] pairs. Filters out null values, sums remaining weights, and computes the weighted average over valid entries. Ensures composite scores degrade gracefully when some data sources are unavailable.",
  },
  {
    name: "Readiness Score",
    module: "readiness-engine",
    category: "Scoring",
    description: "Daily readiness/recovery score (0–100) predicting physical stress tolerance from HRV, sleep, strain, RHR, and physiological signals.",
    details: "Five weighted signals: HRV (30%) — current vs 30-day baseline; Sleep (25%) — 60% duration + 40% stage quality; Strain Recovery (20%) — prior day workout load/duration/intensity; Resting HR (15%) — deviation from baseline; Physiological (10%) — SpO2, stress, respiratory rate, temperature. After 14 days, weights auto-personalize via correlation analysis. Returns recommendation: train_hard / train_light / active_recovery / rest.",
  },
  {
    name: "HRV Readiness Signal",
    module: "readiness-engine",
    category: "Scoring",
    description: "HRV readiness component scoring current HRV against 30-day personal baseline.",
    details: "At baseline = 75 points. Above baseline scales up to 100 (proportional to deviation). Below baseline scales down to 0. Contributes 30% weight to the overall Readiness Score. Uses the most recent HRV reading from today's metrics.",
  },
  {
    name: "Sleep Readiness Signal",
    module: "readiness-engine",
    category: "Scoring",
    description: "Sleep quality signal combining duration scoring with sleep stage quality analysis.",
    details: "Composite = 60% duration score + 40% stage quality. Duration: 7–9h = 85+, 6h = 65, 5h = 55, <5h = proportional. Stage quality: deep sleep 15–25% = 100, REM 20–25% = 100, awake <10% = 100. Prefers provider sleep score if available. Contributes 25% to Readiness Score.",
  },
  {
    name: "Strain Recovery Signal",
    module: "readiness-engine",
    category: "Scoring",
    description: "Estimates recovery from prior-day training strain using workout load, duration, and HR intensity.",
    details: "Analyzes yesterday's workouts: count, total duration (>120 min = 40 score), active minutes (>90 min = 55), HR intensity (avg/max % distance from resting). Lower strain = higher recovery score. Contributes 20% to Readiness Score.",
  },
  {
    name: "Resting HR Signal",
    module: "readiness-engine",
    category: "Scoring",
    description: "RHR recovery signal scoring current resting heart rate vs personal baseline.",
    details: "At baseline = 70 points. 10% below baseline = 100 (well recovered). Above baseline scales down to 0 (sympathetic stress). Penalizes elevated RHR as an indicator of incomplete recovery, illness, or overtraining. Contributes 15% to Readiness Score.",
  },
  {
    name: "Physiological Signal",
    module: "readiness-engine",
    category: "Scoring",
    description: "Aggregates SpO₂, stress level, respiratory rate, and temperature deviation into a physiological readiness score.",
    details: "SpO₂ ≥97% = 100, stress is inverted (low = good), respiratory rate 12–20 breaths/min = 90, temperature deviation penalized. Returns average of all available metrics (gracefully handles missing sensors). Contributes 10% to Readiness Score.",
  },
  {
    name: "Readiness Recommendation",
    module: "readiness-engine",
    category: "Scoring",
    description: "Maps readiness score to actionable training recommendation.",
    details: "Score ≥80 = train_hard (high-intensity OK), ≥60 = train_light (moderate activity), ≥40 = active_recovery (walking, stretching), <40 = rest (prioritize sleep and recovery). Helps users make data-driven decisions about workout intensity.",
  },
  {
    name: "Body Score",
    module: "body-score-engine",
    category: "Scoring",
    description: "Composite body composition score (0–100) from weight stability, body fat %, and BMI.",
    details: "Three components: Weight Stability (40%) — 14-day coefficient of variation (CV <1% = 95, >5% = 35); Body Composition (35%) — body fat % against healthy ranges (10–20% = 95, 20–25% = 80); BMI Score (25%) — WHO classification (18.5–24.9 = 95, 25–29.9 = 60, 30+ = 40). Aggregated via weighted average.",
  },
  {
    name: "Weight Stability",
    module: "body-score-engine",
    category: "Scoring",
    description: "Measures weight consistency over 14 days using coefficient of variation.",
    details: "Computes CV (standard deviation ÷ mean × 100) over the last 14 daily weight readings. Scoring: CV <1% = 95 (very stable), 1–2% = 85, 2–3% = 70, 3–5% = 50, >5% = 35 (unstable). Rewards consistency over absolute values.",
  },
  {
    name: "Body Composition Score",
    module: "body-score-engine",
    category: "Scoring",
    description: "Evaluates body fat percentage against healthy ranges using the latest 7-day reading.",
    details: "Uses the most recent body_fat reading within the last 7 days. Scoring: 10–20% = 95 (healthy), 20–25% = 80, 25–30% = 60, 30–35% = 40, >35% = 25. Ranges are general population guidelines; future versions may be gender-adjusted.",
  },
  {
    name: "BMI Score",
    module: "body-score-engine",
    category: "Scoring",
    description: "WHO BMI classification scoring for body mass index assessment.",
    details: "Requires both weight and height metrics. BMI = weight(kg) / height(m)². Scoring: 18.5–24.9 = 95 (normal), 25–29.9 = 60 (overweight), 30+ = 40 (obese), <18.5 = 55 (underweight). Based on World Health Organization classifications.",
  },
  {
    name: "Metabolic Efficiency",
    module: "metabolic-efficiency",
    category: "Scoring",
    description: "Composite metabolic efficiency index (0–100, graded A+ to F) from cardiac, energy, recovery, and aerobic capacity proxies.",
    details: "Four components: Cardiac Efficiency — RHR/HRV ratio per Buchheit methodology; Energy Efficiency — calories per active minute; Recovery Efficiency — RHR elevation after strain via Cole model; Aerobic Capacity — HRV/RHR ratio as VO₂max proxy. Gender-adjusted baselines for females. Includes 30-day trend analysis (improving / stable / declining).",
  },
  {
    name: "Score-to-Grade Converter",
    module: "metabolic-efficiency",
    category: "Scoring",
    description: "Converts 0–100 numeric scores to letter grades (A+ through F).",
    details: "Grade thresholds: ≥95 = A+, ≥90 = A, ≥85 = A−, ≥80 = B+, ≥75 = B, ≥70 = B−, ≥65 = C+, ≥60 = C, ≥55 = C−, ≥50 = D+, ≥45 = D, ≥40 = D−, ≥35 = F+, <35 = F. Used by Health Score, Metabolic Efficiency, and other composite indices.",
  },

  // ── Anomaly Detection ──────────────────────────────────────────────────
  {
    name: "Anomaly Detector (Multi-Method)",
    module: "anomaly-detector",
    category: "Anomaly Detection",
    description: "Multi-method anomaly detection using z-score, IQR, and clinical thresholds to flag unusual health metrics.",
    details: "Three detection methods run in parallel: Z-Score — flags values >2.5σ from 30-day baseline (critical ≥3σ, high ≥2.5σ, medium ≥2σ); IQR — interquartile range with 1.5× fencing; Clinical Thresholds — hardcoded medical ranges (low SpO₂ <92%, elevated RHR >100 bpm, extreme temps). Each alert includes severity, detection method, z-score, and baseline context.",
  },
  {
    name: "Anomaly Detector (Baseline)",
    module: "analytics.processor",
    category: "Anomaly Detection",
    description: "Simplified anomaly detection using z-score against biometric baselines in the post-sync pipeline.",
    details: "Checks recent metric readings against stored biometric baselines. Flags metrics where |z-score| ≥ 2: critical ≥3σ, high ≥2.5σ, medium ≥2σ. Runs automatically after every sync to catch anomalies in near-real-time.",
  },
  {
    name: "Baseline Computation",
    module: "analytics.processor",
    category: "Anomaly Detection",
    description: "Recalculates 30-day biometric baselines (mean, stddev, min, max) for all metric types per user.",
    details: "Aggregates the last 30 days of health_metrics data per (userId, metricType) to compute mean, standard deviation, minimum, maximum, and sample count. Stored in the biometric_baselines table and used as the reference for anomaly detection z-score calculations.",
  },
  {
    name: "IQR Bounds Calculator",
    module: "anomaly-detector",
    category: "Statistical",
    description: "Computes interquartile range fences for outlier detection.",
    details: "Sorts values, computes Q1 (25th percentile), Q3 (75th percentile), IQR = Q3 − Q1. Lower fence = Q1 − 1.5 × IQR, upper fence = Q3 + 1.5 × IQR. Values outside fences are flagged as outliers. More robust than z-score for non-Gaussian distributions.",
  },

  // ── Correlation Analysis ───────────────────────────────────────────────
  {
    name: "Correlation Engine",
    module: "correlation-engine",
    category: "Correlation",
    description: "Pairwise metric correlations using Pearson and Spearman rank methods with statistical significance testing.",
    details: "90-day lookback over top 8 metric types. For each pair: daily aggregation → Pearson r (linear) and Spearman ρ (monotonic) → p-value approximation via t-distribution. Only stores significant results (|r| > 0.3, p < 0.05). Strength labels: very_strong (≥0.7), strong (≥0.5), moderate (≥0.3), weak (<0.3). Direction: positive or negative.",
  },
  {
    name: "Pearson Correlation",
    module: "correlation-engine",
    category: "Statistical",
    description: "Computes Pearson product-moment correlation coefficient measuring linear relationship strength (−1 to +1).",
    details: "For paired observations (x, y): r = Σ(xi − x̄)(yi − ȳ) / √[Σ(xi − x̄)² × Σ(yi − ȳ)²]. Returns 0 if denominator is zero. Assumes linear relationship and normally distributed variables. Used as the primary correlation method.",
  },
  {
    name: "Spearman Rank Correlation",
    module: "correlation-engine",
    category: "Statistical",
    description: "Computes Spearman rank correlation coefficient measuring monotonic relationship strength (−1 to +1).",
    details: "Converts values to ranks (handling ties via average rank), then computes Pearson correlation on the ranks. More robust than Pearson for non-linear monotonic relationships and ordinal data. Less sensitive to outliers.",
  },
  {
    name: "P-Value Approximation",
    module: "correlation-engine",
    category: "Statistical",
    description: "Approximates p-value for correlation coefficient using t-distribution.",
    details: "Converts Pearson r to t-statistic: t = r × √(n − 2) / √(1 − r²). Approximates two-tailed p-value using simplified incomplete beta function. Used to filter significant correlations (p < 0.05) from noise.",
  },
  {
    name: "Correlation Strength Classifier",
    module: "correlation-engine",
    category: "Statistical",
    description: "Classifies correlation magnitude into human-readable strength labels.",
    details: "Based on absolute value of correlation coefficient: |r| ≥ 0.7 = very_strong, ≥ 0.5 = strong, ≥ 0.3 = moderate, < 0.3 = weak. Combined with direction (positive/negative) for full characterization.",
  },

  // ── Circadian & Sleep ──────────────────────────────────────────────────
  {
    name: "Circadian Rhythm Analyzer",
    module: "circadian-analyzer",
    category: "Sleep Analysis",
    description: "Sleep schedule analysis using Munich Chronotype Questionnaire (MCTQ) methodology to identify chronotype and consistency.",
    details: "Analyzes sleep onset/wake times across workdays and free days. Outputs: chronotype classification (early bird / intermediate / night owl), sleep consistency score, onset variability (minutes), social jet lag (weekend vs weekday midpoint delta in hours), and a personalized optimal sleep window recommendation.",
  },
  {
    name: "Sleep Duration Scorer",
    module: "readiness-engine",
    category: "Sleep Analysis",
    description: "Scores sleep duration against recommended ranges for readiness assessment.",
    details: "Optimal 7–9 hours = 85+, 6 hours = 65, 5 hours = 55, <5 hours = max(10, hours × 7). Aligned with National Sleep Foundation guidelines for adults. Used as a fallback when provider sleep scores are unavailable.",
  },

  // ── Training & Strain ──────────────────────────────────────────────────
  {
    name: "Training Load (Impulse-Response)",
    module: "strain-engine",
    category: "Training",
    description: "EWMA-based training load model computing Acute (ATL), Chronic (CTL) training load and Training Stress Balance (TSB).",
    details: "Daily strain from TRIMP-like formula: duration × intensity² × 1.05 scaling per workout, plus passive strain from active minutes. ATL = 7-day exponential weighted moving average (fatigue). CTL = 42-day EWMA (fitness). TSB = CTL − ATL (form). Status: peaked (TSB ≥ 20), fresh (≥ 5), neutral (≥ −5), fatigued (≥ −20), overreached (< −20). Processes 60-day workout + activity window.",
  },
  {
    name: "Daily Strain Calculator",
    module: "strain-engine",
    category: "Training",
    description: "Computes per-day training strain from workouts and activity using TRIMP-like formula.",
    details: "Per-workout strain: duration (hours) × intensity² × 1.05 scaling factor, where intensity = average HR / max HR. Passive strain added from active minutes data. Aggregates all workouts and activity by date from events and health_metrics tables.",
  },
  {
    name: "TSB Status Classifier",
    module: "strain-engine",
    category: "Training",
    description: "Maps Training Stress Balance to training readiness status.",
    details: "TSB ≥ 20 = peaked (race ready), ≥ 5 = fresh (good for hard sessions), ≥ −5 = neutral (maintenance), ≥ −20 = fatigued (reduce volume), < −20 = overreached (rest required). Based on Banister impulse-response model interpretations.",
  },

  // ── Recovery & Stress ──────────────────────────────────────────────────
  {
    name: "Recovery Prediction",
    module: "recovery-prediction",
    category: "Recovery",
    description: "Recovery timeline prediction using the Banister Fitness-Fatigue model with 4-factor adjustment.",
    details: "Predicts hours to full recovery from: Training Load Decay — high load applies 1.4× multiplier; Sleep Quality — good sleep yields 0.7× faster recovery; HRV Trajectory — rising HRV = 0.8×, falling = 1.3×; RHR Elevation — >5 bpm above baseline = 1.2×. States: recovered (<12h), recovering (12–30h), fatigued (30–48h), overtrained (>48h).",
  },
  {
    name: "Stress Resilience Index",
    module: "stress-resilience",
    category: "Recovery",
    description: "Autonomic nervous system resilience score (0–100) measuring post-stressor HRV recovery and adaptation.",
    details: "Identifies stressor events (strain > 14 or sleep score < 50). Measures post-stressor metrics: HRV recovery days, RHR normalization speed, and supercompensation ratio (2–3 days post-stressor). Based on allostatic load and vagal rebound concepts. Tiers: elite (≥85), high (≥70), moderate (≥50), developing (≥30), low (<30).",
  },

  // ── Report Generation ──────────────────────────────────────────────────
  {
    name: "Health Report Generator",
    module: "report.processor",
    category: "Reports",
    description: "Weekly/monthly health report generation with period scores, highlights, and recommendations.",
    details: "Aggregates health scores over the report period. Computes average score, identifies best scoring day, generates human-readable highlights and default recommendations. Persisted to health_reports table with status 'ready'. Triggers a notification to the user when complete.",
  },
  {
    name: "Health Snapshot",
    module: "report.processor",
    category: "Reports",
    description: "Period-end metric aggregation snapshot capturing averages for all tracked health dimensions.",
    details: "Computes daily averages for each metric type (steps, sleep, resting HR, HRV, calories, active minutes, weight, stress, recovery) over the report period. Also includes the average overall health score. Stored in health_snapshots for historical trend comparison.",
  },
  {
    name: "Report Correlation Engine",
    module: "report.processor",
    category: "Reports",
    description: "Monthly pairwise Pearson correlation computation for top metric types during report generation.",
    details: "90-day lookback across top 8 metric types with sufficient data (≥10 readings). Computes daily aggregates for each metric pair, then Pearson r over common days (minimum 7). Classifies: very_strong ≥0.8, strong ≥0.6, moderate ≥0.4, weak. Persisted to correlations table with ON CONFLICT DO NOTHING.",
  },
  {
    name: "LLM Context Builder",
    module: "correlation-engine",
    category: "Reports",
    description: "Builds pre-aggregated biological context for AI coaching: baselines, trends, anomalies, correlations, and health scores.",
    details: "Aggregates 30-day baselines (mean/stddev per metric), 7-day trend analysis (rising/falling/stable via linear regression), active anomalies, top 10 correlations sorted by strength, latest health score and grade, and generates a natural language summary. Output is structured JSON ready for LLM system prompts.",
  },

  // ── Data Sync ──────────────────────────────────────────────────────────
  {
    name: "Provider Sync Pipeline",
    module: "sync.processor",
    category: "Data Sync",
    description: "Provider data synchronization with token refresh, streaming ingestion, and idempotent batch inserts.",
    details: "For each provider connection: decrypt OAuth tokens → refresh if expired (5-min buffer) → stream data via provider.syncData() async generator → batch-insert health metrics in 500-item batches with ON CONFLICT DO NOTHING (idempotent) → extract structured workout/sleep events → update connection lastSyncedAt. Supports OAuth2 and OAuth1a providers.",
  },
  {
    name: "Event Extraction",
    module: "sync.processor",
    category: "Data Sync",
    description: "Extracts structured workout and sleep events from raw sync data points with deduplication.",
    details: "Maps SyncDataPoint to EventInsert rows for workout and sleep metric types. Workouts: duration, distance, avg/max HR, elevation gain, activity type. Sleep: start/end times, duration, nap flag, stage breakdown. Deduplicates via composite key providerId::startTimestamp per (userId, providerId) pair.",
  },
  {
    name: "OAuth Token Refresh",
    module: "sync.processor",
    category: "Data Sync",
    description: "Automatic OAuth2 token refresh with 5-minute expiry buffer and encrypted re-persistence.",
    details: "Checks token expiresAt against current time minus 5-minute buffer. If expired: calls provider.refreshTokens() → re-encrypts new tokens with AES-256 → persists to provider_connections. Ensures uninterrupted data syncing without manual re-authentication.",
  },
  {
    name: "Periodic Sync Scheduler",
    module: "periodic-sync",
    category: "Data Sync",
    description: "Schedules recurring sync jobs for all active provider connections with deduplication.",
    details: "Every SYNC_INTERVAL_MS (default 15 min): paginates through all connected provider connections → enqueues a sync job per connection with time-bucketed jobId (prevents duplicate jobs within the same interval). Uses both BullMQ repeatable jobs and an in-process interval as belt-and-suspenders.",
  },

  // ── Orchestration ──────────────────────────────────────────────────────
  {
    name: "Post-Sync Analytics Orchestrator",
    module: "analytics.processor",
    category: "Orchestration",
    description: "Master pipeline running all analytics after each data sync: scoring, training load, anomalies, achievements, baselines, goals.",
    details: "Triggered after sync completion. Sequential execution: compute health score → compute and persist training load → detect anomalies against baselines → check achievement milestones → recompute 30-day baselines → evaluate goal progress. Ensures all analytics are fresh after new data arrives.",
  },

  // ── Notification & Webhooks ────────────────────────────────────────────
  {
    name: "Notification Dispatcher",
    module: "notification.processor",
    category: "Notifications",
    description: "Multi-channel notification delivery with in-app persistence and per-user channel routing.",
    details: "Creates in-app notification row for every notification (appears in dashboard bell). If channelId specified, delivers to that channel only (test mode). Otherwise resolves all enabled channels for the user (Discord, Slack, Teams, email, push, ntfy, webhook) and dispatches in parallel. Logs delivery status per channel.",
  },
  {
    name: "Webhook Delivery",
    module: "webhook.processor",
    category: "Notifications",
    description: "Outbound webhook delivery with HMAC-SHA256 signing, delivery tracking, and automatic retry.",
    details: "Signs JSON payload with HMAC-SHA256 using per-webhook secret. Includes headers: X-VitaSync-Signature, X-VitaSync-Event, X-VitaSync-Delivery, User-Agent. 10-second timeout. Creates delivery record (pending → delivered/failed). Re-throws on failure for BullMQ exponential backoff retry.",
  },

  // ── Gamification ───────────────────────────────────────────────────────
  {
    name: "Achievement Checker",
    module: "analytics.processor",
    category: "Gamification",
    description: "Milestone-based achievement system that awards badges when cumulative metrics cross thresholds.",
    details: "Checks cumulative step totals against predefined milestones: 100K steps = bronze, 1M = silver, 10M = gold. Awards achievement if cumulative total ≥ threshold and not already unlocked. Extensible to other metric types and tier structures.",
  },
  {
    name: "Goal Evaluator",
    module: "analytics.processor",
    category: "Gamification",
    description: "Goal progress tracking that sums metric values against user-defined targets.",
    details: "For each active goal: sums the target metric type values over the goal period, compares against the target value. If progress ≥ target, marks the goal as completed and deactivates it. Runs as part of the post-sync analytics pipeline.",
  },

  // ── Security & Utilities ───────────────────────────────────────────────
  {
    name: "HMAC Webhook Verification",
    module: "provider-core",
    category: "Security",
    description: "Constant-time HMAC-SHA256/SHA1 signature verification for inbound provider webhooks.",
    details: "Prevents timing attacks by using Node.js crypto.timingSafeEqual for comparing computed vs received HMAC signatures. Supports both SHA-256 and SHA-1 algorithms. Used by all provider webhook endpoints to verify payload authenticity.",
  },
  {
    name: "AES-256 Token Encryption",
    module: "sync.processor",
    category: "Security",
    description: "Symmetric encryption/decryption of OAuth tokens at rest using AES-256 with a 64-char hex key.",
    details: "Provider OAuth tokens are encrypted before storage and decrypted only during sync. Uses a 32-byte (256-bit) key derived from the ENCRYPTION_KEY environment variable (64 hex chars). Ensures tokens are never stored in plaintext in the database.",
  },
  {
    name: "Unit Conversions",
    module: "provider-core",
    category: "Utility",
    description: "Imperial/metric unit conversion helpers for cross-provider data normalization.",
    details: "lbsToKg (÷ 2.20462), kgToLbs (× 2.20462), milesToMeters (× 1609.344), metersToKm (÷ 1000). Used during provider sync to normalize values from different wearable ecosystems into a consistent metric system.",
  },
  {
    name: "Sync Window Calculator",
    module: "provider-core",
    category: "Utility",
    description: "Determines the date range for data synchronization based on last sync time or defaults.",
    details: "If the connection has a lastSyncedAt timestamp: starts 1 hour before that (overlap for missed data). If no prior sync: defaults to 7 days back. Custom from/to dates can be specified per job. clampDate() ensures dates stay within provider API constraints.",
  },

  // ── Statistical Foundations ────────────────────────────────────────────
  {
    name: "Arithmetic Mean",
    module: "anomaly-detector / correlation-engine",
    category: "Statistical",
    description: "Calculates arithmetic mean of a numeric array for baseline and correlation computations.",
    details: "Sum of all values divided by count. Used as foundation for standard deviation, z-score, and correlation calculations throughout the analytics pipeline.",
  },
  {
    name: "Standard Deviation",
    module: "anomaly-detector / correlation-engine",
    category: "Statistical",
    description: "Computes population standard deviation for measuring data spread around the mean.",
    details: "σ = √(Σ(xi − x̄)² / n). Used for z-score anomaly detection, baseline characterization, and correlation coefficient calculations. Population formula (not sample) as baselines use all available data.",
  },
]

const CATEGORIES = [...new Set(ALGORITHMS.map((a) => a.category))].sort()

const CATEGORY_COLORS: Record<string, string> = {
  Scoring: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  "Anomaly Detection": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
  Correlation: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400",
  "Sleep Analysis": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-400",
  Training: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-400",
  Recovery: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
  Reports: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-400",
  "Data Sync": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  Gamification: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  Security: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  Statistical: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-400",
  Orchestration: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
  Notifications: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400",
  Utility: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
}

export default function AlgorithmsPage() {
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return ALGORITHMS.filter((a) => {
      if (selectedCategory && a.category !== selectedCategory) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.module.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q)
      )
    })
  }, [search, selectedCategory])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of ALGORITHMS) {
      counts[a.category] = (counts[a.category] ?? 0) + 1
    }
    return counts
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Algorithms</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {ALGORITHMS.length} algorithms powering health analytics, scoring, and insights.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search algorithms by name, description, category, or module…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !selectedCategory
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All ({ALGORITHMS.length})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {(search || selectedCategory) && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Algorithm cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">No algorithms match your search.</p>
          </div>
        )}
        {filtered.map((algo) => {
          const id = `${algo.module}::${algo.name}`
          const isExpanded = expandedId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : id)}
              className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{algo.name}</h3>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[algo.category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {algo.category}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{algo.description}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">{algo.module}</p>
                  </div>
                  <div className="flex-shrink-0 mt-0.5">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-700/50">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{algo.details}</p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
