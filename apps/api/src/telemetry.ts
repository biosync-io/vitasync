import { config } from "./config.js"

/**
 * Initializes OpenTelemetry instrumentation when OTEL_ENABLED=true.
 *
 * Must be called BEFORE any other imports that should be instrumented
 * (HTTP, PostgreSQL, Redis, etc). The Node.js SDK auto-instruments
 * supported libraries when loaded early.
 *
 * Exports traces via OTLP (gRPC) to the configured collector endpoint.
 */
export async function initTelemetry(): Promise<void> {
  if (!config.OTEL_ENABLED) return

  const { NodeSDK } = await import("@opentelemetry/sdk-node")
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node")
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-grpc")
  const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-grpc")
  const { PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics")
  const { Resource } = await import("@opentelemetry/resources")
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    "@opentelemetry/semantic-conventions"
  )

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
    "deployment.environment": config.NODE_ENV,
  })

  const traceExporter = new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  })

  const metricExporter = new OTLPMetricExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  })

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  })

  sdk.start()

  const shutdown = async () => {
    await sdk.shutdown()
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  console.info(`📡 OpenTelemetry enabled — exporting to ${config.OTEL_EXPORTER_OTLP_ENDPOINT}`)
}
