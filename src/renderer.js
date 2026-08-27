import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ensureFonts } from "./fonts.js";
import { fileSha256, objectSha256 } from "./hash.js";
import { buildThumbnailHtml, READING_LAYOUT } from "./layout.js";
import { ROOT, fromRoot, relativeToRoot } from "./paths.js";

function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".ttf") return "font/ttf";
  throw new Error(`unsupported asset type: ${extension || "none"}`);
}

export function dataUrl(file) {
  return `data:${mimeFor(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

export async function inspectImage(file, existingBrowser = null) {
  const browser = existingBrowser || (await chromium.launch({ headless: true }));
  const page = await browser.newPage();
  try {
    const dimensions = await page.evaluate(
      (source) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => reject(new Error("image could not be decoded"));
          image.src = source;
        }),
      dataUrl(file),
    );
    return { ...dimensions, sha256: fileSha256(file), file: relativeToRoot(file) };
  } finally {
    await page.close();
    if (!existingBrowser) await browser.close();
  }
}

export async function assertCharacterDimensions(file, existingBrowser = null) {
  const inspection = await inspectImage(file, existingBrowser);
  if (inspection.width !== READING_LAYOUT.canvas.width || inspection.height !== READING_LAYOUT.canvas.height) {
    throw new Error(
      `base character is ${inspection.width}x${inspection.height}; expected ${READING_LAYOUT.canvas.width}x${READING_LAYOUT.canvas.height}`,
    );
  }
  return inspection;
}

async function fitText(page) {
  await page.evaluate(() => {
    for (const container of document.querySelectorAll(".line, .top, .subtitle")) {
      const text = container.querySelector("span");
      if (!text) continue;
      const maxWidth = container.clientWidth - 30;
      let fontSize = Number.parseFloat(getComputedStyle(container).fontSize);
      while (text.getBoundingClientRect().width > maxWidth && fontSize > 32) {
        fontSize = Math.max(32, fontSize - 2);
        container.style.fontSize = `${fontSize}px`;
      }
      if (text.getBoundingClientRect().width > maxWidth) {
        const scale = maxWidth / text.getBoundingClientRect().width;
        text.style.transform = `scaleX(${scale})`;
      }
    }
  });
}

export async function renderProducts(workspace, products, { outputDir } = {}) {
  const destinationRoot = fromRoot(outputDir || path.join("output", workspace.profile.slug));
  fs.mkdirSync(destinationRoot, { recursive: true });
  const fonts = await ensureFonts();
  const browser = await chromium.launch({ headless: true });
  const character = await assertCharacterDimensions(workspace.characterFile, browser);
  const artifacts = [];
  try {
    for (const product of products) {
      const productDir = path.join(destinationRoot, product.id);
      fs.mkdirSync(productDir, { recursive: true });
      const destination = path.join(productDir, "thumbnail.jpg");
      const page = await browser.newPage({ viewport: READING_LAYOUT.canvas });
      try {
        const html = buildThumbnailHtml({
          product,
          characterDataUrl: dataUrl(workspace.characterFile),
          antonDataUrl: dataUrl(fonts.anton),
          oswaldDataUrl: dataUrl(fonts.oswald),
        });
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => true));
        await fitText(page);
        await page.screenshot({ path: destination, type: "jpeg", quality: 94 });
      } finally {
        await page.close();
      }
      const rendered = await inspectImage(destination, browser);
      if (rendered.width !== 1200 || rendered.height !== 1500) {
        throw new Error(`rendered thumbnail for ${product.id} has unexpected dimensions`);
      }
      artifacts.push({
        productId: product.id,
        file: relativeToRoot(destination),
        sha256: rendered.sha256,
        width: rendered.width,
        height: rendered.height,
      });
    }
  } finally {
    await browser.close();
  }
  return { destinationRoot, character, artifacts };
}

export async function renderContactSheet(artifacts, destinationRoot) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 920, height: 700 } });
  const destination = path.join(destinationRoot, "contact-sheet.png");
  try {
    const cards = artifacts
      .map((artifact) => {
        const absolute = fromRoot(artifact.file);
        return `<figure><img src="${dataUrl(absolute)}" alt=""><figcaption>${artifact.productId}</figcaption></figure>`;
      })
      .join("");
    await page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}body{margin:0;padding:30px;background:#17131d;color:#fff;font:22px Arial,sans-serif}
      main{display:grid;grid-template-columns:repeat(2,400px);gap:28px;align-items:start}
      figure{margin:0;background:#28202f;border-radius:16px;padding:14px;box-shadow:0 10px 30px #0008}
      img{display:block;width:372px;height:465px;object-fit:cover;border-radius:10px}figcaption{padding:12px 4px 2px;text-align:center}
    </style><main>${cards}</main>`, { waitUntil: "load" });
    await page.screenshot({ path: destination, type: "png", fullPage: true });
  } finally {
    try {
      await page.close();
    } finally {
      await browser.close();
    }
  }
  return { file: relativeToRoot(destination), sha256: fileSha256(destination) };
}

