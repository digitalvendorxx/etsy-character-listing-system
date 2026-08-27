export const READING_LAYOUT = Object.freeze({
  version: "reading-1200x1500-v1",
  canvas: { width: 1200, height: 1500 },
  topBanner: { x: 185, y: 24, width: 833, height: 122 },
  textPanel: { x: 120, y: 500, width: 960, height: 660 },
  firstHeadline: { x: 0, y: 48, width: 960, height: 145 },
  secondHeadline: { x: 0, y: 245, width: 960, height: 145 },
  stars: { x: 0, y: 405, width: 960, height: 95 },
  subtitle: { x: 0, y: 505, width: 960, height: 78 },
});

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function headlineFontSize(value) {
  const length = [...String(value || "").trim()].length;
  if (length <= 5) return 205;
  if (length <= 7) return 195;
  if (length <= 10) return 164;
  if (length <= 12) return 156;
  if (length <= 14) return 148;
  if (length <= 18) return 136;
  return 118;
}

function safeAccent(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#8B5CF6";
}

export function buildThumbnailHtml({ product, characterDataUrl, antonDataUrl = "", oswaldDataUrl = "" }) {
  const [firstLine, secondLine] = product.thumbnail.lines.map((line) => String(line).trim().toUpperCase());
  const accent = safeAccent(product.thumbnail.accentColor);
  const antonFace = antonDataUrl
    ? `@font-face { font-family: AntonLocal; src: url('${antonDataUrl}') format('truetype'); }`
    : "";
  const oswaldFace = oswaldDataUrl
    ? `@font-face { font-family: OswaldLocal; src: url('${oswaldDataUrl}') format('truetype'); font-weight: 200 700; }`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${antonFace}
  ${oswaldFace}
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 1500px; overflow: hidden; background: #120b0b; }
  .canvas { position: relative; width: 1200px; height: 1500px; overflow: hidden; }
  .character { position: absolute; inset: 0; width: 1200px; height: 1500px; object-fit: cover; object-position: center; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(18,4,4,.04), rgba(18,4,4,.15)); }
  .top {
    position: absolute; left: 185px; top: 24px; width: 833px; height: 122px; border-radius: 30px;
    display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(5,3,3,.75);
    font: 600 58px OswaldLocal, "Arial Narrow", sans-serif; line-height: 1; white-space: nowrap;
    text-shadow: 0 4px 8px rgba(0,0,0,.65);
  }
  .panel {
    position: absolute; left: 120px; top: 500px; width: 960px; height: 660px; border-radius: 40px;
    background: rgba(4,3,3,.77); border: 2px solid rgba(225,205,180,.52);
    box-shadow: 0 16px 48px rgba(0,0,0,.25);
  }
  .line {
    position: absolute; left: 0; width: 960px; display: flex; align-items: center; justify-content: center;
    font-family: AntonLocal, Impact, sans-serif; line-height: .94; white-space: nowrap; text-align: center;
    text-shadow: 0 6px 8px rgba(0,0,0,.8);
  }
  .line span { display: inline-block; white-space: nowrap; transform-origin: center; }
  .first { top: 48px; height: 145px; color: #fff; font-size: ${headlineFontSize(firstLine)}px; }
  .second { top: 245px; height: 145px; color: ${accent}; font-size: ${headlineFontSize(secondLine)}px; }
  .stars {
    position: absolute; top: 405px; left: 0; width: 960px; height: 95px;
    display: flex; align-items: center; justify-content: center; gap: 14px; color: #ffd400;
  }
  .stars span { font: 84px Arial, sans-serif; line-height: 1; text-shadow: 0 5px 8px rgba(0,0,0,.75); }
  .subtitle {
    position: absolute; top: 505px; left: 0; width: 960px; height: 78px;
    display: flex; align-items: center; justify-content: center; color: #fff;
    font: 500 54px OswaldLocal, "Arial Narrow", sans-serif; line-height: 1; white-space: nowrap;
    text-align: center; text-shadow: 0 5px 8px rgba(0,0,0,.75);
  }
</style></head><body>
  <div class="canvas" data-layout="${READING_LAYOUT.version}">
    <img class="character" src="${characterDataUrl}" alt="">
    <div class="shade"></div>
    <div class="top" data-role="top-banner"><span>${escapeHtml(product.thumbnail.topBanner)}</span></div>
    <div class="panel" data-role="text-panel">
      <div class="line first" data-role="first-headline"><span>${escapeHtml(firstLine)}</span></div>
      <div class="line second" data-role="second-headline"><span>${escapeHtml(secondLine)}</span></div>
      <div class="stars" data-role="stars">${"<span>★</span>".repeat(5)}</div>
      <div class="subtitle" data-role="subtitle"><span>${escapeHtml(product.thumbnail.subtitle.toUpperCase())}</span></div>
    </div>
  </div>
</body></html>`;
}
