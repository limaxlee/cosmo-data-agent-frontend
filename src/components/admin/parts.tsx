"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  RefreshCw,
  Search,
  Shield,
  TriangleAlert,
  User,
  X,
} from "lucide-react";

import { AdminApiError, PAGE_SIZE, type AdminUser } from "@/lib/admin-api";
import { dayBefore, formatCount } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useAdmin } from "./admin-context";

/** The small pieces every admin view is made of. */

// The raised surface of the composer and the theme button.
const SURFACE = "border-0 shadow-none bg-input dark:bg-zinc-800";

/** A button that is neither the main action nor a danger. */
export function QuietButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      className={cn(SURFACE, "hover:bg-accent", className)}
      {...props}
    />
  );
}

// --- Marks -------------------------------------------------------------------

// Status is never shown by colour alone: there is always a word, and an icon.
const BADGE =
  "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3";

const TONE = {
  green:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  grey: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function Badge({
  tone,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone: keyof typeof TONE }) {
  return <span className={cn(BADGE, TONE[tone], className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge tone="green">
        <Check aria-hidden />
        Active
      </Badge>
    );
  }

  if (status === "waiting") {
    return (
      <Badge tone="amber">
        <Clock aria-hidden />
        Waiting
      </Badge>
    );
  }

  if (status === "deactivated") {
    return (
      <Badge tone="grey">
        <Ban aria-hidden />
        Deactivated
      </Badge>
    );
  }

  // A status this page does not know yet. The backend's word is better than
  // nothing.
  return <Badge tone="grey">{status}</Badge>;
}

export function AdminBadge() {
  return (
    <Badge tone="blue">
      <Shield aria-hidden />
      Admin
    </Badge>
  );
}

/**
 * An admin can always use the app, approved or not. Without this note people
 * wonder why a "Waiting" person has access.
 */
export function AdminAccessNote() {
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
      <Info className="size-3" aria-hidden />
      Has access as admin
    </span>
  );
}

/** Status, and "Admin" as a mark of its own. */
export function UserMarks({ user }: { user: AdminUser }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge status={user.status} />
      {user.is_admin && <AdminBadge />}
      {user.is_admin && user.status !== "active" && <AdminAccessNote />}
    </span>
  );
}

export function YouMark() {
  return (
    <span className="ml-1.5 shrink-0 rounded border border-tile-border px-1.5 text-[11px] font-semibold text-muted-foreground">
      You
    </span>
  );
}

export function WaitingCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
        TONE.amber,
        className,
      )}
    >
      {formatCount(count)}
      <span className="sr-only"> waiting for approval</span>
    </span>
  );
}

/** The circle with the first letter, as in the sidebar's account row. */
export function Avatar({ userId, large }: { userId: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-input font-semibold text-foreground dark:bg-zinc-800",
        large ? "size-11 text-lg" : "size-8 text-sm",
      )}
    >
      {userId.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** A login ID that leads to that person's page. */
export function UserLink({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  return (
    <Link
      href={`/admin/users/${encodeURIComponent(userId)}`}
      title={userId}
      className={cn(
        "rounded-sm underline decoration-muted-foreground/50 underline-offset-[3px] outline-none hover:decoration-current focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {userId}
    </Link>
  );
}

// --- Tables ------------------------------------------------------------------

export const TH =
  "sticky top-0 z-[1] border-b border-sidebar-border bg-background px-3 py-2.5 text-left text-xs font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase";

// Long values are cut, never wrapped: the full text is in the `title`.
export const TD =
  "overflow-hidden border-b border-sidebar-border px-3 py-2 align-middle text-ellipsis whitespace-nowrap";

export const SUB = "block truncate text-xs text-muted-foreground";

/**
 * The frame of a table. It scrolls inside itself in both directions, so a
 * narrow window never stretches the page. `fill` lets it take what is left of
 * the window, with the pager staying in view below it.
 */
export function TableFrame({
  minWidth,
  busy,
  fill,
  children,
}: {
  minWidth: number;
  // A newer answer is on its way. The rows on screen are the previous one.
  busy?: boolean;
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn(
        "overflow-auto rounded-xl border border-tile-border transition-opacity",
        fill ? "min-h-32 shrink" : "shrink-0",
        busy && "opacity-60",
      )}
    >
      <table
        className="w-full table-fixed border-collapse text-sm [&_tbody_tr:last-child_td]:border-b-0"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function Pager({
  page,
  shown,
  total,
  onPage,
}: {
  page: number;
  // Rows on this page.
  shown: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const first = (page - 1) * PAGE_SIZE + 1;

  const label =
    total === 0
      ? "Nothing found"
      : shown === 0
        ? `Nothing on page ${formatCount(page)}. ${formatCount(total)} in all`
        : `${formatCount(first)} to ${formatCount(first + shown - 1)} of ${formatCount(total)}`;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-muted-foreground tabular-nums">{label}</span>
      <span className="flex-1" />
      <QuietButton size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden />
        Previous
      </QuietButton>
      <QuietButton
        size="sm"
        disabled={first + shown - 1 >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
        <ChevronRight aria-hidden />
      </QuietButton>
    </div>
  );
}

// --- Loading, nothing found, could not load ---------------------------------

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      role="status"
      className="shrink-0 rounded-xl border border-tile-border"
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-6 border-b border-sidebar-border px-3 py-3.5 last:border-b-0 motion-reduce:animate-none"
        >
          <span
            className="h-3 rounded-full bg-accent/70"
            style={{ width: `${14 + ((index * 7) % 12)}%` }}
          />
          <span
            className="h-3 rounded-full bg-accent/70"
            style={{ width: `${22 + ((index * 11) % 18)}%` }}
          />
          <span className="h-3 w-[12%] rounded-full bg-accent/70" />
        </div>
      ))}
    </div>
  );
}

function StateBox({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 rounded-xl border border-dashed border-tile-border px-4 py-10 text-center [&>svg]:size-7 [&>svg]:text-muted-foreground">
      {icon}
      <p className="text-sm font-semibold">{title}</p>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  // A way out, such as "Clear filters".
  children?: React.ReactNode;
}) {
  return (
    <StateBox
      icon={<Search strokeWidth={1.5} aria-hidden />}
      title={title}
      text={text}
    >
      {children}
    </StateBox>
  );
}

/**
 * A list that could not be loaded, with a way to try again. A 422 means the
 * backend refused a filter value; its `detail` is a list there and is not
 * shown.
 */
export function LoadError({ what, error }: { what: string; error: unknown }) {
  const { refresh } = useAdmin();
  const badFilter = error instanceof AdminApiError && error.status === 422;

  return (
    <StateBox
      icon={<TriangleAlert strokeWidth={1.5} aria-hidden />}
      title={badFilter ? "This filter is not valid." : `Could not load ${what}`}
      text={
        badFilter
          ? "Change the filters and try again."
          : "The server did not answer as expected."
      }
    >
      <QuietButton size="sm" onClick={refresh}>
        <RefreshCw aria-hidden />
        Try again
      </QuietButton>
    </StateBox>
  );
}

// --- Filters -----------------------------------------------------------------

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
  );
}

