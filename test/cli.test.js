import assert from "node:assert/strict";
import test from "node:test";

import { parseArguments } from "../src/cli.js";

test("CLI parses the complete draft gate without weakening apply", () => {
  const parsed = parseArguments([
    "upload-draft",
    "--apply",
    "--expected-shop-id",
    "24681012",
    "--review-file=output/new-shop/review-manifest.json",
    "--review-hash",
    "a".repeat(64),
  ]);
  assert.equal(parsed.options.apply, true);
  assert.equal(parsed.options["expected-shop-id"], "24681012");
  assert.equal(parsed.options["review-file"], "output/new-shop/review-manifest.json");
});

test("CLI rejects ambiguous or unknown options", () => {
  assert.throws(() => parseArguments(["upload-draft", "--apply=true"]), /does not accept a value/);
  assert.throws(() => parseArguments(["package", "--unknown", "value"]), /unknown option/);
  assert.throws(() => parseArguments(["render", "--products"]), /requires a value/);
});
