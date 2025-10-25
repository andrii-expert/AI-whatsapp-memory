import { trpc, getQueryClient } from "@/trpc/server";
import type { RouterOutputs } from "@api/trpc/routers/_app";
import { renderToStream } from "@react-pdf/renderer";
import { InvoiceTemplate } from "@/components/pdf/invoice-template";
import type { NextRequest } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().optional(),
  token: z.string().optional(),
  preview: z.preprocess((val) => val === "true", z.boolean().default(false)),
});

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);

  const result = paramsSchema.safeParse(
    Object.fromEntries(requestUrl.searchParams.entries()),
  );

  if (!result.success) {
    return new Response("Invalid parameters", { status: 400 });
  }

  const queryClient = getQueryClient();

  const { id, token, preview } = result.data;

  let data: RouterOutputs["invoices"]["getForPdf"] | null = null;

  if (id) {
    data = await queryClient.fetchQuery(
      trpc.invoices.getForPdf.queryOptions({ id }),
    );
  } else if (token) {
    // TODO: Implement getInvoiceByToken method
    // data = await queryClient.fetchQuery(
    //   trpc.invoices.getInvoiceByToken.queryOptions({ token }),
    // );
  }

  if (!data) {
    return new Response("Invoice not found", { status: 404 });
  }

  const stream = await renderToStream(<InvoiceTemplate data={data} />);

  // @ts-expect-error - stream is not assignable to BodyInit
  const blob = await new Response(stream).blob();

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Cache-Control": "no-store, max-age=0",
  };

  if (!preview) {
    headers["Content-Disposition"] =
      `attachment; filename="${data.invoice.number}.pdf"`;
  }

  return new Response(blob, { headers });
}