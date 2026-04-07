# VitaSync Load Tests

Load testing suite using [k6](https://k6.io/) for benchmarking the VitaSync API.

## Prerequisites

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

```bash
# macOS
brew install k6

# Windows
winget install k6 --source winget

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## Usage

```bash
# Run the full API load test
make load-test

# Run with custom options
k6 run load-tests/api.js \
  --env BASE_URL=http://localhost:3001 \
  --env API_KEY=vs_live_xxxxx

# Run with HTML report
K6_WEB_DASHBOARD=true k6 run load-tests/api.js
```

## Test Scenarios

| Scenario | Description | VUs | Duration |
|----------|-------------|-----|----------|
| **smoke** | Verify API works under minimal load | 1 | 30s |
| **average** | Sustained normal traffic | 10 | 2m |
| **stress** | Find breaking point with ramp-up | 10→50 | 5m |
| **spike** | Sudden burst of traffic | 1→100→1 | 2m |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | VitaSync API URL |
| `API_KEY` | — | API key with `read` + `write` scopes |
| `USER_ID` | — | Test user ID (created automatically if not set) |

## Thresholds

Tests fail if any threshold is breached:

| Metric | Threshold |
|--------|-----------|
| HTTP failure rate | < 1% |
| p(95) response time | < 500ms |
| p(99) response time | < 1500ms |
| Health endpoint p(95) | < 200ms |
| Health data queries p(95) | < 800ms |
