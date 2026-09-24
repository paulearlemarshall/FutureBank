import { NextResponse } from "next/server";
import { requireAuthenticatedActionUser } from "@/lib/auth/session";
import { deleteBrandLogo, selectBrandLogo, uploadBrandLogo } from "@/lib/branding";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const actor = await requireAuthenticatedActionUser();
      if (actor.role !== "ADMIN") throw new Error("FORBIDDEN");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
      const logo = await uploadBrandLogo(file, actor.id);
      return NextResponse.json({ logo }, { headers: { "Cache-Control": "no-store" } });
    }

    const actor = await requireAuthenticatedActionUser();
    if (actor.role !== "ADMIN") throw new Error("FORBIDDEN");
    const body = await request.json() as { intent?: string; id?: string };
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Choose a logo." }, { status: 400 });
    if (body.intent === "select") await selectBrandLogo(body.id);
    else if (body.intent === "delete") await deleteBrandLogo(body.id);
    else return NextResponse.json({ error: "Unsupported logo action." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BRANDING_FAILED";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : message === "LOGO_NOT_FOUND" ? 404 : 400;
    const text = message === "INVALID_SIZE" ? "Logo must be between 1 byte and 3 MB." : message === "INVALID_IMAGE" ? "Upload a valid PNG, JPEG or WebP image." : message === "LOGO_NOT_FOUND" ? "That logo is no longer available." : "The logo change could not be completed.";
    return NextResponse.json({ error: text }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
