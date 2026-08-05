import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const staticFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "speech-core.mjs",
  "news-reading-core.mjs",
  "learning-core.mjs",
  "campus-phrases.mjs",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of staticFiles) {
  await writeFile(join(output, file), await readFile(join(root, file)));
}

const newsOutput = join(output, "data", "news");
await mkdir(newsOutput, { recursive: true });
for (const file of await readdir(join(root, "data", "news"))) {
  if (!file.endsWith(".json")) continue;
  await writeFile(join(newsOutput, file), await readFile(join(root, "data", "news", file)));
}

const headers = `/*
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'

/data/news/*
  Cache-Control: public, max-age=300
`;

await writeFile(join(output, "_headers"), headers, "utf8");
