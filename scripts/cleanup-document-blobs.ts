import { emptyDocumentBlobNamespace } from "../src/lib/document-storage";

emptyDocumentBlobNamespace().then(() => {
  console.info("Customer document Blob namespace cleaned.");
}).catch((error) => {
  console.error(error instanceof Error ? error.message : "Blob namespace cleanup failed");
  process.exitCode = 1;
});
