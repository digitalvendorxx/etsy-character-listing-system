import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileSha256, objectSha256 } from "./hash.js";
import { loadAndVerifyReviewManifest } from "./renderer.js";
import { ROOT, RUNTIME_DIR, fromRoot } from "./paths.js";

const ETSY_API_BASE = "https://api.etsy.com";
const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const TOKEN_FILE = path.join(RUNTIME_DIR, "etsy-token.json");
const AUTH_PENDING_FILE = path.join(RUNTIME_DIR, "etsy-auth-pending.json");
const DEFAULT_SCOPES = ["listings_r", "listings_w", "shops_r"];
let lastRequestAt = 0;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required in .env`);
  return value;
}

function apiKeyHeader() {
  const key = requiredEnv("ETSY_KEYSTRING");
  const secret = String(process.env.ETSY_SHARED_SECRET || "").trim();
  return secret ? `${key}:${secret}` : key;
}

function writePrivateJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) throw new Error("Etsy token is missing; run npm run auth first");
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

async function pace() {
  const wait = Math.max(0, lastRequestAt + 1_050 - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

function formBody(values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return body;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function tokenRequest(values) {
  await pace();
  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: formBody(values),
    signal: AbortSignal.timeout(30_000),
  });
  lastRequestAt = Date.now();
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`Etsy token request failed (${response.status})`);
  return { ...data, obtained_at: Date.now(), expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
}

async function refreshToken(current = readToken()) {
  if (!current.refresh_token) throw new Error("Etsy refresh token is missing");
  const refreshed = await tokenRequest({
    grant_type: "refresh_token",
    client_id: requiredEnv("ETSY_KEYSTRING"),
    refresh_token: current.refresh_token,
  });
  const merged = { ...current, ...refreshed };
  writePrivateJson(TOKEN_FILE, merged);
  return merged;
}

async function ensureToken() {
  const token = readToken();
  if (token.expires_at && Date.now() >= Number(token.expires_at) - 120_000) return refreshToken(token);
  return token;
}

async function apiRequest(pathname, { method = "GET", query = {}, form, json, multipart, retryAuth = true } = {}) {
  const token = await ensureToken();
  const url = new URL(pathname, ETSY_API_BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers = { "x-api-key": apiKeyHeader(), Authorization: `Bearer ${token.access_token}` };
  let body;
  if (form) {
    body = formBody(form);
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
  } else if (json) {
    body = JSON.stringify(json);
    headers["Content-Type"] = "application/json; charset=utf-8";
  } else if (multipart) {
    body = multipart;
  }
  await pace();
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(60_000) });
  lastRequestAt = Date.now();
  const data = await parseResponse(response);
  if (response.status === 401 && retryAuth && token.refresh_token) {
    await refreshToken(token);
    return apiRequest(pathname, { method, query, form, json, multipart, retryAuth: false });
  }
  if (!response.ok) throw new Error(`${method} ${url.pathname} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

function base64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomToken(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function sha256Base64Url(value) {
  return base64Url(crypto.createHash("sha256").update(value).digest());
}

function openUrl(url) {
  if (process.platform === "darwin") execFile("open", [url], () => {});
  else if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url], () => {});
  else execFile("xdg-open", [url], () => {});
}

function extractCode(value) {
  try {
    const url = new URL(value);
    return url.searchParams.get("code") || value;
  } catch {
    return value;
  }
}

