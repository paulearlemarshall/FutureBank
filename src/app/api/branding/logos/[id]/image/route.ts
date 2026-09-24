import { getCurrentUser } from "@/lib/auth/session";
import { getBrandLogoImage } from "@/lib/branding";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const image = await getBrandLogoImage(id);
  if (!image) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(image.stream, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
