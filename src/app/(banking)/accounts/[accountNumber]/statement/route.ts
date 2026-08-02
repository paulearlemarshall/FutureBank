import { renderAccountStatementCsv, defaultStatementPeriod } from "@/modules/domain/statement-policy";
import { BankingError } from "@/modules/services/errors";
import { getAccountStatement } from "@/modules/services/statements";

export async function GET(request: Request, { params }: { params: Promise<{ accountNumber: string }> }) {
  const { accountNumber } = await params;
  const url = new URL(request.url);
  const defaults = defaultStatementPeriod();
  try {
    const statement = await getAccountStatement({
      accountNumber,
      fromDate: url.searchParams.get("from") ?? defaults.fromDate,
      toDate: url.searchParams.get("to") ?? defaults.toDate,
    });
    return new Response(renderAccountStatementCsv(statement), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="FutureBank-${statement.accountNumber}-${statement.fromDate}-${statement.toDate}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof BankingError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 400 });
    throw error;
  }
}
