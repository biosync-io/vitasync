import { joinSession } from "@github/copilot-sdk/extension";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execFile } from "node:child_process";

/* ================================================================
 *  VitaSync Code Guardian Extension
 *
 *  Provides:
 *  1. onPostToolUse hook — auto-audits .tsx/.ts files after edit/create
 *  2. onSessionStart hook — injects critical rules as context
 *  3. audit_code tool — full violations audit on a file or directory
 * ================================================================ */

const isWindows = process.platform === "win32";

// ── Violation patterns ──────────────────────────────────────────
const RULES = [
  {
    id: "any-type",
    test: (line) => /:\s*any\b/.test(line) || /as\s+any\b/.test(line),
    message: "Explicit `any` type — use a proper TypeScript type instead",
    applies: (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__"),
  },
  {
    id: "console-log",
    test: (line) => /console\.(log|warn|error|debug)\(/.test(line),
    message: "console.log — use structured logging (request.log / logger) instead",
    applies: (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__") && !f.includes("apps/web/"),
  },
  {
    id: "non-null-assertion",
    test: (line) => /\w+!\.\w/.test(line) && !/!==/.test(line) && !/!=/.test(line),
    message: "Non-null assertion — validate with a proper null check instead",
    applies: (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__") && !f.includes(".d.ts"),
  },
  {
    id: "raw-sql",
    test: (line) => /db\.execute\s*\(/.test(line) || /\.query\s*\(.*SELECT/i.test(line),
    message: "Raw SQL — use Drizzle ORM query builder instead",
    applies: (f) => f.endsWith(".ts") && !f.includes("migrations") && !f.includes(".test.") && !f.includes("drizzle"),
  },
  {
    id: "hardcoded-secret",
    test: (line) => {
      const lower = line.toLowerCase();
      return (/(password|secret|api_?key)\s*[:=]\s*['"][^'"]{8,}['"]/.test(lower)) &&
        !/schema|type|interface|env|process\.env|example|test|mock|placeholder/.test(lower);
    },
    message: "Potential hardcoded secret — use environment variables via validated config",
    applies: (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.") && !f.includes(".spec.") && !f.includes(".env") && !f.includes("example"),
  },
  {
    id: "dangerous-html",
    test: (line) => /dangerouslySetInnerHTML/.test(line),
    message: "dangerouslySetInnerHTML — use React's built-in escaping or sanitize input",
    applies: (f) => f.endsWith(".tsx"),
  },
];

// Paths that are exempt from certain checks
function isTestFile(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  return rel.includes(".test.") || rel.includes(".spec.") || rel.includes("__tests__");
}

function isMigration(filePath) {
  return filePath.replace(/\\/g, "/").includes("/migrations/");
}

function isConfig(filePath) {
  const name = filePath.replace(/\\/g, "/").split("/").pop();
  return name?.includes(".config.") || name === "config.ts";
}

// ── Audit a single file ─────────────────────────────────────────
function auditFile(filePath) {
  if (!existsSync(filePath)) return [];
  if (isMigration(filePath) || isConfig(filePath)) return [];

  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  if (content.length > 100_000) return [];

  const lines = content.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.applies(filePath) && rule.test(line)) {
        violations.push({
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          code: line.trim().substring(0, 120),
        });
      }
    }
  }

  return violations;
}

// ── Format violations for agent context ─────────────────────────
function formatViolations(filePath, violations) {
  if (violations.length === 0) return null;
  const rel = relative(process.cwd(), filePath).replace(/\\/g, "/");
  const lines = violations.map(
    (v) => `  Line ${v.line}: [${v.rule}] ${v.message}\n    → ${v.code}`
  );
  return `⚠️ CODE GUARDIAN: ${violations.length} violation(s) in ${rel}:\n${lines.join("\n")}\n\nFix these violations before proceeding.`;
}

// ── Run audit on a directory ────────────────────────────────────
function runDirectoryAudit(dirPath) {
  return new Promise((resolvePromise) => {
    const shell = isWindows ? "powershell" : "bash";
    const cmd = isWindows
      ? `Get-ChildItem -Path "${dirPath}" -Recurse -Include *.tsx,*.ts | Where-Object { $_.FullName -notmatch 'node_modules|dist|\\.next|migrations' } | ForEach-Object { $_.FullName }`
      : `find "${dirPath}" \\( -name "*.tsx" -o -name "*.ts" \\) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.next/*" ! -path "*/migrations/*" | head -300`;
    const args = isWindows
      ? ["-NoProfile", "-Command", cmd]
      : ["-c", cmd];

    execFile(shell, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolvePromise({ error: err.message, files: 0, violations: [] });
        return;
      }
      const files = stdout.trim().split("\n").filter(Boolean);
      const allViolations = [];
      for (const f of files) {
        const violations = auditFile(f.trim());
        if (violations.length > 0) {
          const rel = relative(process.cwd(), f.trim()).replace(/\\/g, "/");
          allViolations.push({ file: rel, violations });
        }
      }
      resolvePromise({ files: files.length, violations: allViolations });
    });
  });
}

// ── Join session ────────────────────────────────────────────────
const session = await joinSession({
  hooks: {
    onSessionStart: async () => {
      await session.log("🛡️ Code Guardian active — monitoring for violations");
      return {
        additionalContext: [
          "IMPORTANT: This project has a code-guardian extension that auto-audits files after edits.",
          "Key rules: No explicit `any` types, no console.log in API/worker code,",
          "no raw SQL (use Drizzle ORM), Zod validation on all API inputs,",
          "no hardcoded secrets, no dangerouslySetInnerHTML.",
          "Use `pnpm typecheck` for type checking, `pnpm exec biome ci .` for linting.",
          "Run the audit_code tool if you want to check a file or directory for violations.",
        ].join(" "),
      };
    },

    onUserPromptSubmitted: async (input) => {
      const prompt = (input.prompt || "").toLowerCase();
      const isApiTask = /route|endpoint|api|service|handler/.test(prompt);
      const isAuditTask = /audit|check|verify|violations/.test(prompt);

      const rules = [
        "INTEGRITY: Do NOT claim checks pass without running them. Paste actual command output.",
        "INTEGRITY: Do NOT stub implementations. Write complete, production-quality code.",
        "INTEGRITY: Validate all inputs with Zod. Use Drizzle ORM for database queries.",
      ];

      if (isApiTask) {
        rules.push(
          "API TASK: Add Zod validation for all request inputs (body, query, params).",
          "API TASK: Business logic goes in services/, not route handlers.",
          "API TASK: Use request.log for structured logging, never console.log.",
          "API TASK: v1 routes accept only non-breaking changes.",
        );
      }

      if (isAuditTask) {
        rules.push(
          "AUDIT TASK: Run actual grep commands and show raw output. Do not summarize from memory.",
          "AUDIT TASK: Check: any types, console.log, non-null assertions, raw SQL, Zod validation, secrets.",
        );
      }

      return { additionalContext: rules.join("\n") };
    },

    onPostToolUse: async (input) => {
      const toolName = input.toolName;
      if (toolName !== "edit" && toolName !== "create") return;

      const filePath = String(input.toolArgs?.path || "");
      if (!filePath) return;
      if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return;

      // Skip node_modules, dist, migrations
      const normalized = filePath.replace(/\\/g, "/");
      if (normalized.includes("/node_modules/") || normalized.includes("/dist/") || normalized.includes("/migrations/")) return;

      const violations = auditFile(filePath);
      const msg = formatViolations(filePath, violations);

      if (msg) {
        await session.log(`⚠️ ${violations.length} violation(s) found`, { level: "warning" });
        return { additionalContext: msg };
      }
    },
  },

  tools: [
    {
      name: "audit_code",
      description:
        "Audit a file or directory for VitaSync engineering guideline violations. " +
        "Checks for: any types, console.log, non-null assertions, raw SQL, " +
        "hardcoded secrets, dangerouslySetInnerHTML. " +
        "Returns violation locations with rule IDs and suggested fixes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Absolute path to a file or directory to audit. " +
              "For a file: returns line-by-line violations. " +
              "For a directory: scans all .tsx/.ts files recursively.",
          },
        },
        required: ["path"],
      },
      handler: async (args) => {
        const targetPath = resolve(args.path);

        if (!existsSync(targetPath)) {
          return `Error: Path does not exist: ${args.path}`;
        }

        // Check if it's a file
        try {
          readFileSync(targetPath);
          // It's a file
          const violations = auditFile(targetPath);
          const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/");
          if (violations.length === 0) {
            return `✅ ${rel}: No violations found.`;
          }
          const lines = violations.map(
            (v) => `  Line ${v.line}: [${v.rule}] ${v.message}\n    Code: ${v.code}`
          );
          return `❌ ${rel}: ${violations.length} violation(s)\n\n${lines.join("\n\n")}`;
        } catch {
          // It's a directory
          const result = await runDirectoryAudit(targetPath);
          if (result.error) {
            return `Error scanning directory: ${result.error}`;
          }
          if (result.violations.length === 0) {
            return `✅ Scanned ${result.files} files: No violations found.`;
          }
          const totalV = result.violations.reduce((s, f) => s + f.violations.length, 0);
          const sections = result.violations.map((f) => {
            const lines = f.violations.map(
              (v) => `    Line ${v.line}: [${v.rule}] ${v.message}`
            );
            return `  ${f.file} (${f.violations.length}):\n${lines.join("\n")}`;
          });
          return `❌ Scanned ${result.files} files: ${totalV} violation(s) in ${result.violations.length} file(s)\n\n${sections.join("\n\n")}`;
        }
      },
    },
  ],
});
