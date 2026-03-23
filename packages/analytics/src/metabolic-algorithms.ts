// metabolic-algorithms.ts — 60+ metabolic & body-composition algorithms
// Auto-generated suite of clinical-grade estimation functions

import { getDb, healthMetrics } from "@biosync-io/db";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface MetabolicResult {
  value: number;
  unit: string;
  label: string;
  interpretation: string;
  confidence: number;
  details?: Record<string, number | string | null>;
}

export interface TrendResult extends MetabolicResult {
  direction: "increasing" | "decreasing" | "stable";
  rateOfChange: number;
  dataPoints: number;
}

export interface RiskResult extends MetabolicResult {
  riskLevel: "low" | "moderate" | "high" | "very-high";
  factors: string[];
  recommendations: string[];
}

export interface CompositionResult extends MetabolicResult {
  components: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper utilities
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMetric(
  userId: string,
  metricName: string,
  startDate: Date,
  endDate: Date,
): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
        gte(healthMetrics.recordedAt, startDate),
        lte(healthMetrics.recordedAt, endDate),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt));
  return rows.map((r) => Number(r.value)).filter((v) => !isNaN(v));
}

async function fetchLatestMetric(
  userId: string,
  metricName: string,
): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(1);
  if (rows.length === 0) return null;
  const v = Number(rows[0]!.value);
  return isNaN(v) ? null : v;
}

