import SwaggerParser from "@apidevtools/swagger-parser";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const source = new URL("../openapi/futurebank.v1.source.json", import.meta.url);
const artifact = new URL("../openapi/futurebank.v1.json", import.meta.url);
const document = JSON.parse(await readFile(source, "utf8"));
const rendered = `${JSON.stringify(document, null, 2)}\n`;

await SwaggerParser.validate(structuredClone(document));

if (process.argv.includes("--check")) {
  const committed = await readFile(artifact, "utf8");
  if (committed !== rendered) {
    console.error("The committed OpenAPI artifact is stale. Run npm run openapi:generate and commit the result.");
    process.exitCode = 1;
  } else {
    console.info("OpenAPI source is valid and the committed artifact is current.");
  }
} else {
  await writeFile(artifact, rendered, "utf8");
  console.info("Generated openapi/futurebank.v1.json from its canonical source.");
}
