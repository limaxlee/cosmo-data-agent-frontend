"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import {
  PAGE_SIZE,
  WAITING,
  countUsers,
  listAccessLog,
  listAdmins,
  listSessions,
  listUsers,
  type UserFilters,
} from "@/lib/admin-api";
import { dayBefore, formatCount, formatTime } from "@/lib/admin-format";
import { Button } from "@/components/ui/button";

import { AdminPage } from "./admin-shell";
import { targetOf, useConfirmAction } from "./confirm-action";
import {
  Avatar,
  EmptyState,
  ListSkeleton,
  LoadError,
  RefreshButton,
  UserLink,
  WaitingCount,
} from "./parts";
import { SessionsTable } from "./sessions-table";
import { useAdminQuery } from "./use-admin-query";
import { VisitsTable } from "./visits-table";

const WAITING_PAGE: UserFilters = { ...WAITING, limit: PAGE_SIZE };
const LATEST = { limit: 6 };

interface Numbers {
  accounts: number;
  active: number;
  deactivated: number;
  admins: number;
  visitsToday: number;
  chatsToday: number;
}

// The backend has no statistics. A count is the `total` of a list request
// for one row, so each number here is a request of its own.
async function loadNumbers({ today }: { today: string }): Promise<Numbers> {
  const [accounts, active, deactivated, admins, visits, chats] =
    await Promise.all([
      countUsers({}),
      countUsers({ status: "active" }),
      countUsers({ status: "deactivated" }),
      listAdmins(),
      listAccessLog({ from: today, to: today, limit: 1 }),
      listSessions({ from: today, to: today, limit: 1 }),
    ]);

  return {
    accounts,
    active,
    deactivated,
    admins: admins.length,
    visitsToday: visits.total,
    chatsToday: chats.total,
  };
}

function Section({
  title,
  aside,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 shrink-0 flex-col gap-2">
      <div className="flex min-h-8 items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{title}</h2>
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>
        {children}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

function Tile({
  label,
  value,
  href,
}: {
  label: string;
  value: number | undefined;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 rounded-xl border border-tile-border px-3.5 py-3 transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="text-2xl leading-tight font-semibold tabular-nums">
        {value === undefined ? "–" : formatCount(value)}
      </b>
    </Link>
  );
}

/**
 * The start of the admin area: the people who are waiting, with "Activate" on
 * each, a few numbers, and the newest visits and chats. The lists are behind
 * the sidebar.
 */
export function OverviewView() {
  const today = dayBefore(0);
  const waiting = useAdminQuery(listUsers, WAITING_PAGE);
  const numbers = useAdminQuery(loadNumbers, { today });
  const visits = useAdminQuery(listAccessLog, LATEST);
  const chats = useAdminQuery(listSessions, LATEST);
  const { ask, dialog } = useConfirmAction();

  const todayOnly = new URLSearchParams({ from: today, to: today });

  return (
    <AdminPage title="Overview">
      <Section
        title={
          <>
            Waiting for approval
            {waiting.data && waiting.data.total > 0 && (
              <WaitingCount count={waiting.data.total} />
            )}
          </>
        }
        aside={<RefreshButton />}
      >
        {!waiting.data ? (
          waiting.error ? (
            <LoadError what="the waiting people" error={waiting.error} />
          ) : (
            <ListSkeleton rows={3} />
          )
        ) : waiting.data.rows.length === 0 ? (
          <EmptyState
            title="Nobody is waiting"
            text="A new person appears here after their first visit."
          />
        ) : (
          <>
            <ul
              aria-busy={waiting.loading || undefined}
              className={`rounded-xl border border-tile-border transition-opacity ${
                waiting.loading ? "opacity-60" : ""
              }`}
            >
              {waiting.data.rows.map((user) => (
                <li
                  key={user.user_id}
                  className="flex items-center gap-3 border-b border-sidebar-border px-3.5 py-2.5 last:border-b-0"
                >
                  <Avatar userId={user.user_id} />

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <UserLink
                        userId={user.user_id}
                        className="shrink-0 font-semibold"
                      />
                      <span
                        className="truncate text-muted-foreground"
                        title={user.email ?? undefined}
                      >
                        {user.email}
                      </span>
                    </div>
                    <div
                      className="truncate text-xs text-muted-foreground"
                      title={`${user.department ?? "—"} · ${user.company ?? "—"}`}
                    >
                      {user.department ?? "—"} · {user.company ?? "—"}
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                    First visit
                    <br />
                    {formatTime(user.created_at)}
                  </div>

                  {/* The most frequent action in the whole area: a plain
                      button with one confirming step, never inside a menu. */}
                  <Button size="sm" onClick={() => ask("activate", targetOf(user))}>
                    <Check aria-hidden />
                    Activate
                  </Button>
                </li>
              ))}
            </ul>

            {waiting.data.total > waiting.data.rows.length && (
              <SeeAll href="/admin/users?status=waiting&admin=false">
                See all {formatCount(waiting.data.total)} waiting people
              </SeeAll>
            )}
          </>
        )}
      </Section>

      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
        <Tile label="Accounts" value={numbers.data?.accounts} href="/admin/users" />
        <Tile
          label="Active"
          value={numbers.data?.active}
          href="/admin/users?status=active"
        />
        <Tile
          label="Deactivated"
          value={numbers.data?.deactivated}
          href="/admin/users?status=deactivated"
        />
        <Tile label="Admins" value={numbers.data?.admins} href="/admin/admins" />
        <Tile
          label="Visits today"
          value={numbers.data?.visitsToday}
          href={`/admin/access-log?${todayOnly}`}
        />
        <Tile
          label="Chats created today"
          value={numbers.data?.chatsToday}
          href={`/admin/sessions?${todayOnly}`}
        />
      </div>

      {numbers.error !== undefined && (
        <LoadError what="the numbers" error={numbers.error} />
      )}

      <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section
          title="Latest visits"
          aside={<SeeAll href="/admin/access-log">See all</SeeAll>}
        >
          {!visits.data ? (
            visits.error ? (
              <LoadError what="the visits" error={visits.error} />
            ) : (
              <ListSkeleton />
            )
          ) : visits.data.rows.length === 0 ? (
            <EmptyState title="No visits yet" />
          ) : (
            <VisitsTable
              rows={visits.data.rows}
              withBrowser={false}
              busy={visits.loading}
            />
          )}
        </Section>

        <Section
          title="Latest chats"
          aside={<SeeAll href="/admin/sessions">See all</SeeAll>}
        >
          {!chats.data ? (
            chats.error ? (
              <LoadError what="the chats" error={chats.error} />
            ) : (
              <ListSkeleton />
            )
          ) : chats.data.rows.length === 0 ? (
            <EmptyState title="No chats yet" />
          ) : (
            <SessionsTable
              rows={chats.data.rows}
              withActivity={false}
              busy={chats.loading}
            />
          )}
        </Section>
      </div>

      {dialog}
    </AdminPage>
  );
}
