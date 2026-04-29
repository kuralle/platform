import type { Column } from "@tanstack/react-table";
import { Check, PlusCircle, XCircle } from "lucide-react";
import * as React from "react";

import { cn } from "@kuralle/ui/lib/utils";

import { Badge } from "./badge";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";

export interface FacetedFilterOption {
  label: string;
  value: string;
  count?: number;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: FacetedFilterOption[];
  multiple?: boolean;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  multiple = true,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const [open, setOpen] = React.useState(false);

  const columnFilterValue = column?.getFilterValue();
  const selectedValues = new Set(
    Array.isArray(columnFilterValue) ? columnFilterValue : [],
  );

  const onItemSelect = (option: FacetedFilterOption, isSelected: boolean) => {
    if (!column) return;
    if (multiple) {
      const next = new Set(selectedValues);
      if (isSelected) next.delete(option.value);
      else next.add(option.value);
      const arr = Array.from(next);
      column.setFilterValue(arr.length ? arr : undefined);
    } else {
      column.setFilterValue(isSelected ? undefined : [option.value]);
      setOpen(false);
    }
  };

  const onReset = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    column?.setFilterValue(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed font-normal">
            {selectedValues.size > 0 ? (
              <span
                role="button"
                aria-label={`Clear ${title} filter`}
                tabIndex={0}
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
                onClick={onReset}
              >
                <XCircle />
              </span>
            ) : (
              <PlusCircle />
            )}
            {title}
            {selectedValues.size > 0 && (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-0.5 data-[orientation=vertical]:h-4"
                />
                <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                  {selectedValues.size}
                </Badge>
                <span className="hidden items-center gap-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                      {selectedValues.size} selected
                    </Badge>
                  ) : (
                    options
                      .filter((o) => selectedValues.has(o.value))
                      .map((o) => (
                        <Badge
                          variant="secondary"
                          key={o.value}
                          className="rounded-sm px-1 font-normal"
                        >
                          {o.label}
                        </Badge>
                      ))
                  )}
                </span>
              </>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList className="max-h-full">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] scroll-py-1 overflow-y-auto overflow-x-hidden">
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => onItemSelect(option, isSelected)}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check size={12} />
                    </span>
                    {option.icon && <option.icon size={14} />}
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onReset()} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
