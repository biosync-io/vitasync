---
title: MCP Server
description: Expose VitaSync health data to AI assistants via the Model Context Protocol (MCP).
---

import { Aside, Steps, Tabs, TabItem } from '@astrojs/starlight/components';

The `apps/mcp` package is a **Model Context Protocol (MCP)** server that connects directly to your VitaSync PostgreSQL database and exposes health data as callable tools. Any MCP-compatible AI assistant — Claude Desktop, Cursor, VS Code Copilot, or any custom agent — can use these tools to query live health data.

<Aside type="tip">
MCP lets an AI assistant ask _"How has my resting heart rate changed over the past 90 days?"_ and receive real data back from your VitaSync instance in real time.
</Aside>

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard (by Anthropic) that lets AI models call external **tools** and retrieve **resources** from a server. VitaSync implements the server side: the AI assistant is the client.

## Available Tools

### Data Query Tools

| Tool | Description |
|------|-------------|
| `query_health_metrics` | Query `health_metrics` by user, metric type, time range, and provider |
| `list_users` | List workspace users with optional search |
| `list_connections` | List provider connections with status and last-synced time |
| `get_events` | Query workout / sleep / activity events from the `events` table |
| `get_personal_records` | Retrieve all-time personal bests from `personal_records` |

### AI & Analytics Tools

| Tool | Description |
|------|-------------|
| `get_health_context` | LLM-ready biological context including baselines, trends, anomalies, correlations, health scores, and a natural language summary. Ideal as a first call for AI coaching. |
| `get_anomaly_alerts` | Retrieve detected health anomalies with optional `severity` (`info`, `warning`, `critical`) and `status` (`active`, `resolved`) filters |
| `get_correlations` | Discover metric correlations with configurable `minStrength` threshold (default: 0.3). Returns Pearson and Spearman coefficients. |
| `get_health_scores` | Retrieve composite health scores (overall, sleep, activity, cardio, recovery) with optional date range and limit |

## Setup

### Prerequisites

- VitaSync running with a reachable PostgreSQL instance
- Node.js 22+ and pnpm 10+

### Build the server

```bash
# From the monorepo root
pnpm --filter @biosync-io/mcp build
```

The compiled binary is output to `apps/mcp/dist/index.js`.

### Configure client

<Tabs>
  <TabItem label="Claude Desktop">

Add the following to your Claude Desktop config file:

**macOS / Linux:** `~/.config/claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vitasync": {
      "command": "node",
      "args": ["/absolute/path/to/vitasync/apps/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://vitasync:changeme@localhost:5432/vitasync"
      }
    }
  }
}
```

Restart Claude Desktop and you should see the VitaSync tools listed in the tool panel.

  </TabItem>
  <TabItem label="Cursor">

Open **Cursor Settings → MCP** and add a new server:

```json
{
  "name": "vitasync",
  "command": "node",
  "args": ["/absolute/path/to/vitasync/apps/mcp/dist/index.js"],
  "env": {
    "DATABASE_URL": "postgresql://vitasync:changeme@localhost:5432/vitasync"
  }
}
```

  </TabItem>
  <TabItem label="VS Code Copilot">

Add to your workspace `.vscode/mcp.json` (or user settings):

```json
{
  "servers": {
    "vitasync": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/apps/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://vitasync:changeme@localhost:5432/vitasync"
      }
    }
  }
}
```

  </TabItem>
  <TabItem label="Custom agent">

Start the server in `stdio` mode and communicate over stdin/stdout using the MCP JSON-RPC protocol:

```bash
DATABASE_URL=postgresql://... node apps/mcp/dist/index.js
```

Or use the binary shortcut after `pnpm install`:

```bash
DATABASE_URL=postgresql://... npx vitasync-mcp
```

  </TabItem>
</Tabs>

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `MCP_READ_TIMEOUT_MS` | | Query timeout in milliseconds (default: `10000`) |
| `MCP_MAX_ROWS` | | Maximum rows returned per tool call (default: `1000`) |

<Aside type="caution">
The MCP server connects to the database with **read-only** access. It never writes, modifies, or deletes health data. Consider creating a dedicated read-only Postgres role for extra safety.
</Aside>

## Example Prompts

Once connected, try these in your AI assistant:

```
Show me my step count trend for the last 30 days
```

```
Compare my average resting heart rate in January vs February
```

```
What are my top 5 personal records?
```

```
Give me a full health context summary with baselines and trends
```

```
Were there any anomalies detected in my health data this week?
```

```
What correlations exist between my sleep quality and resting heart rate?
```

```
Show me my overall health scores for the last month
```

```
Which provider has synced the most data in the last 7 days?
```

```
List all users who have an active Garmin connection
```

## Development

Run the server in watch mode during development:

```bash
pnpm --filter @biosync-io/mcp dev
```

The server prints structured JSON logs to stderr (not stdout, which is reserved for the MCP protocol).

## Architecture

```
AI Assistant (MCP client)
        │  stdio (JSON-RPC 2.0)
        ▼
  MCP Server (apps/mcp)
        │  read-only SQL queries
        ▼
  PostgreSQL (VitaSync DB)
```

The server uses `@modelcontextprotocol/sdk` and `zod` for input validation. All tool inputs are validated before any SQL is executed.
