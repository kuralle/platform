import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { ScopeChip } from "@kuralle/ui/components/scope-chip";
import { Sparkline } from "@kuralle/ui/components/sparkline";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { WaveformPlayer } from "@kuralle/ui/components/waveform-player";
import { WizardShell, type WizardStep } from "@kuralle/ui/components/wizard-shell";

describe("LiveDot", () => {
  it("renders with the live tone and pulse class", () => {
    render(<LiveDot />);
    const dot = screen.getByRole("status");
    expect(dot).toHaveClass("bg-cyan-500");
    expect(dot).toHaveClass("live-pulse");
  });

  it("respects the `static` flag and skips the pulse", () => {
    render(<LiveDot static />);
    expect(screen.getByRole("status")).not.toHaveClass("live-pulse");
  });
});

describe("StatusPill", () => {
  it("emits the correct tone class", () => {
    render(<StatusPill tone="success">Booked</StatusPill>);
    expect(screen.getByText("Booked").closest("span")).toHaveClass("bg-emerald-500/10");
  });

  it("hides the dot when hideDot=true", () => {
    const { container } = render(<StatusPill tone="success" hideDot>Booked</StatusPill>);
    expect(container.querySelectorAll("span[role='status']").length).toBe(0);
  });
});

describe("ScopeChip", () => {
  it("renders the label inside an indigo pill by default", () => {
    render(<ScopeChip label="prod" />);
    const el = screen.getByText("prod");
    expect(el).toHaveClass("text-indigo-500");
  });
});

describe("ComplianceChip", () => {
  it("formats label and state", () => {
    render(<ComplianceChip label="HIPAA" state="active" />);
    expect(screen.getByText("HIPAA")).toBeInTheDocument();
  });

  it("renders the suffix when provided", () => {
    render(<ComplianceChip label="HIPAA" state="active" suffix="BAA pending" />);
    expect(screen.getByText("· BAA pending")).toBeInTheDocument();
  });
});

describe("Eyebrow", () => {
  it("renders the children inside a small-caps span", () => {
    render(<Eyebrow>Workspace</Eyebrow>);
    const el = screen.getByText("Workspace");
    expect(el).toHaveClass("uppercase");
    expect(el).toHaveClass("tracking-[0.08em]");
  });
});

describe("KpiTile", () => {
  it("renders a currency value in foreground and a positive delta chip", () => {
    const { container } = render(
      <KpiTile label="Recovered revenue" value="$47,200" delta={0.18} currency spark={[1, 2, 3, 4, 5]} />,
    );
    expect(screen.getByText("$47,200")).toHaveClass("text-foreground");
    const chip = container.querySelector(".bg-emerald-500\\/10")!;
    expect(chip.textContent?.replace(/\s+/g, "")).toBe("↑+18%");
  });

  it("renders a negative delta in destructive", () => {
    const { container } = render(<KpiTile label="p95 latency" value="412ms" delta={-0.06} />);
    const chip = container.querySelector(".bg-destructive\\/10")!;
    expect(chip).toBeTruthy();
    expect(chip.textContent?.replace(/\s+/g, "")).toBe("↓6%");
  });
});

describe("Sparkline", () => {
  it("renders SVG path with the picked tone class", () => {
    const { container } = render(<Sparkline data={[1, 2, 3, 4]} tone="currency" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("path.stroke-foreground")).toBeTruthy();
  });
});

describe("WaveformPlayer", () => {
  it("calls onSeek when user clicks the track", () => {
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformPlayer durationSec={120} positionSec={20} onSeek={onSeek} />,
    );
    const slider = container.querySelector("[role='slider']")!;
    // Stub getBoundingClientRect for jsdom.
    Object.defineProperty(slider, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 40, right: 200, bottom: 40 }),
    });
    fireEvent.click(slider, { clientX: 100 });
    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it("seeks back/forward 5s on arrow keys", () => {
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformPlayer durationSec={60} positionSec={30} onSeek={onSeek} />,
    );
    const slider = container.querySelector("[role='slider']")!;
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(35);
  });
});

describe("StickySaveBar", () => {
  it("renders the clean copy when there are no changes", () => {
    render(<StickySaveBar changes={0} onSave={() => undefined} onDiscard={() => undefined} />);
    expect(screen.getByText("All changes saved.")).toBeInTheDocument();
  });

  it("renders the unsaved copy and enables the buttons", () => {
    const onSave = vi.fn();
    render(<StickySaveBar changes={3} onSave={onSave} onDiscard={() => undefined} />);
    expect(screen.getByText("Unsaved changes — 3 fields modified.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save changes"));
    expect(onSave).toHaveBeenCalled();
  });
});

describe("WizardShell", () => {
  const STEPS: WizardStep[] = [
    { id: "a", title: "Step A", render: () => <div>step a body</div> },
    { id: "b", title: "Step B", render: () => <div>step b body</div> },
    { id: "c", title: "Step C", render: () => <div>step c body</div> },
  ];

  it("starts on step 0 and advances on Next", () => {
    render(<WizardShell steps={STEPS} title="Wizard" />);
    expect(screen.getByText("step a body")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Next/));
    expect(screen.getByText("step b body")).toBeInTheDocument();
  });

  it("hits the finish handler on the last step", () => {
    const onFinish = vi.fn();
    render(<WizardShell steps={STEPS} initialIndex={2} onFinish={onFinish} finishLabel="Launch" />);
    fireEvent.click(screen.getByText("Launch"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("blocks Next when isBlocked", () => {
    const blocked: WizardStep[] = [
      { ...STEPS[0]!, isBlocked: true },
      STEPS[1]!,
    ];
    render(<WizardShell steps={blocked} />);
    const next = screen.getByText(/Next/).closest("button")!;
    expect(next).toBeDisabled();
  });
});
