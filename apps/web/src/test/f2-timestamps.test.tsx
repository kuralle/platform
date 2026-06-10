import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { formatDuration, formatRelative, turnCreatedAtIso } from "@/lib/format";

const fiveMinutesAgoSec = Math.floor((Date.now() - 5 * 60_000) / 1000);

function TurnTimestamp({
  turn,
}: {
  turn: { timestampSec: number; createdAt?: string | Date | null };
}) {
  const createdAt = turnCreatedAtIso(turn);
  return (
    <time dateTime={createdAt} title={createdAt}>
      {formatRelative(createdAt)}
    </time>
  );
}

describe("F2 transcript timestamps (BL-S3-07)", () => {
  it("turnCreatedAtIso derives ISO from unix-epoch timestampSec when createdAt is absent", () => {
    const iso = turnCreatedAtIso({ timestampSec: fiveMinutesAgoSec });
    expect(formatRelative(iso)).toBe("5m ago");
  });

  it("renders relative time instead of epoch-minutes duration formatting", () => {
    const epochStyle = formatDuration(fiveMinutesAgoSec);
    expect(epochStyle.split(":")[0]!.length).toBeGreaterThan(3);

    render(
      <TurnTimestamp
        turn={{
          timestampSec: fiveMinutesAgoSec,
        }}
      />,
    );

    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.queryByText(epochStyle)).not.toBeInTheDocument();
  });
});
