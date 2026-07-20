import { errorResponse, withApiAuth } from "@/lib/api/http";
import { routeApiRequest } from "@/lib/api/router";

type RouteContext = { params: Promise<{ segments?: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { segments = [] } = await context.params;
    return await withApiAuth(request, () => routeApiRequest(request, segments));
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
