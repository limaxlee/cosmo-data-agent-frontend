"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { isDay, listSessions, type SessionFilters } from "@/lib/admin-api";

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
  Select,
  Toolbar,
} from "./parts";
import { SessionsTable } from "./sessions-table";
import { useAdminQuery } from "./use-admin-query";
import { useUrlState } from "./use-url-state";

/**
 * The chats: across everybody, or one person's when the address carries
 * `user_id`. Narrowed by a text and by days, which are about the creation
 * unless "Last activity" is chosen.
 *
 * Only the list. This view asks /backend/admin/sessions and nothing else: a
 * request for another person's chat itself would be refused with
 * `user_mismatch`, which the app reads as "a different person has logged in".
 */
export function SessionsView() {
  const url = useUrlState();
  const router = useRouter();

  const userId = url.get("user_id");
  const search = url.get("search");
  const date = url.get("date");
  const from = url.get("from");
  const to = url.get("to");

  const filters: SessionFilters = {
    userId: userId || undefined,
    search: search || undefined,
    dateField: date === "updated" ? "updated" : undefined,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
    page: url.page,
  };

  const { data, error, loading } = useAdminQuery(listSessions, filters);

  const setUrl = url.set;

  const commitSearch = useCallback(
    (text: string) => setUrl({ search: text, page: "" }, "replace"),
    [setUrl],
  );

  const filtered = Boolean(userId || search || from || to);

  return (
    <AdminPage title="Sessions">
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
          label="Login ID, title or session ID"
          className="w-72"
        />
        <Select
          label="Which date the days are about"
          value={filters.dateField ?? ""}
          onChange={(value) => url.set({ date: value, page: "" })}
          options={[
            ["", "Created"],
            ["updated", "Last activity"],
          ]}
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
          <LoadError what="the chats" error={error} />
        ) : (
          <ListSkeleton rows={10} />
        )
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No chats found"
          text={
            data.total > 0
              ? "This page is behind the end of the list."
              : filtered
                ? "Nothing matches these filters."
                : "Nobody has started a chat yet."
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
                onClick={() => router.push("/admin/sessions")}
              >
                Clear filters
              </QuietButton>
            )
          )}
        </EmptyState>
      ) : (
        <SessionsTable rows={data.rows} busy={loading} fill />
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
