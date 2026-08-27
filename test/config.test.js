import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadWorkspace,
  selectProducts,
  validateCatalog,
  validateProduct,
  validateProfile,
} from "../src/config.js";
import { fileSha256 } from "../src/hash.js";
import { ROOT, relativeToRoot } from "../src/paths.js";
import { validCatalog, validProduct, validProfile } from "./fixtures.js";

test("upload-ready profile requires an exact non-zero shop and taxonomy ID", () => {
  assert.doesNotThrow(() => validateProfile(validProfile(), { requireUploadReady: true }));
  assert.throws(
    () => validateProfile(validProfile({ expectedShopId: 0 }), { requireUploadReady: true }),
    /expectedShopId must be set before Etsy writes/,
  );
  assert.throws(
    () => validateProfile(validProfile({ listingDefaults: { taxonomyId: 0 } }), { requireUploadReady: true }),
    /taxonomyId must be set before Etsy writes/,
  );
});

test("profile rejects unsupported layouts and previous-shop marketing claims", () => {
  assert.throws(() => validateProfile(validProfile({ layoutVersion: "floating-v2" })), /unsupported layoutVersion/);
  assert.throws(
    () => validateProfile(validProfile({ brandName: "A 5 star average reading shop" })),
    /previous-shop marketing claim/,
  );
});

test("product validation enforces portable fields and Etsy tag rules", () => {
  assert.doesNotThrow(() => validateProduct(validProduct()));
  assert.throws(
    () => validateProduct(validProduct({ metadata: { sourceListingId: 123 } })),
    /forbidden old-shop field sourceListingId/,
  );
  assert.throws(
    () => validateProduct(validProduct({ tags: [...validProduct().tags.slice(0, 12), "love reading"] })),
    /tags must be unique/,
  );
  assert.throws(
    () => validateProduct(validProduct({ gallery: ["\/tmp\/private-customer-image.jpg"] })),
    /gallery file must be a portable repository-relative path/,
  );
});

test("catalog rejects duplicate product IDs and SKUs", () => {
  const first = validProduct();
  const duplicateId = validProduct({ sku: "NEW-LOVE-002" });
  assert.throws(() => validateCatalog(validCatalog([first, duplicateId])), /product IDs must be unique/);

  const duplicateSku = validProduct({ id: "career-reading-02" });
  assert.throws(() => validateCatalog(validCatalog([first, duplicateSku])), /catalog SKUs must be unique/);
});

test("product selection is explicit, ordered, and duplicate-safe", () => {
  const first = validProduct();
  const second = validProduct({ id: "career-reading-02", sku: "NEW-CAREER-002" });
  const catalog = validCatalog([first, second]);
  assert.deepEqual(
    selectProducts(catalog, "career-reading-02,love-reading-01").map((product) => product.id),
    ["career-reading-02", "love-reading-01"],
  );
  assert.throws(() => selectProducts(catalog, "missing-reading"), /unknown product IDs/);
  assert.throws(() => selectProducts(catalog, "love-reading-01,love-reading-01"), /selection contains duplicates/);
});

test("workspace pins the configured base character by SHA-256", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-character-config-"));
  const localAssets = path.join(ROOT, "local-assets");
  fs.mkdirSync(localAssets, { recursive: true });
  const characterDirectory = fs.mkdtempSync(path.join(localAssets, "test-character-"));
  context.after(() => {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(characterDirectory, { recursive: true, force: true });
  });
  const characterFile = path.join(characterDirectory, "character.svg");
  const characterAsset = relativeToRoot(characterFile);
  const profileFile = path.join(temporary, "shop.json");
  const catalogFile = path.join(temporary, "products.json");
  fs.writeFileSync(characterFile, '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"/>');
  fs.writeFileSync(catalogFile, JSON.stringify(validCatalog()));

  fs.writeFileSync(
    profileFile,
    JSON.stringify(validProfile({ characterAsset, characterSha256: "0".repeat(64) })),
  );
  assert.throws(() => loadWorkspace({ profileFile, catalogFile }), /character hash mismatch/);

  fs.writeFileSync(
    profileFile,
    JSON.stringify(validProfile({ characterAsset, characterSha256: fileSha256(characterFile) })),
  );
  const workspace = loadWorkspace({ profileFile, catalogFile });
  assert.equal(workspace.characterFile, characterFile);
  assert.equal(workspace.characterHash, fileSha256(characterFile));
});
