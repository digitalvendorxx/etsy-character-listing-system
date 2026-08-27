#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, loadWorkspace, selectProducts } from "./config.js";
import { authLocal, uploadDraftProducts, whoami } from "./etsy-client.js";
import { assertCharacterDimensions, packageReview, renderProducts } from "./renderer.js";
import { fromRoot, relativeToRoot } from "./paths.js";

const COMMAND_OPTIONS = {
  validate: new Set(["profile", "catalog"]),
  plan: new Set(["profile", "catalog", "products"]),
  render: new Set(["profile", "catalog", "products", "output"]),
  package: new Set(["profile", "catalog", "products", "output"]),
  "character-inspect": new Set(["file"]),
  "auth-local": new Set(["port"]),
  whoami: new Set(),
  "upload-draft": new Set(["profile", "catalog", "products", "apply", "expected-shop-id", "review-file", "review-hash"]),
};

function usage() {
  return `Usage:
  node src/cli.js validate [--profile FILE] [--catalog FILE]
  node src/cli.js plan [--products all|id,id]
  node src/cli.js render [--products all|id,id] [--output DIR]
  node src/cli.js package [--products all|id,id] [--output DIR]
  node src/cli.js character-inspect --file FILE
  node src/cli.js auth-local [--port 3000]
  node src/cli.js whoami
  node src/cli.js upload-draft --apply --expected-shop-id ID --review-file FILE --review-hash SHA256`;
}

export function parseArguments(argv) {
  const [command, ...tokens] = argv;
  if (!command || command === "help" || command === "--help") return { command: "help", options: {} };
  if (!COMMAND_OPTIONS[command]) throw new Error(`unknown command: ${command}`);
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    const key = token.slice(2, equals === -1 ? undefined : equals);
    if (!COMMAND_OPTIONS[command].has(key)) throw new Error(`unknown option for ${command}: --${key}`);
    if (Object.hasOwn(options, key)) throw new Error(`duplicate option: --${key}`);
    if (key === "apply") {
      if (equals !== -1) throw new Error("--apply does not accept a value");
      options[key] = true;
      continue;
    }
    const value = equals === -1 ? tokens[++index] : token.slice(equals + 1);
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return { command, options };
}

function workspaceOptions(options, requireUploadReady = false) {
  return {
    profileFile: options.profile,
    catalogFile: options.catalog,
    requireUploadReady,
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function checkedOutput(value) {
  if (!value) return undefined;
  const normalized = String(value).replaceAll("\\", "/");
  if (path.isAbsolute(normalized) || normalized.split("/").includes("..") || !normalized.startsWith("output/")) {
    throw new Error("--output must be a repository-relative path under output/");
  }
  return normalized;
}

async function run(command, options) {
  if (command === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === "auth-local") {
    loadDotEnv();
    const port = options.port === undefined ? 3000 : Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be a valid TCP port");
    await authLocal({ port });
    return;
  }
  if (command === "whoami") {
    loadDotEnv();
    const me = await whoami();
    print({ userId: Number(me.user_id || 0) || null, shopId: Number(me.shop_id || 0) || null });
    return;
  }
  if (command === "character-inspect") {
    if (!options.file) throw new Error("character-inspect requires --file");
    const file = fromRoot(options.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`character file does not exist: ${options.file}`);
    const inspection = await assertCharacterDimensions(file);
    print(inspection);
    return;
  }

  const upload = command === "upload-draft";
  if (upload) {
    if (!options.apply) throw new Error("upload-draft requires the explicit --apply flag");
    for (const key of ["expected-shop-id", "review-file", "review-hash"]) {
      if (!options[key]) throw new Error(`upload-draft requires --${key}`);
    }
    if (!/^[a-f0-9]{64}$/.test(options["review-hash"])) throw new Error("--review-hash must be a lowercase SHA-256");
  }
  const workspace = loadWorkspace(workspaceOptions(options, upload));
  const products = selectProducts(workspace.catalog, options.products || "all");
  if (command === "validate") {
    const character = await assertCharacterDimensions(workspace.characterFile);
    print({ valid: true, shop: workspace.profile.slug, catalog: workspace.catalog.catalogVersion, products: workspace.catalog.products.length, character });
    return;
  }
  if (command === "plan") {
    print({ mode: "local-read-only", shop: workspace.profile.slug, expectedShopId: workspace.profile.expectedShopId, layout: workspace.profile.layoutVersion, characterSha256: workspace.characterHash, catalog: workspace.catalog.catalogVersion, products: products.map(({ id, sku, title, price }) => ({ id, sku, title, price })) });
    return;
  }
  if (command === "render") {
    const rendered = await renderProducts(workspace, products, { outputDir: checkedOutput(options.output) });
    print({ mode: "local-render", output: relativeToRoot(rendered.destinationRoot), artifacts: rendered.artifacts });
    return;
  }
  if (command === "package") {
    const packaged = await packageReview(workspace, products, { outputDir: checkedOutput(options.output) });
    print({ mode: "local-review-package", reviewFile: relativeToRoot(packaged.file), reviewHash: packaged.manifest.reviewHash, contactSheet: packaged.manifest.contactSheet.file, next: "Review the contact sheet, then use the exact review file and hash with upload-draft." });
    return;
  }
  if (command === "upload-draft") {
    const reviewedPath = String(options["review-file"]).replaceAll("\\", "/");
    if (path.isAbsolute(reviewedPath) || reviewedPath.split("/").includes("..") || !reviewedPath.startsWith("output/")) {
      throw new Error("--review-file must be a repository-relative path under output/");
    }
    const reviewFile = fromRoot(reviewedPath);
    if (!fs.existsSync(reviewFile) || !fs.statSync(reviewFile).isFile()) throw new Error(`review file does not exist: ${options["review-file"]}`);
    const results = await uploadDraftProducts(workspace, products, {
      apply: true,
      expectedShopId: Number(options["expected-shop-id"]),
      reviewFile,
      reviewHash: options["review-hash"],
    });
    print({ mode: "etsy-draft-only", shopId: workspace.profile.expectedShopId, results });
    return;
  }
  throw new Error(`unhandled command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    await run(parsed.command, parsed.options);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

export const __test = { run, usage };
