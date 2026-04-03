import http from "k6/http"
import { check, group, sleep } from "k6"
import { Rate, Trend } from "k6/metrics"

// ── Custom Metrics ──────────────────────────────────────────────────────────
const errorRate = new Rate("errors")
const healthCheckDuration = new Trend("health_check_duration", true)
const healthDataDuration = new Trend("health_data_query_duration", true)
const eventsDuration = new Trend("events_query_duration", true)

// ── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001"
const API_KEY = __ENV.API_KEY || ""
const USER_ID = __ENV.USER_ID || ""

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
}

// ── Thresholds ──────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Smoke test: verify everything works
    smoke: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
      tags: { scenario: "smoke" },
      exec: "smokeTest",
    },
    // Average load: sustained normal traffic
    average: {
      executor: "constant-vus",
      vus: 10,
      duration: "2m",
      startTime: "35s",
      tags: { scenario: "average" },
      exec: "averageLoad",
    },
    // Stress test: ramp up to find limits
    stress: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "1m", target: 25 },
        { duration: "2m", target: 50 },
        { duration: "1m", target: 25 },
        { duration: "1m", target: 0 },
      ],
      startTime: "3m",
      tags: { scenario: "stress" },
      exec: "stressTest",
    },
    // Spike test: sudden burst
    spike: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 1 },
      ],
      startTime: "8m30s",
      tags: { scenario: "spike" },
      exec: "spikeTest",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    health_check_duration: ["p(95)<200"],
    health_data_query_duration: ["p(95)<800"],
    events_query_duration: ["p(95)<800"],
    errors: ["rate<0.01"],
  },
}

// ── Helper Functions ────────────────────────────────────────────────────────

function checkResponse(res, name) {
  const success = check(res, {
    [`${name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name}: response time < 1s`]: (r) => r.timings.duration < 1000,
  })
  errorRate.add(!success)
  return success
}

// ── Health Check ────────────────────────────────────────────────────────────

function healthCheck() {
  const res = http.get(`${BASE_URL}/health`)
  healthCheckDuration.add(res.timings.duration)
  checkResponse(res, "GET /health")
}

// ── Providers ───────────────────────────────────────────────────────────────

function listProviders() {
  const res = http.get(`${BASE_URL}/v1/providers`, { headers })
  checkResponse(res, "GET /v1/providers")
}

// ── Users ───────────────────────────────────────────────────────────────────

function listUsers() {
  const res = http.get(`${BASE_URL}/v1/users`, { headers })
  checkResponse(res, "GET /v1/users")
}

function getUser() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}`, { headers })
  checkResponse(res, "GET /v1/users/:id")
}

// ── Health Data ─────────────────────────────────────────────────────────────

function queryHealthData() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/health?limit=50`, { headers })
  healthDataDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/health")
}

function queryHealthDataFiltered() {
  if (!USER_ID) return
  const to = new Date().toISOString()
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const res = http.get(
    `${BASE_URL}/v1/users/${USER_ID}/health?metricType=steps&from=${from}&to=${to}&limit=100`,
    { headers },
  )
  healthDataDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/health (filtered)")
}

function healthSummary() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/health/summary`, { headers })
  healthDataDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/health/summary")
}

function healthTimeseries() {
  if (!USER_ID) return
  const to = new Date().toISOString()
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const res = http.get(
    `${BASE_URL}/v1/users/${USER_ID}/health/timeseries?metricType=steps&from=${from}&to=${to}&bucket=day`,
    { headers },
  )
  healthDataDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/health/timeseries")
}

// ── Events ──────────────────────────────────────────────────────────────────

function queryEvents() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/events?limit=20`, { headers })
  eventsDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/events")
}

function queryWorkouts() {
  if (!USER_ID) return
  const to = new Date().toISOString()
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const res = http.get(
    `${BASE_URL}/v1/users/${USER_ID}/events?eventType=workout&from=${from}&to=${to}`,
    { headers },
  )
  eventsDuration.add(res.timings.duration)
  checkResponse(res, "GET /v1/users/:id/events (workouts)")
}

// ── Connections ─────────────────────────────────────────────────────────────

function listConnections() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/connections`, { headers })
  checkResponse(res, "GET /v1/users/:id/connections")
}

// ── Personal Records ────────────────────────────────────────────────────────

function personalRecords() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/personal-records`, { headers })
  checkResponse(res, "GET /v1/users/:id/personal-records")
}

// ── Health Scores ───────────────────────────────────────────────────────────

function healthScores() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/health-scores/latest`, { headers })
  checkResponse(res, "GET /v1/users/:id/health-scores/latest")
}

// ── Readiness ───────────────────────────────────────────────────────────────

function readiness() {
  if (!USER_ID) return
  const res = http.get(`${BASE_URL}/v1/users/${USER_ID}/readiness`, { headers })
  checkResponse(res, "GET /v1/users/:id/readiness")
}

// ── Scenario Implementations ────────────────────────────────────────────────

// Smoke: single VU, hit every endpoint once
export function smokeTest() {
  group("smoke", () => {
    healthCheck()
    listProviders()
    listUsers()
    getUser()
    queryHealthData()
    healthSummary()
    queryEvents()
    listConnections()
    personalRecords()
  })
  sleep(1)
}

// Average: realistic user browsing pattern
export function averageLoad() {
  group("browse", () => {
    healthCheck()
    listProviders()

    // Simulate dashboard load
    getUser()
    healthSummary()
    healthTimeseries()
    queryEvents()
    healthScores()
    readiness()
  })
  sleep(Math.random() * 3 + 1) // 1-4s think time
}

// Stress: heavy read-focused traffic
export function stressTest() {
  group("heavy-reads", () => {
    healthCheck()
    queryHealthData()
    queryHealthDataFiltered()
    healthTimeseries()
    queryEvents()
    queryWorkouts()
    personalRecords()
    healthScores()
  })
  sleep(Math.random() * 2 + 0.5) // 0.5-2.5s think time
}

// Spike: rapid-fire health checks + data queries
export function spikeTest() {
  group("spike", () => {
    healthCheck()
    queryHealthData()
    healthSummary()
  })
  sleep(0.1)
}
