import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { useMemo } from "react";

import { formatPct, formatUsd } from "@/lib/format";
import { makeRoiReceipt } from "@/mocks";

export const Route = createFileRoute("/_app/revenue/receipt/$month")({
  component: RoiReceiptRoute,
});

function RoiReceiptRoute() {
  const { month } = Route.useParams();
  const receipt = useMemo(() => makeRoiReceipt(month), [month]);

  const sumPerAgent = receipt.perAgent.reduce((a, p) => a + p.recovered, 0);
  const maxRecovered = Math.max(...receipt.perAgent.map((p) => p.recovered));

  function print() {
    window.print();
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-soft-hairline/60 print:bg-paper-white">
      <div className="mx-auto max-w-[920px] px-8 py-8 print:p-0">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link to="/home" className="inline-flex items-center gap-1 text-[12px] text-mute-slate hover:text-foreground">
            <ChevronLeft size={12} /> Back to home
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={print} className="gap-1.5">
              <Printer size={14} /> Print
            </Button>
            <Button className="gap-1.5">
              <Download size={14} /> Download PDF
            </Button>
          </div>
        </div>

        <article
          className="mx-auto bg-paper-white p-12 shadow-[0_24px_64px_rgba(11,18,32,0.06)] print:shadow-none"
          style={{ aspectRatio: "794 / 1123", maxHeight: 1123 }}
        >
          <header className="flex items-start justify-between border-b pb-6">
            <div>
              <Eyebrow>Monthly ROI receipt · {receipt.month}</Eyebrow>
              <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">
                Calderon HVAC
              </h1>
              <p className="mt-1 text-[12px] text-mute-slate">
                Voice agent operations summary · prepared by Kuralle on{" "}
                <span className="font-mono tabular-nums">2026-04-30</span>.
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] tabular-nums text-mute-slate">RCT-2026-04-001</div>
              <div className="font-mono text-[11px] tabular-nums text-mute-slate">workspace · ws_calderon_hvac</div>
            </div>
          </header>

          <section className="mt-8 rounded-md bg-receipt-gold-tint px-8 py-10 text-center">
            <Eyebrow>Recovered revenue · {receipt.month}</Eyebrow>
            <div className="mt-3 font-mono text-[64px] font-medium leading-none tracking-tight text-receipt-gold tabular-nums">
              {formatUsd(receipt.recoveredRevenueUsd)}
            </div>
            <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-receipt-gold/30 bg-paper-white px-4 py-1.5 font-mono text-[13px] tabular-nums text-receipt-gold">
              {receipt.roiMultiplier}× ROI · cost {formatUsd(receipt.costUsd)}
            </div>
          </section>

          <section className="mt-10 grid gap-3">
            <Eyebrow>How we got here</Eyebrow>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Recovered</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.perAgent.map((row) => (
                  <TableRow key={row.agentName}>
                    <TableCell>
                      <div className="text-[13px] font-medium">{row.agentName}</div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-soft-hairline">
                        <div
                          className="h-1.5 rounded-full bg-receipt-gold"
                          style={{ width: `${(row.recovered / maxRecovered) * 100}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.calls}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-receipt-gold">
                      {formatUsd(row.recovered)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPct(row.recovered / sumPerAgent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="mt-8 grid grid-cols-3 gap-4">
            <Card className="p-4">
              <Eyebrow>vs last month</Eyebrow>
              <div className="mt-1 font-mono text-[20px] tabular-nums text-booked-green">
                +{formatPct(receipt.comparisonDeltaPct)}
              </div>
              <div className="mt-0.5 text-[11px] text-mute-slate">recovered revenue</div>
            </Card>
            <Card className="p-4">
              <Eyebrow>Cost</Eyebrow>
              <div className="mt-1 font-mono text-[20px] tabular-nums text-receipt-gold">
                {formatUsd(receipt.costUsd)}
              </div>
              <div className="mt-0.5 text-[11px] text-mute-slate">platform + voice</div>
            </Card>
            <Card className="p-4">
              <Eyebrow>Net impact</Eyebrow>
              <div className="mt-1 font-mono text-[20px] tabular-nums text-receipt-gold">
                {formatUsd(receipt.recoveredRevenueUsd - receipt.costUsd)}
              </div>
              <div className="mt-0.5 text-[11px] text-mute-slate">of recovered minus cost</div>
            </Card>
          </section>

          <footer className="mt-10 border-t pt-4 text-[10px] text-mute-slate">
            Prepared by Kuralle for Calderon HVAC. Recovered revenue = bookings closed via Kuralle that
            would otherwise have been missed (no-answer / after-hours / abandoned). Methodology in
            <span className="ml-1 font-mono">/workspace/compliance#methodology</span>.
          </footer>
        </article>
      </div>
    </div>
  );
}
