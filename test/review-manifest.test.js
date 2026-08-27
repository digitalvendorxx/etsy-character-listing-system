import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { objectSha256, fileSha256 } from "../src/hash.js";
import {
  calculateReviewHash,
  loadAndVerifyReviewManifest,
  verifyReviewManifest,
} from "../src/renderer.js";
import { ROOT, relativeToRoot } from "../src/paths.js";
import { validProduct } from "./fixtures.js";

function manifestFor({ artifactFile, contactSheetFile, galleryFile }) {
  const gallery = galleryFile
    ? [{ rank: 2, file: relativeToRoot(galleryFile), sha256: fileSha256(galleryFile), bytes: fs.statSync(galleryFile).size }]
    : [];
  const product = validProduct({ gallery: gallery.map((item) => item.file) });
  const manifest = {
    schemaVersion: 1,
    createdAt: "2026-08-27T09:00:00.000Z",
    shop: { slug: "new-reading-shop", expectedShopId: 24681012, profileSha256: "a".repeat(64) },
    catalog: { version: "starter-v1", sha256: "b".repeat(64) },
    layout: { version: "reading-1200x1500-v1" },
    character: { sha256: "c".repeat(64), width: 1200, height: 1500 },
    products: [
      {
        id: product.id,
        productSha256: objectSha256(product),
        artifact: { file: relativeToRoot(artifactFile), sha256: fileSha256(artifactFile), width: 1200, height: 1500 },
        gallery,
      },
    ],
    contactSheet: { file: relativeToRoot(contactSheetFile), sha256: fileSha256(contactSheetFile) },
  };
  manifest.reviewHash = calculateReviewHash(manifest);
  return manifest;
}

test("review hash ignores only its prior hash and includes the review timestamp", () => {
  const base = {
    schemaVersion: 1,
    createdAt: "2026-08-27T09:00:00.000Z",
    reviewHash: "stale",
    shop: { slug: "new-reading-shop", expectedShopId: 24681012 },
    products: [{ id: "love-reading-01", productSha256: "a".repeat(64) }],
  };
  const changedPriorHash = { ...base, reviewHash: "different" };
  const changedTimestamp = { ...base, createdAt: "2030-01-01T00:00:00.000Z" };
  assert.equal(calculateReviewHash(base), calculateReviewHash(changedPriorHash));
  assert.notEqual(calculateReviewHash(base), calculateReviewHash(changedTimestamp));
});

test("review manifest rejects any reviewed-content change", () => {
  const manifest = {
    schemaVersion: 1,
    createdAt: "2026-08-27T09:00:00.000Z",
    shop: { slug: "new-reading-shop", expectedShopId: 24681012 },
    products: [{ id: "love-reading-01", title: "Original title" }],
  };
  manifest.reviewHash = calculateReviewHash(manifest);
  assert.equal(verifyReviewManifest(manifest), manifest.reviewHash);
  manifest.products[0].title = "Changed after review";
  assert.throws(() => verifyReviewManifest(manifest), /hash does not match/);
});

test("review package pins product JSON, thumbnail, gallery, and contact-sheet bytes", (context) => {
  const outputRoot = path.join(ROOT, "output");
  const galleryRoot = path.join(ROOT, "local-assets", "gallery");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(galleryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(outputRoot, "test-review-"));
  const galleryDirectory = fs.mkdtempSync(path.join(galleryRoot, "test-review-"));
  context.after(() => {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(galleryDirectory, { recursive: true, force: true });
  });
  const artifactFile = path.join(temporary, "thumbnail.jpg");
  const contactSheetFile = path.join(temporary, "contact-sheet.png");
  const galleryFile = path.join(galleryDirectory, "gallery.jpg");
  const manifestFile = path.join(temporary, "review-manifest.json");
  fs.writeFileSync(artifactFile, "reviewed image bytes");
  fs.writeFileSync(contactSheetFile, "reviewed contact sheet bytes");
  fs.writeFileSync(galleryFile, "reviewed gallery bytes");
  const manifest = manifestFor({ artifactFile, contactSheetFile, galleryFile });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));

  assert.deepEqual(loadAndVerifyReviewManifest(manifestFile), manifest);

  fs.writeFileSync(galleryFile, "changed gallery bytes");
  assert.throws(() => loadAndVerifyReviewManifest(manifestFile), /gallery image changed or is missing/);
  fs.writeFileSync(galleryFile, "reviewed gallery bytes");
  fs.writeFileSync(artifactFile, "changed image bytes");
  assert.throws(() => loadAndVerifyReviewManifest(manifestFile), /thumbnail changed or is missing/);
  fs.writeFileSync(artifactFile, "reviewed image bytes");
  fs.writeFileSync(contactSheetFile, "changed contact sheet bytes");
  assert.throws(() => loadAndVerifyReviewManifest(manifestFile), /contact sheet changed or is missing/);
});
