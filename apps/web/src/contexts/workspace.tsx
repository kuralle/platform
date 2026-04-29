import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

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

export const VERTICAL_LABEL: Record<Vertical, string> = {
  "home-services": "Home Services",
  "appointment-services": "Appointment Services",
  "education": "Education",
};

export const VERTICAL_DESCRIPTION: Record<Vertical, string> = {
  "home-services":
    "HVAC, plumbing, electrical, generic field-service operators. TCPA-default compliance.",
  "appointment-services":
    "Dental, medical, veterinary, salon. HIPAA-default compliance and BAA workflows.",
  "education":
    "Higher-ed admissions, K-12, bootcamps. FERPA-default with identity-verification gates.",
};
