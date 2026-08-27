#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedRoot = process.argv[2] ? path.resolve(process.argv[2]) : SCRIPT_ROOT;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const KNOWN_BINARY_EXTENSIONS = new Set([".gif", ".ico", ".jpeg", ".jpg", ".png", ".ttf", ".webp", ".woff", ".woff2"]);
const oldShopId = ["6649", "4528"].join("");
const oldUserPath = ["/Users/", "berkayyalinkilic"].join("");

const secretRules = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ["Stripe live key", /\b[ps]k_live_[A-Za-z0-9]{16,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{16,}\b/g],
  ["SendGrid API key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g],
  ["npm token", /\bnpm_[A-Za-z0-9]{20,}\b/g],
  ["PyPI token", /\bpypi-[A-Za-z0-9_-]{20,}\b/g],
  ["JWT token", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["credential-bearing database URL", /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s"']+/gi],
  [
    "hard-coded credential value",
    /["']?(?:access_token|refresh_token|client_secret|shared_secret|api_key|password)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  ],
];

const forbiddenPathRules = [
  ["non-placeholder public asset", (value) => value.startsWith("assets/") && value !== "assets/example-character.svg"],
  ["environment file", (value) => /(^|\/)\.env(?:\..+)?$/i.test(value) && value !== ".env.example"],
  [
    "credential artifact",
    (value) => /(^|\/)(?:[^/]*(?:auth|token|oauth|storage-state)[^/]*)\.(?:json|ya?ml)$/i.test(value),
  ],
  ["private key file", (value) => /\.(?:pem|key|p12|pfx)$/i.test(value)],
  ["shop-private config", (value) => /(?:^|\/)[^/]*(?:\.local|config\.local)[^/]*\.(?:json|ya?ml)$/i.test(value)],
  [
    "private runtime or asset directory",
    (value) =>
      /(^|\/)(?:\.runtime|local-assets|private-assets|[^/]*browser-profile[^/]*|user-data-dir|playwright\/\.auth)(\/|$)/i.test(value),
  ],
  [
    "customer or order artifact",
    (value) =>
      /(^|\/)(?:customer-data|order-assets|order-drafts|message-drafts|receipts?|orders?|customers?|journals?)(\/|$)/i.test(value) ||
      /(?:^|\/)[^/]*(?:customer|order|receipt|journal)[^/]*\.(?:json|jsonl|csv|xlsx|sqlite|db|log|txt|html?|png|jpe?g|pdf|zip)$/i.test(value) ||
      /\.(?:sqlite3?|xlsx|csv|heic)$/i.test(value),
  ],
];

function normalize(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function walk(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".runtime", "output"].includes(entry.name)) continue;
    const relative = normalize(path.join(prefix, entry.name));
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function filesToScan(root) {
  try {
    const output = execFileSync("git", ["-C", root, "ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = output.split("\0").filter(Boolean).map(normalize);
    if (tracked.length) return tracked;
  } catch {
    // A fresh starter directory is scanned recursively before its first commit.
  }
  return walk(root);
}

function isText(buffer) {
  return !buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0);
}

function lineFor(text, index) {
  return text.slice(0, index).split("\n").length;
}

const findings = [];
const files = filesToScan(requestedRoot);
for (const relative of files) {
  for (const [rule, matches] of forbiddenPathRules) {
    if (matches(relative)) findings.push({ file: relative, rule, line: null });
  }

  const absolute = path.join(requestedRoot, relative);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    findings.push({ file: relative, rule: "tracked file is unreadable", line: null });
    continue;
  }
  if (stat.isSymbolicLink()) {
    findings.push({ file: relative, rule: "tracked symbolic link", line: null });
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size > MAX_TEXT_BYTES) {
    if (!KNOWN_BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      findings.push({ file: relative, rule: "file exceeds the fail-closed text scan limit", line: null });
    }
    continue;
  }
  const buffer = fs.readFileSync(absolute);
  if (!isText(buffer)) continue;
  const text = buffer.toString("utf8");

  if (text.includes(oldShopId)) findings.push({ file: relative, rule: "previous shop ID", line: lineFor(text, text.indexOf(oldShopId)) });
  if (text.includes(oldUserPath)) findings.push({ file: relative, rule: "previous computer absolute path", line: lineFor(text, text.indexOf(oldUserPath)) });
  for (const [rule, expression] of secretRules) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      findings.push({ file: relative, rule, line: lineFor(text, match.index || 0) });
    }
  }
}

const unique = [...new Map(findings.map((finding) => [`${finding.file}:${finding.line || 0}:${finding.rule}`, finding])).values()];
if (unique.length) {
  console.error(`Secret scan failed with ${unique.length} finding(s):`);
  for (const finding of unique) {
    console.error(`- ${finding.file}${finding.line ? `:${finding.line}` : ""}: ${finding.rule}`);
  }
  console.error("No secret value was printed. Remove the artifact or replace the credential with an environment variable.");
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed: ${files.length} repository file(s) checked.`);
}