export function calculateReviewHash(manifest) {
  const { reviewHash: _reviewHash, ...reviewed } = manifest;
  return objectSha256(reviewed);
}

export function verifyReviewManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error("review manifest schema is invalid");
  if (!Array.isArray(manifest.products) || !manifest.products.length) throw new Error("review manifest products are empty");
  const ids = manifest.products.map((product) => product.id);
  if (new Set(ids).size !== ids.length) throw new Error("review manifest product IDs must be unique");
  const calculated = calculateReviewHash(manifest);
  if (calculated !== manifest.reviewHash) throw new Error("review manifest hash does not match its contents");
  return calculated;
}

export async function packageReview(workspace, products, options = {}) {
  const rendered = await renderProducts(workspace, products, options);
  const contactSheet = await renderContactSheet(rendered.artifacts, rendered.destinationRoot);
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    shop: {
      slug: workspace.profile.slug,
      expectedShopId: workspace.profile.expectedShopId,
      brandName: workspace.profile.brandName,
      profileSha256: workspace.profileHash,
    },
    catalog: {
      version: workspace.catalog.catalogVersion,
      sha256: workspace.catalogHash,
    },
    layout: READING_LAYOUT,
    character: {
      file: relativeToRoot(workspace.characterFile),
      sha256: workspace.characterHash,
      width: rendered.character.width,
      height: rendered.character.height,
    },
    products: products.map((product) => {
      const gallery = product.gallery.map((galleryFile, index) => {
        const absolute = fromRoot(galleryFile);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
          throw new Error(`gallery image is missing for ${product.id}: ${galleryFile}`);
        }
        if (!/[.](png|jpe?g)$/i.test(absolute)) throw new Error(`gallery image type is unsupported: ${galleryFile}`);
        const size = fs.statSync(absolute).size;
        if (size < 1 || size > 20 * 1024 * 1024) throw new Error(`gallery image size is invalid: ${galleryFile}`);
        return { rank: index + 2, file: relativeToRoot(absolute), sha256: fileSha256(absolute), bytes: size };
      });
      return {
        id: product.id,
        sku: product.sku,
        title: product.title,
        price: product.price,
        tags: product.tags,
        productSha256: objectSha256(product),
        artifact: rendered.artifacts.find((artifact) => artifact.productId === product.id),
        gallery,
      };
    }),
    contactSheet,
  };
  manifest.reviewHash = calculateReviewHash(manifest);
  const file = path.join(rendered.destinationRoot, "review-manifest.json");
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return { file, manifest };
}

export function loadAndVerifyReviewManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  verifyReviewManifest(manifest);
  const resolveReviewedFile = (value, allowedPrefix) => {
    const normalized = String(value || "").replaceAll("\\", "/");
    if (path.isAbsolute(normalized) || normalized.split("/").includes("..") || !normalized.startsWith(allowedPrefix)) {
      throw new Error(`review manifest contains an unsafe asset path: ${normalized}`);
    }
    return fromRoot(normalized);
  };
  for (const product of manifest.products) {
    if (!product.artifact || !Array.isArray(product.gallery)) throw new Error(`reviewed assets are incomplete for ${product.id}`);
    if (!/^[a-f0-9]{64}$/.test(String(product.artifact.sha256 || ""))) throw new Error(`reviewed thumbnail hash is invalid for ${product.id}`);
    const artifactFile = resolveReviewedFile(product.artifact.file, "output/");
    if (!fs.existsSync(artifactFile) || fileSha256(artifactFile) !== product.artifact.sha256) {
      throw new Error(`reviewed thumbnail changed or is missing for ${product.id}`);
    }
    for (let index = 0; index < product.gallery.length; index += 1) {
      const gallery = product.gallery[index];
      if (gallery.rank !== index + 2 || !/^[a-f0-9]{64}$/.test(String(gallery.sha256 || ""))) {
        throw new Error(`reviewed gallery metadata is invalid for ${product.id}`);
      }
      const galleryFile = resolveReviewedFile(gallery.file, "local-assets/gallery/");
      if (!fs.existsSync(galleryFile) || fileSha256(galleryFile) !== gallery.sha256) {
        throw new Error(`reviewed gallery image changed or is missing for ${product.id}`);
      }
    }
  }
  const contactSheetFile = resolveReviewedFile(manifest.contactSheet?.file, "output/");
  if (!fs.existsSync(contactSheetFile) || fileSha256(contactSheetFile) !== manifest.contactSheet.sha256) {
    throw new Error("reviewed contact sheet changed or is missing");
  }
  return manifest;
}

export function defaultReviewFile(profile) {
  return path.join(ROOT, "output", profile.slug, "review-manifest.json");
}
