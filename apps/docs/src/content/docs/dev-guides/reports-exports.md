---
title: Reports & Data Exports
description: Generate health reports and export user data in multiple formats including FHIR R4.
---

import { Aside } from '@astrojs/starlight/components';

VitaSync can generate periodic health reports and export user data in multiple formats for compliance, portability, and AI analysis.

## Health Reports

Generate comprehensive health reports covering a user's metrics, trends, and recommendations.

### Generate a Report

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/reports/generate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "weekly",
    "periodStart": "2025-03-10T00:00:00Z",
    "periodEnd": "2025-03-17T00:00:00Z"
  }'
```

### Report Types

| Type | Period | Content |
|------|--------|---------|
| `weekly` | 7 days | Activity summary, sleep trends, notable metrics |
| `monthly` | ~30 days | Full metric breakdown, goal progress, health scores |
| `quarterly` | ~90 days | Trend analysis, correlations, recommendations |
| `annual` | ~365 days | Year-in-review, personal records, long-term trends |

### Report Response

```json
{
  "id": "01HX...",
  "userId": "...",
  "reportType": "weekly",
  "title": "Weekly Health Report — Mar 10–17",
  "status": "completed",
  "periodStart": "2025-03-10T00:00:00.000Z",
  "periodEnd": "2025-03-17T00:00:00.000Z",
  "content": { "...structured report data..." },
  "highlights": ["Resting HR decreased 3%", "Sleep consistency improved"],
  "recommendations": ["Consider increasing cardio frequency"]
}
```

### Report Statuses

| Status | Description |
|--------|-------------|
| `generating` | Report computation in progress |
| `completed` | Report ready to view |
| `failed` | Report generation encountered an error |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/reports` | List reports (filter by `reportType`) |
| `GET` | `/v1/users/:userId/reports/:reportId` | Get a specific report |
| `POST` | `/v1/users/:userId/reports/generate` | Generate a new report |

<Aside type="tip">
  Reports are generated asynchronously. Poll the report by ID to check when it changes from `generating` to `completed`. Users with notification rules targeting the `report` category will receive an alert automatically.
</Aside>

---

## Data Exports

Export all user health data for GDPR compliance, data portability, or external analysis.

### Request an Export

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/exports \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "from": "2025-01-01T00:00:00Z",
    "to": "2025-03-18T00:00:00Z",
    "metricTypes": ["steps", "heart_rate", "sleep_duration"]
  }'
```

### Export Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| `json` | Full structured JSON dump | Programmatic access, backup |
| `csv` | Flat CSV tables per metric type | Spreadsheet analysis, data science |
| `fhir_r4` | HL7 FHIR R4 Bundle | Healthcare interoperability |
| `pdf` | Formatted PDF report | Sharing with healthcare providers |

### Export Response

```json
{
  "id": "01HX...",
  "userId": "...",
  "format": "json",
  "status": "pending",
  "metricTypes": ["steps", "heart_rate", "sleep_duration"],
  "periodStart": "2025-01-01T00:00:00.000Z",
  "periodEnd": "2025-03-18T00:00:00.000Z",
  "downloadUrl": null,
  "expiresAt": null,
  "createdAt": "2025-03-18T10:00:00.000Z"
}
```

Once processing completes, `status` changes to `completed` and `downloadUrl` is populated with a time-limited download link.

### Export Statuses

| Status | Description |
|--------|-------------|
| `pending` | Export queued for processing |
| `processing` | Data extraction in progress |
| `completed` | Ready for download |
| `failed` | Export encountered an error |
| `expired` | Download link has expired |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/exports` | List exports |
| `GET` | `/v1/users/:userId/exports/:exportId` | Get export status/details |
| `POST` | `/v1/users/:userId/exports` | Request a new export |

### FHIR R4 Support

When exporting in `fhir_r4` format, VitaSync produces a valid [HL7 FHIR R4](https://hl7.org/fhir/R4/) Bundle containing:
- `Patient` resource with user metadata
- `Observation` resources for each health metric
- Standard LOINC codes for common metrics (heart rate, SpO₂, body weight, etc.)

<Aside type="caution">
  Export download URLs are time-limited and expire after the duration shown in `expiresAt`. Request a new export if the link has expired.
</Aside>
