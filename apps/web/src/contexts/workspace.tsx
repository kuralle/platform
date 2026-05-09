import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { Environment, Region, Vertical, Workspace } from "@/types/domain";

const STORAGE_KEY = "vokari.workspace.v1";

const DEFAULT_WORKSPACE: Workspace = {
  id: "ws_calderon_hvac",
  name: "Calderon HVAC",
  vertical: "home-services",
  environment: "production",
  region: "us-east-1",
  members: 8,
  compliance: {
    hipaa: "inactive",
    ferpa: "inactive",
    tcpa: "active",
    euAiAct: "action-required",
  },
};

interface WorkspaceContextValue {
  workspace: Workspace;
  setVertical: (v: Vertical) => void;
  setEnvironment: (e: Environment) => void;
  setRegion: (r: Region) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readPersisted(): Workspace {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE;
    return { ...DEFAULT_WORKSPACE, ...(JSON.parse(raw) as Partial<Workspace>) };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

function persist(ws: Workspace) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(() => readPersisted());

  const update = useCallback((patch: Partial<Workspace>) => {
    setWorkspace((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      setVertical: (vertical) => update({ vertical }),
      setEnvironment: (environment) => update({ environment }),
      setRegion: (region) => update({ region }),
    }),
    [workspace, update],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

// Source of truth = better-auth's session.activeOrganizationId, populated
// server-side by the organization plugin on every authenticated request.
// Falls back to the local WorkspaceProvider's stored id during the brief
// hydration window or in tests (kept for stability), but session always wins
// once the auth hook has resolved.
// Ref: better-auth v1.5.5 docs (Context7) — Session Active Organization Fields.
// Resolves BL-S3-10 fully.
export function useActiveWorkspaceId(): string {
  const sessionResult = useSessionSafely();
  const { workspace } = useWorkspace();
  return sessionResult?.activeOrganizationId ?? workspace.id;
}

function useSessionSafely(): { activeOrganizationId: string | null } | null {
  try {
    const { data } = authClient.useSession();
    if (!data?.session) return null;
    return { activeOrganizationId: data.session.activeOrganizationId ?? null };
  } catch {
    return null;
  }
}

export const VERTICAL_LABEL: Record<Vertical, string> = {
  "home-services": "Home Services",
  "appointment-services": "Healthcare & Appointments",
  "education": "Education",
};

export const VERTICAL_DESCRIPTION: Record<Vertical, string> = {
  "home-services":
    "HVAC, plumbing, electrical, generic field-service operators. TCPA-default compliance.",
  "appointment-services":
    "Dental, medical, veterinary practices. HIPAA-default compliance and BAA workflows.",
  "education":
    "Higher-ed admissions, K-12, bootcamps. FERPA-default with identity-verification gates.",
};
