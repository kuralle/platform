import { createRng, isoMinutesAgo, pick, range } from "./seed";

export type KbSource = "file" | "url" | "text";
export type KbUsage = "auto" | "prompt";
export type KbStatus = "ready" | "indexing" | "needs_refresh" | "failed";

export interface KbDocument {
  id: string;
  name: string;
  source: KbSource;
  /** Bytes for file/text, characters for url import. */
  sizeBytes: number;
  usage: KbUsage;
  status: KbStatus;
  ragIndexed: boolean;
  embeddingModel: "e5_mistral_7b_instruct" | "multilingual_e5_large_instruct" | null;
  folder: string;
  url?: string;
  /** Other agents that also reference this doc. */
  dependentAgents: string[];
  /** ISO timestamp. */
  updatedAt: string;
}

const NAMES_BY_SOURCE: Record<KbSource, string[]> = {
  file: [
    "Calderon HVAC pricing book Q4.pdf",
    "Service truck inventory.docx",
    "Emergency dispatch policy.pdf",
    "Tech onboarding handbook.pdf",
  ],
  url: [
    "https://calderonhvac.com/services",
    "https://calderonhvac.com/about/team",
    "https://help.calderonhvac.com/faq",
  ],
  text: [
    "After-hours availability rules",
    "Diagnostic-fee waiver script",
    "FAFSA disclosure verbiage",
  ],
};

export function makeKbDocuments(count = 8): KbDocument[] {
  const rng = createRng(0xb00b1e5);
  return Array.from({ length: count }, (_, i) => {
    const source = pick(rng, ["file", "file", "url", "text"] as const);
    const names = NAMES_BY_SOURCE[source];
    const name = names[i % names.length]!;
    const status: KbStatus = pick(rng, [
      "ready",
      "ready",
      "ready",
      "indexing",
      "needs_refresh",
    ] as const);
    const ragIndexed = status === "ready" && rng() > 0.25;
    return {
      id: `kb_${(0xd00 + i).toString(16)}`,
      name,
      source,
      sizeBytes: source === "file" ? range(rng, 80_000, 18_000_000) : range(rng, 800, 280_000),
      usage: ragIndexed ? "auto" : "prompt",
      status,
      ragIndexed,
      embeddingModel: ragIndexed
        ? pick(rng, ["e5_mistral_7b_instruct", "multilingual_e5_large_instruct"] as const)
        : null,
      folder: pick(rng, ["Pricing", "Operations", "Policy", "Marketing", "Compliance"]),
      url: source === "url" ? name : undefined,
      dependentAgents: rng() > 0.55
        ? pick(rng, [
            ["Sundance Plumbing 24/7"],
            ["Brookline Dental Reminder", "Beacon University Admissions"],
            [],
          ])
        : [],
      updatedAt: isoMinutesAgo(range(rng, 5, 60 * 24 * 14)),
    } satisfies KbDocument;
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
