import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanner = path.join(root, "scripts", "scan-secrets.mjs");

function runScanner(directory) {
  return spawnSync(process.execPath, [scanner, directory], { encoding: "utf8" });
}

test("secret scanner accepts public source and scans a normal package lock without false positives", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-safe-scan-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, "src"));
  fs.writeFileSync(path.join(temporary, "src", "index.js"), 'const key = process.env.API_KEY;\n');
  fs.writeFileSync(
    path.join(temporary, "package-lock.json"),
    JSON.stringify({ resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz", integrity: "sha512-public-integrity" }),
  );

  const result = runScanner(temporary);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Secret scan passed/);
});

test("secret scanner does not exempt credentials hidden in package locks", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-lock-scan-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const token = ["ghp_", "C".repeat(36)].join("");
  fs.writeFileSync(path.join(temporary, "package-lock.json"), JSON.stringify({ resolved: token }));

  const result = runScanner(temporary);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub token/);
  assert.equal(result.stderr.includes(token), false);
});

test("secret scanner fails closed without exposing the credential", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-bad-scan-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, "src"));
  const token = ["ghp_", "B".repeat(36)].join("");
  fs.writeFileSync(path.join(temporary, "src", "leak.js"), `export const leaked = "${token}";\n`);

  const result = runScanner(temporary);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub token/);
  assert.equal(result.stderr.includes(token), false);
});

test("secret scanner blocks old-shop identity and customer artifacts", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-private-scan-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, "customer-data"));
  fs.writeFileSync(path.join(temporary, "customer-data", "records.json"), "{}\n");
  fs.writeFileSync(path.join(temporary, "config.js"), `export const oldShop = ${["6649", "4528"].join("")};\n`);

  const result = runScanner(temporary);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /customer or order artifact/);
  assert.match(result.stderr, /previous shop ID/);
});
