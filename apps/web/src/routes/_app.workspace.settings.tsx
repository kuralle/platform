import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldDescription, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { Skeleton } from "@kuralle/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useWorkspaceSettings, useUpdateWorkspace } from "@/hooks/api/workspace";
import type { Environment, Region } from "@/types/domain";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsRoute,
});

function WorkspaceSettingsRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: settings, isLoading, isError } = useWorkspaceSettings({ workspaceId });
  const updateWorkspace = useUpdateWorkspace();

  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("");
  const [environment, setEnvironment] = useState("");
  const [region, setRegion] = useState("");

  const loadedSnapshot = useRef({ name: "", vertical: "", environment: "production", region: "us-east-1" });

  useEffect(() => {
    if (settings) {
      const snap = {
        name: settings.name,
        vertical: settings.vertical ?? "",
        environment: settings.environment ?? "production",
        region: settings.region ?? "us-east-1",
      };
      setName(snap.name);
      setVertical(snap.vertical);
      setEnvironment(snap.environment);
      setRegion(snap.region);
      loadedSnapshot.current = snap;
    }
  }, [settings]);

  const changes =
    (name !== loadedSnapshot.current.name ? 1 : 0) +
    (vertical !== loadedSnapshot.current.vertical ? 1 : 0) +
    (environment !== loadedSnapshot.current.environment ? 1 : 0) +
    (region !== loadedSnapshot.current.region ? 1 : 0);

  const handleSave = () => {
    updateWorkspace.mutate({
      workspaceId,
      name: name || undefined,
      vertical: vertical || null,
      environment: (environment || undefined) as Environment | undefined,
      region: (region || undefined) as Region | undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] flex-col">
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            <PageHeader eyebrow="Workspace" title="Settings" description="Loading…" />
            <Skeleton className="mt-6 h-[400px]" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <Alert variant="destructive">
          <AlertTitle>Failed to load workspace settings</AlertTitle>
          <AlertDescription>Try refreshing the page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <PageHeader
            eyebrow="Workspace"
            title="Settings"
            description={`Manage ${settings?.name ?? "workspace"} identity, environment, and region.`}
          />
          <div className="mx-auto grid max-w-2xl gap-6">
            <Card className="p-6">
              <Eyebrow>Identity</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Workspace name</h2>
              <Field className="mt-4">
                <FieldLabel htmlFor="ws">Name</FieldLabel>
                <Input id="ws" value={name} onChange={(e) => setName(e.target.value)} />
                <FieldDescription>Shown on receipts, audit logs, and the avatar dropdown.</FieldDescription>
              </Field>
            </Card>
            <Card className="p-6">
              <Eyebrow>Environment</Eyebrow>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Vertical</FieldLabel>
                  <Select value={vertical} onValueChange={(v) => { if (v != null) setVertical(v); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home-services">Home Services</SelectItem>
                      <SelectItem value="appointment-services">Appointment Services</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Active environment</FieldLabel>
                  <Select value={environment} onValueChange={(v) => { if (v != null) setEnvironment(v); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Data region</FieldLabel>
                  <Select value={region} onValueChange={(v) => { if (v != null) setRegion(v); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us-east-1">US East (Ashburn)</SelectItem>
                      <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                      <SelectItem value="eu-west-1">EU West (Dublin)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <StickySaveBar
        changes={changes}
        onSave={handleSave}
        onDiscard={() => {
          setName(loadedSnapshot.current.name);
          setVertical(loadedSnapshot.current.vertical);
          setEnvironment(loadedSnapshot.current.environment);
          setRegion(loadedSnapshot.current.region);
        }}
      />
      {updateWorkspace.isError && (
        <Alert variant="destructive" className="mx-auto max-w-3xl">
          <AlertTitle>Failed to save</AlertTitle>
          <AlertDescription>{(updateWorkspace.error as Error)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
