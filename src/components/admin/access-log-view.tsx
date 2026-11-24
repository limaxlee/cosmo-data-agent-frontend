"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { isDay, listAccessLog, type AccessLogFilters } from "@/lib/admin-api";

import { AdminPage } from "./admin-shell";
import {
  DayRange,
  EmptyState,
  ListSkeleton,
  LoadError,
  OnlyPerson,
  Pager,
  QuietButton,
  RefreshButton,
  SearchInput,
  Toolbar,
} from "./parts";
import { useAdminQuery } from "./use-admin-query";
import { useUrlState } from "./use-url-state";
import { VisitsTable } from "./visits-table";

/**
 * The access log: who opened the app, when, from which address. Across
 * everybody, or for one person when the address carries `user_id`.
 *
 * `user_id` and `search` are different filters. A person's page links here
 * with `user_id`, which means that person and nobody else. A typed text is
 * sent as `search`, which also finds login IDs that contain it.
 */
export function AccessLogView() {
  const url = useUrlState();
  const router = useRouter();

  const userId = url.get("user_id");
  const search = url.get("search");
  const from = url.get("from");
  const to = url.get("to");

  const filters: AccessLogFilters = {
    userId: userId || undefined,
    search: search || undefined,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
    page: url.page,
  };

  const { data, error, loading } = useAdminQuery(listAccessLog, filters);

  const setUrl = url.set;

  const commitSearch = useCallback(
    (text: string) => setUrl({ search: text, page: "" }, "replace"),
    [setUrl],
  );

  const filtered = Boolean(userId || search || from || to);

  return (
    <AdminPage title="Access log">
      <Toolbar>
        {userId && (
          <OnlyPerson
            userId={userId}
            onClear={() => url.set({ user_id: "", page: "" })}
          />
        )}
        <SearchInput
          value={search}
          onCommit={commitSearch}
          label="Login ID or IP address"
          className="w-64"
        />
        <DayRange
          from={filters.from ?? ""}
          to={filters.to ?? ""}
          onChange={(range) => url.set({ ...range, page: "" })}
        />
        <RefreshButton />
      </Toolbar>

      {!data ? (
        error ? (
          <LoadError what="the access log" error={error} />
        ) : (
          <ListSkeleton rows={10} />
        )
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No visits found"
          text={
            data.total > 0
              ? "This page is behind the end of the list."
              : filtered
                ? "Nothing matches these filters."
                : "Nobody has opened the app yet."
          }
        >
          {data.total > 0 ? (
            <QuietButton size="sm" onClick={() => url.set({ page: "" })}>
              First page
            </QuietButton>
          ) : (
            filtered && (
              <QuietButton
                size="sm"
                onClick={() => router.push("/admin/access-log")}
              >
                Clear filters
              </QuietButton>
            )
          )}
        </EmptyState>
      ) : (
        <VisitsTable rows={data.rows} busy={loading} fill />
      )}

      {data && (
        <Pager
          page={url.page}
          shown={data.rows.length}
          total={data.total}
          onPage={(page) => url.set({ page: page > 1 ? String(page) : "" })}
        />
      )}
    </AdminPage>
  );
}