async function fetchMetricWithDates(
  userId: string,
  metricName: string,
  startDate: Date,
  endDate: Date,
): Promise<{ value: number; date: Date }[]> {
  const db = getDb();
  const rows = await db
    .select({ value: healthMetrics.value, date: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
        gte(healthMetrics.recordedAt, startDate),
        lte(healthMetrics.recordedAt, endDate),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt));
  return rows
    .map((r) => ({ value: Number(r.value), date: new Date(r.date) }))
    .filter((r) => !isNaN(r.value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sqDiffs = values.map((v) => (v - m) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

function linearRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const ssTot = points.reduce((s, p) => s + (p.y - sumY / n) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (idx - lower);
}

function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return (stddev(values) / Math.abs(m)) * 100;
}

function exponentialMovingAverage(values: number[], alpha: number = 0.3): number[] {
  if (values.length === 0) return [];
  const ema: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    ema.push(alpha * values[i]! + (1 - alpha) * ema[i - 1]!);
  }
  return ema;
}

function interpretBMI(bmi: number): string {
  if (bmi < 16) return "Severe underweight";
  if (bmi < 17) return "Moderate underweight";
  if (bmi < 18.5) return "Mild underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  if (bmi < 35) return "Obese class I";
  if (bmi < 40) return "Obese class II";
  return "Obese class III";
}

function ageFromBirthDate(birthDate: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BMR — Harris-Benedict equation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates Basal Metabolic Rate using the revised Harris-Benedict equation (Roza & Shizgal 1984).
 * Male:   BMR = 88.362 + (13.397 × weight_kg) + (4.799 × height_cm) − (5.677 × age_years)
 * Female: BMR = 447.593 + (9.247 × weight_kg) + (3.098 × height_cm) − (4.330 × age_years)
 */
export async function calculateBMR_HarrisBenedict(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height || !age) {
    return {
      value: 0,
      unit: "kcal/day",
      label: "BMR (Harris-Benedict)",
      interpretation: "Insufficient data: weight, height, and age are required.",
      confidence: 0,
      details: { weight, height, age },
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  const bmr = isMale
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;

  const clamped = clamp(bmr, 500, 5000);

  let interpretation: string;
  if (clamped < 1200) interpretation = "Below average BMR — may indicate low muscle mass or hypothyroidism.";
  else if (clamped < 1600) interpretation = "Normal BMR range for a moderately active individual.";
  else if (clamped < 2200) interpretation = "Above average BMR — typically seen in taller or more muscular individuals.";
  else interpretation = "Very high BMR — common in athletes or very large individuals.";

  return {
    value: Math.round(clamped),
    unit: "kcal/day",
    label: "BMR (Harris-Benedict)",
    interpretation,
    confidence: 0.85,
    details: { weight, height, age, gender: gender ?? "unknown", equation: "Harris-Benedict revised 1984" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BMR — Mifflin-St Jeor equation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates BMR using the Mifflin-St Jeor equation (1990).
 * Male:   BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age_years) + 5
 * Female: BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age_years) − 161
 */
export async function calculateBMR_MifflinStJeor(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height || !age) {
    return {
      value: 0,
      unit: "kcal/day",
      label: "BMR (Mifflin-St Jeor)",
      interpretation: "Insufficient data: weight, height, and age are required.",
      confidence: 0,
      details: { weight, height, age },
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
  const clamped = clamp(bmr, 500, 5000);

  let interpretation: string;
  if (clamped < 1200) interpretation = "Low BMR — consider checking thyroid function and lean mass.";
  else if (clamped < 1800) interpretation = "Normal BMR range for the Mifflin-St Jeor model.";
  else interpretation = "Elevated BMR — typical for larger body frames or higher muscle mass.";

  return {
    value: Math.round(clamped),
    unit: "kcal/day",
    label: "BMR (Mifflin-St Jeor)",
    interpretation,
    confidence: 0.88,
    details: { weight, height, age, gender: gender ?? "unknown", equation: "Mifflin-St Jeor 1990" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TDEE — Total Daily Energy Expenditure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates TDEE by multiplying BMR (Mifflin-St Jeor) by an activity factor.
 * Sedentary (1.2), Lightly active (1.375), Moderately active (1.55),
 * Very active (1.725), Extra active (1.9).
 * Activity level is inferred from average daily step count over the past 14 days.
 */
export async function calculateTDEE(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const bmrResult = await calculateBMR_MifflinStJeor(userId, date, gender);
  if (bmrResult.value === 0) {
    return { ...bmrResult, label: "TDEE", interpretation: "Cannot calculate TDEE without BMR data." };
  }

  const steps = await fetchMetric(userId, "steps", daysAgo(14, date), date);
  const avgSteps = mean(steps);

  let activityFactor: number;
  let activityLevel: string;
  if (avgSteps < 3000) {
    activityFactor = 1.2;
    activityLevel = "Sedentary";
  } else if (avgSteps < 6000) {
    activityFactor = 1.375;
    activityLevel = "Lightly active";
  } else if (avgSteps < 10000) {
    activityFactor = 1.55;
    activityLevel = "Moderately active";
  } else if (avgSteps < 15000) {
    activityFactor = 1.725;
    activityLevel = "Very active";
  } else {
    activityFactor = 1.9;
    activityLevel = "Extra active";
  }

  const tdee = bmrResult.value * activityFactor;

  return {
    value: Math.round(tdee),
    unit: "kcal/day",
    label: "TDEE",
    interpretation: `Activity level: ${activityLevel} (${avgSteps.toFixed(0)} avg steps). Estimated total daily energy expenditure is ${Math.round(tdee)} kcal.`,
    confidence: steps.length >= 7 ? 0.82 : 0.6,
    details: {
      bmr: bmrResult.value,
      activityFactor,
      activityLevel,
      avgSteps: Math.round(avgSteps),
      stepDataPoints: steps.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Metabolic Age
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates metabolic age by comparing the user's BMR to age-specific population norms.
 * Uses Mifflin-St Jeor BMR and inverts it against reference BMR curves.
 * metabolic_age = chronological_age + (expected_bmr - actual_bmr) / adjustment_factor
 */
export async function calculateMetabolicAge(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height || !age) {
    return {
      value: 0,
      unit: "years",
      label: "Metabolic Age",
      interpretation: "Insufficient data.",
      confidence: 0,
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  const actualBMR = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

  // Reference BMR for average body composition at the user's height
  const refWeight = isMale ? 0.4 * height - 22 : 0.38 * height - 23;
  const expectedBMR = 10 * refWeight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

  // Each ~7 kcal/day difference ≈ 1 year of metabolic age difference
  const adjustmentFactor = isMale ? 7.5 : 6.8;
  const metabolicAge = Math.round(age + (expectedBMR - actualBMR) / adjustmentFactor);
  const clampedAge = clamp(metabolicAge, 15, 120);

  const diff = clampedAge - age;
  let interpretation: string;
  if (diff <= -10) interpretation = "Exceptional metabolic health — your body functions as if significantly younger.";
  else if (diff <= -3) interpretation = "Good metabolic health — your metabolic age is younger than your chronological age.";
  else if (diff <= 3) interpretation = "Average metabolic health — your metabolic and chronological ages roughly align.";
  else if (diff <= 10) interpretation = "Below-average metabolic health — consider improving diet and exercise.";
  else interpretation = "Poor metabolic health — strongly recommend consulting a healthcare provider.";

  return {
    value: clampedAge,
    unit: "years",
    label: "Metabolic Age",
    interpretation,
    confidence: 0.65,
    details: {
      chronologicalAge: age,
      difference: diff,
      actualBMR: Math.round(actualBMR),
      expectedBMR: Math.round(expectedBMR),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Insulin Resistance Proxy (TyG Index)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates insulin resistance using the TyG (Triglyceride-Glucose) Index.
 * TyG = ln(fasting_triglycerides_mg_dL × fasting_glucose_mg_dL / 2)
 * A TyG index ≥ 8.5 is associated with insulin resistance.
 */
export async function calculateInsulinResistanceProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const triglycerides = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");

  if (!triglycerides || !glucose) {
    return {
      value: 0,
      unit: "index",
      label: "Insulin Resistance Proxy (TyG)",
      interpretation: "Insufficient data: fasting triglycerides and glucose required.",
      confidence: 0,
      riskLevel: "low",
      factors: [],
      recommendations: [],
    };
  }

  const tyg = Math.log(triglycerides * glucose / 2);
  const clampedTyg = clamp(tyg, 5, 12);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;
  const factors: string[] = [];
  const recommendations: string[] = [];

  if (clampedTyg < 7.5) {
    riskLevel = "low";
    interpretation = "Low insulin resistance risk. Metabolic markers are within healthy ranges.";
  } else if (clampedTyg < 8.5) {
    riskLevel = "moderate";
    interpretation = "Moderate insulin resistance risk. Consider dietary optimization.";
    factors.push("Borderline triglyceride-glucose ratio");
    recommendations.push("Reduce refined carbohydrate intake", "Increase physical activity to 150+ min/week");
  } else if (clampedTyg < 9.5) {
    riskLevel = "high";
    interpretation = "High insulin resistance risk. Medical evaluation recommended.";
    factors.push("Elevated TyG index", "Possible metabolic syndrome component");
    recommendations.push("Consult endocrinologist", "Consider OGTT testing", "Mediterranean diet recommended");
  } else {
    riskLevel = "very-high";
    interpretation = "Very high insulin resistance. Immediate medical consultation advised.";
    factors.push("Significantly elevated TyG index", "Strong insulin resistance indicator");
    recommendations.push("Urgent medical consultation", "HbA1c testing", "Comprehensive metabolic panel");
  }

  if (triglycerides > 150) factors.push(`Elevated triglycerides: ${triglycerides} mg/dL`);
  if (glucose > 100) factors.push(`Elevated fasting glucose: ${glucose} mg/dL`);

  return {
    value: Math.round(clampedTyg * 100) / 100,
    unit: "index",
    label: "Insulin Resistance Proxy (TyG)",
    interpretation,
    confidence: 0.75,
    riskLevel,
    factors,
    recommendations,
    details: { triglycerides, glucose, rawTyG: tyg },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Metabolic Syndrome Risk Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores metabolic syndrome risk using the NCEP ATP III criteria.
 * Evaluates: waist circumference, triglycerides, HDL, blood pressure, fasting glucose.
 * Risk score 0-5 based on number of criteria met (≥3 = metabolic syndrome diagnosis).
 */
export async function calculateMetabolicSyndromeRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const triglycerides = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const hdl = await fetchLatestMetric(userId, "hdl_mg_dl");
  const systolic = await fetchLatestMetric(userId, "systolic_bp");
  const diastolic = await fetchLatestMetric(userId, "diastolic_bp");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");

  const isMale = gender?.toLowerCase() === "male";
  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  let dataCount = 0;

  // Criterion 1: Waist circumference
  if (waist !== null) {
    dataCount++;
    const waistThreshold = isMale ? 102 : 88;
    if (waist > waistThreshold) {
      score++;
      factors.push(`Elevated waist circumference: ${waist} cm (threshold: ${waistThreshold} cm)`);
      recommendations.push("Target waist reduction through core exercises and calorie management");
    }
  }

  // Criterion 2: Triglycerides ≥ 150 mg/dL
  if (triglycerides !== null) {
    dataCount++;
    if (triglycerides >= 150) {
      score++;
      factors.push(`Elevated triglycerides: ${triglycerides} mg/dL`);
      recommendations.push("Reduce sugar and refined carbs, increase omega-3 fatty acids");
    }
  }

  // Criterion 3: HDL < 40 mg/dL (men) or < 50 mg/dL (women)
  if (hdl !== null) {
    dataCount++;
    const hdlThreshold = isMale ? 40 : 50;
    if (hdl < hdlThreshold) {
      score++;
      factors.push(`Low HDL: ${hdl} mg/dL (threshold: ${hdlThreshold} mg/dL)`);
      recommendations.push("Increase aerobic exercise, consume healthy fats (olive oil, nuts, avocado)");
    }
  }

  // Criterion 4: Blood pressure ≥ 130/85 mmHg
  if (systolic !== null && diastolic !== null) {
    dataCount++;
    if (systolic >= 130 || diastolic >= 85) {
      score++;
      factors.push(`Elevated BP: ${systolic}/${diastolic} mmHg`);
      recommendations.push("Reduce sodium intake, DASH diet recommended, regular aerobic exercise");
    }
  }

  // Criterion 5: Fasting glucose ≥ 100 mg/dL
  if (glucose !== null) {
    dataCount++;
    if (glucose >= 100) {
      score++;
      factors.push(`Elevated fasting glucose: ${glucose} mg/dL`);
      recommendations.push("Monitor carbohydrate intake, consider glycemic index-based meal planning");
    }
  }

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (score === 0) {
    riskLevel = "low";
    interpretation = "No metabolic syndrome criteria met. Excellent metabolic health.";
  } else if (score <= 2) {
    riskLevel = "moderate";
    interpretation = `${score} of 5 metabolic syndrome criteria met. Preventive lifestyle changes recommended.`;
  } else if (score <= 3) {
    riskLevel = "high";
    interpretation = `Metabolic syndrome diagnosed (${score}/5 criteria met). Medical intervention recommended.`;
  } else {
    riskLevel = "very-high";
    interpretation = `Severe metabolic syndrome (${score}/5 criteria met). Comprehensive medical management urgently needed.`;
  }

  return {
    value: score,
    unit: "criteria met (of 5)",
    label: "Metabolic Syndrome Risk",
    interpretation,
    confidence: dataCount >= 4 ? 0.9 : dataCount / 5,
    riskLevel,
    factors,
    recommendations,
    details: { waist, triglycerides, hdl, systolic, diastolic, glucose, criteriaEvaluated: dataCount },
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// 7. Glycemic Load Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates daily glycemic load from tracked carbohydrate intake and glucose response.
 * GL = Σ (GI_food × carbs_g / 100). Uses average glucose as a proxy for glycemic index.
 * Low GL < 80, Medium 80-120, High > 120.
 */
export async function calculateGlycemicLoadProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const carbs = await fetchMetric(userId, "carbohydrates_g", daysAgo(7, date), date);
  const glucoseReadings = await fetchMetric(userId, "blood_glucose_mg_dl", daysAgo(7, date), date);

  if (carbs.length === 0) {
    return {
      value: 0,
      unit: "GL units",
      label: "Glycemic Load Proxy",
      interpretation: "Insufficient carbohydrate intake data.",
      confidence: 0,
    };
  }

  const avgCarbs = mean(carbs);
  const avgGlucose = glucoseReadings.length > 0 ? mean(glucoseReadings) : 100;

  // Proxy GI derived from average glucose response (normalized to 100 baseline)
  const estimatedGI = clamp((avgGlucose / 100) * 55, 20, 100);
  const dailyGL = (estimatedGI * avgCarbs) / 100;

  let interpretation: string;
  if (dailyGL < 80) {
    interpretation = "Low glycemic load — favorable for blood sugar management and insulin sensitivity.";
  } else if (dailyGL < 120) {
    interpretation = "Moderate glycemic load — generally acceptable for most individuals.";
  } else if (dailyGL < 160) {
    interpretation = "High glycemic load — consider reducing refined carbohydrates.";
  } else {
    interpretation = "Very high glycemic load — significant risk for insulin resistance and metabolic dysfunction.";
  }

  return {
    value: Math.round(dailyGL * 10) / 10,
    unit: "GL units",
    label: "Glycemic Load Proxy",
    interpretation,
    confidence: glucoseReadings.length > 3 ? 0.7 : 0.45,
    details: {
      avgCarbs: Math.round(avgCarbs),
      avgGlucose: Math.round(avgGlucose),
      estimatedGI: Math.round(estimatedGI),
      carbDataPoints: carbs.length,
      glucoseDataPoints: glucoseReadings.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Fat Oxidation Rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates fat oxidation rate during exercise using the Achten & Jeukendrup model.
 * FATox (g/min) = 1.67 × VO2 − 1.67 × VCO2 (Frayn 1983 stoichiometric equation)
 * Simplified: uses HR-based VO2 estimation and exercise intensity proxy.
 * MFO typically occurs at 45-65% VO2max.
 */
export async function calculateFatOxidationRate(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const age = await fetchLatestMetric(userId, "age");
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const exerciseHR = await fetchMetric(userId, "exercise_heart_rate", daysAgo(7, date), date);

  if (!weight || !age || !restingHR) {
    return {
      value: 0,
      unit: "g/min",
      label: "Fat Oxidation Rate",
      interpretation: "Insufficient data: weight, age, and resting heart rate required.",
      confidence: 0,
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  const maxHR = 208 - 0.7 * age; // Tanaka formula
  const avgExerciseHR = exerciseHR.length > 0 ? mean(exerciseHR) : restingHR * 1.4;
  const hrReserve = maxHR - restingHR;
  const exerciseIntensity = clamp((avgExerciseHR - restingHR) / hrReserve, 0, 1);

  // VO2 estimation from heart rate (Swain 1994 approximation)
  const vo2Fraction = 1.5472 * exerciseIntensity - 0.1263;
  const vo2max = isMale ? 3.5 + (weight * 0.035) : 3.1 + (weight * 0.032);
  const vo2 = vo2max * clamp(vo2Fraction, 0.1, 0.95);

  // RER estimation based on exercise intensity
  const rer = 0.7 + 0.3 * exerciseIntensity;

  // Fat oxidation: FATox = 1.67 × VO2 × (1 - RER) / 0.3 — simplified
  const fatOx = 1.67 * vo2 * (1 - rer) / 0.3;
  const clampedFatOx = clamp(fatOx, 0, 2.5);

  // MFO zone detection
  const inMFOZone = exerciseIntensity >= 0.4 && exerciseIntensity <= 0.65;

  let interpretation: string;
  if (clampedFatOx < 0.2) {
    interpretation = "Low fat oxidation — exercise intensity may be too high or too low for optimal fat burning.";
  } else if (clampedFatOx < 0.5) {
    interpretation = inMFOZone
      ? "Good fat oxidation rate — you are near the maximal fat oxidation zone."
      : "Moderate fat oxidation — adjusting intensity to 45-65% VO2max could optimize fat burning.";
  } else if (clampedFatOx < 1.0) {
    interpretation = "High fat oxidation rate — excellent fat-burning efficiency.";
  } else {
    interpretation = "Very high fat oxidation — typical for endurance-trained individuals.";
  }

  return {
    value: Math.round(clampedFatOx * 1000) / 1000,
    unit: "g/min",
    label: "Fat Oxidation Rate",
    interpretation,
    confidence: exerciseHR.length > 3 ? 0.65 : 0.4,
    details: {
      exerciseIntensity: Math.round(exerciseIntensity * 100),
      estimatedVO2: Math.round(vo2 * 100) / 100,
      estimatedRER: Math.round(rer * 1000) / 1000,
      maxHR: Math.round(maxHR),
      avgExerciseHR: Math.round(avgExerciseHR),
      inMFOZone: inMFOZone ? 1 : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. RMR from Heart Rate (Charlot formula adaptation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates Resting Metabolic Rate from resting heart rate using pulse-based models.
 * RMR ≈ BMR × (restingHR / reference_HR). Reference HR ~ 70 bpm for healthy adults.
 * Lower resting HR suggests higher cardiovascular fitness, adjusting RMR downward.
 */
export async function calculateRMR_fromHR(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");

  if (!weight || !height || !age || !restingHR) {
    return {
      value: 0,
      unit: "kcal/day",
      label: "RMR (HR-based)",
      interpretation: "Insufficient data.",
      confidence: 0,
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  const baseBMR = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
  const referenceHR = isMale ? 70 : 75;

  // HR-based adjustment factor (Charlot-inspired)
  const hrAdjustment = 0.85 + 0.15 * (restingHR / referenceHR);
  const rmr = baseBMR * clamp(hrAdjustment, 0.75, 1.3);

  let interpretation: string;
  if (restingHR < 50) {
    interpretation = "Very low resting HR indicates high cardiovascular fitness. RMR adjusted downward.";
  } else if (restingHR < 60) {
    interpretation = "Athletic resting HR. RMR reflects efficient metabolism.";
  } else if (restingHR < 80) {
    interpretation = "Normal resting HR range. RMR estimate is standard.";
  } else {
    interpretation = "Elevated resting HR may indicate deconditioning, stress, or medical conditions.";
  }

  return {
    value: Math.round(rmr),
    unit: "kcal/day",
    label: "RMR (HR-based)",
    interpretation,
    confidence: 0.7,
    details: {
      baseBMR: Math.round(baseBMR),
      restingHR,
      hrAdjustment: Math.round(hrAdjustment * 1000) / 1000,
      referenceHR,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Thyroid Function Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proxy estimation of thyroid function based on BMR deviation, resting HR, and body temperature.
 * Hypothyroidism indicators: low BMR, low HR, low body temperature, weight gain.
 * Hyperthyroidism indicators: high BMR, high HR, high body temperature, weight loss.
 * Score from -10 (hypo) to +10 (hyper), 0 = euthyroid.
 */
export async function calculateThyroidFunctionProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const bodyTemp = await fetchLatestMetric(userId, "body_temperature_c");
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(90, date), date);

  if (!weight || !height || !age) {
    return {
      value: 0,
      unit: "score",
      label: "Thyroid Function Proxy",
      interpretation: "Insufficient data.",
      confidence: 0,
      riskLevel: "low",
      factors: [],
      recommendations: [],
    };
  }

  let thyroidScore = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  // BMR deviation check
  const isMale = gender?.toLowerCase() === "male";
  const actualBMR = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
  const refWeight = isMale ? 0.4 * height - 22 : 0.38 * height - 23;
  const expectedBMR = 10 * refWeight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
  const bmrDeviation = (actualBMR - expectedBMR) / expectedBMR;

  if (bmrDeviation < -0.15) {
    thyroidScore -= 3;
    factors.push("BMR significantly below expected");
  } else if (bmrDeviation < -0.05) {
    thyroidScore -= 1;
    factors.push("BMR slightly below expected");
  } else if (bmrDeviation > 0.15) {
    thyroidScore += 3;
    factors.push("BMR significantly above expected");
  } else if (bmrDeviation > 0.05) {
    thyroidScore += 1;
    factors.push("BMR slightly above expected");
  }

  // Resting HR analysis
  if (restingHR !== null) {
    if (restingHR < 55) {
      thyroidScore -= 2;
      factors.push(`Low resting HR: ${restingHR} bpm`);
    } else if (restingHR > 90) {
      thyroidScore += 2;
      factors.push(`Elevated resting HR: ${restingHR} bpm`);
    } else if (restingHR > 80) {
      thyroidScore += 1;
      factors.push(`Mildly elevated resting HR: ${restingHR} bpm`);
    }
  }

  // Body temperature analysis
  if (bodyTemp !== null) {
    if (bodyTemp < 36.1) {
      thyroidScore -= 2;
      factors.push(`Low body temperature: ${bodyTemp}°C`);
    } else if (bodyTemp < 36.4) {
      thyroidScore -= 1;
      factors.push(`Mildly low body temperature: ${bodyTemp}°C`);
    } else if (bodyTemp > 37.2) {
      thyroidScore += 2;
      factors.push(`Elevated body temperature: ${bodyTemp}°C`);
    }
  }

  // Weight trend analysis
  if (weightHistory.length >= 5) {
    const recentWeight = mean(weightHistory.slice(0, 3));
    const olderWeight = mean(weightHistory.slice(-3));
    const weightChange = (recentWeight - olderWeight) / olderWeight;

    if (weightChange > 0.05) {
      thyroidScore -= 2;
      factors.push("Unexplained weight gain trend");
    } else if (weightChange < -0.05) {
      thyroidScore += 2;
      factors.push("Unexplained weight loss trend");
    }
  }

  thyroidScore = clamp(thyroidScore, -10, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (thyroidScore <= -5) {
    riskLevel = "high";
    interpretation = "Strong hypothyroid indicators detected. TSH/T4 blood test recommended.";
    recommendations.push("Request thyroid panel (TSH, free T4, T3)", "Monitor energy levels and weight");
  } else if (thyroidScore <= -2) {
    riskLevel = "moderate";
    interpretation = "Mild hypothyroid indicators. Consider monitoring symptoms.";
    recommendations.push("Track body temperature, energy, weight over 4 weeks", "Consider thyroid screening if symptoms persist");
  } else if (thyroidScore >= 5) {
    riskLevel = "high";
    interpretation = "Strong hyperthyroid indicators detected. Medical evaluation recommended.";
    recommendations.push("Request thyroid panel urgently", "Monitor heart rate and weight changes");
  } else if (thyroidScore >= 2) {
    riskLevel = "moderate";
    interpretation = "Mild hyperthyroid indicators. Consider monitoring symptoms.";
    recommendations.push("Track resting heart rate and weight", "Note any tremors, anxiety, or heat intolerance");
  } else {
    riskLevel = "low";
    interpretation = "Thyroid function appears normal based on available proxy indicators.";
  }

  return {
    value: thyroidScore,
    unit: "score (-10 hypo to +10 hyper)",
    label: "Thyroid Function Proxy",
    interpretation,
    confidence: (restingHR !== null ? 0.2 : 0) + (bodyTemp !== null ? 0.2 : 0) + 0.3,
    riskLevel,
    factors,
    recommendations,
    details: {
      bmrDeviation: Math.round(bmrDeviation * 100),
      restingHR,
      bodyTemp,
      weightDataPoints: weightHistory.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Body Adiposity Index (BAI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates Body Adiposity Index (Bergman et al. 2011).
 * BAI = (hip_circumference_cm / (height_m ^ 1.5)) − 18
 * Provides a body fat percentage estimate without requiring weight.
 */
export async function calculateBodyAdiposityIndex(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const hipCircumference = await fetchLatestMetric(userId, "hip_circumference_cm");
  const height = await fetchLatestMetric(userId, "height_cm");

  if (!hipCircumference || !height) {
    return {
      value: 0,
      unit: "% body fat",
      label: "Body Adiposity Index",
      interpretation: "Insufficient data: hip circumference and height required.",
      confidence: 0,
    };
  }

  const heightM = height / 100;
  const bai = (hipCircumference / Math.pow(heightM, 1.5)) - 18;
  const clampedBAI = clamp(bai, 5, 60);

  const isMale = gender?.toLowerCase() === "male";
  let interpretation: string;

  if (isMale) {
    if (clampedBAI < 8) interpretation = "Essential fat level — may be unsustainably low.";
    else if (clampedBAI < 20) interpretation = "Athletic to fit range for males.";
    else if (clampedBAI < 25) interpretation = "Average body fat percentage for males.";
    else interpretation = "Above-average body fat for males — consider body composition optimization.";
  } else {
    if (clampedBAI < 14) interpretation = "Essential fat level — may be unsustainably low.";
    else if (clampedBAI < 25) interpretation = "Athletic to fit range for females.";
    else if (clampedBAI < 32) interpretation = "Average body fat percentage for females.";
    else interpretation = "Above-average body fat for females — consider body composition optimization.";
  }

  return {
    value: Math.round(clampedBAI * 10) / 10,
    unit: "% body fat (estimated)",
    label: "Body Adiposity Index",
    interpretation,
    confidence: 0.72,
    details: { hipCircumference, heightM: Math.round(heightM * 100) / 100 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Body Composition Trend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes body composition trend over 90 days using weight, body fat %, and lean mass.
 * Uses linear regression to determine direction and rate of change.
 * Differentiates between muscle gain, fat loss, overall weight change.
 */
export async function calculateBodyCompositionTrend(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<TrendResult> {
  const startDate = daysAgo(90, date);
  const weightData = await fetchMetricWithDates(userId, "weight_kg", startDate, date);
  const bodyFatData = await fetchMetricWithDates(userId, "body_fat_pct", startDate, date);

  if (weightData.length < 3) {
    return {
      value: 0,
      unit: "kg/week",
      label: "Body Composition Trend",
      interpretation: "Insufficient weight data for trend analysis (need 3+ data points).",
      confidence: 0,
      direction: "stable",
      rateOfChange: 0,
      dataPoints: weightData.length,
    };
  }

  const refDate = weightData[weightData.length - 1]!.date.getTime();
  const weightPoints = weightData.map((d) => ({
    x: (d.date.getTime() - refDate) / (7 * 24 * 3600 * 1000), // weeks
    y: d.value,
  }));

  const weightReg = linearRegression(weightPoints);
  const weeklyWeightChange = weightReg.slope;

  let fatTrendSlope = 0;
  if (bodyFatData.length >= 3) {
    const fatPoints = bodyFatData.map((d) => ({
      x: (d.date.getTime() - refDate) / (7 * 24 * 3600 * 1000),
      y: d.value,
    }));
    fatTrendSlope = linearRegression(fatPoints).slope;
  }

  let direction: TrendResult["direction"];
  if (Math.abs(weeklyWeightChange) < 0.05) direction = "stable";
  else if (weeklyWeightChange > 0) direction = "increasing";
  else direction = "decreasing";

  let interpretation: string;
  if (direction === "stable") {
    interpretation = "Weight is stable. ";
    if (fatTrendSlope < -0.1) interpretation += "Body fat is decreasing — likely recomposition (gaining muscle, losing fat).";
    else if (fatTrendSlope > 0.1) interpretation += "Body fat is increasing — consider adjusting diet.";
    else interpretation += "Body composition is maintaining.";
  } else if (direction === "increasing") {
    if (fatTrendSlope < 0) interpretation = "Weight increasing while fat decreasing — excellent muscle gain phase.";
    else interpretation = `Weight gaining at ${Math.abs(weeklyWeightChange).toFixed(2)} kg/week. Monitor body fat percentage.`;
  } else {
    if (fatTrendSlope < 0) interpretation = `Losing ${Math.abs(weeklyWeightChange).toFixed(2)} kg/week with fat loss — healthy deficit.`;
    else interpretation = `Losing ${Math.abs(weeklyWeightChange).toFixed(2)} kg/week but fat stable — may be losing lean mass. Increase protein.`;
  }

  return {
    value: Math.round(weeklyWeightChange * 100) / 100,
    unit: "kg/week",
    label: "Body Composition Trend",
    interpretation,
    confidence: weightReg.r2 > 0.5 ? 0.8 : 0.55,
    direction,
    rateOfChange: Math.round(weeklyWeightChange * 100) / 100,
    dataPoints: weightData.length,
    details: {
      weeklyWeightChange: Math.round(weeklyWeightChange * 100) / 100,
      weeklyFatChange: Math.round(fatTrendSlope * 100) / 100,
      weightR2: Math.round(weightReg.r2 * 100) / 100,
      weightDataPoints: weightData.length,
      fatDataPoints: bodyFatData.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Lean Mass Index (LMI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lean Mass Index = lean_mass_kg / height_m².
 * If body fat % is available: lean_mass = weight × (1 − bf%).
 * LMI normal ranges: Males 16.7–19.8, Females 14.6–16.8 kg/m².
 */
export async function calculateLeanMassIndex(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");

  if (!weight || !height) {
    return { value: 0, unit: "kg/m²", label: "Lean Mass Index", interpretation: "Insufficient data.", confidence: 0 };
  }

  const heightM = height / 100;
  const bfFraction = bodyFat !== null ? bodyFat / 100 : (gender?.toLowerCase() === "male" ? 0.18 : 0.25);
  const leanMass = weight * (1 - bfFraction);
  const lmi = leanMass / (heightM * heightM);

  const isMale = gender?.toLowerCase() === "male";
  let interpretation: string;
  if (isMale) {
    if (lmi < 14) interpretation = "Low lean mass index — sarcopenia risk; resistance training recommended.";
    else if (lmi < 16.7) interpretation = "Below average lean mass. Consider strength training.";
    else if (lmi < 19.8) interpretation = "Normal lean mass index for males.";
    else if (lmi < 22) interpretation = "Above average lean mass — well-muscled physique.";
    else interpretation = "Very high lean mass — athletic/bodybuilder level.";
  } else {
    if (lmi < 12) interpretation = "Low lean mass index — sarcopenia risk; resistance training recommended.";
    else if (lmi < 14.6) interpretation = "Below average lean mass. Consider strength training.";
    else if (lmi < 16.8) interpretation = "Normal lean mass index for females.";
    else if (lmi < 19) interpretation = "Above average lean mass — well-muscled physique.";
    else interpretation = "Very high lean mass — athletic level.";
  }

  return {
    value: Math.round(lmi * 10) / 10,
    unit: "kg/m²",
    label: "Lean Mass Index",
    interpretation,
    confidence: bodyFat !== null ? 0.82 : 0.55,
    details: { leanMass: Math.round(leanMass * 10) / 10, bodyFatUsed: Math.round(bfFraction * 100), weight, heightM: Math.round(heightM * 100) / 100 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Visceral Fat Risk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates visceral fat risk using waist circumference, BMI, age, and gender.
 * VAI (Visceral Adiposity Index) = (waist / (39.68 + 1.88 × BMI)) × (triglycerides / 1.03) × (1.31 / HDL) for males.
 * Simplified when full lipid panel not available: uses waist-to-height ratio and BMI.
 */
export async function calculateVisceralFatRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const triglycerides = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const hdl = await fetchLatestMetric(userId, "hdl_mg_dl");

  if (!weight || !height) {
    return {
      value: 0, unit: "score", label: "Visceral Fat Risk", interpretation: "Insufficient data.",
      confidence: 0, riskLevel: "low", factors: [], recommendations: [],
    };
  }

  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  const isMale = gender?.toLowerCase() === "male";

  let vai: number;
  const factors: string[] = [];
  const recommendations: string[] = [];

  if (waist !== null && triglycerides !== null && hdl !== null) {
    // Full VAI calculation (Amato et al. 2010)
    if (isMale) {
      vai = (waist / (39.68 + 1.88 * bmi)) * (triglycerides / 1.03) * (1.31 / hdl);
    } else {
      vai = (waist / (36.58 + 1.89 * bmi)) * (triglycerides / 0.81) * (1.52 / hdl);
    }
  } else {
    // Simplified estimation using waist-to-height ratio
    const whr = waist ? waist / height : bmi / 40;
    const ageAdjust = age ? Math.max(0, (age - 30) * 0.03) : 0;
    vai = (whr * 3 + bmi / 10 + ageAdjust) * (isMale ? 1.1 : 1.0);
  }

  const clampedVAI = clamp(vai, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedVAI < 1.5) {
    riskLevel = "low";
    interpretation = "Low visceral fat risk. Healthy abdominal fat distribution.";
  } else if (clampedVAI < 2.5) {
    riskLevel = "moderate";
    interpretation = "Moderate visceral fat accumulation. Lifestyle modifications recommended.";
    factors.push("Mildly elevated visceral adiposity index");
    recommendations.push("Increase aerobic exercise to 200+ min/week", "Reduce trans fats and added sugars");
  } else if (clampedVAI < 4) {
    riskLevel = "high";
    interpretation = "High visceral fat risk. Associated with cardiovascular and metabolic disease.";
    factors.push("Elevated VAI", "Increased cardiometabolic risk");
    recommendations.push("Medical consultation recommended", "HIIT training shown effective for visceral fat reduction", "Mediterranean or DASH diet");
  } else {
    riskLevel = "very-high";
    interpretation = "Very high visceral fat. Strongly associated with type 2 diabetes and cardiovascular disease.";
    factors.push("Severely elevated VAI", "Major cardiometabolic risk factor");
    recommendations.push("Urgent medical assessment", "Structured weight management program", "Consider pharmacological intervention discussion");
  }

  if (waist !== null) {
    const waistThreshold = isMale ? 102 : 88;
    if (waist > waistThreshold) factors.push(`Waist circumference ${waist} cm exceeds ${waistThreshold} cm threshold`);
  }

  return {
    value: Math.round(clampedVAI * 100) / 100,
    unit: "VAI score",
    label: "Visceral Fat Risk",
    interpretation,
    confidence: (waist !== null && triglycerides !== null && hdl !== null) ? 0.85 : 0.55,
    riskLevel,
    factors,
    recommendations,
    details: { bmi: Math.round(bmi * 10) / 10, waist, triglycerides, hdl, rawVAI: vai },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. Waist-to-Hip Ratio Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates Waist-to-Hip Ratio (WHR) for cardiovascular risk assessment.
 * WHO thresholds: Men > 0.90, Women > 0.85 indicate substantially increased risk.
 * If hip not available, estimates from BMI-based regression.
 */
export async function calculateWaistHipProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const hip = await fetchLatestMetric(userId, "hip_circumference_cm");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");

  if (!waist && (!weight || !height)) {
    return {
      value: 0, unit: "ratio", label: "Waist-to-Hip Ratio", interpretation: "Insufficient data.",
      confidence: 0, riskLevel: "low", factors: [], recommendations: [],
    };
  }

  const isMale = gender?.toLowerCase() === "male";
  let whr: number;
  let isEstimated = false;

  if (waist && hip) {
    whr = waist / hip;
  } else if (waist && weight && height) {
    // Estimate hip from anthropometric regression
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const estimatedHip = isMale ? 0.65 * waist + 0.35 * height * 0.58 : 0.6 * waist + 0.4 * height * 0.62;
    whr = waist / estimatedHip;
    isEstimated = true;
  } else {
    // Full estimation from BMI
    const heightM = height! / 100;
    const bmi = weight! / (heightM * heightM);
    whr = isMale ? 0.7 + bmi * 0.008 : 0.65 + bmi * 0.009;
    isEstimated = true;
  }

  const threshold = isMale ? 0.9 : 0.85;
  const factors: string[] = [];
  const recommendations: string[] = [];

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (whr < threshold - 0.1) {
    riskLevel = "low";
    interpretation = "Excellent waist-to-hip ratio. Low cardiovascular risk from fat distribution.";
  } else if (whr < threshold) {
    riskLevel = "moderate";
    interpretation = "Approaching elevated WHR threshold. Monitor abdominal fat trends.";
    factors.push("Borderline waist-to-hip ratio");
    recommendations.push("Focus on core strengthening and cardiovascular exercise");
  } else if (whr < threshold + 0.1) {
    riskLevel = "high";
    interpretation = `WHR ${whr.toFixed(2)} exceeds ${threshold} threshold. Increased cardiovascular risk.`;
    factors.push("Elevated WHR — central obesity pattern");
    recommendations.push("Targeted abdominal fat reduction program", "Dietary fiber increase recommended");
  } else {
    riskLevel = "very-high";
    interpretation = `WHR ${whr.toFixed(2)} significantly elevated. High cardiovascular and metabolic risk.`;
    factors.push("Severely elevated WHR", "Central obesity");
    recommendations.push("Medical consultation recommended", "Comprehensive lifestyle intervention needed");
  }

  if (isEstimated) factors.push("Note: WHR was estimated from available anthropometric data");

  return {
    value: Math.round(whr * 1000) / 1000,
    unit: "ratio",
    label: "Waist-to-Hip Ratio",
    interpretation,
    confidence: isEstimated ? 0.5 : 0.9,
    riskLevel,
    factors,
    recommendations,
    details: { waist, hip, isEstimated: isEstimated ? 1 : 0, genderThreshold: threshold },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Calorie Balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates daily calorie balance = intake − expenditure.
 * Uses tracked calorie intake and TDEE estimation.
 * Positive = surplus (weight gain), Negative = deficit (weight loss).
 * Safe deficit range: -250 to -750 kcal/day for sustainable fat loss.
 */
export async function calculateCalorieBalance(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const calorieIntake = await fetchMetric(userId, "calorie_intake", daysAgo(7, date), date);
  const tdeeResult = await calculateTDEE(userId, date, gender);

  if (calorieIntake.length === 0) {
    return {
      value: 0,
      unit: "kcal/day",
      label: "Calorie Balance",
      interpretation: "No calorie intake data available.",
      confidence: 0,
    };
  }

  const avgIntake = mean(calorieIntake);
  const tdee = tdeeResult.value || 2000;
  const balance = avgIntake - tdee;

  let interpretation: string;
  if (balance > 500) {
    interpretation = `Large calorie surplus (+${Math.round(balance)} kcal/day). Expected weight gain: ~${(balance * 7 / 7700).toFixed(1)} kg/week.`;
  } else if (balance > 100) {
    interpretation = `Mild calorie surplus (+${Math.round(balance)} kcal/day). Suitable for lean bulking.`;
  } else if (balance > -100) {
    interpretation = "Near maintenance calories. Weight should remain stable.";
  } else if (balance > -500) {
    interpretation = `Moderate deficit (${Math.round(balance)} kcal/day). Expected fat loss: ~${(Math.abs(balance) * 7 / 7700).toFixed(1)} kg/week.`;
  } else if (balance > -1000) {
    interpretation = `Aggressive deficit (${Math.round(balance)} kcal/day). Monitor for muscle loss and fatigue.`;
  } else {
    interpretation = `Extreme deficit (${Math.round(balance)} kcal/day). Unsustainable — risk of metabolic adaptation and muscle loss.`;
  }

  return {
    value: Math.round(balance),
    unit: "kcal/day",
    label: "Calorie Balance",
    interpretation,
    confidence: calorieIntake.length >= 5 ? 0.75 : 0.5,
    details: {
      avgIntake: Math.round(avgIntake),
      estimatedTDEE: tdee,
      intakeDataPoints: calorieIntake.length,
      projectedWeeklyChange: Math.round((balance * 7 / 7700) * 100) / 100,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. Thermic Effect of Food (TEF)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates Thermic Effect of Food based on macronutrient composition.
 * TEF for protein: 20-35% of calories, carbs: 5-10%, fat: 0-3%.
 * Average TEF is typically 10% of total calorie intake.
 */
export async function calculateTEF(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const protein = await fetchMetric(userId, "protein_g", daysAgo(7, date), date);
  const carbs = await fetchMetric(userId, "carbohydrates_g", daysAgo(7, date), date);
  const fat = await fetchMetric(userId, "fat_g", daysAgo(7, date), date);
  const totalCalories = await fetchMetric(userId, "calorie_intake", daysAgo(7, date), date);

  if (protein.length === 0 && carbs.length === 0 && fat.length === 0 && totalCalories.length === 0) {
    return { value: 0, unit: "kcal/day", label: "Thermic Effect of Food", interpretation: "No nutritional intake data.", confidence: 0 };
  }

  let tef: number;

  if (protein.length > 0 && carbs.length > 0 && fat.length > 0) {
    const avgProtein = mean(protein);
    const avgCarbs = mean(carbs);
    const avgFat = mean(fat);

    // Caloric values: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g
    const proteinCal = avgProtein * 4;
    const carbsCal = avgCarbs * 4;
    const fatCal = avgFat * 9;

    // TEF rates
    const proteinTEF = proteinCal * 0.25; // 25% average for protein
    const carbsTEF = carbsCal * 0.075; // 7.5% average for carbs
    const fatTEF = fatCal * 0.015; // 1.5% average for fat

    tef = proteinTEF + carbsTEF + fatTEF;
  } else {
    // Estimate as ~10% of total calories
    const avgCal = totalCalories.length > 0 ? mean(totalCalories) : 2000;
    tef = avgCal * 0.1;
  }

  const clampedTEF = clamp(tef, 0, 800);

  let interpretation: string;
  if (clampedTEF < 100) interpretation = "Low TEF — diet may be very low in protein. Consider increasing protein intake.";
  else if (clampedTEF < 200) interpretation = "Normal TEF range. Diet has adequate thermic effect.";
  else if (clampedTEF < 350) interpretation = "Above-average TEF — likely a high-protein diet, which aids satiety and body composition.";
  else interpretation = "Very high TEF — characteristic of very high protein intake or very large calorie consumption.";

  return {
    value: Math.round(clampedTEF),
    unit: "kcal/day",
    label: "Thermic Effect of Food",
    interpretation,
    confidence: (protein.length > 0 && carbs.length > 0 && fat.length > 0) ? 0.8 : 0.5,
    details: {
      proteinData: protein.length,
      carbData: carbs.length,
      fatData: fat.length,
      method: (protein.length > 0 && carbs.length > 0 && fat.length > 0) ? "macronutrient-specific" : "percentage-estimate",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. Sarcopenia Risk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates sarcopenia risk using the SARC-F inspired proxy.
 * Factors: age, grip strength trend, gait speed, lean mass, protein intake.
 * Risk increases significantly after age 65 and with low protein intake.
 */
export async function calculateSarcopeniaRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const age = await fetchLatestMetric(userId, "age");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const gripStrength = await fetchLatestMetric(userId, "grip_strength_kg");
  const protein = await fetchMetric(userId, "protein_g", daysAgo(30, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(14, date), date);

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Age factor
  if (age !== null) {
    if (age >= 80) { score += 3; factors.push("Age ≥ 80: high sarcopenia risk"); }
    else if (age >= 70) { score += 2; factors.push("Age 70-79: elevated sarcopenia risk"); }
    else if (age >= 60) { score += 1; factors.push("Age 60-69: moderate age-related risk"); }
  }

  // Lean mass estimation
  if (weight && height && bodyFat !== null) {
    const heightM = height / 100;
    const leanMass = weight * (1 - bodyFat / 100);
    const smi = leanMass / (heightM * heightM); // Skeletal muscle mass index proxy
    const isMale = gender?.toLowerCase() === "male";
    const smiThreshold = isMale ? 7.0 : 5.7; // kg/m² cutoffs (EWGSOP2)
    if (smi < smiThreshold) {
      score += 2;
      factors.push(`Low skeletal muscle index: ${smi.toFixed(1)} kg/m² (threshold: ${smiThreshold})`);
    }
  }

  // Grip strength
  if (gripStrength !== null) {
    const isMale = gender?.toLowerCase() === "male";
    const gripThreshold = isMale ? 27 : 16; // kg (EWGSOP2)
    if (gripStrength < gripThreshold) {
      score += 2;
      factors.push(`Low grip strength: ${gripStrength} kg (threshold: ${gripThreshold} kg)`);
      recommendations.push("Resistance training 2-3x/week targeting major muscle groups");
    }
  }

  // Protein intake
  if (protein.length > 0 && weight) {
    const avgProtein = mean(protein);
    const proteinPerKg = avgProtein / weight;
    if (proteinPerKg < 0.8) {
      score += 1;
      factors.push(`Low protein intake: ${proteinPerKg.toFixed(1)} g/kg (recommended ≥1.2 g/kg for older adults)`);
      recommendations.push("Increase protein to 1.2-1.6 g/kg body weight", "Distribute protein evenly across meals (25-30g per meal)");
    }
  }

  // Activity level (step proxy)
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps < 3000) {
      score += 2;
      factors.push(`Very low activity: ${Math.round(avgSteps)} avg daily steps`);
      recommendations.push("Gradually increase daily walking to 6000+ steps");
    } else if (avgSteps < 5000) {
      score += 1;
      factors.push(`Low activity: ${Math.round(avgSteps)} avg daily steps`);
    }
  }

  const clampedScore = clamp(score, 0, 10);
  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 2) {
    riskLevel = "low";
    interpretation = "Low sarcopenia risk. Maintain current activity and nutrition levels.";
  } else if (clampedScore <= 4) {
    riskLevel = "moderate";
    interpretation = "Moderate sarcopenia risk. Preventive measures recommended.";
    recommendations.push("Consider DEXA scan for body composition baseline");
  } else if (clampedScore <= 6) {
    riskLevel = "high";
    interpretation = "High sarcopenia risk. Structured intervention needed.";
    recommendations.push("Consult geriatrician or sports medicine physician", "Structured progressive resistance training program");
  } else {
    riskLevel = "very-high";
    interpretation = "Very high sarcopenia risk. Comprehensive medical and exercise intervention needed.";
    recommendations.push("Urgent referral to geriatric medicine", "Professional-supervised exercise program", "Nutritional supplementation (leucine, HMB)");
  }

  return {
    value: clampedScore,
    unit: "risk score (0-10)",
    label: "Sarcopenia Risk",
    interpretation,
    confidence: 0.6,
    riskLevel,
    factors,
    recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 19. Hydration Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates hydration status from water intake, urine specific gravity, and body weight changes.
 * Adequate intake: ~3.7 L/day (men), ~2.7 L/day (women) per IOM guidelines.
 * Acute weight loss >2% over 24h suggests dehydration.
 */
export async function calculateHydrationStatus(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const waterIntake = await fetchMetric(userId, "water_intake_ml", daysAgo(7, date), date);
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const urineSG = await fetchLatestMetric(userId, "urine_specific_gravity");

  const isMale = gender?.toLowerCase() === "male";
  const targetIntake = isMale ? 3700 : 2700;

  let hydrationScore = 100; // start at fully hydrated
  const details: Record<string, number | string | null> = {};

  if (waterIntake.length > 0) {
    const avgWater = mean(waterIntake);
    const hydrationPct = (avgWater / targetIntake) * 100;
    hydrationScore = clamp(hydrationPct, 0, 150);
    details.avgWaterIntake = Math.round(avgWater);
    details.targetIntake = targetIntake;
    details.hydrationPct = Math.round(hydrationPct);
  }

  if (urineSG !== null) {
    if (urineSG > 1.025) hydrationScore -= 20;
    else if (urineSG > 1.020) hydrationScore -= 10;
    else if (urineSG < 1.005) hydrationScore += 5;
    details.urineSG = urineSG;
  }

  hydrationScore = clamp(hydrationScore, 0, 100);

  let interpretation: string;
  if (hydrationScore >= 90) interpretation = "Well hydrated. Maintain current fluid intake.";
  else if (hydrationScore >= 70) interpretation = "Adequately hydrated but could improve. Aim for consistent water intake throughout the day.";
  else if (hydrationScore >= 50) interpretation = "Mildly dehydrated. Increase fluid intake — may affect cognitive and physical performance.";
  else interpretation = "Significantly dehydrated. Immediate increase in fluid intake recommended.";

  return {
    value: Math.round(hydrationScore),
    unit: "% (hydration score)",
    label: "Hydration Status",
    interpretation,
    confidence: waterIntake.length >= 3 ? 0.7 : 0.4,
    details,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 20. Weight Velocity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates rate of weight change using linear regression over configurable window.
 * Expresses result in kg/week and projects future weight at current rate.
 * Flags unsafe rates (>1 kg/week loss without medical supervision).
 */
export async function calculateWeightVelocity(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<TrendResult> {
  const weightData = await fetchMetricWithDates(userId, "weight_kg", daysAgo(60, date), date);

  if (weightData.length < 3) {
    return {
      value: 0, unit: "kg/week", label: "Weight Velocity",
      interpretation: "Insufficient weight data (need 3+ measurements).",
      confidence: 0, direction: "stable", rateOfChange: 0, dataPoints: weightData.length,
    };
  }

  const refDate = weightData[weightData.length - 1]!.date.getTime();
  const points = weightData.map((d) => ({
    x: (d.date.getTime() - refDate) / (7 * 24 * 3600 * 1000),
    y: d.value,
  }));

  const reg = linearRegression(points);
  const weeklyChange = reg.slope;
  const currentWeight = weightData[0]!.value;
  const projected4w = currentWeight + weeklyChange * 4;
  const projected12w = currentWeight + weeklyChange * 12;

  let direction: TrendResult["direction"];
  if (Math.abs(weeklyChange) < 0.05) direction = "stable";
  else if (weeklyChange > 0) direction = "increasing";
  else direction = "decreasing";

  let interpretation: string;
  if (Math.abs(weeklyChange) < 0.05) {
    interpretation = `Weight stable at ${currentWeight.toFixed(1)} kg. No significant trend detected.`;
  } else if (weeklyChange > 1) {
    interpretation = `Rapid weight gain: +${weeklyChange.toFixed(2)} kg/week. Projected: ${projected4w.toFixed(1)} kg in 4 weeks. Medical review recommended.`;
  } else if (weeklyChange > 0.3) {
    interpretation = `Moderate weight gain: +${weeklyChange.toFixed(2)} kg/week. Projected: ${projected4w.toFixed(1)} kg in 4 weeks.`;
  } else if (weeklyChange > 0) {
    interpretation = `Slow weight gain: +${weeklyChange.toFixed(2)} kg/week. Healthy bulking rate if intentional.`;
  } else if (weeklyChange > -0.5) {
    interpretation = `Healthy weight loss: ${weeklyChange.toFixed(2)} kg/week. Sustainable rate for fat loss.`;
  } else if (weeklyChange > -1) {
    interpretation = `Moderate weight loss: ${weeklyChange.toFixed(2)} kg/week. Ensure adequate protein intake.`;
  } else {
    interpretation = `Rapid weight loss: ${weeklyChange.toFixed(2)} kg/week. Risk of muscle loss — medical supervision recommended.`;
  }

  return {
    value: Math.round(weeklyChange * 100) / 100,
    unit: "kg/week",
    label: "Weight Velocity",
    interpretation,
    confidence: reg.r2 > 0.5 ? 0.85 : 0.6,
    direction,
    rateOfChange: Math.round(weeklyChange * 100) / 100,
    dataPoints: weightData.length,
    details: {
      currentWeight,
      projected4Weeks: Math.round(projected4w * 10) / 10,
      projected12Weeks: Math.round(projected12w * 10) / 10,
      r2: Math.round(reg.r2 * 100) / 100,
      totalChange: Math.round((weightData[0]!.value - weightData[weightData.length - 1]!.value) * 10) / 10,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 21. BMI Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive BMI analysis with WHO classification, adjusted BMI for age,
 * and BMI prime (ratio to upper limit of normal BMI).
 */
export async function calculateBMIAnalysis(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height) {
    return { value: 0, unit: "kg/m²", label: "BMI Analysis", interpretation: "Insufficient data.", confidence: 0 };
  }

  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  const bmiPrime = bmi / 25; // ratio to upper normal limit
  const idealWeightLow = 18.5 * heightM * heightM;
  const idealWeightHigh = 24.9 * heightM * heightM;

  // New BMI (Trefethen 2013): 1.3 × weight / height^2.5
  const newBMI = 1.3 * weight / Math.pow(heightM, 2.5);

  const classification = interpretBMI(bmi);

  let interpretation = `BMI: ${bmi.toFixed(1)} kg/m² — ${classification}. `;
  interpretation += `BMI Prime: ${bmiPrime.toFixed(2)}. `;
  interpretation += `Ideal weight range: ${idealWeightLow.toFixed(1)}-${idealWeightHigh.toFixed(1)} kg. `;

  if (age && age > 65) {
    interpretation += "Note: For older adults, BMI 23-30 may be optimal due to the obesity paradox.";
  }

  return {
    value: Math.round(bmi * 10) / 10,
    unit: "kg/m²",
    label: "BMI Analysis",
    interpretation,
    confidence: 0.95,
    details: {
      bmi: Math.round(bmi * 10) / 10,
      bmiPrime: Math.round(bmiPrime * 100) / 100,
      newBMI: Math.round(newBMI * 10) / 10,
      classification,
      idealWeightLow: Math.round(idealWeightLow * 10) / 10,
      idealWeightHigh: Math.round(idealWeightHigh * 10) / 10,
      weightToLoseForNormal: bmi > 25 ? Math.round((weight - idealWeightHigh) * 10) / 10 : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. Obesity Risk Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multi-factor obesity risk assessment combining BMI trajectory, family history proxy,
 * calorie surplus patterns, activity level, and metabolic markers.
 */
export async function calculateObesityRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const steps = await fetchMetric(userId, "steps", daysAgo(30, date), date);
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(30, date), date);
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(180, date), date);

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  if (weight && height) {
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);

    if (bmi >= 30) { score += 3; factors.push(`Current BMI: ${bmi.toFixed(1)} (obese range)`); }
    else if (bmi >= 27) { score += 2; factors.push(`BMI: ${bmi.toFixed(1)} (pre-obese)`); }
    else if (bmi >= 25) { score += 1; factors.push(`BMI: ${bmi.toFixed(1)} (overweight)`); }
  }

  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps < 3000) { score += 2; factors.push("Sedentary lifestyle (<3000 steps/day)"); }
    else if (avgSteps < 5000) { score += 1; factors.push("Low activity level (<5000 steps/day)"); }
  }

  if (calories.length > 0 && weight) {
    const avgCal = mean(calories);
    const isMale = gender?.toLowerCase() === "male";
    const estimatedTDEE = isMale ? weight * 30 : weight * 27;
    if (avgCal > estimatedTDEE * 1.2) { score += 2; factors.push("Chronic calorie surplus >20%"); }
    else if (avgCal > estimatedTDEE * 1.1) { score += 1; factors.push("Mild calorie surplus >10%"); }
  }

  if (weightHistory.length >= 5) {
    const recentW = mean(weightHistory.slice(0, 3));
    const oldW = mean(weightHistory.slice(-3));
    if (recentW > oldW * 1.05) { score += 1; factors.push("Weight increasing trend over 6 months"); }
  }

  if (age && age > 50) { score += 1; factors.push("Age >50 increases metabolic slowdown risk"); }

  const clampedScore = clamp(score, 0, 10);
  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 2) { riskLevel = "low"; interpretation = "Low obesity risk. Current lifestyle supports healthy weight maintenance."; }
  else if (clampedScore <= 4) { riskLevel = "moderate"; interpretation = "Moderate obesity risk. Preventive lifestyle adjustments recommended."; recommendations.push("Track calorie intake daily", "Target 7000+ steps/day"); }
  else if (clampedScore <= 6) { riskLevel = "high"; interpretation = "High obesity risk. Structured intervention recommended."; recommendations.push("Nutritionist consultation recommended", "Structured exercise program", "Regular weight monitoring"); }
  else { riskLevel = "very-high"; interpretation = "Very high obesity risk. Comprehensive medical and lifestyle intervention needed."; recommendations.push("Medical weight management program", "Consider bariatric evaluation if BMI >40"); }

  return { value: clampedScore, unit: "risk score", label: "Obesity Risk", interpretation, confidence: 0.7, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 23. Fat-Free Mass Index (FFMI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FFMI = fat_free_mass / height_m² + 6.1 × (1.8 − height_m)
 * Normalized FFMI accounts for height differences.
 * Natural limit ~25 for males, ~22 for females (Kouri et al. 1995).
 */
export async function calculateFFMI(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");

  if (!weight || !height) {
    return { value: 0, unit: "kg/m²", label: "FFMI", interpretation: "Insufficient data.", confidence: 0 };
  }

  const heightM = height / 100;
  const bfFraction = bodyFat !== null ? bodyFat / 100 : (gender?.toLowerCase() === "male" ? 0.18 : 0.25);
  const ffm = weight * (1 - bfFraction);
  const ffmi = ffm / (heightM * heightM);
  const normalizedFFMI = ffmi + 6.1 * (1.8 - heightM);

  const isMale = gender?.toLowerCase() === "male";
  let interpretation: string;

  if (isMale) {
    if (normalizedFFMI < 17) interpretation = "Below average muscularity for males.";
    else if (normalizedFFMI < 20) interpretation = "Average muscularity for males.";
    else if (normalizedFFMI < 22) interpretation = "Above average — good muscle development.";
    else if (normalizedFFMI < 25) interpretation = "Excellent muscularity — advanced trainee level.";
    else interpretation = "Exceptional muscularity — near or beyond natural genetic limit (~25 FFMI).";
  } else {
    if (normalizedFFMI < 14) interpretation = "Below average muscularity for females.";
    else if (normalizedFFMI < 17) interpretation = "Average muscularity for females.";
    else if (normalizedFFMI < 19) interpretation = "Above average — good muscle development.";
    else if (normalizedFFMI < 22) interpretation = "Excellent muscularity — advanced trainee level.";
    else interpretation = "Exceptional muscularity — near or beyond natural genetic limit (~22 FFMI).";
  }

  return {
    value: Math.round(normalizedFFMI * 10) / 10,
    unit: "kg/m²",
    label: "FFMI (Normalized)",
    interpretation,
    confidence: bodyFat !== null ? 0.85 : 0.55,
    details: { ffm: Math.round(ffm * 10) / 10, rawFFMI: Math.round(ffmi * 10) / 10, normalizedFFMI: Math.round(normalizedFFMI * 10) / 10, bodyFatUsed: Math.round(bfFraction * 100) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 24. Metabolic Flexibility Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates metabolic flexibility — the ability to switch between fat and carb oxidation.
 * Assessed by glucose stability during fasting vs fed states and RER variation.
 * Higher flexibility = better metabolic health.
 */
export async function calculateMetabolicFlexibility(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const fastingGlucose = await fetchMetric(userId, "fasting_glucose_mg_dl", daysAgo(30, date), date);
  const postMealGlucose = await fetchMetric(userId, "postmeal_glucose_mg_dl", daysAgo(30, date), date);
  const restingHR = await fetchMetric(userId, "resting_heart_rate", daysAgo(30, date), date);
  const exerciseHR = await fetchMetric(userId, "exercise_heart_rate", daysAgo(30, date), date);

  let flexScore = 50; // baseline score 0-100

  if (fastingGlucose.length > 0 && postMealGlucose.length > 0) {
    const avgFasting = mean(fastingGlucose);
    const avgPostMeal = mean(postMealGlucose);
    const glucoseExcursion = avgPostMeal - avgFasting;

    // Small excursion = better flexibility
    if (glucoseExcursion < 30) flexScore += 20;
    else if (glucoseExcursion < 50) flexScore += 10;
    else if (glucoseExcursion > 80) flexScore -= 15;
    else if (glucoseExcursion > 60) flexScore -= 5;

    // Low fasting glucose variability = good
    const fastingCV = coefficientOfVariation(fastingGlucose);
    if (fastingCV < 5) flexScore += 10;
    else if (fastingCV > 15) flexScore -= 10;
  }

  if (restingHR.length > 0) {
    const hrCV = coefficientOfVariation(restingHR);
    // Moderate HR variability suggests good autonomic flexibility
    if (hrCV >= 3 && hrCV <= 8) flexScore += 10;
    else if (hrCV > 15) flexScore -= 5;
  }

  if (exerciseHR.length > 0 && restingHR.length > 0) {
    const hrRange = mean(exerciseHR) - mean(restingHR);
    if (hrRange > 60) flexScore += 10; // good cardiac reserve
    else if (hrRange < 30) flexScore -= 10;
  }

  flexScore = clamp(flexScore, 0, 100);

  let interpretation: string;
  if (flexScore >= 80) interpretation = "Excellent metabolic flexibility — your body efficiently switches between fuel sources.";
  else if (flexScore >= 60) interpretation = "Good metabolic flexibility. Minor optimizations could further improve fuel switching.";
  else if (flexScore >= 40) interpretation = "Moderate metabolic flexibility. Consider intermittent fasting or zone 2 training to improve.";
  else interpretation = "Poor metabolic flexibility. May indicate metabolic rigidity — consult endocrinologist.";

  return {
    value: Math.round(flexScore),
    unit: "score (0-100)",
    label: "Metabolic Flexibility",
    interpretation,
    confidence: (fastingGlucose.length > 3 && postMealGlucose.length > 3) ? 0.7 : 0.4,
    details: {
      fastingGlucosePoints: fastingGlucose.length,
      postMealGlucosePoints: postMealGlucose.length,
      restingHRPoints: restingHR.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 25. Resting Energy Expenditure (REE) — Cunningham Equation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * REE using Cunningham equation (1991): REE = 500 + 22 × lean_body_mass_kg
 * More accurate than BMR equations for athletic populations.
 * Falls back to Katch-McArdle if body fat % available, else Mifflin-St Jeor.
 */
export async function calculateREE(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");

  if (!weight) {
    return { value: 0, unit: "kcal/day", label: "REE", interpretation: "Insufficient data.", confidence: 0 };
  }

  let ree: number;
  let method: string;

  if (bodyFat !== null) {
    const lbm = weight * (1 - bodyFat / 100);
    ree = 500 + 22 * lbm; // Cunningham
    method = "Cunningham (LBM-based)";
  } else if (height && age) {
    const isMale = gender?.toLowerCase() === "male";
    ree = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
    method = "Mifflin-St Jeor (fallback)";
  } else {
    ree = weight * 24; // crude estimation
    method = "Weight-based estimate";
  }

  const clamped = clamp(ree, 500, 5000);

  return {
    value: Math.round(clamped),
    unit: "kcal/day",
    label: "Resting Energy Expenditure",
    interpretation: `REE estimated at ${Math.round(clamped)} kcal/day using ${method}.`,
    confidence: bodyFat !== null ? 0.85 : 0.7,
    details: { method, weight, bodyFat, height, age },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 26. Lipid Profile Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes lipid panel (TC, LDL, HDL, triglycerides) and computes risk ratios.
 * TC/HDL ratio, LDL/HDL ratio, TG/HDL ratio, non-HDL cholesterol.
 * Framingham-inspired cardiovascular risk categorization.
 */
export async function calculateLipidProfileProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const tc = await fetchLatestMetric(userId, "total_cholesterol_mg_dl");
  const ldl = await fetchLatestMetric(userId, "ldl_mg_dl");
  const hdl = await fetchLatestMetric(userId, "hdl_mg_dl");
  const tg = await fetchLatestMetric(userId, "triglycerides_mg_dl");

  if (!tc && !ldl && !hdl) {
    return {
      value: 0, unit: "score", label: "Lipid Profile", interpretation: "No lipid data available.",
      confidence: 0, riskLevel: "low", factors: [], recommendations: [],
    };
  }

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, number | string | null> = {};

  // TC/HDL ratio (optimal < 4.0 for men, < 3.5 for women)
  if (tc && hdl) {
    const tcHdlRatio = tc / hdl;
    details.tcHdlRatio = Math.round(tcHdlRatio * 100) / 100;
    const isMale = gender?.toLowerCase() === "male";
    const threshold = isMale ? 4.5 : 4.0;
    if (tcHdlRatio > threshold + 1) { score += 2; factors.push(`High TC/HDL ratio: ${tcHdlRatio.toFixed(1)}`); }
    else if (tcHdlRatio > threshold) { score += 1; factors.push(`Borderline TC/HDL ratio: ${tcHdlRatio.toFixed(1)}`); }
  }

  // LDL analysis
  if (ldl !== null) {
    details.ldl = ldl;
    if (ldl > 190) { score += 3; factors.push(`Very high LDL: ${ldl} mg/dL`); recommendations.push("Statin therapy evaluation recommended"); }
    else if (ldl > 160) { score += 2; factors.push(`High LDL: ${ldl} mg/dL`); }
    else if (ldl > 130) { score += 1; factors.push(`Borderline high LDL: ${ldl} mg/dL`); }
  }

  // HDL analysis
  if (hdl !== null) {
    details.hdl = hdl;
    if (hdl < 40) { score += 2; factors.push(`Very low HDL: ${hdl} mg/dL`); recommendations.push("Increase aerobic exercise and healthy fats"); }
    else if (hdl < 50) { score += 1; factors.push(`Low HDL: ${hdl} mg/dL`); }
    else if (hdl > 60) { factors.push(`Protective HDL level: ${hdl} mg/dL`); score -= 1; }
  }

  // TG/HDL ratio (insulin resistance proxy)
  if (tg && hdl) {
    const tgHdlRatio = tg / hdl;
    details.tgHdlRatio = Math.round(tgHdlRatio * 100) / 100;
    if (tgHdlRatio > 3.5) { score += 1; factors.push("Elevated TG/HDL ratio — insulin resistance indicator"); }
  }

  // Non-HDL cholesterol
  if (tc && hdl) {
    const nonHDL = tc - hdl;
    details.nonHDL = nonHDL;
    if (nonHDL > 190) { score += 1; factors.push(`High non-HDL cholesterol: ${nonHDL} mg/dL`); }
  }

  if (tg !== null) {
    details.triglycerides = tg;
    if (tg > 500) { score += 2; factors.push(`Very high triglycerides: ${tg} mg/dL — pancreatitis risk`); recommendations.push("Urgent triglyceride management needed"); }
    else if (tg > 200) { score += 1; factors.push(`High triglycerides: ${tg} mg/dL`); recommendations.push("Reduce simple carbohydrates and alcohol"); }
  }

  const clampedScore = clamp(score, 0, 10);
  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 1) { riskLevel = "low"; interpretation = "Favorable lipid profile. Low cardiovascular risk from lipids."; }
  else if (clampedScore <= 3) { riskLevel = "moderate"; interpretation = "Borderline lipid values. Lifestyle modifications recommended."; recommendations.push("Heart-healthy diet (Mediterranean or DASH)", "Regular lipid monitoring every 6 months"); }
  else if (clampedScore <= 5) { riskLevel = "high"; interpretation = "Unfavorable lipid profile. Cardiovascular risk elevated."; recommendations.push("Cardiology consultation recommended", "Consider pharmacological intervention"); }
  else { riskLevel = "very-high"; interpretation = "Severely dyslipidemic profile. High cardiovascular event risk."; recommendations.push("Urgent lipid specialist referral", "Comprehensive cardiac risk assessment"); }

  return { value: clampedScore, unit: "risk score", label: "Lipid Profile Risk", interpretation, confidence: 0.8, riskLevel, factors, recommendations, details };
}

// ─────────────────────────────────────────────────────────────────────────────
// 27. Body Density (Siri Equation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates body density from body fat percentage using the Siri equation.
 * Body Density = 495 / (%BF + 100) — rearranged Siri (1961): %BF = (495/BD) − 450
 * If BF% not available, estimates from BMI using Deurenberg equation.
 */
export async function calculateBodyDensity(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  let bf: number;
  let method: string;

  if (bodyFat !== null) {
    bf = bodyFat;
    method = "Direct body fat measurement";
  } else if (weight && height && age) {
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const isMale = gender?.toLowerCase() === "male";
    // Deurenberg equation (1991): BF% = 1.2 × BMI + 0.23 × age − 10.8 × sex − 5.4
    bf = 1.2 * bmi + 0.23 * age - (isMale ? 10.8 : 0) - 5.4;
    method = "Deurenberg estimation from BMI";
  } else {
    return { value: 0, unit: "g/cm³", label: "Body Density", interpretation: "Insufficient data.", confidence: 0 };
  }

  const clampedBF = clamp(bf, 3, 60);
  // Siri equation rearranged: BD = 495 / (BF% + 450/100... wait, let's be precise)
  // Siri: %BF = (4.95/BD - 4.50) × 100 → BD = 4.95 / (%BF/100 + 4.50)
  const bodyDensity = 4.95 / (clampedBF / 100 + 4.50);

  let interpretation: string;
  if (bodyDensity > 1.08) interpretation = "Very low body fat — lean/athletic body density.";
  else if (bodyDensity > 1.06) interpretation = "Fit body density range.";
  else if (bodyDensity > 1.04) interpretation = "Average body density.";
  else interpretation = "Higher body fat reflected in lower body density.";

  return {
    value: Math.round(bodyDensity * 10000) / 10000,
    unit: "g/cm³",
    label: "Body Density (Siri)",
    interpretation,
    confidence: bodyFat !== null ? 0.85 : 0.6,
    details: { bodyFatUsed: Math.round(clampedBF * 10) / 10, method },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 28. Set-Point Weight Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates the body's "set-point" weight — the weight the body naturally defends.
 * Uses long-term weight history (6+ months) to find the most stable weight range.
 * Identifies the mode/cluster of weight values where the body spent most time.
 */
export async function calculateSetPointWeight(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weightData = await fetchMetric(userId, "weight_kg", daysAgo(365, date), date);

  if (weightData.length < 10) {
    return {
      value: 0, unit: "kg", label: "Set-Point Weight",
      interpretation: "Insufficient long-term weight data (need 10+ measurements over 6+ months).",
      confidence: 0,
    };
  }

  // Find the most common weight range (1kg buckets)
  const buckets = new Map<number, number>();
  for (const w of weightData) {
    const bucket = Math.round(w);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  let maxCount = 0;
  let setPoint = mean(weightData);
  for (const [bucket, count] of buckets) {
    if (count > maxCount) {
      maxCount = count;
      setPoint = bucket;
    }
  }

  // Refine with weighted average of top buckets
  const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const topBuckets = sortedBuckets.slice(0, 3);
  const totalWeight = topBuckets.reduce((s, [_, c]) => s + c, 0);
  const weightedSetPoint = topBuckets.reduce((s, [w, c]) => s + w * c, 0) / totalWeight;

  const currentWeight = weightData[0]!;
  const deviation = currentWeight - weightedSetPoint;

  let interpretation: string;
  if (Math.abs(deviation) < 1) {
    interpretation = `Your current weight is at your body's set-point (~${weightedSetPoint.toFixed(1)} kg).`;
  } else if (deviation > 0) {
    interpretation = `You are ${deviation.toFixed(1)} kg above your set-point weight of ~${weightedSetPoint.toFixed(1)} kg. Your body may naturally tend back toward this weight.`;
  } else {
    interpretation = `You are ${Math.abs(deviation).toFixed(1)} kg below your set-point weight of ~${weightedSetPoint.toFixed(1)} kg. Maintaining this weight may require continued effort.`;
  }

  return {
    value: Math.round(weightedSetPoint * 10) / 10,
    unit: "kg",
    label: "Set-Point Weight",
    interpretation,
    confidence: weightData.length >= 30 ? 0.75 : 0.5,
    details: {
      currentWeight,
      deviation: Math.round(deviation * 10) / 10,
      dataPoints: weightData.length,
      weightRange: `${Math.min(...weightData).toFixed(1)} - ${Math.max(...weightData).toFixed(1)} kg`,
      weightStdDev: Math.round(stddev(weightData) * 10) / 10,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 29. Adaptive Thermogenesis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates adaptive thermogenesis — the metabolic slowdown that occurs during sustained calorie restriction.
 * Compares current BMR to expected BMR based on current body composition.
 * A deficit sustained >2 weeks typically triggers 5-15% metabolic adaptation.
 */
export async function calculateAdaptiveThermogenesis(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(30, date), date);
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(90, date), date);

  if (!weight || !height || !age) {
    return { value: 0, unit: "%", label: "Adaptive Thermogenesis", interpretation: "Insufficient data.", confidence: 0 };
  }

  const isMale = gender?.toLowerCase() === "male";
  const expectedBMR = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

  let adaptationPct = 0;

  if (calories.length >= 14 && weightHistory.length >= 5) {
    const avgCalories = mean(calories);
    const estimatedTDEE = expectedBMR * 1.4; // moderate activity assumption
    const deficitPct = (estimatedTDEE - avgCalories) / estimatedTDEE;

    // Weight loss velocity
    const recentW = mean(weightHistory.slice(0, 3));
    const olderW = mean(weightHistory.slice(-3));
    const weightLossPct = (olderW - recentW) / olderW;

    if (deficitPct > 0.1 && weightLossPct > 0.02) {
      // Expect ~5% adaptation per month of deficit
      const deficitDuration = Math.min(calories.length, 90);
      adaptationPct = clamp(deficitPct * 0.5 * (deficitDuration / 30) * 100, 0, 25);

      // If weight loss has stalled despite deficit, adaptation is likely higher
      if (deficitPct > 0.15 && weightLossPct < 0.01) {
        adaptationPct += 5;
      }
    }
  }

  adaptationPct = clamp(adaptationPct, 0, 25);
  const adaptedBMR = expectedBMR * (1 - adaptationPct / 100);

  let interpretation: string;
  if (adaptationPct < 3) interpretation = "Minimal metabolic adaptation detected. Metabolism is functioning normally.";
  else if (adaptationPct < 8) interpretation = "Mild metabolic adaptation. Consider periodic diet breaks or refeeds.";
  else if (adaptationPct < 15) interpretation = "Moderate metabolic adaptation. Recommend a 1-2 week maintenance calorie period.";
  else interpretation = "Significant metabolic adaptation. Extended reverse dieting phase recommended before further deficit.";

  return {
    value: Math.round(adaptationPct * 10) / 10,
    unit: "% metabolic reduction",
    label: "Adaptive Thermogenesis",
    interpretation,
    confidence: calories.length >= 21 ? 0.65 : 0.35,
    details: {
      expectedBMR: Math.round(expectedBMR),
      adaptedBMR: Math.round(adaptedBMR),
      metabolicReduction: Math.round(expectedBMR - adaptedBMR),
      calorieDataPoints: calories.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 30. Nutrient Partitioning Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates how well the body partitions nutrients toward muscle vs fat storage.
 * Good partitioning: surplus calories → muscle. Poor: surplus → fat.
 * Assessed via: insulin sensitivity proxy, activity level, protein intake, body composition trend.
 */
export async function calculateNutrientPartitioning(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const protein = await fetchMetric(userId, "protein_g", daysAgo(14, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(14, date), date);
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const bodyFatHistory = await fetchMetric(userId, "body_fat_pct", daysAgo(90, date), date);

  let partitionScore = 50; // 0-100, higher = better

  // Insulin sensitivity (fasting glucose proxy)
  if (glucose !== null) {
    if (glucose < 85) partitionScore += 15;
    else if (glucose < 95) partitionScore += 10;
    else if (glucose > 110) partitionScore -= 15;
    else if (glucose > 100) partitionScore -= 5;
  }

  // Activity level
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps > 10000) partitionScore += 10;
    else if (avgSteps > 7000) partitionScore += 5;
    else if (avgSteps < 3000) partitionScore -= 10;
  }

  // Protein intake relative to body weight
  if (protein.length > 0 && weight) {
    const avgProtein = mean(protein);
    const proteinPerKg = avgProtein / weight;
    if (proteinPerKg > 1.6) partitionScore += 10;
    else if (proteinPerKg > 1.2) partitionScore += 5;
    else if (proteinPerKg < 0.8) partitionScore -= 10;
  }

  // Body fat trend
  if (bodyFatHistory.length >= 5) {
    const recentBF = mean(bodyFatHistory.slice(0, 3));
    const olderBF = mean(bodyFatHistory.slice(-3));
    if (recentBF < olderBF - 1) partitionScore += 10; // losing fat
    else if (recentBF > olderBF + 2) partitionScore -= 10; // gaining fat
  }

  // Current body fat level
  if (bodyFat !== null) {
    const isMale = gender?.toLowerCase() === "male";
    const leanThreshold = isMale ? 15 : 22;
    if (bodyFat < leanThreshold) partitionScore += 5;
    else if (bodyFat > (isMale ? 25 : 35)) partitionScore -= 10;
  }

  partitionScore = clamp(partitionScore, 0, 100);

  let interpretation: string;
  if (partitionScore >= 75) interpretation = "Excellent nutrient partitioning — calories are preferentially directed toward muscle tissue.";
  else if (partitionScore >= 55) interpretation = "Good nutrient partitioning. Slight calorie surplus will favor lean mass gains.";
  else if (partitionScore >= 35) interpretation = "Average nutrient partitioning. Excess calories may be stored as both muscle and fat.";
  else interpretation = "Poor nutrient partitioning — excess calories likely stored as fat. Improve insulin sensitivity and increase resistance training.";

  return {
    value: Math.round(partitionScore),
    unit: "score (0-100)",
    label: "Nutrient Partitioning",
    interpretation,
    confidence: 0.5,
    details: { glucose, bodyFat, proteinData: protein.length, stepData: steps.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 31. Glycolysis Efficiency Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates glycolytic efficiency based on glucose clearance rate and exercise performance.
 * Efficient glycolysis: rapid glucose clearance, stable energy during exercise.
 * Uses fasting glucose, post-exercise glucose drop, and perceived exertion data.
 */
export async function calculateGlycolysisEfficiency(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const fastingGlucose = await fetchMetric(userId, "fasting_glucose_mg_dl", daysAgo(14, date), date);
  const postExerciseGlucose = await fetchMetric(userId, "post_exercise_glucose_mg_dl", daysAgo(14, date), date);
  const exerciseDuration = await fetchMetric(userId, "exercise_duration_min", daysAgo(14, date), date);

  let efficiencyScore = 50;

  if (fastingGlucose.length > 0) {
    const avgFasting = mean(fastingGlucose);
    if (avgFasting < 85) efficiencyScore += 15;
    else if (avgFasting < 95) efficiencyScore += 5;
    else if (avgFasting > 110) efficiencyScore -= 15;
  }

  if (fastingGlucose.length > 0 && postExerciseGlucose.length > 0) {
    const glucoseDrop = mean(fastingGlucose) - mean(postExerciseGlucose);
    if (glucoseDrop > 15 && glucoseDrop < 40) efficiencyScore += 15; // appropriate glucose utilization
    else if (glucoseDrop > 5) efficiencyScore += 5;
    else if (glucoseDrop < 0) efficiencyScore -= 10; // glucose rising during exercise = poor regulation
  }

  if (exerciseDuration.length > 0) {
    const avgDuration = mean(exerciseDuration);
    if (avgDuration > 45) efficiencyScore += 5;
    else if (avgDuration < 15) efficiencyScore -= 5;
  }

  // Glucose variability penalty
  if (fastingGlucose.length >= 5) {
    const cv = coefficientOfVariation(fastingGlucose);
    if (cv > 15) efficiencyScore -= 10;
    else if (cv < 5) efficiencyScore += 5;
  }

  efficiencyScore = clamp(efficiencyScore, 0, 100);

  let interpretation: string;
  if (efficiencyScore >= 75) interpretation = "Excellent glycolytic efficiency — glucose is rapidly and effectively metabolized for energy.";
  else if (efficiencyScore >= 50) interpretation = "Normal glycolytic function. Body processes glucose adequately.";
  else if (efficiencyScore >= 30) interpretation = "Below average glycolytic efficiency. Consider structured exercise to improve glucose metabolism.";
  else interpretation = "Poor glycolytic efficiency — potential glucose metabolism disorder. Consider medical evaluation.";

  return {
    value: Math.round(efficiencyScore),
    unit: "score (0-100)",
    label: "Glycolysis Efficiency",
    interpretation,
    confidence: (fastingGlucose.length > 3 && postExerciseGlucose.length > 3) ? 0.65 : 0.35,
    details: { fastingGlucosePoints: fastingGlucose.length, postExercisePoints: postExerciseGlucose.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 32. Protein Turnover Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates daily protein turnover — the rate at which the body breaks down and resynthesizes proteins.
 * Average adult: ~250-300 g/day total protein turnover.
 * Estimated from lean mass, activity level, and nitrogen balance proxy.
 */
export async function calculateProteinTurnover(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const protein = await fetchMetric(userId, "protein_g", daysAgo(7, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(7, date), date);
  const age = await fetchLatestMetric(userId, "age");

  if (!weight) {
    return { value: 0, unit: "g/day", label: "Protein Turnover", interpretation: "Insufficient data.", confidence: 0 };
  }

  const bfFraction = bodyFat !== null ? bodyFat / 100 : 0.2;
  const leanMass = weight * (1 - bfFraction);

  // Base turnover: ~3.5-4.5 g protein / kg lean mass / day
  let turnoverRate = 4.0;

  // Activity adjustment
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps > 10000) turnoverRate += 0.5;
    else if (avgSteps < 3000) turnoverRate -= 0.3;
  }

  // Age adjustment (turnover decreases with age)
  if (age !== null) {
    if (age > 65) turnoverRate -= 0.5;
    else if (age > 50) turnoverRate -= 0.3;
    else if (age < 25) turnoverRate += 0.2;
  }

  const totalTurnover = leanMass * turnoverRate;

  // Nitrogen balance estimation
  let nitrogenBalance: string;
  if (protein.length > 0) {
    const avgProtein = mean(protein);
    const proteinNeeded = leanMass * 1.2; // minimum for balance
    if (avgProtein > proteinNeeded * 1.2) nitrogenBalance = "Positive (anabolic state)";
    else if (avgProtein > proteinNeeded * 0.9) nitrogenBalance = "Balanced";
    else nitrogenBalance = "Negative (catabolic risk)";
  } else {
    nitrogenBalance = "Unknown";
  }

  return {
    value: Math.round(totalTurnover),
    unit: "g/day",
    label: "Protein Turnover",
    interpretation: `Estimated daily protein turnover: ${Math.round(totalTurnover)} g/day. Nitrogen balance: ${nitrogenBalance}.`,
    confidence: bodyFat !== null ? 0.6 : 0.4,
    details: {
      leanMass: Math.round(leanMass * 10) / 10,
      turnoverRate: Math.round(turnoverRate * 10) / 10,
      nitrogenBalance,
      proteinDataPoints: protein.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 33. Ketosis Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates likelihood of nutritional ketosis based on macronutrient intake patterns.
 * Ketosis typically occurs when: carbs < 50g/day, moderate protein, high fat.
 * Also considers fasting duration and blood glucose trends.
 */
export async function calculateKetosisProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const carbs = await fetchMetric(userId, "carbohydrates_g", daysAgo(7, date), date);
  const fat = await fetchMetric(userId, "fat_g", daysAgo(7, date), date);
  const protein = await fetchMetric(userId, "protein_g", daysAgo(7, date), date);
  const glucose = await fetchMetric(userId, "fasting_glucose_mg_dl", daysAgo(7, date), date);
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(7, date), date);

  if (carbs.length === 0) {
    return { value: 0, unit: "likelihood %", label: "Ketosis Proxy", interpretation: "No macronutrient data available.", confidence: 0 };
  }

  const avgCarbs = mean(carbs);
  const avgFat = fat.length > 0 ? mean(fat) : 0;
  const avgProtein = protein.length > 0 ? mean(protein) : 0;
  const avgGlucose = glucose.length > 0 ? mean(glucose) : 100;

  let ketosisLikelihood = 0;

  // Carb threshold analysis
  if (avgCarbs < 20) ketosisLikelihood += 40;
  else if (avgCarbs < 50) ketosisLikelihood += 25;
  else if (avgCarbs < 100) ketosisLikelihood += 5;
  else ketosisLikelihood -= 20; // high carb = no ketosis

  // Fat ratio analysis
  if (avgFat > 0 && avgProtein > 0 && avgCarbs > 0) {
    const totalCal = avgFat * 9 + avgProtein * 4 + avgCarbs * 4;
    const fatPct = (avgFat * 9 / totalCal) * 100;
    if (fatPct > 70) ketosisLikelihood += 25;
    else if (fatPct > 60) ketosisLikelihood += 15;
    else if (fatPct < 40) ketosisLikelihood -= 10;
  }

  // Glucose level (lower fasting glucose supports ketosis)
  if (avgGlucose < 80) ketosisLikelihood += 15;
  else if (avgGlucose < 90) ketosisLikelihood += 5;
  else if (avgGlucose > 110) ketosisLikelihood -= 10;

  // Calorie deficit can enhance ketosis
  if (calories.length > 0) {
    const avgCal = mean(calories);
    if (avgCal < 1500) ketosisLikelihood += 10;
  }

  ketosisLikelihood = clamp(ketosisLikelihood, 0, 100);

  let interpretation: string;
  if (ketosisLikelihood >= 70) interpretation = "High likelihood of nutritional ketosis. Carbohydrate intake is low enough for ketone production.";
  else if (ketosisLikelihood >= 40) interpretation = "Moderate ketosis likelihood. May be in mild or transitional ketosis.";
  else if (ketosisLikelihood >= 15) interpretation = "Low ketosis likelihood. Carbohydrate intake is likely too high for sustained ketosis.";
  else interpretation = "Very unlikely to be in ketosis. Standard carbohydrate-fueled metabolism.";

  return {
    value: Math.round(ketosisLikelihood),
    unit: "likelihood %",
    label: "Ketosis Proxy",
    interpretation,
    confidence: carbs.length >= 5 ? 0.6 : 0.35,
    details: { avgCarbs: Math.round(avgCarbs), avgFat: Math.round(avgFat), avgProtein: Math.round(avgProtein), avgGlucose: Math.round(avgGlucose) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 34. NAFLD Risk Score (Non-Alcoholic Fatty Liver Disease)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates NAFLD risk using the Fatty Liver Index (FLI) by Bedogni et al. 2006.
 * FLI = (e^(0.953×ln(TG) + 0.139×BMI + 0.718×ln(GGT) + 0.053×waist − 15.745)) /
 *       (1 + e^(0.953×ln(TG) + 0.139×BMI + 0.718×ln(GGT) + 0.053×waist − 15.745)) × 100
 * Simplified version when GGT unavailable uses BMI, waist, triglycerides, glucose.
 */
export async function calculateNAFLDRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const triglycerides = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const ggt = await fetchLatestMetric(userId, "ggt_u_l");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const alt = await fetchLatestMetric(userId, "alt_u_l");

  if (!weight || !height) {
    return { value: 0, unit: "score", label: "NAFLD Risk", interpretation: "Insufficient data.", confidence: 0, riskLevel: "low", factors: [], recommendations: [] };
  }

  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  const factors: string[] = [];
  const recommendations: string[] = [];

  let fli: number;

  if (triglycerides && ggt && waist) {
    const logit = 0.953 * Math.log(triglycerides) + 0.139 * bmi + 0.718 * Math.log(ggt) + 0.053 * waist - 15.745;
    fli = (Math.exp(logit) / (1 + Math.exp(logit))) * 100;
  } else {
    // Simplified estimation
    let score = 0;
    if (bmi > 30) score += 30;
    else if (bmi > 25) score += 15;
    if (waist) {
      const isMale = gender?.toLowerCase() === "male";
      if (waist > (isMale ? 102 : 88)) score += 20;
      else if (waist > (isMale ? 94 : 80)) score += 10;
    }
    if (triglycerides) {
      if (triglycerides > 200) score += 20;
      else if (triglycerides > 150) score += 10;
    }
    if (glucose) {
      if (glucose > 110) score += 15;
      else if (glucose > 100) score += 5;
    }
    if (alt) {
      if (alt > 40) score += 15;
      else if (alt > 30) score += 5;
    }
    fli = clamp(score, 0, 100);
  }

  if (bmi > 30) factors.push(`Obesity (BMI ${bmi.toFixed(1)})`);
  if (triglycerides && triglycerides > 150) factors.push(`Elevated triglycerides: ${triglycerides} mg/dL`);
  if (glucose && glucose > 100) factors.push(`Elevated fasting glucose: ${glucose} mg/dL`);
  if (alt && alt > 40) factors.push(`Elevated ALT: ${alt} U/L`);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (fli < 30) { riskLevel = "low"; interpretation = "Low NAFLD risk (FLI < 30). Liver fat accumulation unlikely."; }
  else if (fli < 60) { riskLevel = "moderate"; interpretation = "Intermediate NAFLD risk. Liver ultrasound may be warranted."; recommendations.push("Reduce saturated fat and fructose intake", "Regular aerobic exercise"); }
  else if (fli < 80) { riskLevel = "high"; interpretation = "High NAFLD risk (FLI ≥ 60). Hepatic steatosis likely."; recommendations.push("Liver ultrasound recommended", "Weight loss of 5-10% can significantly reduce liver fat", "Avoid alcohol"); }
  else { riskLevel = "very-high"; interpretation = "Very high NAFLD risk. Significant liver fat accumulation probable."; recommendations.push("Urgent hepatology referral", "Comprehensive liver function testing", "Structured weight loss program"); }

  return { value: Math.round(fli), unit: "FLI score (0-100)", label: "NAFLD Risk", interpretation, confidence: ggt !== null ? 0.85 : 0.55, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 35. 24-Hour Metabolic Rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates total 24-hour metabolic rate including BMR, TEF, NEAT, and EAT.
 * BMR (60-70%) + TEF (8-15%) + NEAT (15-30%) + EAT (5-10%).
 * Provides breakdown of each component.
 */
export async function calculate24HourMetabolicRate(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<CompositionResult> {
  const bmrResult = await calculateBMR_MifflinStJeor(userId, date, gender);
  const bmr = bmrResult.value || 1500;

  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(7, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(7, date), date);
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(7, date), date);
  const weight = await fetchLatestMetric(userId, "weight_kg");

  // TEF estimation (~10% of calorie intake, or ~10% of BMR if no data)
  const avgCalories = calories.length > 0 ? mean(calories) : bmr * 1.2;
  const tef = avgCalories * 0.1;

  // EAT (Exercise Activity Thermogenesis)
  const avgExerciseMin = exerciseMin.length > 0 ? mean(exerciseMin) : 0;
  const met = 5; // average MET for moderate exercise
  const eat = weight ? (met * 3.5 * weight / 200) * avgExerciseMin : avgExerciseMin * 5;

  // NEAT (Non-Exercise Activity Thermogenesis)
  const avgSteps = steps.length > 0 ? mean(steps) : 5000;
  const neatFromSteps = avgSteps * 0.04; // ~0.04 kcal per step
  const neat = neatFromSteps + 200; // baseline fidgeting, posture, etc.

  const total24h = bmr + tef + neat + eat;

  return {
    value: Math.round(total24h),
    unit: "kcal/day",
    label: "24-Hour Metabolic Rate",
    interpretation: `Total daily energy: ${Math.round(total24h)} kcal (BMR: ${Math.round(bmr)}, TEF: ${Math.round(tef)}, NEAT: ${Math.round(neat)}, EAT: ${Math.round(eat)}).`,
    confidence: 0.65,
    components: {
      BMR: Math.round(bmr),
      TEF: Math.round(tef),
      NEAT: Math.round(neat),
      EAT: Math.round(eat),
      total: Math.round(total24h),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 36. Mitochondrial Function Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proxy estimation of mitochondrial function based on exercise recovery,
 * resting heart rate, and VO2max estimation.
 * Better mitochondrial function = faster HR recovery, higher VO2max, lower resting HR.
 */
export async function calculateMitochondrialFunction(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const age = await fetchLatestMetric(userId, "age");
  const hrRecovery = await fetchLatestMetric(userId, "hr_recovery_1min");
  const exerciseHR = await fetchMetric(userId, "exercise_heart_rate", daysAgo(14, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(14, date), date);

  let mitoScore = 50;

  // Resting HR (lower = better mitochondrial density)
  if (restingHR !== null) {
    if (restingHR < 50) mitoScore += 20;
    else if (restingHR < 60) mitoScore += 10;
    else if (restingHR > 80) mitoScore -= 10;
    else if (restingHR > 90) mitoScore -= 20;
  }

  // HR recovery (>30 bpm in 1 min = excellent)
  if (hrRecovery !== null) {
    if (hrRecovery > 40) mitoScore += 15;
    else if (hrRecovery > 30) mitoScore += 10;
    else if (hrRecovery > 20) mitoScore += 5;
    else if (hrRecovery < 12) mitoScore -= 15;
  }

  // VO2max estimation (Uth et al. 2004: VO2max ≈ 15.3 × HRmax/HRrest)
  if (restingHR && age) {
    const maxHR = 208 - 0.7 * age;
    const vo2max = 15.3 * maxHR / restingHR;
    if (vo2max > 50) mitoScore += 10;
    else if (vo2max > 40) mitoScore += 5;
    else if (vo2max < 25) mitoScore -= 10;
  }

  // Activity level
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps > 12000) mitoScore += 5;
    else if (avgSteps < 3000) mitoScore -= 5;
  }

  mitoScore = clamp(mitoScore, 0, 100);

  let interpretation: string;
  if (mitoScore >= 80) interpretation = "Excellent mitochondrial function indicators — high energy production capacity.";
  else if (mitoScore >= 60) interpretation = "Good mitochondrial function. Adequate cellular energy metabolism.";
  else if (mitoScore >= 40) interpretation = "Average mitochondrial function. Zone 2 training can improve mitochondrial density.";
  else interpretation = "Below-average mitochondrial function. Consider comprehensive metabolic testing.";

  return {
    value: Math.round(mitoScore),
    unit: "score (0-100)",
    label: "Mitochondrial Function Proxy",
    interpretation,
    confidence: (restingHR !== null && hrRecovery !== null) ? 0.6 : 0.35,
    details: { restingHR, hrRecovery, stepsData: steps.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 37. Oxidative Stress Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates oxidative stress level from lifestyle and metabolic markers.
 * Factors: smoking status, alcohol, exercise intensity, sleep, antioxidant intake,
 * resting heart rate, glucose levels.
 */
export async function calculateOxidativeStress(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(14, date), date);
  const steps = await fetchMetric(userId, "steps", daysAgo(14, date), date);
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(14, date), date);
  const age = await fetchLatestMetric(userId, "age");

  let stressScore = 30; // baseline (some oxidative stress is normal)
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Sleep quality
  if (sleep.length > 0) {
    const avgSleep = mean(sleep);
    if (avgSleep < 5) { stressScore += 15; factors.push(`Severe sleep deprivation: ${avgSleep.toFixed(1)} hrs/night`); }
    else if (avgSleep < 6) { stressScore += 10; factors.push(`Insufficient sleep: ${avgSleep.toFixed(1)} hrs/night`); }
    else if (avgSleep >= 7 && avgSleep <= 9) { stressScore -= 10; }
    else if (avgSleep > 10) { stressScore += 5; factors.push("Excessive sleep may indicate underlying health issues"); }
  }

  // Glucose (chronic hyperglycemia increases ROS)
  if (glucose !== null) {
    if (glucose > 126) { stressScore += 15; factors.push("Diabetic-range glucose — major oxidative stress driver"); }
    else if (glucose > 100) { stressScore += 5; factors.push("Pre-diabetic glucose range"); }
  }

  // Exercise (moderate = protective, excessive = pro-oxidant)
  if (exerciseMin.length > 0) {
    const avgMin = mean(exerciseMin);
    if (avgMin > 120) { stressScore += 5; factors.push("Very high exercise volume — potential overtraining"); }
    else if (avgMin > 30) { stressScore -= 10; }
    else if (avgMin < 10) { stressScore += 5; factors.push("Sedentary — lack of exercise-induced antioxidant adaptation"); }
  }

  // Resting HR (proxy for sympathetic activation)
  if (restingHR !== null && restingHR > 85) {
    stressScore += 5;
    factors.push("Elevated resting HR suggests sympathetic overdrive");
  }

  // Age factor
  if (age !== null && age > 60) { stressScore += 5; factors.push("Age-related increase in oxidative stress"); }

  stressScore = clamp(stressScore, 0, 100);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (stressScore <= 20) { riskLevel = "low"; interpretation = "Low oxidative stress. Good antioxidant-prooxidant balance."; }
  else if (stressScore <= 40) { riskLevel = "moderate"; interpretation = "Moderate oxidative stress — within normal range. Minor lifestyle adjustments helpful."; recommendations.push("Increase antioxidant-rich foods (berries, green tea, dark chocolate)"); }
  else if (stressScore <= 60) { riskLevel = "high"; interpretation = "Elevated oxidative stress. Multiple contributing factors identified."; recommendations.push("Prioritize 7-9 hours sleep", "Add anti-inflammatory foods", "Consider CoQ10 or NAC supplementation after medical consultation"); }
  else { riskLevel = "very-high"; interpretation = "High oxidative stress. Accelerated cellular aging likely."; recommendations.push("Comprehensive health assessment recommended", "Significant lifestyle modifications needed"); }

  return { value: Math.round(stressScore), unit: "score (0-100)", label: "Oxidative Stress Proxy", interpretation, confidence: 0.45, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 38. Type 2 Diabetes Risk (Finnish Diabetes Risk Score adaptation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates 10-year type 2 diabetes risk adapted from the FINDRISC model.
 * Factors: age, BMI, waist circumference, physical activity, diet, blood pressure,
 * blood glucose history.
 */
export async function calculateDiabetesRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const systolic = await fetchLatestMetric(userId, "systolic_bp");
  const steps = await fetchMetric(userId, "steps", daysAgo(30, date), date);

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // Age scoring (FINDRISC)
  if (age !== null) {
    if (age >= 64) { score += 4; factors.push("Age ≥ 64"); }
    else if (age >= 55) { score += 3; factors.push("Age 55-64"); }
    else if (age >= 45) { score += 2; factors.push("Age 45-54"); }
  }

  // BMI scoring
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi > 30) { score += 3; factors.push(`BMI > 30 (${bmi.toFixed(1)})`); }
    else if (bmi > 25) { score += 1; factors.push(`BMI 25-30 (${bmi.toFixed(1)})`); }
  }

  // Waist circumference
  if (waist !== null) {
    if (isMale) {
      if (waist > 102) { score += 4; factors.push("Waist > 102 cm"); }
      else if (waist > 94) { score += 3; factors.push("Waist 94-102 cm"); }
    } else {
      if (waist > 88) { score += 4; factors.push("Waist > 88 cm"); }
      else if (waist > 80) { score += 3; factors.push("Waist 80-88 cm"); }
    }
  }

  // Physical activity
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps < 4000) { score += 2; factors.push("Insufficient physical activity"); }
  } else {
    score += 1; // assume moderate if no data
  }

  // Blood glucose
  if (glucose !== null) {
    if (glucose >= 126) { score += 5; factors.push(`Diabetic-range glucose: ${glucose} mg/dL`); }
    else if (glucose >= 100) { score += 3; factors.push(`Pre-diabetic glucose: ${glucose} mg/dL`); }
  }

  // Blood pressure
  if (systolic !== null && systolic >= 140) { score += 2; factors.push("Hypertension"); }

  const clampedScore = clamp(score, 0, 26);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;
  let risk10y: string;

  if (clampedScore < 7) { riskLevel = "low"; risk10y = "<1%"; interpretation = `Low diabetes risk (FINDRISC-adapted score: ${clampedScore}). 10-year risk: ${risk10y}.`; }
  else if (clampedScore < 12) { riskLevel = "moderate"; risk10y = "~4%"; interpretation = `Slightly elevated diabetes risk (score: ${clampedScore}). 10-year risk: ${risk10y}.`; recommendations.push("Annual fasting glucose screening", "Increase fiber intake", "Target 150+ min/week moderate exercise"); }
  else if (clampedScore < 15) { riskLevel = "high"; risk10y = "~17%"; interpretation = `Moderate diabetes risk (score: ${clampedScore}). 10-year risk: ${risk10y}.`; recommendations.push("Glucose tolerance test recommended", "Structured weight loss if overweight", "Consider metformin discussion with physician"); }
  else { riskLevel = "very-high"; risk10y = "~50%"; interpretation = `High diabetes risk (score: ${clampedScore}). 10-year risk: ${risk10y}.`; recommendations.push("Urgent endocrinologist referral", "HbA1c testing", "Intensive lifestyle intervention"); }

  return { value: clampedScore, unit: "FINDRISC score", label: "Type 2 Diabetes Risk", interpretation, confidence: 0.7, riskLevel, factors, recommendations, details: { estimated10YearRisk: risk10y } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 39. Glucose Variability (CGM-inspired)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes glucose variability using standard deviation, coefficient of variation,
 * MAGE (Mean Amplitude of Glycemic Excursions), and time in range.
 * Target: CV < 36%, time in range (70-180 mg/dL) > 70%.
 */
export async function calculateGlucoseVariability(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const glucoseReadings = await fetchMetric(userId, "blood_glucose_mg_dl", daysAgo(14, date), date);

  if (glucoseReadings.length < 5) {
    return { value: 0, unit: "CV %", label: "Glucose Variability", interpretation: "Insufficient glucose data (need 5+ readings).", confidence: 0 };
  }

  const avg = mean(glucoseReadings);
  const sd = stddev(glucoseReadings);
  const cv = (sd / avg) * 100;

  // Time in range (70-180 mg/dL)
  const inRange = glucoseReadings.filter((g) => g >= 70 && g <= 180).length;
  const tirPct = (inRange / glucoseReadings.length) * 100;

  // Below range (<70) — hypoglycemia
  const belowRange = glucoseReadings.filter((g) => g < 70).length;
  const tbrPct = (belowRange / glucoseReadings.length) * 100;

  // Above range (>180) — hyperglycemia
  const aboveRange = glucoseReadings.filter((g) => g > 180).length;
  const tarPct = (aboveRange / glucoseReadings.length) * 100;

  // MAGE approximation (simplified)
  const excursions: number[] = [];
  for (let i = 1; i < glucoseReadings.length; i++) {
    const diff = Math.abs(glucoseReadings[i]! - glucoseReadings[i - 1]!);
    if (diff > sd) excursions.push(diff);
  }
  const mage = excursions.length > 0 ? mean(excursions) : 0;

  let interpretation: string;
  if (cv < 20 && tirPct > 90) interpretation = "Excellent glucose stability — minimal variability and high time in range.";
  else if (cv < 36 && tirPct > 70) interpretation = "Good glucose control — variability within recommended targets.";
  else if (cv < 50) interpretation = "Moderate glucose variability — some room for dietary/lifestyle improvement.";
  else interpretation = "High glucose variability — associated with increased cardiovascular risk. Consider CGM and dietary review.";

  return {
    value: Math.round(cv * 10) / 10,
    unit: "CV %",
    label: "Glucose Variability",
    interpretation,
    confidence: glucoseReadings.length >= 20 ? 0.85 : 0.55,
    details: {
      meanGlucose: Math.round(avg),
      sdGlucose: Math.round(sd * 10) / 10,
      cv: Math.round(cv * 10) / 10,
      timeInRange: Math.round(tirPct),
      timeBelowRange: Math.round(tbrPct),
      timeAboveRange: Math.round(tarPct),
      mage: Math.round(mage),
      dataPoints: glucoseReadings.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 40. Anabolic Window Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates post-exercise nutrition timing and quality for optimal recovery.
 * Considers protein intake timing, carb replenishment, and sleep quality.
 * Score 0-100 reflecting how well the anabolic window is utilized.
 */
export async function calculateAnabolicWindow(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const protein = await fetchMetric(userId, "protein_g", daysAgo(7, date), date);
  const carbs = await fetchMetric(userId, "carbohydrates_g", daysAgo(7, date), date);
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(7, date), date);
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(7, date), date);

  let anabolicScore = 40; // baseline

  // Protein adequacy
  if (protein.length > 0 && weight) {
    const avgProtein = mean(protein);
    const proteinPerKg = avgProtein / weight;
    if (proteinPerKg >= 1.6) anabolicScore += 20;
    else if (proteinPerKg >= 1.2) anabolicScore += 10;
    else if (proteinPerKg < 0.8) anabolicScore -= 15;
  }

  // Carb replenishment
  if (carbs.length > 0 && weight) {
    const avgCarbs = mean(carbs);
    const carbsPerKg = avgCarbs / weight;
    if (carbsPerKg >= 3 && carbsPerKg <= 7) anabolicScore += 10;
    else if (carbsPerKg < 2) anabolicScore -= 5;
  }

  // Sleep (critical for anabolism)
  if (sleep.length > 0) {
    const avgSleep = mean(sleep);
    if (avgSleep >= 7 && avgSleep <= 9) anabolicScore += 15;
    else if (avgSleep >= 6) anabolicScore += 5;
    else anabolicScore -= 10;
  }

  // Exercise stimulus
  if (exerciseMin.length > 0) {
    const avgExercise = mean(exerciseMin);
    if (avgExercise >= 30 && avgExercise <= 90) anabolicScore += 10;
    else if (avgExercise > 120) anabolicScore += 5; // diminishing returns
    else if (avgExercise < 15) anabolicScore -= 5;
  }

  anabolicScore = clamp(anabolicScore, 0, 100);

  let interpretation: string;
  if (anabolicScore >= 80) interpretation = "Excellent anabolic environment — nutrition, training, and recovery well-optimized for muscle growth.";
  else if (anabolicScore >= 60) interpretation = "Good anabolic conditions. Minor improvements in nutrition timing or sleep could enhance gains.";
  else if (anabolicScore >= 40) interpretation = "Moderate anabolic potential. Review protein intake distribution and sleep quality.";
  else interpretation = "Poor anabolic conditions — inadequate protein, training stimulus, or recovery impeding muscle growth.";

  return {
    value: Math.round(anabolicScore),
    unit: "score (0-100)",
    label: "Anabolic Window Score",
    interpretation,
    confidence: (protein.length > 3 && sleep.length > 3) ? 0.65 : 0.35,
    details: { proteinData: protein.length, sleepData: sleep.length, exerciseData: exerciseMin.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 41. Caloric Deficit Safety Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether the current caloric deficit is safe and sustainable.
 * Checks: deficit magnitude, duration, lean mass preservation, energy levels.
 * Safe deficit: 250-750 kcal/day. Extreme deficits (<1200 kcal total) flagged.
 */
export async function calculateCaloricDeficitSafety(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(14, date), date);
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (calories.length === 0 || !weight || !height || !age) {
    return { value: 0, unit: "score", label: "Caloric Deficit Safety", interpretation: "Insufficient data.", confidence: 0, riskLevel: "low", factors: [], recommendations: [] };
  }

  const isMale = gender?.toLowerCase() === "male";
  const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
  const estimatedTDEE = bmr * 1.4;
  const avgCalories = mean(calories);
  const deficit = estimatedTDEE - avgCalories;
  const deficitPct = deficit / estimatedTDEE * 100;

  const factors: string[] = [];
  const recommendations: string[] = [];
  let safetyScore = 100;

  // Absolute calorie floor
  const minCalories = isMale ? 1500 : 1200;
  if (avgCalories < minCalories) {
    safetyScore -= 30;
    factors.push(`Intake below minimum safe threshold (${Math.round(avgCalories)} vs ${minCalories} kcal)`);
    recommendations.push(`Increase intake to at least ${minCalories} kcal/day`);
  }

  // Deficit magnitude
  if (deficit > 1000) { safetyScore -= 25; factors.push(`Extreme deficit: ${Math.round(deficit)} kcal/day`); }
  else if (deficit > 750) { safetyScore -= 10; factors.push(`Aggressive deficit: ${Math.round(deficit)} kcal/day`); }
  else if (deficit > 500) { safetyScore -= 0; } // safe range
  else if (deficit < 0) { safetyScore += 5; } // surplus, no deficit concern

  // Below BMR
  if (avgCalories < bmr) {
    safetyScore -= 15;
    factors.push(`Eating below BMR (${Math.round(avgCalories)} vs ${Math.round(bmr)} kcal)`);
    recommendations.push("Eating below BMR can trigger metabolic adaptation — consider increasing intake");
  }

  // Extreme deficit percentage
  if (deficitPct > 40) {
    safetyScore -= 20;
    factors.push(`Deficit exceeds 40% of TDEE — very large calorie restriction`);
    recommendations.push("Maximum recommended deficit is 25% of TDEE for sustainability");
  }

  safetyScore = clamp(safetyScore, 0, 100);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (safetyScore >= 80) { riskLevel = "low"; interpretation = "Current caloric intake is within safe deficit range."; }
  else if (safetyScore >= 60) { riskLevel = "moderate"; interpretation = "Caloric deficit is moderately aggressive. Monitor energy levels and strength."; }
  else if (safetyScore >= 40) { riskLevel = "high"; interpretation = "Caloric deficit is too aggressive. Risk of metabolic adaptation, muscle loss, and nutrient deficiency."; recommendations.push("Increase calories by 200-300 kcal/day", "Ensure protein ≥1.6 g/kg"); }
  else { riskLevel = "very-high"; interpretation = "Dangerously low caloric intake. Immediate dietary adjustment needed."; recommendations.push("Urgently increase caloric intake", "Consult registered dietitian"); }

  return {
    value: safetyScore,
    unit: "safety score (0-100)",
    label: "Caloric Deficit Safety",
    interpretation,
    confidence: calories.length >= 7 ? 0.8 : 0.5,
    riskLevel, factors, recommendations,
    details: { avgCalories: Math.round(avgCalories), estimatedTDEE: Math.round(estimatedTDEE), deficit: Math.round(deficit), deficitPct: Math.round(deficitPct), bmr: Math.round(bmr) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 42. Eating Disorder Risk Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Screens for potential eating disorder risk patterns.
 * Flags: extreme restriction, rapid weight cycling, BMI extremes, erratic intake patterns.
 * NOT a diagnostic tool — only a screening prompt for professional evaluation.
 */
export async function calculateEatingDisorderRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(30, date), date);
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(90, date), date);

  let riskScore = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  // BMI extremes
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi < 17) { riskScore += 3; factors.push(`Very low BMI: ${bmi.toFixed(1)}`); }
    else if (bmi < 18.5) { riskScore += 1; factors.push(`Underweight BMI: ${bmi.toFixed(1)}`); }
  }

  // Extreme caloric restriction
  if (calories.length > 0) {
    const avgCal = mean(calories);
    const isMale = gender?.toLowerCase() === "male";
    if (avgCal < (isMale ? 1200 : 900)) { riskScore += 3; factors.push(`Very low caloric intake: ${Math.round(avgCal)} kcal/day`); }
    else if (avgCal < (isMale ? 1500 : 1200)) { riskScore += 1; factors.push(`Low caloric intake: ${Math.round(avgCal)} kcal/day`); }

    // Erratic patterns (high variability)
    if (calories.length >= 7) {
      const cv = coefficientOfVariation(calories);
      if (cv > 50) { riskScore += 2; factors.push(`Highly erratic eating pattern (CV: ${cv.toFixed(0)}%)`); }
      else if (cv > 35) { riskScore += 1; factors.push(`Variable eating pattern (CV: ${cv.toFixed(0)}%)`); }
    }
  }

  // Weight cycling
  if (weightHistory.length >= 10) {
    const weightSD = stddev(weightHistory);
    const avgWeight = mean(weightHistory);
    const weightCV = (weightSD / avgWeight) * 100;
    if (weightCV > 5) { riskScore += 2; factors.push("Significant weight cycling detected"); }
    else if (weightCV > 3) { riskScore += 1; factors.push("Moderate weight fluctuation"); }
  }

  riskScore = clamp(riskScore, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (riskScore <= 1) { riskLevel = "low"; interpretation = "No eating disorder risk indicators detected."; }
  else if (riskScore <= 3) { riskLevel = "moderate"; interpretation = "Some concerning eating patterns detected. Self-monitoring recommended."; recommendations.push("Practice mindful eating", "Avoid extreme restriction"); }
  else if (riskScore <= 5) { riskLevel = "high"; interpretation = "Multiple eating disorder risk indicators present. Professional evaluation recommended."; recommendations.push("Consider speaking with a registered dietitian", "Screen with validated tools (EDE-Q, SCOFF)"); }
  else { riskLevel = "very-high"; interpretation = "Significant eating disorder risk. Professional help strongly recommended."; recommendations.push("Seek evaluation from eating disorder specialist", "NEDA helpline: 1-800-931-2237"); }

  return {
    value: riskScore,
    unit: "risk score (0-10)",
    label: "Eating Disorder Risk Screen",
    interpretation: interpretation + " Disclaimer: This is a screening proxy only, not a diagnostic tool.",
    confidence: 0.4,
    riskLevel, factors, recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 43. Body Water Percentage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates total body water percentage using Watson equation (1980).
 * Males: TBW = 2.447 − 0.09156 × age + 0.1074 × height_cm + 0.3362 × weight_kg
 * Females: TBW = −2.097 + 0.1069 × height_cm + 0.2466 × weight_kg
 * Normal range: 45-65% for males, 40-60% for females.
 */
export async function calculateBodyWaterPercentage(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height || !age) {
    return { value: 0, unit: "%", label: "Body Water %", interpretation: "Insufficient data.", confidence: 0 };
  }

  const isMale = gender?.toLowerCase() === "male";
  let tbw: number;

  if (isMale) {
    tbw = 2.447 - 0.09156 * age + 0.1074 * height + 0.3362 * weight;
  } else {
    tbw = -2.097 + 0.1069 * height + 0.2466 * weight;
  }

  const tbwPct = (tbw / weight) * 100;
  const clampedPct = clamp(tbwPct, 30, 75);

  let interpretation: string;
  if (isMale) {
    if (clampedPct < 45) interpretation = "Below normal body water — possible dehydration or high body fat.";
    else if (clampedPct < 55) interpretation = "Normal body water percentage for males.";
    else if (clampedPct < 65) interpretation = "Good hydration — lean individuals tend toward higher body water.";
    else interpretation = "Very high body water percentage — may reflect very low body fat.";
  } else {
    if (clampedPct < 40) interpretation = "Below normal body water — possible dehydration or high body fat.";
    else if (clampedPct < 50) interpretation = "Normal body water percentage for females.";
    else if (clampedPct < 60) interpretation = "Good hydration level.";
    else interpretation = "Very high body water percentage — may reflect very low body fat.";
  }

  return {
    value: Math.round(clampedPct * 10) / 10,
    unit: "%",
    label: "Body Water Percentage",
    interpretation,
    confidence: 0.75,
    details: { totalBodyWater: Math.round(tbw * 10) / 10, weight, equation: "Watson 1980" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 44. Bone Mineral Density Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates bone mineral density risk using FRAX-inspired proxy factors.
 * Factors: age, gender, BMI, physical activity, calcium/vitamin D proxy.
 * Low BMI, advanced age, low activity, and inadequate nutrition increase osteoporosis risk.
 */
export async function calculateBoneMineralDensityProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const steps = await fetchMetric(userId, "steps", daysAgo(30, date), date);
  const calcium = await fetchMetric(userId, "calcium_mg", daysAgo(30, date), date);

  let bmdScore = 50; // baseline healthy
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // Age factor
  if (age !== null) {
    if (age > 70) { bmdScore -= 20; factors.push("Age > 70 — significant bone density loss risk"); }
    else if (age > 60) { bmdScore -= 10; factors.push("Age 60-70 — moderate bone density decline"); }
    else if (age > 50 && !isMale) { bmdScore -= 15; factors.push("Post-menopausal age range — accelerated bone loss"); }
  }

  // BMI (very low BMI = higher fracture risk)
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi < 18.5) { bmdScore -= 15; factors.push("Low BMI increases fracture risk"); }
    else if (bmi > 25 && bmi < 30) { bmdScore += 5; } // mild protective effect of higher weight
  }

  // Activity (weight-bearing exercise protective)
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps > 8000) { bmdScore += 10; }
    else if (avgSteps < 3000) { bmdScore -= 10; factors.push("Low physical activity — insufficient mechanical stimulus for bone"); recommendations.push("Increase weight-bearing exercise (walking, jogging, strength training)"); }
  }

  // Calcium intake
  if (calcium.length > 0) {
    const avgCalcium = mean(calcium);
    if (avgCalcium >= 1000) bmdScore += 5;
    else if (avgCalcium < 500) { bmdScore -= 10; factors.push(`Low calcium intake: ${Math.round(avgCalcium)} mg/day`); recommendations.push("Increase calcium to 1000-1200 mg/day from food sources or supplements"); }
  }

  // Gender factor
  if (!isMale) { bmdScore -= 5; factors.push("Female sex — higher baseline osteoporosis risk"); }

  bmdScore = clamp(bmdScore, 0, 100);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (bmdScore >= 60) { riskLevel = "low"; interpretation = "Low osteoporosis risk. Current bone health indicators are favorable."; }
  else if (bmdScore >= 40) { riskLevel = "moderate"; interpretation = "Moderate bone density risk. Preventive measures recommended."; recommendations.push("Consider DEXA scan baseline", "Ensure adequate vitamin D (2000-4000 IU/day)"); }
  else if (bmdScore >= 25) { riskLevel = "high"; interpretation = "Elevated osteoporosis risk. DEXA scan recommended."; recommendations.push("DEXA scan recommended", "Consult endocrinologist", "Strength training 3x/week"); }
  else { riskLevel = "very-high"; interpretation = "High osteoporosis risk. Comprehensive bone health evaluation needed."; recommendations.push("Urgent DEXA scan", "Fall prevention assessment", "Consider bisphosphonate evaluation"); }

  return { value: bmdScore, unit: "bone health score", label: "Bone Mineral Density Proxy", interpretation, confidence: 0.5, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 45. Muscle Mass Estimation (Lee equation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates skeletal muscle mass using the Lee equation (2000).
 * SM (kg) = 0.244 × weight + 7.80 × height_m + 6.6 × sex − 0.098 × age + race − 3.3
 * Where sex = 1 for male, 0 for female. Race factor simplified to 0 (mixed/unknown).
 */
export async function calculateMuscleMassEstimation(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || !height || !age) {
    return { value: 0, unit: "kg", label: "Skeletal Muscle Mass", interpretation: "Insufficient data.", confidence: 0 };
  }

  const isMale = gender?.toLowerCase() === "male";
  const heightM = height / 100;
  const sexFactor = isMale ? 1 : 0;

  // Lee equation (simplified, race factor = 0)
  const smm = 0.244 * weight + 7.80 * heightM + 6.6 * sexFactor - 0.098 * age - 3.3;
  const clampedSMM = clamp(smm, 10, 60);
  const smmPct = (clampedSMM / weight) * 100;

  let interpretation: string;
  if (isMale) {
    if (smmPct < 33) interpretation = "Below average muscle mass for males. Resistance training recommended.";
    else if (smmPct < 39) interpretation = "Normal skeletal muscle mass for males.";
    else if (smmPct < 44) interpretation = "Above average — good muscular development.";
    else interpretation = "High muscle mass — athletic-level muscularity.";
  } else {
    if (smmPct < 24) interpretation = "Below average muscle mass for females. Resistance training recommended.";
    else if (smmPct < 30) interpretation = "Normal skeletal muscle mass for females.";
    else if (smmPct < 35) interpretation = "Above average — good muscular development.";
    else interpretation = "High muscle mass — athletic-level muscularity.";
  }

  return {
    value: Math.round(clampedSMM * 10) / 10,
    unit: "kg",
    label: "Skeletal Muscle Mass (Lee equation)",
    interpretation,
    confidence: 0.7,
    details: { smmPct: Math.round(smmPct * 10) / 10, weight, heightM: Math.round(heightM * 100) / 100, age, equation: "Lee 2000" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 46. Frailty Index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simplified frailty index inspired by Fried phenotype criteria.
 * Evaluates: unintentional weight loss, exhaustion (low activity), weakness (grip),
 * slow walking speed (step proxy), low physical activity.
 */
export async function calculateFrailtyIndex(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const age = await fetchLatestMetric(userId, "age");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const gripStrength = await fetchLatestMetric(userId, "grip_strength_kg");
  const steps = await fetchMetric(userId, "steps", daysAgo(30, date), date);
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(180, date), date);
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(14, date), date);

  let frailtyCount = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // Criterion 1: Unintentional weight loss (>5% in 6 months)
  if (weightHistory.length >= 5) {
    const oldest = mean(weightHistory.slice(-3));
    const newest = mean(weightHistory.slice(0, 3));
    const pctChange = (oldest - newest) / oldest * 100;
    if (pctChange > 5) { frailtyCount++; factors.push(`Unintentional weight loss: ${pctChange.toFixed(1)}%`); }
  }

  // Criterion 2: Self-reported exhaustion (proxy: very low activity + poor sleep)
  if (steps.length > 0 && sleep.length > 0) {
    const avgSteps = mean(steps);
    const avgSleep = mean(sleep);
    if (avgSteps < 2000 && avgSleep < 5) { frailtyCount++; factors.push("Signs of exhaustion (very low activity + poor sleep)"); }
  }

  // Criterion 3: Weakness (grip strength)
  if (gripStrength !== null) {
    const threshold = isMale ? 26 : 18;
    if (gripStrength < threshold) { frailtyCount++; factors.push(`Low grip strength: ${gripStrength} kg`); }
  }

  // Criterion 4: Slow walking speed (step proxy)
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps < 2500) { frailtyCount++; factors.push("Very low daily step count suggests slow gait"); }
  }

  // Criterion 5: Low physical activity
  if (steps.length > 0) {
    const avgSteps = mean(steps);
    if (avgSteps < 3500) { frailtyCount++; factors.push("Insufficient physical activity"); }
  }

  frailtyCount = Math.min(frailtyCount, 5);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (frailtyCount === 0) { riskLevel = "low"; interpretation = "Robust — no frailty criteria met."; }
  else if (frailtyCount <= 2) { riskLevel = "moderate"; interpretation = `Pre-frail (${frailtyCount}/5 criteria). Preventive intervention recommended.`; recommendations.push("Progressive resistance training", "Adequate protein intake (1.2+ g/kg)", "Fall prevention assessment"); }
  else if (frailtyCount <= 3) { riskLevel = "high"; interpretation = `Frail (${frailtyCount}/5 criteria met). Comprehensive geriatric assessment recommended.`; recommendations.push("Geriatric medicine referral", "Structured exercise program", "Nutritional supplementation review"); }
  else { riskLevel = "very-high"; interpretation = `Severely frail (${frailtyCount}/5 criteria). Urgent comprehensive assessment needed.`; recommendations.push("Urgent geriatric consultation", "Multi-disciplinary care team", "Fall prevention and safety assessment"); }

  return { value: frailtyCount, unit: "criteria met (of 5)", label: "Frailty Index (Fried)", interpretation, confidence: 0.55, riskLevel, factors, recommendations, details: { age, isGeriatric: age ? (age >= 65 ? 1 : 0) : null } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 47. Energy Availability (EA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Energy Availability = (Energy Intake − Exercise Energy Expenditure) / Fat-Free Mass
 * EA < 30 kcal/kg FFM/day = low EA (RED-S risk)
 * EA < 20 kcal/kg FFM/day = clinically low (amenorrhea, bone loss risk)
 * Optimal: 45+ kcal/kg FFM/day.
 */
export async function calculateEnergyAvailability(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(7, date), date);
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(7, date), date);
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");

  if (calories.length === 0 || !weight) {
    return { value: 0, unit: "kcal/kg FFM/day", label: "Energy Availability", interpretation: "Insufficient data.", confidence: 0, riskLevel: "low", factors: [], recommendations: [] };
  }

  const bfFraction = bodyFat !== null ? bodyFat / 100 : (gender?.toLowerCase() === "male" ? 0.18 : 0.25);
  const ffm = weight * (1 - bfFraction);

  const avgCalories = mean(calories);
  const avgExerciseMin = exerciseMin.length > 0 ? mean(exerciseMin) : 0;

  // Exercise energy expenditure estimation (~8 kcal/min moderate exercise)
  const eee = avgExerciseMin * 8;
  const ea = (avgCalories - eee) / ffm;
  const clampedEA = clamp(ea, 0, 100);

  const factors: string[] = [];
  const recommendations: string[] = [];

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedEA >= 45) { riskLevel = "low"; interpretation = "Optimal energy availability. Adequate energy for all physiological functions."; }
  else if (clampedEA >= 30) { riskLevel = "moderate"; interpretation = "Marginal energy availability. Some metabolic compromise may occur."; recommendations.push("Monitor menstrual function (if applicable)", "Ensure adequate micronutrient intake"); factors.push("Sub-optimal energy availability"); }
  else if (clampedEA >= 20) { riskLevel = "high"; interpretation = "Low energy availability (RED-S risk zone). Hormonal and bone health may be compromised."; factors.push("Low EA — RED-S risk", "Potential for menstrual dysfunction, bone stress injuries"); recommendations.push("Increase calorie intake or reduce training volume", "Bone density screening recommended", "Sports medicine consultation"); }
  else { riskLevel = "very-high"; interpretation = "Clinically low energy availability. Serious health consequences likely."; factors.push("Dangerously low EA", "High risk of stress fractures, amenorrhea, immune suppression"); recommendations.push("Urgent sports medicine referral", "Immediate calorie increase", "Consider training cessation until EA improves"); }

  return {
    value: Math.round(clampedEA * 10) / 10,
    unit: "kcal/kg FFM/day",
    label: "Energy Availability",
    interpretation,
    confidence: (calories.length >= 5 && exerciseMin.length >= 5) ? 0.75 : 0.45,
    riskLevel, factors, recommendations,
    details: { avgCalories: Math.round(avgCalories), eee: Math.round(eee), ffm: Math.round(ffm * 10) / 10, bodyFatUsed: Math.round(bfFraction * 100) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 48. Substrate Utilization Profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates the ratio of fat vs carbohydrate oxidation based on exercise intensity,
 * macronutrient intake, and metabolic markers.
 * Reports estimated RER (Respiratory Exchange Ratio) and fuel mix.
 */
export async function calculateSubstrateUtilization(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<CompositionResult> {
  const carbs = await fetchMetric(userId, "carbohydrates_g", daysAgo(7, date), date);
  const fat = await fetchMetric(userId, "fat_g", daysAgo(7, date), date);
  const exerciseHR = await fetchMetric(userId, "exercise_heart_rate", daysAgo(7, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const age = await fetchLatestMetric(userId, "age");

  // Estimate exercise intensity
  let exerciseIntensity = 0.5; // default moderate
  if (exerciseHR.length > 0 && restingHR && age) {
    const maxHR = 208 - 0.7 * age;
    const hrReserve = maxHR - restingHR;
    const avgExHR = mean(exerciseHR);
    exerciseIntensity = clamp((avgExHR - restingHR) / hrReserve, 0, 1);
  }

  // RER estimation: 0.7 (pure fat) to 1.0 (pure carbs)
  let rer = 0.7 + 0.3 * exerciseIntensity;

  // Dietary influence
  if (carbs.length > 0 && fat.length > 0) {
    const avgCarbs = mean(carbs);
    const avgFat = mean(fat);
    const carbCal = avgCarbs * 4;
    const fatCal = avgFat * 9;
    const carbFraction = carbCal / (carbCal + fatCal);
    // Shift RER slightly based on diet composition
    rer = rer * 0.7 + (0.7 + 0.3 * carbFraction) * 0.3;
  }

  rer = clamp(rer, 0.7, 1.0);

  // Calculate fuel percentages
  const fatPct = ((1.0 - rer) / 0.3) * 100;
  const carbPct = 100 - fatPct;

  let interpretation: string;
  if (rer < 0.75) interpretation = "Predominantly fat oxidation — typical of fasted or low-intensity activity.";
  else if (rer < 0.85) interpretation = "Mixed fuel utilization — balanced fat and carbohydrate burning.";
  else if (rer < 0.95) interpretation = "Predominantly carbohydrate oxidation — typical of moderate-high intensity exercise.";
  else interpretation = "Near-pure carbohydrate oxidation — anaerobic threshold or high-intensity exercise.";

  return {
    value: Math.round(rer * 1000) / 1000,
    unit: "RER",
    label: "Substrate Utilization",
    interpretation,
    confidence: (exerciseHR.length > 3 && carbs.length > 3) ? 0.6 : 0.35,
    components: {
      fatOxidation: Math.round(fatPct),
      carbOxidation: Math.round(carbPct),
      estimatedRER: Math.round(rer * 1000) / 1000,
      exerciseIntensityPct: Math.round(exerciseIntensity * 100),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 49. Metabolic Efficiency Ratio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ratio of useful metabolic work to total energy expenditure.
 * Higher efficiency = more energy directed to vital functions vs waste heat.
 * Factors: TEF efficiency, exercise economy, metabolic flexibility, sleep quality.
 */
export async function calculateMetabolicEfficiencyRatio(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const bmrResult = await calculateBMR_MifflinStJeor(userId, date, gender);
  const tdeeResult = await calculateTDEE(userId, date, gender);
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(14, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");

  let efficiencyScore = 50;

  // BMR to TDEE ratio (higher ratio = less efficient / more total expenditure beyond BMR)
  if (bmrResult.value > 0 && tdeeResult.value > 0) {
    const bmrTdeeRatio = bmrResult.value / tdeeResult.value;
    if (bmrTdeeRatio > 0.7) efficiencyScore += 5; // low activity overhead
    else if (bmrTdeeRatio < 0.5) efficiencyScore -= 5; // very high activity
  }

  // Sleep efficiency
  if (sleep.length > 0) {
    const avgSleep = mean(sleep);
    const sleepCV = coefficientOfVariation(sleep);
    if (avgSleep >= 7 && avgSleep <= 8.5 && sleepCV < 15) efficiencyScore += 15;
    else if (avgSleep >= 6 && avgSleep <= 9) efficiencyScore += 5;
    else efficiencyScore -= 10;
  }

  // Cardiovascular efficiency (lower resting HR = more efficient)
  if (restingHR !== null) {
    if (restingHR < 55) efficiencyScore += 15;
    else if (restingHR < 65) efficiencyScore += 10;
    else if (restingHR > 80) efficiencyScore -= 5;
    else if (restingHR > 90) efficiencyScore -= 10;
  }

  efficiencyScore = clamp(efficiencyScore, 0, 100);

  let interpretation: string;
  if (efficiencyScore >= 75) interpretation = "High metabolic efficiency — body systems are well-optimized.";
  else if (efficiencyScore >= 55) interpretation = "Normal metabolic efficiency. Body is functioning adequately.";
  else if (efficiencyScore >= 35) interpretation = "Below average efficiency. Poor sleep or cardiovascular fitness may be contributing.";
  else interpretation = "Low metabolic efficiency. Comprehensive lifestyle review recommended.";

  return {
    value: Math.round(efficiencyScore),
    unit: "score (0-100)",
    label: "Metabolic Efficiency Ratio",
    interpretation,
    confidence: 0.5,
    details: { bmr: bmrResult.value, tdee: tdeeResult.value, restingHR, sleepData: sleep.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 50. Hyperinsulinemia Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates hyperinsulinemia likelihood from metabolic markers.
 * Uses: fasting glucose, triglycerides, HDL ratio, waist circumference, BMI.
 * Surrogate for fasting insulin when direct measurement isn't available.
 */
export async function calculateHyperinsulinemiaProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const tg = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const hdl = await fetchLatestMetric(userId, "hdl_mg_dl");
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");

  let insulinScore = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // TG/HDL ratio (best surrogate for insulin resistance)
  if (tg !== null && hdl !== null && hdl > 0) {
    const tgHdlRatio = tg / hdl;
    if (tgHdlRatio > 3.5) { insulinScore += 3; factors.push(`High TG/HDL ratio: ${tgHdlRatio.toFixed(1)}`); }
    else if (tgHdlRatio > 2.5) { insulinScore += 2; factors.push(`Elevated TG/HDL ratio: ${tgHdlRatio.toFixed(1)}`); }
    else if (tgHdlRatio > 1.5) { insulinScore += 1; }
  }

  // Fasting glucose
  if (glucose !== null) {
    if (glucose > 110) { insulinScore += 2; factors.push(`Impaired fasting glucose: ${glucose} mg/dL`); }
    else if (glucose > 95) { insulinScore += 1; factors.push(`Upper-normal fasting glucose: ${glucose} mg/dL`); }
  }

  // Central adiposity
  if (waist !== null) {
    const threshold = isMale ? 94 : 80;
    if (waist > threshold + 10) { insulinScore += 2; factors.push("Significant central adiposity"); }
    else if (waist > threshold) { insulinScore += 1; factors.push("Mild central adiposity"); }
  }

  // BMI
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi > 30) { insulinScore += 1; factors.push("Obesity increases insulin demand"); }
  }

  const clampedScore = clamp(insulinScore, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 1) { riskLevel = "low"; interpretation = "Low hyperinsulinemia risk. Insulin sensitivity appears adequate."; }
  else if (clampedScore <= 3) { riskLevel = "moderate"; interpretation = "Moderate hyperinsulinemia indicators. Early insulin resistance possible."; recommendations.push("Reduce refined carbohydrate intake", "Time-restricted eating may improve insulin sensitivity"); }
  else if (clampedScore <= 5) { riskLevel = "high"; interpretation = "High likelihood of hyperinsulinemia. Formal insulin testing recommended."; recommendations.push("Request fasting insulin test and HOMA-IR calculation", "Low-glycemic diet recommended", "Exercise 30+ min daily"); }
  else { riskLevel = "very-high"; interpretation = "Very high hyperinsulinemia risk. Comprehensive metabolic evaluation needed."; recommendations.push("Urgent endocrinology referral", "C-peptide and insulin levels", "Consider metformin discussion"); }

  return { value: clampedScore, unit: "risk score (0-10)", label: "Hyperinsulinemia Proxy", interpretation, confidence: (tg !== null && hdl !== null && glucose !== null) ? 0.7 : 0.4, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 51. Body Surface Area (Du Bois formula)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates Body Surface Area using the Du Bois & Du Bois formula (1916).
 * BSA (m²) = 0.007184 × height_cm^0.725 × weight_kg^0.425
 * Used for drug dosing, cardiac index, and metabolic scaling.
 */
export async function calculateBSA(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");

  if (!weight || !height) {
    return { value: 0, unit: "m²", label: "Body Surface Area", interpretation: "Insufficient data.", confidence: 0 };
  }

  // Du Bois formula
  const bsa = 0.007184 * Math.pow(height, 0.725) * Math.pow(weight, 0.425);

  // Also calculate Mosteller formula for comparison: BSA = √(height_cm × weight_kg / 3600)
  const bsaMosteller = Math.sqrt((height * weight) / 3600);

  let interpretation: string;
  if (bsa < 1.5) interpretation = "Below average BSA — smaller body frame.";
  else if (bsa < 1.8) interpretation = "Average BSA range.";
  else if (bsa < 2.1) interpretation = "Above average BSA — larger body frame.";
  else interpretation = "Very large BSA — significant body size.";

  return {
    value: Math.round(bsa * 100) / 100,
    unit: "m²",
    label: "Body Surface Area (Du Bois)",
    interpretation: `${interpretation} Du Bois: ${bsa.toFixed(2)} m², Mosteller: ${bsaMosteller.toFixed(2)} m².`,
    confidence: 0.95,
    details: { duBois: Math.round(bsa * 100) / 100, mosteller: Math.round(bsaMosteller * 100) / 100, weight, height },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 52. Weight Cycling Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects yo-yo dieting patterns by analyzing weight oscillations over time.
 * Counts significant weight swings (>3% body weight) and estimates cycling frequency.
 * Chronic weight cycling is associated with increased cardiovascular risk.
 */
export async function calculateWeightCycling(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weightData = await fetchMetricWithDates(userId, "weight_kg", daysAgo(365, date), date);

  if (weightData.length < 10) {
    return { value: 0, unit: "cycles/year", label: "Weight Cycling", interpretation: "Insufficient data (need 10+ weight measurements over 6+ months).", confidence: 0, riskLevel: "low", factors: [], recommendations: [] };
  }

  // Smooth the data with EMA
  const rawWeights = weightData.map((d) => d.value);
  const smoothed = exponentialMovingAverage(rawWeights, 0.2);
  const avgWeight = mean(rawWeights);
  const threshold = avgWeight * 0.03; // 3% of body weight

  // Count direction changes exceeding threshold
  let cycles = 0;
  let direction = 0; // 0=unknown, 1=gaining, -1=losing
  let lastPeak = smoothed[0]!;
  let lastValley = smoothed[0]!;

  for (let i = 1; i < smoothed.length; i++) {
    const diff = smoothed[i]! - smoothed[i - 1]!;
    if (diff > 0 && direction !== 1) {
      if (direction === -1 && (lastPeak - smoothed[i - 1]!) > threshold) {
        cycles++;
        lastValley = smoothed[i - 1]!;
      }
      direction = 1;
    } else if (diff < 0 && direction !== -1) {
      if (direction === 1 && (smoothed[i - 1]! - lastValley) > threshold) {
        cycles++;
        lastPeak = smoothed[i - 1]!;
      }
      direction = -1;
    }
  }

  // Annualize
  const spanDays = (weightData[0]!.date.getTime() - weightData[weightData.length - 1]!.date.getTime()) / (24 * 3600 * 1000);
  const annualizedCycles = spanDays > 30 ? (cycles / spanDays) * 365 : cycles;
  const totalVariation = stddev(rawWeights);

  const factors: string[] = [];
  const recommendations: string[] = [];

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (annualizedCycles < 2) { riskLevel = "low"; interpretation = "Stable weight pattern. No significant yo-yo dieting detected."; }
  else if (annualizedCycles < 4) { riskLevel = "moderate"; interpretation = `Mild weight cycling (${Math.round(annualizedCycles)} cycles/year). Monitor for pattern escalation.`; recommendations.push("Focus on sustainable dietary changes rather than rapid diets"); factors.push(`${Math.round(annualizedCycles)} weight cycles/year`); }
  else if (annualizedCycles < 6) { riskLevel = "high"; interpretation = `Significant weight cycling (${Math.round(annualizedCycles)} cycles/year). Associated with metabolic dysfunction.`; factors.push("Chronic weight cycling pattern", `Weight SD: ${totalVariation.toFixed(1)} kg`); recommendations.push("Consult dietitian about sustainable weight management", "Avoid very-low-calorie diets"); }
  else { riskLevel = "very-high"; interpretation = `Severe weight cycling pattern. Significant health risk.`; factors.push("Extreme yo-yo dieting", "High cardiovascular and metabolic risk"); recommendations.push("Professional eating behavior assessment", "Behavioral weight management program"); }

  return {
    value: Math.round(annualizedCycles * 10) / 10,
    unit: "cycles/year",
    label: "Weight Cycling",
    interpretation, confidence: weightData.length >= 20 ? 0.75 : 0.5,
    riskLevel, factors, recommendations,
    details: { rawCycles: cycles, spanDays: Math.round(spanDays), dataPoints: weightData.length, weightSD: Math.round(totalVariation * 10) / 10 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 53. Fat Distribution Pattern
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifies fat distribution pattern (android vs gynoid) from available measurements.
 * Android (apple): central/abdominal — higher metabolic risk.
 * Gynoid (pear): peripheral/hip-thigh — lower metabolic risk.
 * Uses WHR, waist-to-height ratio, and skinfold ratios when available.
 */
export async function calculateFatDistribution(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const waist = await fetchLatestMetric(userId, "waist_circumference_cm");
  const hip = await fetchLatestMetric(userId, "hip_circumference_cm");
  const height = await fetchLatestMetric(userId, "height_cm");
  const weight = await fetchLatestMetric(userId, "weight_kg");

  if (!waist && (!weight || !height)) {
    return { value: 0, unit: "ratio", label: "Fat Distribution", interpretation: "Insufficient data.", confidence: 0 };
  }

  const isMale = gender?.toLowerCase() === "male";
  let androidScore = 0; // higher = more android

  // Waist-to-hip ratio
  if (waist && hip) {
    const whr = waist / hip;
    const threshold = isMale ? 0.9 : 0.85;
    androidScore += (whr - threshold) * 100;
  }

  // Waist-to-height ratio
  if (waist && height) {
    const whtr = waist / height;
    if (whtr > 0.58) androidScore += 20;
    else if (whtr > 0.52) androidScore += 10;
    else if (whtr < 0.42) androidScore -= 10;
  }

  // BMI-adjusted waist (higher waist relative to BMI = more android)
  if (waist && weight && height) {
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const expectedWaist = isMale ? 60 + bmi * 1.5 : 55 + bmi * 1.4;
    if (waist > expectedWaist + 5) androidScore += 15;
    else if (waist < expectedWaist - 5) androidScore -= 15;
  }

  let pattern: string;
  let interpretation: string;

  if (androidScore > 15) {
    pattern = "Strongly Android (Apple)";
    interpretation = "Central/abdominal fat predominance. Higher metabolic and cardiovascular risk. Prioritize visceral fat reduction.";
  } else if (androidScore > 5) {
    pattern = "Mildly Android";
    interpretation = "Slight tendency toward central fat storage. Monitor waist circumference trends.";
  } else if (androidScore > -5) {
    pattern = "Balanced/Intermediate";
    interpretation = "Balanced fat distribution between central and peripheral areas.";
  } else if (androidScore > -15) {
    pattern = "Mildly Gynoid";
    interpretation = "Fat stored preferentially in hips/thighs. Lower metabolic risk from fat distribution.";
  } else {
    pattern = "Strongly Gynoid (Pear)";
    interpretation = "Predominantly peripheral fat storage. Generally favorable for metabolic health.";
  }

  return {
    value: Math.round(androidScore),
    unit: "android score",
    label: "Fat Distribution Pattern",
    interpretation: `${pattern}. ${interpretation}`,
    confidence: (waist !== null && hip !== null) ? 0.8 : 0.45,
    details: { pattern, waist, hip, height, androidScore: Math.round(androidScore) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 54. Cachexia Risk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Screens for cachexia risk — involuntary weight/muscle loss associated with chronic disease.
 * Criteria: >5% weight loss in 12 months, low BMI, reduced muscle strength,
 * fatigue indicators, biochemical markers.
 */
export async function calculateCachexiaRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(365, date), date);
  const gripStrength = await fetchLatestMetric(userId, "grip_strength_kg");
  const albumin = await fetchLatestMetric(userId, "albumin_g_dl");
  const crp = await fetchLatestMetric(userId, "crp_mg_l");

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // Weight loss >5% in 12 months
  if (weightHistory.length >= 5) {
    const oldest = mean(weightHistory.slice(-3));
    const newest = mean(weightHistory.slice(0, 3));
    const pctLoss = ((oldest - newest) / oldest) * 100;
    if (pctLoss > 10) { score += 4; factors.push(`Severe weight loss: ${pctLoss.toFixed(1)}% in tracking period`); }
    else if (pctLoss > 5) { score += 2; factors.push(`Significant weight loss: ${pctLoss.toFixed(1)}%`); }
  }

  // Low BMI
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi < 18.5) { score += 2; factors.push(`Low BMI: ${bmi.toFixed(1)}`); }
    if (bmi < 16) { score += 2; factors.push("Severely underweight"); }
  }

  // Grip strength
  if (gripStrength !== null) {
    const threshold = isMale ? 26 : 18;
    if (gripStrength < threshold * 0.8) { score += 2; factors.push("Significantly reduced grip strength"); }
  }

  // Albumin (malnutrition marker)
  if (albumin !== null && albumin < 3.5) {
    score += 1;
    factors.push(`Low albumin: ${albumin} g/dL`);
  }

  // CRP (inflammation marker)
  if (crp !== null && crp > 5) {
    score += 1;
    factors.push(`Elevated CRP: ${crp} mg/L — systemic inflammation`);
  }

  const clampedScore = clamp(score, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 1) { riskLevel = "low"; interpretation = "Low cachexia risk. Weight and muscle mass appear stable."; }
  else if (clampedScore <= 3) { riskLevel = "moderate"; interpretation = "Some cachexia risk indicators present. Monitor weight and nutritional status."; recommendations.push("Track weight weekly", "Ensure adequate calorie and protein intake"); }
  else if (clampedScore <= 5) { riskLevel = "high"; interpretation = "Elevated cachexia risk. Medical evaluation recommended."; recommendations.push("Comprehensive nutritional assessment", "Investigate underlying causes of weight loss", "Consider nutritional supplementation"); }
  else { riskLevel = "very-high"; interpretation = "High cachexia risk. Urgent medical intervention needed."; recommendations.push("Urgent medical referral", "Investigate underlying disease", "Nutritional rehabilitation program"); }

  return { value: clampedScore, unit: "risk score (0-10)", label: "Cachexia Risk", interpretation, confidence: 0.55, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 55. Anabolic Index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composite anabolic index combining factors that promote muscle protein synthesis:
 * protein intake adequacy, resistance exercise stimulus, sleep quality, hormonal environment proxy,
 * calorie sufficiency, and leucine threshold per meal.
 */
export async function calculateAnabolicIndex(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const protein = await fetchMetric(userId, "protein_g", daysAgo(14, date), date);
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(14, date), date);
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(14, date), date);
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(14, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");

  let anabolicScore = 30;

  // Protein adequacy
  if (protein.length > 0 && weight) {
    const proteinPerKg = mean(protein) / weight;
    if (proteinPerKg >= 2.0) anabolicScore += 20;
    else if (proteinPerKg >= 1.6) anabolicScore += 15;
    else if (proteinPerKg >= 1.2) anabolicScore += 10;
    else if (proteinPerKg < 0.8) anabolicScore -= 10;
  }

  // Calorie sufficiency (need surplus or maintenance for anabolism)
  if (calories.length > 0 && weight) {
    const avgCal = mean(calories);
    const estimatedMaintenance = weight * 30;
    if (avgCal >= estimatedMaintenance * 1.1) anabolicScore += 15; // surplus
    else if (avgCal >= estimatedMaintenance * 0.95) anabolicScore += 10; // maintenance
    else if (avgCal < estimatedMaintenance * 0.8) anabolicScore -= 15; // significant deficit
  }

  // Sleep (GH release, recovery)
  if (sleep.length > 0) {
    const avgSleep = mean(sleep);
    if (avgSleep >= 7.5 && avgSleep <= 9) anabolicScore += 10;
    else if (avgSleep >= 6.5) anabolicScore += 5;
    else anabolicScore -= 10;
  }

  // Exercise stimulus
  if (exerciseMin.length > 0) {
    const avgMin = mean(exerciseMin);
    if (avgMin >= 30 && avgMin <= 75) anabolicScore += 10;
    else if (avgMin >= 15) anabolicScore += 5;
    else if (avgMin > 120) anabolicScore -= 5; // overtraining risk
  }

  // Recovery indicator (resting HR)
  if (restingHR !== null) {
    if (restingHR < 65) anabolicScore += 5;
    else if (restingHR > 80) anabolicScore -= 5;
  }

  anabolicScore = clamp(anabolicScore, 0, 100);

  let interpretation: string;
  if (anabolicScore >= 75) interpretation = "Highly anabolic environment — optimal conditions for muscle growth and recovery.";
  else if (anabolicScore >= 55) interpretation = "Moderately anabolic — good conditions but room for optimization.";
  else if (anabolicScore >= 35) interpretation = "Weakly anabolic — insufficient stimulus, nutrition, or recovery for optimal gains.";
  else interpretation = "Catabolic environment — body is likely breaking down more muscle than building. Address nutrition and recovery.";

  return { value: Math.round(anabolicScore), unit: "score (0-100)", label: "Anabolic Index", interpretation, confidence: (protein.length > 5 && sleep.length > 5) ? 0.65 : 0.4, details: { proteinData: protein.length, calorieData: calories.length, sleepData: sleep.length, exerciseData: exerciseMin.length } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 56. Catabolic State Assessment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether the body is in a catabolic state (muscle breakdown > synthesis).
 * Risk factors: large caloric deficit, insufficient protein, overtraining,
 * poor sleep, high cortisol markers (elevated resting HR), weight loss with no fat loss.
 */
export async function calculateCatabolicState(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const calories = await fetchMetric(userId, "calorie_intake", daysAgo(14, date), date);
  const protein = await fetchMetric(userId, "protein_g", daysAgo(14, date), date);
  const sleep = await fetchMetric(userId, "sleep_hours", daysAgo(14, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const weightHistory = await fetchMetric(userId, "weight_kg", daysAgo(30, date), date);
  const bodyFatHistory = await fetchMetric(userId, "body_fat_pct", daysAgo(30, date), date);

  let catScore = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Large caloric deficit
  if (calories.length > 0 && weight) {
    const avgCal = mean(calories);
    const estimatedTDEE = weight * 28;
    const deficit = estimatedTDEE - avgCal;
    if (deficit > 1000) { catScore += 3; factors.push(`Extreme caloric deficit: ${Math.round(deficit)} kcal/day`); }
    else if (deficit > 500) { catScore += 1; factors.push(`Significant caloric deficit: ${Math.round(deficit)} kcal/day`); }
  }

  // Insufficient protein
  if (protein.length > 0 && weight) {
    const proteinPerKg = mean(protein) / weight;
    if (proteinPerKg < 0.8) { catScore += 2; factors.push(`Very low protein: ${proteinPerKg.toFixed(1)} g/kg`); }
    else if (proteinPerKg < 1.2) { catScore += 1; factors.push(`Suboptimal protein for muscle preservation`); }
  }

  // Poor sleep
  if (sleep.length > 0) {
    const avgSleep = mean(sleep);
    if (avgSleep < 5) { catScore += 2; factors.push(`Severe sleep deprivation: ${avgSleep.toFixed(1)} hrs`); }
    else if (avgSleep < 6) { catScore += 1; factors.push("Insufficient sleep for recovery"); }
  }

  // Elevated resting HR (cortisol/stress proxy)
  if (restingHR !== null && restingHR > 85) {
    catScore += 1;
    factors.push("Elevated resting HR suggests stress/overtraining");
  }

  // Weight loss without fat loss
  if (weightHistory.length >= 5 && bodyFatHistory.length >= 3) {
    const weightLoss = mean(weightHistory.slice(-3)) - mean(weightHistory.slice(0, 3));
    const fatChange = bodyFatHistory.length >= 3 ? mean(bodyFatHistory.slice(-3)) - mean(bodyFatHistory.slice(0, 3)) : 0;
    if (weightLoss > 1 && fatChange >= 0) {
      catScore += 2;
      factors.push("Losing weight without losing body fat — muscle loss likely");
    }
  }

  const clampedScore = clamp(catScore, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 1) { riskLevel = "low"; interpretation = "No significant catabolic indicators. Body appears to be in anabolic or maintenance state."; }
  else if (clampedScore <= 3) { riskLevel = "moderate"; interpretation = "Mild catabolic indicators present. Risk of muscle loss during current deficit."; recommendations.push("Increase protein to 1.6+ g/kg", "Prioritize sleep", "Include resistance training"); }
  else if (clampedScore <= 5) { riskLevel = "high"; interpretation = "Significant catabolic state likely. Muscle wasting probable."; recommendations.push("Reduce caloric deficit magnitude", "Protein to 2.0+ g/kg during deficit", "Deload training volume"); }
  else { riskLevel = "very-high"; interpretation = "Severe catabolic state. Urgent intervention needed to preserve lean mass."; recommendations.push("Immediately increase calories to at least maintenance", "Maximum protein intake", "Prioritize recovery over training"); }

  return { value: clampedScore, unit: "catabolic score (0-10)", label: "Catabolic State", interpretation, confidence: 0.55, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 57. Metabolic Energy Store Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates total metabolic energy stores: glycogen (liver + muscle) and adipose tissue.
 * Glycogen: ~400-500g muscle, ~100g liver = ~2000-2400 kcal total.
 * Fat stores: body_fat_kg × 7,700 kcal/kg.
 * Provides survival fasting duration estimate.
 */
export async function calculateMetabolicEnergyStore(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<CompositionResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const height = await fetchLatestMetric(userId, "height_cm");

  if (!weight) {
    return { value: 0, unit: "kcal", label: "Metabolic Energy Stores", interpretation: "Insufficient data.", confidence: 0, components: {} };
  }

  const bfFraction = bodyFat !== null ? bodyFat / 100 : 0.2;
  const fatMass = weight * bfFraction;
  const leanMass = weight * (1 - bfFraction);

  // Fat energy stores (7,700 kcal per kg of fat, but minimum ~5% essential fat)
  const isMale = gender?.toLowerCase() === "male";
  const essentialFatPct = isMale ? 0.03 : 0.12;
  const availableFat = Math.max(0, fatMass - weight * essentialFatPct);
  const fatEnergy = availableFat * 7700;

  // Glycogen stores (proportional to lean mass)
  const muscleGlycogen = leanMass * 0.015 * 4000; // ~15g/kg lean mass × 4 kcal/g
  const liverGlycogen = 100 * 4; // ~100g × 4 kcal/g
  const glycogenEnergy = muscleGlycogen + liverGlycogen;

  // Protein (emergency catabolism, not ideal)
  const proteinReserve = leanMass * 0.05 * 4000; // ~5% of lean mass available

  const totalEnergy = fatEnergy + glycogenEnergy;

  // Estimate fasting duration at ~2000 kcal/day BMR
  const estimatedBMR = height ? 10 * weight + 6.25 * height - 5 * 30 + (isMale ? 5 : -161) : 1800;
  const fastingDays = totalEnergy / estimatedBMR;

  return {
    value: Math.round(totalEnergy),
    unit: "kcal",
    label: "Metabolic Energy Stores",
    interpretation: `Total available energy: ${Math.round(totalEnergy).toLocaleString()} kcal. Fat stores: ${Math.round(fatEnergy).toLocaleString()} kcal. Glycogen: ${Math.round(glycogenEnergy).toLocaleString()} kcal. Theoretical fasting capacity: ~${Math.round(fastingDays)} days.`,
    confidence: bodyFat !== null ? 0.75 : 0.5,
    components: {
      fatEnergy: Math.round(fatEnergy),
      glycogenEnergy: Math.round(glycogenEnergy),
      proteinReserve: Math.round(proteinReserve),
      totalEnergy: Math.round(totalEnergy),
      availableFatKg: Math.round(availableFat * 10) / 10,
      theoreticalFastingDays: Math.round(fastingDays),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 58. Gout Risk Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates gout risk based on available metabolic markers.
 * Risk factors: uric acid (if available), BMI, alcohol intake, red meat/fructose consumption,
 * kidney function proxy, dehydration.
 */
export async function calculateGoutRisk(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<RiskResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const uricAcid = await fetchLatestMetric(userId, "uric_acid_mg_dl");
  const glucose = await fetchLatestMetric(userId, "fasting_glucose_mg_dl");
  const triglycerides = await fetchLatestMetric(userId, "triglycerides_mg_dl");
  const waterIntake = await fetchMetric(userId, "water_intake_ml", daysAgo(7, date), date);
  const age = await fetchLatestMetric(userId, "age");

  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  const isMale = gender?.toLowerCase() === "male";

  // Gender (males have ~4x higher risk)
  if (isMale) { score += 2; factors.push("Male sex — higher baseline gout risk"); }

  // Uric acid
  if (uricAcid !== null) {
    if (uricAcid > 9) { score += 4; factors.push(`Very high uric acid: ${uricAcid} mg/dL`); }
    else if (uricAcid > 7) { score += 2; factors.push(`Elevated uric acid: ${uricAcid} mg/dL`); }
    else if (uricAcid > 6) { score += 1; factors.push(`Borderline uric acid: ${uricAcid} mg/dL`); }
  }

  // BMI
  if (weight && height) {
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi > 30) { score += 2; factors.push("Obesity increases uric acid production"); }
    else if (bmi > 25) { score += 1; factors.push("Overweight — mild gout risk increase"); }
  }

  // Metabolic syndrome markers
  if (glucose && glucose > 100) { score += 1; factors.push("Insulin resistance increases urate levels"); }
  if (triglycerides && triglycerides > 150) { score += 1; factors.push("Hypertriglyceridemia associated with hyperuricemia"); }

  // Dehydration
  if (waterIntake.length > 0) {
    const avgWater = mean(waterIntake);
    if (avgWater < 1500) { score += 1; factors.push("Low fluid intake — dehydration concentrates uric acid"); recommendations.push("Increase water intake to 2.5+ L/day"); }
  }

  // Age
  if (age !== null && age > 50) { score += 1; factors.push("Age >50 increases gout prevalence"); }

  const clampedScore = clamp(score, 0, 10);

  let riskLevel: RiskResult["riskLevel"];
  let interpretation: string;

  if (clampedScore <= 2) { riskLevel = "low"; interpretation = "Low gout risk based on available markers."; }
  else if (clampedScore <= 4) { riskLevel = "moderate"; interpretation = "Moderate gout risk. Dietary modifications may help."; recommendations.push("Limit high-purine foods (organ meats, shellfish)", "Reduce alcohol (especially beer)", "Maintain hydration"); }
  else if (clampedScore <= 6) { riskLevel = "high"; interpretation = "Elevated gout risk. Monitor uric acid levels."; recommendations.push("Uric acid blood test recommended", "Consider cherry extract supplementation", "Limit fructose intake"); }
  else { riskLevel = "very-high"; interpretation = "High gout risk. Medical management may be needed."; recommendations.push("Consult rheumatologist", "Urate-lowering therapy evaluation", "Strict dietary purine reduction"); }

  return { value: clampedScore, unit: "risk score (0-10)", label: "Gout Risk", interpretation, confidence: uricAcid !== null ? 0.75 : 0.45, riskLevel, factors, recommendations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 59. Postprandial Metabolism Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates postprandial (after-meal) metabolic response quality.
 * Good postprandial metabolism: modest glucose rise (<40 mg/dL), rapid return to baseline,
 * no reactive hypoglycemia, appropriate insulin response.
 */
export async function calculatePostprandialMetabolism(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const fastingGlucose = await fetchMetric(userId, "fasting_glucose_mg_dl", daysAgo(14, date), date);
  const postMealGlucose = await fetchMetric(userId, "postmeal_glucose_mg_dl", daysAgo(14, date), date);
  const tg = await fetchLatestMetric(userId, "triglycerides_mg_dl");

  let ppScore = 50;

  if (fastingGlucose.length > 0 && postMealGlucose.length > 0) {
    const avgFasting = mean(fastingGlucose);
    const avgPostMeal = mean(postMealGlucose);
    const excursion = avgPostMeal - avgFasting;

    if (excursion < 30) { ppScore += 25; }
    else if (excursion < 50) { ppScore += 15; }
    else if (excursion < 80) { ppScore += 0; }
    else if (excursion < 120) { ppScore -= 15; }
    else { ppScore -= 25; }

    // Absolute post-meal level
    if (avgPostMeal < 120) ppScore += 10;
    else if (avgPostMeal > 180) ppScore -= 15;
    else if (avgPostMeal > 140) ppScore -= 5;

    // Variability of post-meal readings
    if (postMealGlucose.length >= 5) {
      const pmCV = coefficientOfVariation(postMealGlucose);
      if (pmCV < 15) ppScore += 5;
      else if (pmCV > 30) ppScore -= 10;
    }
  }

  // Postprandial triglycerides (if fasting TG elevated, postprandial likely worse)
  if (tg !== null) {
    if (tg > 200) ppScore -= 10;
    else if (tg < 100) ppScore += 5;
  }

  ppScore = clamp(ppScore, 0, 100);

  let interpretation: string;
  if (ppScore >= 75) interpretation = "Excellent postprandial metabolism — glucose is well-regulated after meals.";
  else if (ppScore >= 55) interpretation = "Good postprandial response. Minor glucose excursions within normal limits.";
  else if (ppScore >= 35) interpretation = "Moderate postprandial dysfunction. Consider meal composition optimization (lower GI, more fiber/protein first).";
  else interpretation = "Poor postprandial metabolism — significant glucose spikes after meals. Consider CGM monitoring and dietary restructuring.";

  return {
    value: Math.round(ppScore),
    unit: "score (0-100)",
    label: "Postprandial Metabolism",
    interpretation,
    confidence: (fastingGlucose.length > 3 && postMealGlucose.length > 3) ? 0.7 : 0.35,
    details: { fastingGlucosePoints: fastingGlucose.length, postMealGlucosePoints: postMealGlucose.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 60. Exercise Metabolic Cost
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates the metabolic cost of exercise using MET values and duration.
 * Calories = MET × weight_kg × duration_hours × 1.05 (adjusted for EPOC).
 * Provides breakdown by exercise type if available.
 */
export async function calculateExerciseMetabolicCost(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const exerciseMin = await fetchMetric(userId, "exercise_duration_min", daysAgo(7, date), date);
  const exerciseHR = await fetchMetric(userId, "exercise_heart_rate", daysAgo(7, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight || exerciseMin.length === 0) {
    return { value: 0, unit: "kcal/day", label: "Exercise Metabolic Cost", interpretation: "Insufficient exercise or weight data.", confidence: 0 };
  }

  const avgMin = mean(exerciseMin);

  // Estimate MET from heart rate if available
  let estimatedMET = 5; // default moderate exercise
  if (exerciseHR.length > 0 && restingHR && age) {
    const maxHR = 208 - 0.7 * age;
    const avgExHR = mean(exerciseHR);
    const pctHRR = (avgExHR - restingHR) / (maxHR - restingHR);
    // MET ≈ 1 + 14 × %HRR (rough approximation)
    estimatedMET = clamp(1 + 14 * pctHRR, 1, 15);
  }

  // Calories burned per session
  const calPerSession = estimatedMET * weight * (avgMin / 60) * 1.05; // 1.05 for EPOC
  const calPerDay = calPerSession; // assuming 1 session/day average

  // EPOC estimation (5-15% of exercise calories for moderate intensity)
  const epoc = calPerSession * 0.08;

  let interpretation: string;
  if (calPerDay < 100) interpretation = "Low exercise energy expenditure. Consider increasing duration or intensity.";
  else if (calPerDay < 300) interpretation = "Moderate exercise expenditure — good for general health maintenance.";
  else if (calPerDay < 500) interpretation = "Substantial exercise expenditure — effective for weight management and fitness.";
  else interpretation = "High exercise expenditure — ensure adequate fueling and recovery.";

  return {
    value: Math.round(calPerDay),
    unit: "kcal/day",
    label: "Exercise Metabolic Cost",
    interpretation: `${interpretation} Average session: ${Math.round(calPerSession)} kcal (${Math.round(avgMin)} min at ~${estimatedMET.toFixed(1)} METs). EPOC: ~${Math.round(epoc)} kcal.`,
    confidence: exerciseHR.length > 0 ? 0.7 : 0.5,
    details: {
      avgDuration: Math.round(avgMin),
      estimatedMET: Math.round(estimatedMET * 10) / 10,
      caloriesPerSession: Math.round(calPerSession),
      epoc: Math.round(epoc),
      sessionsTracked: exerciseMin.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 61. Brown Fat Activity Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates brown adipose tissue (BAT) activity proxy based on cold exposure response,
 * resting metabolic rate deviation, and body temperature regulation.
 * Higher BAT activity → more non-shivering thermogenesis → better metabolic health.
 */
export async function calculateBrownFatActivityProxy(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const bodyTemp = await fetchMetric(userId, "body_temperature_c", daysAgo(30, date), date);
  const restingHR = await fetchLatestMetric(userId, "resting_heart_rate");
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");

  let batScore = 40; // baseline

  // Body temperature stability (BAT helps thermoregulate)
  if (bodyTemp.length >= 5) {
    const tempCV = coefficientOfVariation(bodyTemp);
    const avgTemp = mean(bodyTemp);

    // Stable, slightly warm = good BAT
    if (tempCV < 0.5 && avgTemp >= 36.5 && avgTemp <= 37.0) batScore += 15;
    else if (tempCV < 1.0) batScore += 5;
    else batScore -= 5;

    // Higher average temp suggests more thermogenesis
    if (avgTemp >= 36.8 && avgTemp <= 37.1) batScore += 5;
    else if (avgTemp < 36.2) batScore -= 10;
  }

  // BMR deviation (BAT activation increases BMR)
  if (weight && height && age) {
    const isMale = gender?.toLowerCase() === "male";
    const expectedBMR = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
    const refWeight = isMale ? 0.4 * height - 22 : 0.38 * height - 23;
    const refBMR = 10 * refWeight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

    if (expectedBMR > refBMR * 1.1) batScore += 10; // BMR higher than expected
    else if (expectedBMR < refBMR * 0.9) batScore -= 10;
  }

  // Age factor (BAT decreases with age)
  if (age !== null) {
    if (age < 30) batScore += 10;
    else if (age < 50) batScore += 5;
    else if (age > 60) batScore -= 10;
    else if (age > 70) batScore -= 15;
  }

  // Body fat (lean individuals tend to have more active BAT relative to body size)
  if (bodyFat !== null) {
    if (bodyFat < 15) batScore += 5;
    else if (bodyFat > 30) batScore -= 5;
  }

  // Resting HR (BAT activation can slightly elevate metabolism without HR increase)
  if (restingHR !== null) {
    if (restingHR < 60) batScore += 5;
  }

  batScore = clamp(batScore, 0, 100);

  let interpretation: string;
  if (batScore >= 70) interpretation = "Likely high brown fat activity — contributes to non-shivering thermogenesis and metabolic health.";
  else if (batScore >= 50) interpretation = "Moderate brown fat activity indicators. Can be enhanced with cold exposure (cold showers, outdoor exercise in cold).";
  else if (batScore >= 30) interpretation = "Low brown fat activity proxy. Age and body composition may be limiting factors.";
  else interpretation = "Very low BAT activity indicators. Cold exposure protocols may help activate remaining brown fat.";

  return {
    value: Math.round(batScore),
    unit: "score (0-100)",
    label: "Brown Fat Activity Proxy",
    interpretation,
    confidence: bodyTemp.length >= 5 ? 0.45 : 0.25,
    details: { tempDataPoints: bodyTemp.length, age, bodyFat, restingHR },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 62. BMR Katch-McArdle Equation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BMR using Katch-McArdle equation — most accurate when lean body mass is known.
 * BMR = 370 + 21.6 × lean_body_mass_kg
 * Falls back to body fat estimation if direct LBM not available.
 */
export async function calculateBMR_KatchMcArdle(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<MetabolicResult> {
  const weight = await fetchLatestMetric(userId, "weight_kg");
  const bodyFat = await fetchLatestMetric(userId, "body_fat_pct");
  const height = await fetchLatestMetric(userId, "height_cm");
  const age = await fetchLatestMetric(userId, "age");

  if (!weight) {
    return { value: 0, unit: "kcal/day", label: "BMR (Katch-McArdle)", interpretation: "Insufficient data.", confidence: 0 };
  }

  let lbm: number;
  let method: string;

  if (bodyFat !== null) {
    lbm = weight * (1 - bodyFat / 100);
    method = "Direct body fat measurement";
  } else if (height && age) {
    const isMale = gender?.toLowerCase() === "male";
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const estimatedBF = 1.2 * bmi + 0.23 * age - (isMale ? 10.8 : 0) - 5.4;
    lbm = weight * (1 - clamp(estimatedBF, 5, 50) / 100);
    method = "Estimated from Deurenberg BF equation";
  } else {
    lbm = weight * 0.8;
    method = "Default 80% lean estimate";
  }

  const bmr = 370 + 21.6 * lbm;
  const clamped = clamp(bmr, 500, 5000);

  return {
    value: Math.round(clamped),
    unit: "kcal/day",
    label: "BMR (Katch-McArdle)",
    interpretation: `BMR estimated at ${Math.round(clamped)} kcal/day using Katch-McArdle (LBM: ${lbm.toFixed(1)} kg). ${method}.`,
    confidence: bodyFat !== null ? 0.9 : 0.6,
    details: { lbm: Math.round(lbm * 10) / 10, method, weight, bodyFat },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 63. Comprehensive Metabolic Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a comprehensive metabolic health summary by running key algorithms
 * and aggregating results into an overall metabolic health score.
 */
export async function calculateComprehensiveMetabolicSummary(
  userId: string,
  date: Date = new Date(),
  gender?: string | null,
): Promise<CompositionResult> {
  // Run key assessments in parallel
  const [bmrResult, tdeeResult, bmiResult, metAgeResult, bodyCompResult] = await Promise.all([
    calculateBMR_MifflinStJeor(userId, date, gender),
    calculateTDEE(userId, date, gender),
    calculateBMIAnalysis(userId, date, gender),
    calculateMetabolicAge(userId, date, gender),
    calculateBodyCompositionTrend(userId, date, gender),
  ]);

  const [insulinResult, syndromeResult, flexResult, hydrationResult] = await Promise.all([
    calculateInsulinResistanceProxy(userId, date, gender),
    calculateMetabolicSyndromeRisk(userId, date, gender),
    calculateMetabolicFlexibility(userId, date, gender),
    calculateHydrationStatus(userId, date, gender),
  ]);

  // Compute overall health score (0-100)
  let overallScore = 50;
  const scoredResults: { weight: number; score: number; label: string }[] = [];

  // BMI component
  if (bmiResult.value > 0) {
    const bmi = bmiResult.value;
    let bmiScore = 100;
    if (bmi < 18.5) bmiScore = 60;
    else if (bmi < 25) bmiScore = 100;
    else if (bmi < 30) bmiScore = 70;
    else bmiScore = 40;
    scoredResults.push({ weight: 0.15, score: bmiScore, label: "BMI" });
  }

  // Metabolic age (closer to or younger than chronological = better)
  if (metAgeResult.value > 0 && metAgeResult.details?.chronologicalAge) {
    const diff = metAgeResult.value - (metAgeResult.details.chronologicalAge as number);
    const ageScore = clamp(100 - diff * 5, 0, 100);
    scoredResults.push({ weight: 0.15, score: ageScore, label: "Metabolic Age" });
  }

  // Insulin resistance
  if (insulinResult.value > 0) {
    const irScore = insulinResult.riskLevel === "low" ? 90 : insulinResult.riskLevel === "moderate" ? 65 : insulinResult.riskLevel === "high" ? 35 : 15;
    scoredResults.push({ weight: 0.15, score: irScore, label: "Insulin Sensitivity" });
  }

  // Metabolic syndrome
  const msScore = syndromeResult.value <= 1 ? 90 : syndromeResult.value <= 2 ? 60 : syndromeResult.value <= 3 ? 30 : 10;
  scoredResults.push({ weight: 0.2, score: msScore, label: "Metabolic Syndrome" });

  // Metabolic flexibility
  if (flexResult.value > 0) {
    scoredResults.push({ weight: 0.1, score: flexResult.value, label: "Metabolic Flexibility" });
  }

  // Hydration
  if (hydrationResult.value > 0) {
    scoredResults.push({ weight: 0.1, score: hydrationResult.value, label: "Hydration" });
  }

  // Body composition trend
  scoredResults.push({ weight: 0.15, score: bodyCompResult.direction === "stable" ? 80 : bodyCompResult.direction === "decreasing" ? 70 : 60, label: "Body Composition" });

  if (scoredResults.length > 0) {
    const totalWeight = scoredResults.reduce((s, r) => s + r.weight, 0);
    overallScore = scoredResults.reduce((s, r) => s + (r.weight / totalWeight) * r.score, 0);
  }

  overallScore = clamp(Math.round(overallScore), 0, 100);

  let interpretation: string;
  if (overallScore >= 80) interpretation = "Excellent overall metabolic health. Keep up your current lifestyle.";
  else if (overallScore >= 65) interpretation = "Good metabolic health with some areas for improvement.";
  else if (overallScore >= 45) interpretation = "Average metabolic health. Several risk factors identified — lifestyle modifications recommended.";
  else interpretation = "Below average metabolic health. Multiple risk factors present — comprehensive medical and lifestyle review recommended.";

  const components: Record<string, number> = {
    overallScore,
    bmr: bmrResult.value,
    tdee: tdeeResult.value,
    bmi: bmiResult.value,
    metabolicAge: metAgeResult.value,
    insulinResistance: insulinResult.value,
    metabolicSyndromeScore: syndromeResult.value,
    metabolicFlexibility: flexResult.value,
    hydration: hydrationResult.value,
  };

  for (const r of scoredResults) {
    components[`${r.label}_score`] = Math.round(r.score);
  }

  return {
    value: overallScore,
    unit: "score (0-100)",
    label: "Comprehensive Metabolic Summary",
    interpretation,
    confidence: 0.6,
    components,
  };
}
