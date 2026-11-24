"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import {
  findUser,
  listAccessLog,
  listAdmins,
  listSessions,
  type AdminUser,
} from "@/lib/admin-api";
import { formatCount, formatTime } from "@/lib/admin-format";
import { useUser } from "@/providers/user-provider";
import { Button } from "@/components/ui/button";

import { AdminPage } from "./admin-shell";
import {
  PersonActions,
  targetOf,
  useConfirmAction,
  type ActionTarget,
} from "./confirm-action";
import {
  AdminBadge,
  Avatar,
  Badge,
  EmptyState,
  ListSkeleton,
  LoadError,
  RefreshButton,
  UserMarks,
  YouMark,
} from "./parts";
import { SessionsTable } from "./sessions-table";
import { useAdminQuery } from "./use-admin-query";
import { VisitsTable } from "./visits-table";

// How many of the newest visits and chats the page shows. The full lists are
// one click away, with this person preselected.
const LATEST = 8;

const NOTHING = {};

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function Facts({ user }: { user: AdminUser }) {
  return (
    <dl className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-5 gap-y-3">
      <Fact label="Department">{user.department ?? "—"}</Fact>
      <Fact label="Company">{user.company ?? "—"}</Fact>
      <Fact label="First visit">
        <span className="tabular-nums">{formatTime(user.created_at)}</span>
      </Fact>
      <Fact label="Approved">
        {user.activated_at ? (
          <>
            <span className="tabular-nums">{formatTime(user.activated_at)}</span>
            {user.activated_by ? ` by ${user.activated_by}` : ""}
            {user.status === "deactivated" ? " (taken away since)" : ""}
          </>
        ) : (
          "Never"
        )}
      </Fact>
      <Fact label="Last visit">
        <span className="tabular-nums">{formatTime(user.last_access_at)}</span>
        {user.last_access_ip ? ` from ${user.last_access_ip}` : ""}
      </Fact>
      {/* Technical values from the company login. */}
      <Fact label="Windows name">
        <span className="font-mono text-xs">{user.unique_name ?? "—"}</span>
      </Fact>
      <Fact label="SID">
        <span className="font-mono text-xs">{user.sid ?? "—"}</span>
      </Fact>
      <Fact label="Roles">
        {user.roles && user.roles.length > 0 ? user.roles.join(", ") : "None"}
      </Fact>
    </dl>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 shrink-0 flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
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

/**
 * One person: their state, the actions, their details, and their newest
 * visits and chats.
 *
 * A login ID can be without an account: an admin who has not opened the app
 * yet, or the owner of an old chat. The page then says so and still shows
 * what exists for that ID.
 */
export function PersonView({ userId }: { userId: string }) {
  const { userId: me } = useUser();
  const { ask, dialog } = useConfirmAction();

  const account = useAdminQuery(findUser, userId);
  const noAccount = account.data === null;
  // Whether an ID without an account is an admin is only in the admins list.
  const admins = useAdminQuery(listAdmins, noAccount ? NOTHING : null);
  const visits = useAdminQuery(listAccessLog, { userId, limit: LATEST });
  const chats = useAdminQuery(listSessions, { userId, limit: LATEST });

  const user = account.data ?? null;
  const onlyThem = new URLSearchParams({ user_id: userId });

  const target: ActionTarget | null = user
    ? targetOf(user)
    : noAccount && admins.data
      ? {
          userId,
          isAdmin: admins.data.some(
            (entry) => entry.user_id.toLowerCase() === userId.toLowerCase(),
          ),
          status: null,
        }
      : null;

  return (
    <AdminPage
      title={userId}
      back={
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href="/admin/users">
            <ArrowLeft aria-hidden />
            Accounts
          </Link>
        </Button>
      }
    >
      {account.data === undefined ? (
        account.error ? (
          <LoadError what="this person" error={account.error} />
        ) : (
          <ListSkeleton rows={3} />
        )
      ) : (
        <>
          <div
            aria-busy={account.loading || undefined}
            className={`flex shrink-0 flex-wrap items-start gap-3 transition-opacity ${
              account.loading ? "opacity-60" : ""
            }`}
          >
            <Avatar userId={userId} large />

            <div className="min-w-48 flex-1">
              <h2 className="flex items-center text-xl font-semibold break-all">
                {user?.user_id ?? userId}
                {userId === me && <YouMark />}
              </h2>
              <p className="mt-0.5 mb-2 text-sm break-all text-muted-foreground">
                {user
                  ? (user.email ?? "No email")
                  : "No account has this login ID. Nobody has opened the app with it."}
              </p>
              {user ? (
                <UserMarks user={user} />
              ) : (
                <span className="flex flex-wrap items-center gap-1">
                  <Badge tone="grey">No account</Badge>
                  {target?.isAdmin && <AdminBadge />}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {target && <PersonActions target={target} ask={ask} />}
              <RefreshButton />
            </div>
          </div>

          {user && <Facts user={user} />}
        </>
      )}

      <Section
        title="Latest visits"
        aside={
          visits.data &&
          visits.data.total > 0 && (
            <SeeAll href={`/admin/access-log?${onlyThem}`}>
              See all {formatCount(visits.data.total)} in the access log
            </SeeAll>
          )
        }
      >
        {!visits.data ? (
          visits.error ? (
            <LoadError what="the visits" error={visits.error} />
          ) : (
            <ListSkeleton rows={4} />
          )
        ) : visits.data.rows.length === 0 ? (
          <EmptyState title="No visits" />
        ) : (
          <VisitsTable
            rows={visits.data.rows}
            withUser={false}
            busy={visits.loading}
          />
        )}
      </Section>

      <Section
        title="Latest chats"
        aside={
          chats.data &&
          chats.data.total > 0 && (
            <SeeAll href={`/admin/sessions?${onlyThem}`}>
              See all {formatCount(chats.data.total)} in the sessions list
            </SeeAll>
          )
        }
      >
        {!chats.data ? (
          chats.error ? (
            <LoadError what="the chats" error={chats.error} />
          ) : (
            <ListSkeleton rows={4} />
          )
        ) : chats.data.rows.length === 0 ? (
          <EmptyState title="No chats" />
        ) : (
          <SessionsTable
            rows={chats.data.rows}
            withOwner={false}
            busy={chats.loading}
          />
        )}
      </Section>

      {dialog}
    </AdminPage>
  );
}
