import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { $api } from "@/providers/api-provider";
import type { Environment, Region, Vertical, Workspace } from "@/types/domain";

const STORAGE_KEY = "vokari.workspace.v1";

interface Prefs {
  vertical: Vertical;
  environment: Environment;
  region: Region;
}

const DEFAULT_PREFS: Prefs = {
  vertical: "home-services",
  environment: "production",
  region: "us-east-1",
};

const DEFAULT_COMPLIANCE: Workspace["compliance"] = {
  hipaa: "inactive",
  ferpa: "inactive",
  tcpa: "active",
  euAiAct: "action-required",
};

interface WorkspaceContextValue {
  workspace: Workspace;
  setVertical: (v: Vertical) => void;
  setEnvironment: (e: Environment) => void;
  setRegion: (r: Region) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readPersisted(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function persist(prefs: Prefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: sessionData } = authClient.useSession();
  const orgId = sessionData?.session?.activeOrganizationId;

  const { data: wsSettings } = useQuery({
    ...$api.workspace.get.queryOptions({ input: { workspaceId: orgId! } }),
    enabled: !!orgId,
  });

  const [prefs, setPrefs] = useState<Prefs>(() => readPersisted());

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const workspace = useMemo<Workspace>(() => ({
    id: orgId ?? "",
    name: wsSettings?.name ?? "",
    vertical: prefs.vertical,
    environment: prefs.environment,
    region: prefs.region,
    members: 0,
    compliance: DEFAULT_COMPLIANCE,
  }), [orgId, wsSettings, prefs]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      setVertical: (vertical) => updatePrefs({ vertical }),
      setEnvironment: (environment) => updatePrefs({ environment }),
      setRegion: (region) => updatePrefs({ region }),
    }),
    [workspace, updatePrefs],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

// Read workspace ID synchronously from authClient.useSession(). The route
// guard in /_app already awaits getSession() in beforeLoad, so by the time
// any descendant renders, the session is fetched and `data` is populated.
// We accept undefined as a transient "session hook still hydrating" state
// (better-auth's useSession briefly returns isPending=true before the cached
// fetch lands) and short-circuit to "" — callers that gate downstream RPCs
// on a non-empty workspaceId will simply skip until the next render. No
// Suspense throw: a never-resolving SUSPENDED promise would deadlock the
// router's defaultPendingComponent.
export function useActiveWorkspaceId(): string {
  const { data, error } = authClient.useSession();
  if (error) throw new Error(`Auth session error: ${error.message}`);
  return data?.session?.activeOrganizationId ?? "";
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
