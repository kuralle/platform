import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@kuralle/ui/components/command";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  CircleDollarSign,
  Headset,
  LayoutDashboard,
  ListChecks,
  Phone,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";

interface CommandItemDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function go(to: string) {
    return () => {
      setOpen(false);
      navigate({ to });
    };
  }

  const navItems: CommandItemDef[] = [
    { id: "home", label: "Today dashboard", icon: LayoutDashboard, action: go("/home") },
    { id: "agents", label: "Agents", icon: Users, action: go("/agents") },
    { id: "knowledge", label: "Knowledge base", icon: BookOpen, action: go("/knowledge") },
    { id: "convs", label: "Conversations", icon: Headset, action: go("/conversations") },
    { id: "batches", label: "Outbound batches", icon: ListChecks, action: go("/batches") },
    { id: "telephony", label: "Telephony connectors", icon: Workflow, action: go("/telephony") },
    { id: "numbers", label: "Phone numbers", icon: Phone, action: go("/phone-numbers") },
    { id: "widget", label: "Widget customizer", icon: Activity, action: go("/widget") },
  ];

  const wsItems: CommandItemDef[] = [
    { id: "ws-settings", label: "Workspace settings", icon: Settings, action: go("/workspace/settings") },
    { id: "ws-compliance", label: "Compliance posture", icon: ShieldCheck, action: go("/workspace/compliance") },
    { id: "revenue", label: "Monthly ROI receipt", icon: CircleDollarSign, action: go("/revenue/receipt/2026-04") },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump anywhere">
      <CommandInput placeholder="Jump to a screen, agent, or conversation…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {navItems.map((it) => (
            <CommandItem key={it.id} onSelect={it.action}>
              <it.icon size={16} />
              <span>{it.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Workspace">
          {wsItems.map((it) => (
            <CommandItem key={it.id} onSelect={it.action}>
              <it.icon size={16} />
              <span>{it.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
