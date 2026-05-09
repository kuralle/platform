import { useState } from "react";

import { Avatar, AvatarFallback } from "@kuralle/ui/components/avatar";
import { Button } from "@kuralle/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kuralle/ui/components/dropdown-menu";
import { Kbd } from "@kuralle/ui/components/kbd";
import { ScopeChip } from "@kuralle/ui/components/scope-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@kuralle/ui/components/tooltip";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/initials";
import { useWorkspaceSettings } from "@/hooks/api/workspace";
import { useActiveWorkspaceId, useWorkspace } from "@/contexts/workspace";
import { Bell, Menu, Search } from "lucide-react";

import { SignOutConfirmDialog } from "./sign-out-confirm-dialog";
import { Wordmark } from "./wordmark";

interface TopbarProps {
  onCommandOpen: () => void;
  onMobileMenuToggle?: () => void;
}

export function Topbar({ onCommandOpen, onMobileMenuToggle }: TopbarProps) {
  const { workspace } = useWorkspace();
  const workspaceId = useActiveWorkspaceId();
  const { data: session, isPending } = authClient.useSession();
  const { data: wsSettings } = useWorkspaceSettings({ workspaceId });
  const [signOutOpen, setSignOutOpen] = useState(false);

  const userName = session?.user?.name ?? "";
  const initials = getInitials(userName);
  const workspaceName = wsSettings?.name ?? "";

  if (isPending) {
    return (
      <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
        {onMobileMenuToggle && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Wordmark />
        </div>
        <div className="ml-auto size-7 animate-pulse rounded-full bg-muted" />
      </header>
    );
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
      {onMobileMenuToggle && (
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      )}
      <Link to="/home" search={{ welcome: false, firstrun: false }} className="flex items-center gap-2">
        <Wordmark />
      </Link>
      <span className="h-6 w-px bg-border" />
      <ScopeChip label={workspace.environment} />
      <ScopeChip label={workspace.region.replace("-", " ")} />
      <button
        type="button"
        onClick={onCommandOpen}
        className="ml-3 hidden h-8 min-w-[280px] items-center gap-2 rounded-md border bg-background px-2 text-[13px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground md:flex"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Jump to a screen, agent, or conversation…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <span className="ml-auto" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell size={16} />
            </Button>
          }
        />
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="size-7">
                <AvatarFallback className="bg-foreground text-card text-[11px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-[13px] font-medium md:inline">{userName}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-muted-foreground">{workspaceName}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link to="/workspace/settings" />}>
            Workspace settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/workspace/compliance" />}>
            Compliance posture
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            data-testid="sign-out"
            onSelect={() => setSignOutOpen(true)}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={async () => {
          await authClient.signOut();
          window.location.href = "/auth/sign-in";
        }}
      />
    </header>
  );
}