export function RefreshButton() {
  const { refresh } = useAdmin();

  return (
    <QuietButton
      size="sm"
      className="ml-auto"
      onClick={refresh}
      title="Ask the server again. Nothing reloads by itself."
    >
      <RefreshCw aria-hidden />
      Refresh
    </QuietButton>
  );
}

/**
 * A search box whose text lives in the address. `value` is what the address
 * says; `onCommit` is called about 300 ms after the last key.
 */
export function SearchInput({
  value,
  onCommit,
  label,
  className,
}: {
  value: string;
  onCommit: (text: string) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // What this box last put into the address.
  const [sent, setSent] = useState(value);

  // The address changed. Take its text over only when the change came from
  // somewhere else ("Clear filters", the Back button). Our own change arrives
  // here a moment after it was typed, and by then the person may have typed
  // on: overwriting the box would eat those keys.
  if (value !== seen) {
    setSeen(value);
    if (value !== sent) setText(value);
  }

  useEffect(() => {
    const wanted = text.trim();

    if (wanted === value) return;

    const timer = setTimeout(() => {
      setSent(wanted);
      onCommit(wanted);
    }, 300);

    return () => clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <label className={cn("relative flex w-72 max-w-full items-center", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={label}
        aria-label={label}
        maxLength={255}
        className={cn(SURFACE, "pl-9")}
      />
    </label>
  );
}

export function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  // [value, what the person reads]
  options: [string, string][];
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={cn(
          SURFACE,
          "h-9 cursor-pointer appearance-none rounded-md pr-8 pl-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}

function Shortcut({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full px-2.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "bg-foreground text-background"
          : "bg-input text-muted-foreground hover:bg-accent dark:bg-zinc-800",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Two days, both included, in the admin's own time zone. These are the
 * browser's own date fields, so they show a day the way the browser's
 * language writes it.
 */
export function DayRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const today = dayBefore(0);
  const weekAgo = dayBefore(6);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">From</span>
      <Input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(event) => onChange({ from: event.target.value, to })}
        aria-label="From day"
        className={cn(SURFACE, "w-[9.5rem]")}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(event) => onChange({ from, to: event.target.value })}
        aria-label="To day, included"
        className={cn(SURFACE, "w-[9.5rem]")}
      />
      <Shortcut
        label="Today"
        active={from === today && to === today}
        onClick={() => onChange({ from: today, to: today })}
      />
      <Shortcut
        label="Last 7 days"
        active={from === weekAgo && to === today}
        onClick={() => onChange({ from: weekAgo, to: today })}
      />
    </span>
  );
}

/**
 * "Only gildong.hong": the list is about this person and nobody else. A typed
 * search is a different filter: "j.kim" as a search also finds "hj.kim".
 */
export function OnlyPerson({
  userId,
  onClear,
}: {
  userId: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-md bg-blue-100 pr-1 pl-2.5 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-300">
      <User className="size-4 shrink-0" aria-hidden />
      <span className="truncate" title={userId}>
        Only <b className="font-semibold">{userId}</b>
      </span>
      <button
        type="button"
        onClick={onClear}
        title="Show everybody"
        aria-label={`Show everybody, not only ${userId}`}
        className="flex size-7 shrink-0 items-center justify-center rounded outline-none hover:bg-background/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </span>
  );
}
