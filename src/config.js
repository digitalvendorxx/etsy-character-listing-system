import fs from "node:fs";
import path from "node:path";
import { fileSha256, objectSha256 } from "./hash.js";
import { ROOT, fromRoot, relativeToRoot } from "./paths.js";

const FORBIDDEN_PRODUCT_KEYS = new Set([
  "sourceListingId",
  "sourcePhoto",
  "previousShopProof",
  "salesClaim",
  "ratingClaim",
  "photoProofClaim",
]);

export function loadDotEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertNoForbiddenKeys(value, prefix = "product") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRODUCT_KEYS.has(key)) throw new Error(`${prefix} contains forbidden old-shop field ${key}`);
    if (nested && typeof nested === "object") assertNoForbiddenKeys(nested, `${prefix}.${key}`);
  }
}

function textLength(value) {
  return [...String(value || "")].length;
}

function normalizedPortablePath(value, label, allowedRoots) {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  if (!normalized || path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`${label} must be a portable repository-relative path`);
  }
  if (!allowedRoots.some((root) => normalized.startsWith(`${root}/`))) {
    throw new Error(`${label} must live under ${allowedRoots.join(" or ")}`);
  }
  return normalized;
}

export function validateProfile(profile, { requireUploadReady = false } = {}) {
  assertObject(profile, "shop profile");
  if (profile.schemaVersion !== 1) throw new Error("shop profile schemaVersion must be 1");
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(String(profile.slug || ""))) {
    throw new Error("shop profile slug must use lowercase letters, numbers, and hyphens");
  }
  if (!Number.isSafeInteger(profile.expectedShopId) || profile.expectedShopId < 0) {
    throw new Error("expectedShopId must be a non-negative integer");
  }
  if (requireUploadReady && profile.expectedShopId <= 0) throw new Error("expectedShopId must be set before Etsy writes");
  if (!String(profile.brandName || "").trim()) throw new Error("brandName is required");
  if (textLength(profile.brandName) > 80) throw new Error("brandName must be at most 80 characters");
  if (profile.layoutVersion !== "reading-1200x1500-v1") {
    throw new Error("unsupported layoutVersion; expected reading-1200x1500-v1");
  }
  normalizedPortablePath(profile.characterAsset, "characterAsset", ["assets", "local-assets"]);
  if (!/^[a-f0-9]{64}$/.test(String(profile.characterSha256 || ""))) {
    throw new Error("characterSha256 must be an exact lowercase SHA-256");
  }
  assertObject(profile.listingDefaults, "listingDefaults");
  const defaults = profile.listingDefaults;
  if (!Number.isSafeInteger(defaults.quantity) || defaults.quantity < 1) throw new Error("listingDefaults.quantity must be positive");
  if (!String(defaults.whoMade || "")) throw new Error("listingDefaults.whoMade is required");
  if (!String(defaults.whenMade || "")) throw new Error("listingDefaults.whenMade is required");
  if (!Number.isSafeInteger(defaults.taxonomyId) || defaults.taxonomyId < 0) throw new Error("listingDefaults.taxonomyId is invalid");
  if (requireUploadReady && defaults.taxonomyId <= 0) throw new Error("listingDefaults.taxonomyId must be set before Etsy writes");
  for (const field of ["shippingProfileId", "returnPolicyId", "readinessStateId"]) {
    if (defaults[field] !== null && (!Number.isSafeInteger(defaults[field]) || defaults[field] <= 0)) {
      throw new Error(`listingDefaults.${field} must be null or a positive integer`);
    }
  }
  for (const field of ["processingMin", "processingMax"]) {
    if (!Number.isInteger(defaults[field]) || defaults[field] < 0) {
      throw new Error(`listingDefaults.${field} must be a non-negative integer`);
    }
  }
  if (defaults.processingMin > defaults.processingMax) {
    throw new Error("listingDefaults processingMin cannot exceed processingMax");
  }
  const serialized = JSON.stringify(profile);
  if (/12,?000\+?\s*sales|5\s*star\s*average|photo proof/i.test(serialized)) {
    throw new Error("profile contains an unapproved previous-shop marketing claim");
  }
  return profile;
}