export async function authLocal({ port = 3000 } = {}) {
  const clientId = requiredEnv("ETSY_KEYSTRING");
  const redirectUri = String(process.env.ETSY_REDIRECT_URI || `http://localhost:${port}/callback`);
  const redirect = new URL(redirectUri);
  const scopes = String(process.env.ETSY_SCOPES || DEFAULT_SCOPES.join(","))
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const codeVerifier = randomToken(64);
  const state = randomToken(24);
  const authUrl = new URL(ETSY_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  writePrivateJson(AUTH_PENDING_FILE, { clientId, redirectUri, codeVerifier, state, createdAt: new Date().toISOString() });

  let authorizationError = null;
  const server = http.createServer(async (request, response) => {
    const callback = new URL(request.url || "/", redirectUri);
    if (callback.pathname !== redirect.pathname) {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      if (callback.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
      const code = extractCode(callback.toString());
      const token = await tokenRequest({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      });
      writePrivateJson(TOKEN_FILE, token);
      if (fs.existsSync(AUTH_PENDING_FILE)) fs.unlinkSync(AUTH_PENDING_FILE);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Etsy authorization complete. You can close this tab.");
    } catch (error) {
      authorizationError = error;
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Etsy authorization failed: ${error.message}`);
    } finally {
      server.close();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(redirect.port || port), redirect.hostname, resolve);
  });
  console.log(`Open Etsy authorization: ${authUrl.toString().replaceAll("+", "%20")}`);
  openUrl(authUrl.toString());
  await new Promise((resolve) => server.once("close", resolve));
  if (authorizationError) throw authorizationError;
}

export async function whoami() {
  return apiRequest("/v3/application/users/me");
}

export function buildDraftPayload(profile, product) {
  const defaults = profile.listingDefaults;
  return {
    quantity: defaults.quantity,
    title: product.title,
    description: product.description,
    price: Number(product.price).toFixed(2),
    who_made: defaults.whoMade,
    when_made: defaults.whenMade,
    taxonomy_id: defaults.taxonomyId,
    shipping_profile_id: defaults.shippingProfileId,
    return_policy_id: defaults.returnPolicyId,
    tags: product.tags,
    should_auto_renew: defaults.shouldAutoRenew,
    is_supply: defaults.isSupply,
    processing_min: defaults.processingMin,
    processing_max: defaults.processingMax,
    readiness_state_id: defaults.readinessStateId,
  };
}

async function findExactTitle(shopId, title) {
  for (const state of ["draft", "inactive", "active"]) {
    for (let offset = 0; ; ) {
      const data = await apiRequest(`/v3/application/shops/${shopId}/listings`, { query: { state, limit: 100, offset } });
      const results = data?.results || [];
      const match = results.find((listing) => String(listing.title || "").trim() === title.trim());
      if (match) return match;
      if (results.length < 100) break;
      offset += results.length;
    }
  }
  return null;
}

async function uploadImage(shopId, listingId, file, rank, altText, { overwrite = false } = {}) {
  if (!fs.existsSync(file)) throw new Error(`listing image is missing: ${file}`);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > 20 * 1024 * 1024) throw new Error(`listing image size is invalid: ${file}`);
  const extension = path.extname(file).toLowerCase();
  const contentType = extension === ".png" ? "image/png" : "image/jpeg";
  if (![".png", ".jpg", ".jpeg"].includes(extension)) throw new Error(`listing image type is unsupported: ${file}`);
  const form = new FormData();
  form.set("image", new Blob([fs.readFileSync(file)], { type: contentType }), path.basename(file));
  form.set("rank", String(rank));
  if (overwrite) form.set("overwrite", "true");
  if (altText) form.set("alt_text", altText.slice(0, 250));
  return apiRequest(`/v3/application/shops/${shopId}/listings/${listingId}/images`, { method: "POST", multipart: form });
}

async function setPersonalization(shopId, listingId, instructions) {
  return apiRequest(`/v3/application/shops/${shopId}/listings/${listingId}/personalization`, {
    method: "POST",
    query: { supports_multiple_personalization_questions: "true" },
    json: {
      personalization_questions: [
        {
          question_text: "Personalization",
          instructions,
          question_type: "text_input",
          required: true,
          max_allowed_characters: 1024,
        },
      ],
    },
  });
}

function stateFile(profile) {
  return path.join(RUNTIME_DIR, profile.slug, "draft-state.json");
}

function loadState(profile) {
  const file = stateFile(profile);
  if (!fs.existsSync(file)) return { schemaVersion: 2, shopId: profile.expectedShopId, packages: {}, products: {} };
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  if (state.schemaVersion !== 2 || Number(state.shopId) !== Number(profile.expectedShopId)) {
    throw new Error("runtime state belongs to a different shop or schema");
  }
  if (!state.packages || typeof state.packages !== "object" || !state.products || typeof state.products !== "object") {
    throw new Error("runtime state is incomplete");
  }
  return state;
}

function saveState(profile, state) {
  const file = stateFile(profile);
  state.updatedAt = new Date().toISOString();
  writePrivateJson(file, state);
}

export async function uploadDraftProducts(workspace, products, { apply = false, expectedShopId, reviewFile, reviewHash } = {}) {
  if (apply !== true) throw new Error("Etsy draft writes require explicit apply=true");
  const expected = Number(expectedShopId);
  if (!Number.isInteger(expected) || expected <= 0 || expected !== workspace.profile.expectedShopId) {
    throw new Error("--expected-shop-id must exactly match the upload-ready shop profile");
  }
  const manifest = loadAndVerifyReviewManifest(reviewFile);
  if (manifest.reviewHash !== reviewHash) throw new Error("--review-hash does not match the reviewed package");
  if (manifest.shop.expectedShopId !== expected || manifest.shop.slug !== workspace.profile.slug) {
    throw new Error("review package belongs to a different shop");
  }
  if (manifest.character.sha256 !== workspace.characterHash || manifest.layout.version !== workspace.profile.layoutVersion) {
    throw new Error("character or layout changed after manual review");
  }
  if (
    manifest.shop.profileSha256 !== workspace.profileHash ||
    manifest.catalog.sha256 !== workspace.catalogHash ||
    manifest.catalog.version !== workspace.catalog.catalogVersion
  ) {
    throw new Error("shop profile or product catalog changed after manual review");
  }
  const me = await whoami();
  if (Number(me.shop_id) !== expected) throw new Error(`authenticated Etsy shop ${me.shop_id} does not match expected shop ${expected}`);

  const state = loadState(workspace.profile);
  state.packages[reviewHash] = {
    catalogVersion: workspace.catalog.catalogVersion,
    catalogSha256: workspace.catalogHash,
    characterSha256: workspace.characterHash,
    layoutVersion: workspace.profile.layoutVersion,
    acceptedAt: state.packages[reviewHash]?.acceptedAt || new Date().toISOString(),
  };
  saveState(workspace.profile, state);

  const results = [];
  for (const product of products) {
    const reviewed = manifest.products.find((item) => item.id === product.id);
    if (!reviewed) throw new Error(`product ${product.id} is not in the reviewed package`);
    if (reviewed.productSha256 !== objectSha256(product)) throw new Error(`product ${product.id} changed after review`);
    if (reviewed.gallery.length !== product.gallery.length) throw new Error(`gallery changed after review for ${product.id}`);

    const prior = state.products[product.id];
    if (prior?.reviewHash && prior.reviewHash !== reviewHash) {
      if (prior.status === "draft_verified" && prior.productSha256 === reviewed.productSha256) {
        results.push({ productId: product.id, listingId: prior.listingId, state: "unchanged_previous_package", skipped: true });
        continue;
      }
      throw new Error(`product ${product.id} is pinned to a different review package; manual reconciliation required`);
    }
    if (prior?.status === "draft_verified" && prior.reviewHash === reviewHash) {
      results.push({ productId: product.id, listingId: prior.listingId, state: "draft_verified", skipped: true });
      continue;
    }
    state.products[product.id] = {
      ...prior,
      reviewHash,
      productSha256: reviewed.productSha256,
      characterSha256: workspace.characterHash,
      layoutVersion: workspace.profile.layoutVersion,
    };
    saveState(workspace.profile, state);

    let listingId = Number(state.products[product.id]?.listingId || 0);
    if (!listingId) {
      const existing = await findExactTitle(expected, product.title);
      if (existing) throw new Error(`listing title already exists (${existing.listing_id}); manual reconciliation required`);
      state.products[product.id] = { ...state.products[product.id], status: "create_attempting", attemptedAt: new Date().toISOString() };
      saveState(workspace.profile, state);
      const created = await apiRequest(`/v3/application/shops/${expected}/listings`, {
        method: "POST",
        form: buildDraftPayload(workspace.profile, product),
      });
      listingId = Number(created.listing_id);
      if (!listingId) throw new Error(`Etsy did not return a listing ID for ${product.id}`);
      state.products[product.id] = { ...state.products[product.id], listingId, status: "draft_created", createdAt: new Date().toISOString() };
      saveState(workspace.profile, state);
    } else {
      const existing = await apiRequest(`/v3/application/listings/${listingId}`, { query: { includes: "Images" } });
      if (Number(existing.shop_id) !== expected || existing.state !== "draft") {
        throw new Error(`saved listing ${listingId} is not a draft in the expected shop`);
      }
    }

    let currentListing = await apiRequest(`/v3/application/listings/${listingId}`, { query: { includes: "Images" } });
    let currentRanks = new Set((currentListing.images || []).map((image) => Number(image.rank)));
    const thumbnailFile = fromRoot(reviewed.artifact.file);
    if (fileSha256(thumbnailFile) !== reviewed.artifact.sha256) throw new Error(`thumbnail changed for ${product.id}`);
    await uploadImage(expected, listingId, thumbnailFile, 1, product.altText, { overwrite: currentRanks.has(1) });
    for (const gallery of reviewed.gallery) {
      currentListing = await apiRequest(`/v3/application/listings/${listingId}`, { query: { includes: "Images" } });
      currentRanks = new Set((currentListing.images || []).map((image) => Number(image.rank)));
      const galleryFile = fromRoot(gallery.file);
      if (fileSha256(galleryFile) !== gallery.sha256) throw new Error(`gallery image changed for ${product.id}`);
      await uploadImage(expected, listingId, galleryFile, gallery.rank, undefined, { overwrite: currentRanks.has(gallery.rank) });
    }
    await setPersonalization(expected, listingId, product.personalization);

    let verified = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_500));
      const listing = await apiRequest(`/v3/application/listings/${listingId}`, { query: { includes: "Images" } });
      const personalization = await apiRequest(`/v3/application/listings/${listingId}/personalization`);
      const imageRanks = (listing.images || []).map((image) => Number(image.rank)).sort((a, b) => a - b);
      const expectedRanks = Array.from({ length: 1 + reviewed.gallery.length }, (_, index) => index + 1);
      const firstImage = (listing.images || []).find((image) => Number(image.rank) === 1);
      const priceDivisor = Number(listing.price?.divisor || 100);
      const question = personalization?.personalization_questions?.[0];
      if (
        Number(listing.shop_id) === expected &&
        listing.state === "draft" &&
        listing.title === product.title &&
        normalizeEtsyText(listing.description) === normalizeEtsyText(product.description) &&
        JSON.stringify(listing.tags || []) === JSON.stringify(product.tags) &&
        Number(listing.price?.amount) === Math.round(Number(product.price) * priceDivisor) &&
        JSON.stringify(imageRanks) === JSON.stringify(expectedRanks) &&
        Number(firstImage?.full_width) * 5 === Number(firstImage?.full_height) * 4 &&
        question?.required === true &&
        normalizeEtsyText(question?.instructions) === normalizeEtsyText(product.personalization)
      ) {
        verified = listing;
        break;
      }
    }
    if (!verified) throw new Error(`draft verification failed for listing ${listingId}`);
    state.products[product.id] = {
      ...state.products[product.id],
      status: "draft_verified",
      verifiedAt: new Date().toISOString(),
      listingUrl: verified.url || null,
    };
    saveState(workspace.profile, state);
    results.push({ productId: product.id, listingId, state: verified.state, imageCount: verified.images.length });
  }
  return results;
}

function normalizeEtsyText(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

export const __test = { formBody };
