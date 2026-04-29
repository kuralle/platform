import { flexRender, type RowData, type Table as TanstackTable } from "@tanstack/react-table";
import type * as React from "react";

import { cn } from "@kuralle/ui/lib/utils";

import type { FacetedFilterOption } from "./data-table-faceted-filter";
import { DataTablePagination } from "./data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: TData / TValue come from the augmented interface.
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: "text" | "select" | "multiSelect";
    options?: FacetedFilterOption[];
  }
}

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>;
  /** Optional action bar shown beneath the table when rows are selected. */
  actionBar?: React.ReactNode;
  /** Optional row-click handler — when provided, rows render with cursor:pointer. */
  onRowClick?: (row: TData) => void;
  /** Hide the default pagination footer — useful for tiny fixed-size lists. */
  hidePagination?: boolean;
  /** Toolbar / search row rendered above the table (passed via `children`). */
}

export function DataTable<TData>({
  table,
  actionBar,
  onRowClick,
  hidePagination,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  return (
    <div className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)} {...props}>
      {children}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        {!hidePagination && <DataTablePagination table={table} />}
        {actionBar && table.getFilteredSelectedRowModel().rows.length > 0 && actionBar}
      </div>
    </div>
  );
}
