---
title: Database Backup & Restore
description: Strategies for backing up and restoring the VitaSync PostgreSQL database in Docker Compose and Kubernetes environments.
---

VitaSync stores all health data, user accounts, provider connections, and analytics in PostgreSQL. A solid backup strategy is essential for any production deployment.

## Quick Reference

| Method | Best For | RPO | Complexity |
|--------|----------|-----|------------|
| `pg_dump` (logical) | Small–medium databases, migrations | Point-in-time | Low |
| `pg_basebackup` + WAL archiving | Large databases, minimal data loss | Continuous | Medium |
| Volume snapshots | Cloud-hosted volumes (EBS, PD) | Point-in-time | Low |
| Kubernetes CronJob | Automated scheduled backups | Scheduled | Medium |

> **RPO** = Recovery Point Objective — how much data you can afford to lose.

---

## Docker Compose

### One-Time Backup with `pg_dump`

Create a compressed, timestamped backup:

```bash
docker compose exec -T postgres pg_dump \
  -U vitasync \
  -d vitasync \
  --format=custom \
  --compress=9 \
  > "vitasync-$(date +%Y%m%d-%H%M%S).dump"
```

**Flags explained:**

- `--format=custom` — PostgreSQL's native compressed format, supports selective restore
- `--compress=9` — maximum compression
- `-T` — no TTY (safe for scripts and cron)

### SQL-Format Backup

For a human-readable SQL file:

```bash
docker compose exec -T postgres pg_dump \
  -U vitasync \
  -d vitasync \
  --clean \
  --if-exists \
  > "vitasync-$(date +%Y%m%d-%H%M%S).sql"
```

### Restore from Backup

**Custom format (`.dump`):**

```bash
docker compose exec -T postgres pg_restore \
  -U vitasync \
  -d vitasync \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  < vitasync-20260401-120000.dump
```

**SQL format (`.sql`):**

```bash
docker compose exec -T postgres psql \
  -U vitasync \
  -d vitasync \
  < vitasync-20260401-120000.sql
```

:::caution
`--clean` drops existing objects before recreating them. Make sure you're restoring to the correct database.
:::

### Automated Backups with Cron

Create a backup script at `scripts/backup-db.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/vitasync-${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Starting backup: ${BACKUP_FILE}"
docker compose exec -T postgres pg_dump \
  -U vitasync \
  -d vitasync \
  --format=custom \
  --compress=9 \
  > "$BACKUP_FILE"

# Verify backup is valid
pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1
echo "Backup verified: $(du -h "$BACKUP_FILE" | cut -f1)"

# Clean up old backups
find "$BACKUP_DIR" -name "vitasync-*.dump" -mtime "+${RETENTION_DAYS}" -delete
echo "Cleaned backups older than ${RETENTION_DAYS} days"
```

Add to crontab (`crontab -e`):

```cron
# Daily backup at 2:00 AM
0 2 * * * cd /path/to/vitasync && bash scripts/backup-db.sh >> /var/log/vitasync-backup.log 2>&1
```

### Off-Host Backup Storage

Copy backups to a remote location for disaster recovery:

```bash
# S3-compatible storage (AWS, MinIO, Backblaze B2)
aws s3 cp "$BACKUP_FILE" "s3://my-backups/vitasync/${TIMESTAMP}.dump"

# rsync to remote server
rsync -avz "$BACKUP_DIR/" backup-server:/backups/vitasync/
```

---

## Kubernetes / Helm

### Prerequisites

Ensure PostgreSQL persistence is enabled in your `values.yaml`:

```yaml
postgresql:
  persistence:
    enabled: true        # ⚠️ Disabled by default — enable this!
    size: 8Gi
    storageClassName: "" # Use your cluster's default, or specify one
```

:::danger
PostgreSQL persistence is **disabled by default** in the Helm chart. Without it, all data is lost when the pod restarts. Always enable persistence in production.
:::

### Manual Backup via kubectl

```bash
# Find the PostgreSQL pod
POSTGRES_POD=$(kubectl get pods -l app.kubernetes.io/component=postgresql -o jsonpath='{.items[0].metadata.name}')

# Run pg_dump
kubectl exec -i "$POSTGRES_POD" -- pg_dump \
  -U vitasync \
  -d vitasync \
  --format=custom \
  --compress=9 \
  > "vitasync-$(date +%Y%m%d-%H%M%S).dump"
```

### Restore via kubectl

```bash
kubectl exec -i "$POSTGRES_POD" -- pg_restore \
  -U vitasync \
  -d vitasync \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  < vitasync-20260401-120000.dump
```

### Automated Backups with CronJob

Create a Kubernetes CronJob for scheduled backups. This example uploads to S3-compatible storage:

