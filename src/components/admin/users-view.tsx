"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { listUsers, type UserFilters, type UserStatus } from "@/lib/admin-api";
import { formatTime } from "@/lib/admin-format";
import { useUser } from "@/providers/user-provider";
import { Button } from "@/components/ui/button";

import { AdminPage } from "./admin-shell";
import { targetOf, useConfirmAction } from "./confirm-action";
import {
  EmptyState,
  ListSkeleton,
  LoadError,
  Pager,
  QuietButton,
  RefreshButton,
  SearchInput,
  Select,
  SUB,
  TableFrame,
  TD,
  TH,
  Toolbar,
  UserLink,
  UserMarks,
  YouMark,
} from "./parts";
import { useAdminQuery } from "./use-admin-query";
import { useUrlState } from "./use-url-state";

const STATUSES: UserStatus[] = ["waiting", "active", "deactivated"];

/**
 * All accounts, narrowed by a search text, by status and by "is an admin".
 * The backend does the searching, the filtering and the cutting into pages;
 * the filters and the page number live in the address.
 */
export function UsersView() {
  const url = useUrlState();
  const router = useRouter();
  const { userId: me } = useUser();
  const { ask, dialog } = useConfirmAction();

  const search = url.get("search");
  const status = url.get("status");
  const admin = url.get("admin");

  const filters: UserFilters = {
    search: search || undefined,
    status: STATUSES.find((known) => known === status),
    isAdmin: admin === "true" ? true : admin === "false" ? false : undefined,
    page: url.page,
  };

  const { data, error, loading } = useAdminQuery(listUsers, filters);

  const setUrl = url.set;

  const commitSearch = useCallback(
    (text: string) => setUrl({ search: text, page: "" }, "replace"),
    [setUrl],
  );

  const filtered = Boolean(search || status || admin);

  return (
    <AdminPage title="Accounts">
      <Toolbar>
        <SearchInput
          value={search}
          onCommit={commitSearch}
          label="Login ID, email, department, company"
          className="w-80"
        />
        <Select
          label="Status"
          value={filters.status ?? ""}
          onChange={(value) => url.set({ status: value, page: "" })}
          options={[
            ["", "Any status"],
            ["waiting", "Waiting"],
            ["active", "Active"],
            ["deactivated", "Deactivated"],
          ]}
        />
        <Select
          label="Admin"
          value={filters.isAdmin === undefined ? "" : String(filters.isAdmin)}
          onChange={(value) => url.set({ admin: value, page: "" })}
          options={[
            ["", "Admins and others"],
            ["true", "Admins only"],
            ["false", "Not admins"],
          ]}
        />
        <RefreshButton />
      </Toolbar>

      {!data ? (
        error ? (
          <LoadError what="the accounts" error={error} />
        ) : (
          <ListSkeleton rows={10} />
        )
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No accounts found"
          text={
            data.total > 0
              ? "This page is behind the end of the list."
              : filtered
                ? "Nobody matches these filters."
                : "Nobody has opened the app yet."
          }
        >
          {data.total > 0 ? (
            <QuietButton size="sm" onClick={() => url.set({ page: "" })}>
              First page
            </QuietButton>
          ) : (
            filtered && (
              <QuietButton size="sm" onClick={() => router.push("/admin/users")}>
                Clear filters
              </QuietButton>
            )
          )}
        </EmptyState>
      ) : (
        <TableFrame minWidth={1040} busy={loading} fill>
          <colgroup>
            <col style={{ width: 230 }} />
            <col />
            <col style={{ width: 190 }} />
            <col style={{ width: 172 }} />
            <col style={{ width: 186 }} />
            <col style={{ width: 124 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Login ID</th>
              <th className={TH}>Department</th>
              <th className={TH}>Status</th>
              <th className={TH}>Last visit</th>
              <th className={TH}>First visit</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((user) => (
              /* The whole row leads to the person, for the mouse. The login
                 ID inside it is a real link, for the keyboard. */
              <tr
                key={user.user_id}
                onClick={(event) => {
                  // The link and the button inside the row act by themselves.
                  if ((event.target as HTMLElement).closest("a, button")) return;

                  router.push(`/admin/users/${encodeURIComponent(user.user_id)}`);
                }}
                className="cursor-pointer hover:bg-accent/30"
              >
                <td className={TD}>
                  <span className="flex min-w-0 items-center">
                    <UserLink
                      userId={user.user_id}
                      className="truncate font-semibold no-underline"
                    />
                    {user.user_id === me && <YouMark />}
                  </span>
                  <span className={SUB} title={user.email ?? undefined}>
                    {user.email ?? "—"}
                  </span>
                </td>
                <td className={TD}>
                  <span className="block truncate" title={user.department ?? undefined}>
                    {user.department ?? "—"}
                  </span>
                  <span className={SUB} title={user.company ?? undefined}>
                    {user.company ?? "—"}
                  </span>
                </td>
                <td className={`${TD} whitespace-normal`}>
                  <UserMarks user={user} />
                </td>
                <td className={`${TD} tabular-nums`}>
                  {formatTime(user.last_access_at)}
                  <span className={SUB}>{user.last_access_ip ?? "—"}</span>
                </td>
                <td className={`${TD} tabular-nums`}>
                  {formatTime(user.created_at)}
                  <span className={SUB} title={user.activated_by ?? undefined}>
                    {user.activated_by
                      ? `Approved by ${user.activated_by}`
                      : "Never approved"}
                  </span>
                </td>
                <td className={`${TD} overflow-visible text-right`}>
                  <span className="inline-flex items-center gap-1.5">
                    {user.status !== "active" &&
                      (user.status === "waiting" ? (
                        <Button
                          size="sm"
                          onClick={() => ask("activate", targetOf(user))}
                        >
                          Activate
                        </Button>
                      ) : (
                        <QuietButton
                          size="sm"
                          onClick={() => ask("activate", targetOf(user))}
                        >
                          Activate
                        </QuietButton>
                      ))}
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      {data && (
        <Pager
          page={url.page}
          shown={data.rows.length}
          total={data.total}
          onPage={(page) => url.set({ page: page > 1 ? String(page) : "" })}
        />
      )}

      {dialog}
    </AdminPage>
  );
}
