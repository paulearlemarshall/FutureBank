import Module from "node:module";

// The database workflow verifier invokes Server Actions outside a Next.js request.
// Keep Next request-only effects inert while it supplies an explicit API actor.
const originalLoad = Module._load;
Module._load = function loadForWorkflowVerification(request, parent, isMain) {
  if (request === "next/navigation") {
    return {
      redirect() { throw new Error("Unexpected redirect during API workflow verification."); },
      notFound() { throw new Error("Unexpected notFound during API workflow verification."); },
    };
  }
  if (request === "next/cache") {
    return { revalidatePath() {}, revalidateTag() {}, updateTag() {}, refresh() {} };
  }
  if (request === "next/headers") {
    return { headers: async () => new Headers(), cookies: async () => new Map() };
  }
  return originalLoad.call(this, request, parent, isMain);
};
