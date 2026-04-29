import type { Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@kuralle/ui/lib/utils";

import { Button } from "./button";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "./data-table-faceted-filter";
import { DataTableViewOptions } from "./data-table-view-options";
import { Input } from "./input";

interface DataTableToolbarProps<TData> extends React.ComponentProps<"div"> {
  table: Table<TData>;
  /** When provided, an extra trailing slot at the right (next to View). */
  trailingActions?: React.ReactNode;
}

/**
 * Slimmed tablecn toolbar — drives column meta `variant: "text" | "select" | "multiSelect"`
 * with a search input or faceted filter respectively. Date / range / slider variants are
 * not wired (we don't use them yet).
 */
export function DataTableToolbar<TData>({
  table,
  trailingActions,
  className,
  ...props
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex w-full items-start justify-between gap-2 p-1",
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {columns.map((column) => {
          const meta = column.columnDef.meta as
            | {
                label?: string;
                placeholder?: string;
                variant?: "text" | "select" | "multiSelect";
                options?: FacetedFilterOption[];
              }
            | undefined;
          if (!meta?.variant) return null;
          if (meta.variant === "text") {
            return (
              <Input
                key={column.id}
                placeholder={meta.placeholder ?? meta.label ?? "Search"}
                value={(column.getFilterValue() as string) ?? ""}
                onChange={(e) => column.setFilterValue(e.target.value)}
                className="h-8 w-40 lg:w-56"
              />
            );
          }
          return (
            <DataTableFacetedFilter
              key={column.id}
              column={column}
              title={meta.label ?? column.id}
              options={meta.options ?? []}
              multiple={meta.variant === "multiSelect"}
            />
          );
        })}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="h-8 border-dashed"
            onClick={onReset}
          >
            <X />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {trailingActions}
        <DataTableViewOptions table={table} align="end" />
      </div>
    </div>
  );
}