```yaml
# backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: vitasync-db-backup
spec:
  schedule: "0 2 * * *" # Daily at 2:00 AM UTC
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: postgres:16-alpine
              command:
                - /bin/sh
                - -c
                - |
                  set -e
                  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
                  BACKUP_FILE="/tmp/vitasync-${TIMESTAMP}.dump"

                  echo "Starting backup..."
                  pg_dump \
                    -h "$PGHOST" \
                    -U "$PGUSER" \
                    -d "$PGDATABASE" \
                    --format=custom \
                    --compress=9 \
                    > "$BACKUP_FILE"

                  echo "Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

                  # Upload to S3 (install awscli or use a pre-built image)
                  # aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/vitasync/${TIMESTAMP}.dump"
              env:
                - name: PGHOST
                  value: vitasync-postgresql # Helm service name
                - name: PGUSER
                  value: vitasync
                - name: PGDATABASE
                  value: vitasync
                - name: PGPASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: vitasync-secrets
                      key: POSTGRES_PASSWORD
```

Apply:

```bash
kubectl apply -f backup-cronjob.yaml

# Trigger a manual run
kubectl create job --from=cronjob/vitasync-db-backup vitasync-backup-manual

# Check status
kubectl get jobs -l job-name=vitasync-backup-manual
kubectl logs job/vitasync-backup-manual
```

### Volume Snapshots (Cloud Providers)

If your cluster uses a CSI driver that supports volume snapshots (EBS, GCE PD, Azure Disk):

```yaml
# volume-snapshot.yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: vitasync-db-snapshot
spec:
  volumeSnapshotClassName: csi-snapclass # Your snapshot class
  source:
    persistentVolumeClaimName: vitasync-postgresql-data
```

```bash
# Create snapshot
kubectl apply -f volume-snapshot.yaml

# Restore from snapshot
# Reference in a new PVC:
# spec.dataSource.name: vitasync-db-snapshot
# spec.dataSource.kind: VolumeSnapshot
# spec.dataSource.apiGroup: snapshot.storage.k8s.io
```

---

## Continuous Archiving (WAL)

For near-zero data loss, configure PostgreSQL WAL (Write-Ahead Log) archiving. This captures every transaction between `pg_dump` snapshots.

### Enable WAL Archiving

Add to your `postgresql.conf` or pass as environment variables:

```yaml
# docker-compose.yml — add to postgres service
postgres:
  command:
    - postgres
    - -c
    - archive_mode=on
    - -c
    - archive_command=cp %p /archive/%f
    - -c
    - wal_level=replica
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - postgres_archive:/archive
```

### Point-in-Time Recovery (PITR)

With a base backup + WAL archives, restore to any point in time:

```bash
# 1. Take a base backup
docker compose exec -T postgres pg_basebackup \
  -U vitasync \
  -D /tmp/basebackup \
  --format=tar \
  --gzip \
  --checkpoint=fast

# 2. To restore to a specific time, configure recovery.conf:
# recovery_target_time = '2026-04-01 14:30:00 UTC'
# restore_command = 'cp /archive/%f %p'
```

:::tip
WAL archiving is most valuable for databases with high write throughput where even a few minutes of data loss is unacceptable.
:::

---

## Verification

Always verify your backups. An untested backup is not a backup.

### Verify Backup Integrity

```bash
# List contents of a custom-format backup
pg_restore --list vitasync-20260401-120000.dump

# Test restore to a temporary database
docker compose exec -T postgres psql -U vitasync -c "CREATE DATABASE vitasync_restore_test;"
docker compose exec -T postgres pg_restore \
  -U vitasync \
  -d vitasync_restore_test \
  --no-owner \
  < vitasync-20260401-120000.dump

# Verify row counts
docker compose exec -T postgres psql -U vitasync -d vitasync_restore_test -c "
  SELECT 'users' AS table_name, COUNT(*) FROM users
  UNION ALL SELECT 'health_metrics', COUNT(*) FROM health_metrics
  UNION ALL SELECT 'provider_connections', COUNT(*) FROM provider_connections;
"

# Clean up
docker compose exec -T postgres psql -U vitasync -c "DROP DATABASE vitasync_restore_test;"
```

---

## Production Checklist

Before going to production, ensure you have:

- [ ] **Backups enabled** — automated daily (minimum) via cron or CronJob
- [ ] **Persistence enabled** — PostgreSQL PVC in Kubernetes, named volume in Docker
- [ ] **Off-host storage** — backups stored outside the database server (S3, GCS, remote host)
- [ ] **Retention policy** — old backups automatically cleaned (e.g., 30 days)
- [ ] **Encryption at rest** — backup files encrypted before upload (`gpg`, server-side encryption)
- [ ] **Restore tested** — run a full restore drill at least quarterly
- [ ] **Monitoring** — alerts for backup failures (check CronJob status or cron exit codes)
- [ ] **Documented runbook** — team knows how to restore in an emergency