export function validateProduct(product) {
  assertObject(product, "product");
  assertNoForbiddenKeys(product);
  if (!/^[a-z0-9][a-z0-9-]{2,72}$/.test(String(product.id || ""))) throw new Error("product.id is invalid");
  if (!String(product.sku || "").trim()) throw new Error(`product ${product.id} requires sku`);
  const titleLength = textLength(product.title);
  if (titleLength < 20 || titleLength > 140) throw new Error(`product ${product.id} title must be 20-140 characters`);
  if (textLength(product.description) < 180) throw new Error(`product ${product.id} description is too short`);
  if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) throw new Error(`product ${product.id} price is invalid`);
  if (!Array.isArray(product.tags) || product.tags.length !== 13) throw new Error(`product ${product.id} must have exactly 13 tags`);
  const normalizedTags = product.tags.map((tag) => String(tag || "").trim().toLowerCase());
  if (new Set(normalizedTags).size !== 13) throw new Error(`product ${product.id} tags must be unique`);
  for (const tag of normalizedTags) {
    if (!tag || textLength(tag) > 20) throw new Error(`product ${product.id} has an invalid Etsy tag: ${tag}`);
  }
  if (textLength(product.personalization) < 30) throw new Error(`product ${product.id} personalization is too short`);
  if (!String(product.altText || "").trim() || textLength(product.altText) > 250) {
    throw new Error(`product ${product.id} altText must be 1-250 characters`);
  }
  assertObject(product.thumbnail, `product ${product.id} thumbnail`);
  if (!Array.isArray(product.thumbnail.lines) || product.thumbnail.lines.length !== 2) {
    throw new Error(`product ${product.id} thumbnail requires exactly two headline lines`);
  }
  if (product.thumbnail.lines.some((line) => !String(line || "").trim() || textLength(line) > 24)) {
    throw new Error(`product ${product.id} thumbnail line is empty or too long`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(String(product.thumbnail.accentColor || ""))) {
    throw new Error(`product ${product.id} accentColor is invalid`);
  }
  if (!String(product.thumbnail.topBanner || "").trim() || textLength(product.thumbnail.topBanner) > 30) {
    throw new Error(`product ${product.id} topBanner must be 1-30 characters`);
  }
  if (!String(product.thumbnail.subtitle || "").trim() || textLength(product.thumbnail.subtitle) > 42) {
    throw new Error(`product ${product.id} subtitle must be 1-42 characters`);
  }
  if (!Array.isArray(product.gallery)) throw new Error(`product ${product.id} gallery must be an array`);
  if (product.gallery.length > 9) throw new Error(`product ${product.id} gallery may contain at most 9 images`);
  const normalizedGallery = [];
  for (const galleryFile of product.gallery) {
    normalizedGallery.push(normalizedPortablePath(galleryFile, `product ${product.id} gallery file`, ["local-assets/gallery"]));
  }
  if (new Set(normalizedGallery).size !== normalizedGallery.length) throw new Error(`product ${product.id} gallery files must be unique`);
  const serialized = JSON.stringify(product);
  if (/12,?000\+?\s*sales|5\s*star\s*average|photo proof/i.test(serialized)) {
    throw new Error(`product ${product.id} contains an unapproved previous-shop marketing claim`);
  }
  return product;
}

export function validateCatalog(catalog) {
  assertObject(catalog, "product catalog");
  if (catalog.schemaVersion !== 1) throw new Error("catalog schemaVersion must be 1");
  if (!/^[a-z0-9][a-z0-9._-]{2,64}$/i.test(String(catalog.catalogVersion || ""))) {
    throw new Error("catalogVersion is invalid");
  }
  if (!Array.isArray(catalog.products) || !catalog.products.length) throw new Error("catalog products are empty");
  catalog.products.forEach(validateProduct);
  const ids = catalog.products.map((product) => product.id);
  const skus = catalog.products.map((product) => product.sku);
  const titles = catalog.products.map((product) => product.title.trim().toLowerCase());
  if (new Set(ids).size !== ids.length) throw new Error("catalog product IDs must be unique");
  if (new Set(skus).size !== skus.length) throw new Error("catalog SKUs must be unique");
  if (new Set(titles).size !== titles.length) throw new Error("catalog titles must be unique");
  return catalog;
}

export function loadWorkspace({ profileFile, catalogFile, requireUploadReady = false } = {}) {
  loadDotEnv();
  const resolvedProfile = fromRoot(profileFile || process.env.SHOP_PROFILE || "config/shop.example.json");
  const resolvedCatalog = fromRoot(catalogFile || process.env.PRODUCT_CATALOG || "config/products.example.json");
  const profile = validateProfile(readJson(resolvedProfile), { requireUploadReady });
  const catalog = validateCatalog(readJson(resolvedCatalog));
  const characterFile = fromRoot(profile.characterAsset);
  if (!fs.existsSync(characterFile) || !fs.statSync(characterFile).isFile()) {
    throw new Error(`characterAsset does not exist: ${relativeToRoot(characterFile)}`);
  }
  const actualCharacterHash = fileSha256(characterFile);
  if (actualCharacterHash !== profile.characterSha256) {
    throw new Error(`character hash mismatch: expected ${profile.characterSha256}, got ${actualCharacterHash}`);
  }
  return {
    profile,
    catalog,
    profileFile: resolvedProfile,
    catalogFile: resolvedCatalog,
    characterFile,
    characterHash: actualCharacterHash,
    profileHash: objectSha256(profile),
    catalogHash: objectSha256(catalog),
  };
}

export function selectProducts(catalog, selector = "all") {
  if (!selector || selector === "all") return [...catalog.products];
  const requested = String(selector).split(",").map((value) => value.trim()).filter(Boolean);
  const selected = requested.map((id) => catalog.products.find((product) => product.id === id));
  const missing = requested.filter((_, index) => !selected[index]);
  if (missing.length) throw new Error(`unknown product IDs: ${missing.join(", ")}`);
  if (new Set(requested).size !== requested.length) throw new Error("product selection contains duplicates");
  return selected;
}
