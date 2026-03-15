import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://biosync-io.github.io",
  integrations: [
    starlight({
      title: "VitaSync",
      description:
        "Self-hosted wearable health data aggregation platform — one API for Fitbit, Garmin, Whoop, Strava and more.",
      head: [
        { tag: "script", attrs: { src: "/particles.js", defer: true } },
        { tag: "script", attrs: { src: "/scroll-reveal.js", defer: true } },
      ],
      logo: {
        dark: "./src/assets/logo-dark.svg",
        light: "./src/assets/logo-light.svg",
        alt: "VitaSync",
        replacesTitle: true,
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/your-org/vitasync" }],
      editLink: {
        baseUrl: "https://github.com/your-org/vitasync/edit/main/apps/docs/",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "index" },
            { label: "Quickstart", slug: "quickstart" },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "Overview", slug: "architecture/overview" },
            { label: "Data Model", slug: "architecture/data-model" },
            { label: "Sync Pipeline", slug: "architecture/sync-pipeline" },
            { label: "Security", slug: "architecture/security" },
          ],
        },
        {
          label: "Providers",
          items: [
            { label: "Supported Providers", slug: "providers/supported" },
            { label: "Fitbit", slug: "providers/fitbit" },
            { label: "Garmin", slug: "providers/garmin" },
            { label: "Whoop", slug: "providers/whoop" },
            { label: "Strava", slug: "providers/strava" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "Introduction", slug: "api-reference/introduction" },
            {
              label: "Guides",
              items: [
                {
                  label: "Authentication",
                  slug: "api-reference/guides/authentication",
                },
                {
                  label: "Connect a User",
                  slug: "api-reference/guides/connect-a-user",
                },
                {
                  label: "Query Health Data",
                  slug: "api-reference/guides/query-health-data",
                },
                {
                  label: "Webhooks",
                  slug: "api-reference/guides/webhooks",
                },
              ],
            },
          ],
        },
        {
          label: "Developer Guides",
          items: [
            {
              label: "Adding a Provider",
              slug: "dev-guides/adding-a-provider",
            },
            { label: "API Keys", slug: "dev-guides/api-keys" },
            { label: "Webhooks", slug: "dev-guides/webhooks" },
            { label: "MCP Server", slug: "dev-guides/mcp" },
            { label: "Grafana Dashboards", slug: "dev-guides/grafana-dashboards" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "Docker Compose", slug: "deployment/docker" },
            { label: "Kubernetes / Helm", slug: "deployment/kubernetes" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
})
