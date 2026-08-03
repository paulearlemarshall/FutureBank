import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { renderGuide, contentHash } from "./generate-api-guide.mjs";

const root = path.resolve(import.meta.dirname, "..");
const documentationFiles = [
  "AGENTS.md",
  "README.md",
  ...(await readdir(path.join(root, "docs"))).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`),
];
const requiredOwnerPaths = [
  ".github/workflows/ci.yml",
  "e2e/customer-documents.spec.ts",
  "e2e/selector-contract.spec.ts",
  "openapi/futurebank.v1.json",
  "openapi/futurebank.v1.source.json",
  "scripts/verify-db.ts",
  "src/app/api/v1",
  "src/db/schema.ts",
  "src/db/seed-manifest.ts",
  "src/db/seed.ts",
  "src/modules/domain",
  "src/modules/services",
];
const supersededClaims = [
  /not covered by automated CI/i,
  /README doesn't mention BLOB_READ_WRITE_TOKEN/i,
  /reset (?:is|remains) opt-in/i,
  /exactly five customers/i,
  /exactly fourteen accounts/i,
];
const errors = [];

async function exists(target) {
  try { await access(target, constants.F_OK); return true; }
  catch { return false; }
}

for (const relativeFile of documentationFiles) {
  const absoluteFile = path.join(root, relativeFile);
  const body = await readFile(absoluteFile, "utf8");
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(absoluteFile), decodeURIComponent(target));
    if (!(await exists(resolved))) errors.push(`${relativeFile}: missing Markdown target ${match[1]}`);
  }
  for (const pattern of supersededClaims) {
    if (pattern.test(body)) errors.push(`${relativeFile}: contains superseded claim ${pattern}`);
  }
}

for (const relativePath of requiredOwnerPaths) {
  if (!(await exists(path.join(root, relativePath)))) errors.push(`Missing routed owner path: ${relativePath}`);
}
if (await exists(path.join(root, "CLAUDE.md"))) errors.push("CLAUDE.md is a superseded review journal; keep durable guidance with its owning contract.");

const guidePath = path.join(root, "docs", "FutureBank-API-Guide.docx");
if (await exists(guidePath)) {
  const [committed, generated] = await Promise.all([readFile(guidePath), renderGuide()]);
  if (contentHash(committed) !== contentHash(generated)) {
    errors.push("docs/FutureBank-API-Guide.docx is stale; run npm run api-guide:generate and commit the regenerated file.");
  }
} else {
  errors.push("docs/FutureBank-API-Guide.docx is missing; run npm run api-guide:generate and commit the file.");
}

const readme = await readFile(path.join(root, "README.md"), "utf8");
const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
for (const [name, body] of [["README.md", readme], ["AGENTS.md", agents]]) {
  if (!/nine customers and nineteen accounts/i.test(body)) errors.push(`${name}: missing the current reset baseline count.`);
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.info(`Documentation verification passed for ${documentationFiles.length} files and ${requiredOwnerPaths.length} routed owner paths.`);
}
