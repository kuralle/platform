import type { Table } from "@tanstack/react-table";
import { Check, Settings2 } from "lucide-react";
import * as React from "react";

import { cn } from "@kuralle/ui/lib/utils";

import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

export function DataTableViewOptions<TData>({
  table,
  align = "end",
  disabled,
}: DataTableViewOptionsProps<TData>) {
  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          (column) => typeof column.accessorFn !== "undefined" && column.getCanHide(),
        ),
    [table],
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Toggle columns"
            role="combobox"
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 font-normal lg:flex"
            disabled={disabled}
          >
            <Settings2 className="text-muted-foreground" />
            View
          </Button>
        }
      />
      <PopoverContent className="w-44 p-0" align={align}>
        <Command>
          <CommandInput placeholder="Search columns…" />
          <CommandList>
            <CommandEmpty>No columns found.</CommandEmpty>
            <CommandGroup>
              {columns.map((column) => {
                const label = (column.columnDef.meta as { label?: string } | undefined)?.label
                  ?? column.id;
                return (
                  <CommandItem
                    key={column.id}
                    onSelect={() => column.toggleVisibility(!column.getIsVisible())}
                  >
                    <span className="truncate">{label}</span>
                    <Check
                      className={cn(
                        "ml-auto size-4 shrink-0",
                        column.getIsVisible() ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
