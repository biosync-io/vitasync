{{/*
Expand the name of the chart.
*/}}
{{- define "vitasync.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncate at 63 chars because some Kubernetes name fields are limited to this (DNS naming spec).
*/}}
{{- define "vitasync.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "vitasync.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "vitasync.labels" -}}
helm.sh/chart: {{ include "vitasync.chart" . }}
{{ include "vitasync.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "vitasync.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vitasync.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API-specific labels
*/}}
{{- define "vitasync.api.labels" -}}
{{ include "vitasync.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{- define "vitasync.api.selectorLabels" -}}
{{ include "vitasync.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Worker-specific labels
*/}}
{{- define "vitasync.worker.labels" -}}
{{ include "vitasync.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{- define "vitasync.worker.selectorLabels" -}}
{{ include "vitasync.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Web-specific labels
*/}}
{{- define "vitasync.web.labels" -}}
{{ include "vitasync.labels" . }}
app.kubernetes.io/component: web
{{- end }}

{{- define "vitasync.web.selectorLabels" -}}
{{ include "vitasync.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
ServiceAccount name
*/}}
{{- define "vitasync.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "vitasync.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the secret containing sensitive env vars.
Prefers .Values.secrets.existingSecret when set.
*/}}
{{- define "vitasync.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "vitasync.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Name of the ConfigMap containing non-sensitive config.
*/}}
{{- define "vitasync.configMapName" -}}
{{- printf "%s-config" (include "vitasync.fullname" .) }}
{{- end }}

{{/*
Image tag helper — falls back to .Chart.AppVersion
*/}}
{{- define "vitasync.api.image" -}}
{{- $tag := .Values.api.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.api.image.repository $tag }}
{{- end }}

{{- define "vitasync.worker.image" -}}
{{- $tag := .Values.worker.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.worker.image.repository $tag }}
{{- end }}

{{- define "vitasync.web.image" -}}
{{- $tag := .Values.web.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.web.image.repository $tag }}
{{- end }}

{{/*
imagePullSecrets helper
*/}}
{{- define "vitasync.imagePullSecrets" -}}
{{- $secrets := concat (.Values.global.imagePullSecrets | default list) (.Values.imagePullSecrets | default list) }}
{{- if $secrets }}
imagePullSecrets:
{{- range $secrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}
