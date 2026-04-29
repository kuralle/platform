import { Avatar, AvatarFallback } from "@kuralle/ui/components/avatar";
import { Badge } from "@kuralle/ui/components/badge";
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
import { Bell, Search } from "lucide-react";

import { useWorkspace } from "@/contexts/workspace";

import { Wordmark } from "./wordmark";

interface TopbarProps {
  onCommandOpen: () => void;
}

export function Topbar({ onCommandOpen }: TopbarProps) {
  const { workspace } = useWorkspace();
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
      <Link to="/home" className="flex items-center gap-2">
        <Wordmark />
      </Link>
      <span className="h-6 w-px bg-border" />
      <ScopeChip label={workspace.environment} />
      <ScopeChip label={workspace.region.replace("-", " ")} />
      <button
        type="button"
        onClick={onCommandOpen}
        className="ml-3 flex h-8 min-w-[280px] items-center gap-2 rounded-md border bg-background px-2 text-[13px] text-mute-slate transition hover:border-signal-teal/40 hover:text-foreground"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Jump to a screen, agent, or conversation…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <span className="ml-auto" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
              <Bell size={16} />
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 font-mono text-[10px] tabular-nums"
              >
                3
              </Badge>
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
                <AvatarFallback className="bg-foreground text-paper-white text-[11px] font-semibold">
                  RJ
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-[13px] font-medium md:inline">RJ Calderon</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-mute-slate">{workspace.name}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link to="/workspace/settings" />}>
            Workspace settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/workspace/compliance" />}>
            Compliance posture
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" render={<Link to="/auth/sign-in" />}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
