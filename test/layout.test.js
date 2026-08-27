import assert from "node:assert/strict";
import test from "node:test";

import { buildThumbnailHtml, escapeHtml, headlineFontSize, READING_LAYOUT } from "../src/layout.js";
import { validProduct } from "./fixtures.js";

test("reading layout keeps the 1200x1500 canvas and fixed text regions", () => {
  assert.deepEqual(READING_LAYOUT, {
    version: "reading-1200x1500-v1",
    canvas: { width: 1200, height: 1500 },
    topBanner: { x: 185, y: 24, width: 833, height: 122 },
    textPanel: { x: 120, y: 500, width: 960, height: 660 },
    firstHeadline: { x: 0, y: 48, width: 960, height: 145 },
    secondHeadline: { x: 0, y: 245, width: 960, height: 145 },
    stars: { x: 0, y: 405, width: 960, height: 95 },
    subtitle: { x: 0, y: 505, width: 960, height: 78 },
  });
});

test("thumbnail text is HTML-escaped while the layout remains fixed", () => {
  const product = validProduct({
    thumbnail: {
      topBanner: '<script data-x="1">& banner</script>',
      lines: ["<love>", "you & me"],
      subtitle: "it's <clear>",
    },
  });
  const html = buildThumbnailHtml({ product, characterDataUrl: "data:image/png;base64,AA==" });

  assert.equal(escapeHtml('<>&"\''), "&lt;&gt;&amp;&quot;&#39;");
  assert.doesNotMatch(html, /<script data-x=/);
  assert.match(html, /&lt;script data-x=&quot;1&quot;&gt;&amp; banner&lt;\/script&gt;/);
  assert.match(html, /&lt;LOVE&gt;/);
  assert.match(html, /YOU &amp; ME/);
  assert.match(html, /IT&#39;S &lt;CLEAR&gt;/);
  assert.match(html, /left: 120px; top: 500px; width: 960px; height: 660px/);
  assert.equal((html.match(/<span>★<\/span>/g) || []).length, 5);
});

test("headline sizing is deterministic at its important boundaries", () => {
  assert.equal(headlineFontSize("12345"), 205);
  assert.equal(headlineFontSize("123456"), 195);
  assert.equal(headlineFontSize("12345678"), 164);
  assert.equal(headlineFontSize("12345678901"), 156);
  assert.equal(headlineFontSize("1234567890123"), 148);
  assert.equal(headlineFontSize("123456789012345"), 136);
  assert.equal(headlineFontSize("1234567890123456789"), 118);
});

test("invalid accent colors fall back to the locked palette", () => {
  const html = buildThumbnailHtml({
    product: validProduct({ thumbnail: { accentColor: "red;position:fixed" } }),
    characterDataUrl: "data:image/png;base64,AA==",
  });
  assert.match(html, /\.second \{[^}]*color: #8B5CF6;/s);
  assert.doesNotMatch(html, /red;position:fixed/);
});
