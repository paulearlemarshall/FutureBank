import specification from "../../../../openapi/futurebank.v1.json";

export function GET(): Response {
  return Response.json(specification, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
