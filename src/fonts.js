import fs from "node:fs";
import path from "node:path";
import { RUNTIME_DIR } from "./paths.js";

const FONT_DIR = path.join(RUNTIME_DIR, "fonts");
const FONTS = [
  {
    name: "Anton-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
  },
  {
    name: "Oswald-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
  },
];

async function downloadFont(font) {
  const destination = path.join(FONT_DIR, font.name);
  if (fs.existsSync(destination) && fs.statSync(destination).size > 20_000) return destination;
  const response = await fetch(font.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`font download failed ${font.name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 20_000) throw new Error(`font download is unexpectedly small: ${font.name}`);
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, data, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return destination;
}

export async function ensureFonts() {
  const [anton, oswald] = await Promise.all(FONTS.map(downloadFont));
  return { anton, oswald };
}
