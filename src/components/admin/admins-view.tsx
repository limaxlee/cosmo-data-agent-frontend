"use client";

import { useState } from "react";
import { ShieldX, TriangleAlert, UserPlus } from "lucide-react";

import {
  listAdmins,
  listUsers,
  normalizeUserId,
  type UserFilters,
} from "@/lib/admin-api";
import { formatTime } from "@/lib/admin-format";
import { useUser } from "@/providers/user-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AdminPage } from "./admin-shell";
import { useConfirmAction } from "./confirm-action";
import {
  AdminAccessNote,
  Badge,
  EmptyState,
  ListSkeleton,
  LoadError,
  QuietButton,
  RefreshButton,
  StatusBadge,
  TableFrame,
  TD,
  TH,
  UserLink,
  YouMark,
} from "./parts";
import { useAdminQuery } from "./use-admin-query";

const NOTHING = {};

// The accounts of the admins, for the "Account" column. An admin who is not
// in this answer has no account.
const ADMIN_ACCOUNTS: UserFilters = { isAdmin: true, limit: 200 };

/**
 * The admins by themselves, and a field to make a login ID an admin.
 *
 * The accounts list alone is not enough for this: a login ID can be made
 * admin before that person has ever opened the app, and then it is in the
 * list of admins and not in the list of accounts.
 */
export function AdminsView() {
  const { userId: me } = useUser();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const { ask, dialog } = useConfirmAction(() => setTyped(""));

  const admins = useAdminQuery(listAdmins, NOTHING);
  const accounts = useAdminQuery(listUsers, ADMIN_ACCOUNTS);

  const statusOf = (userId: string): string | null | undefined => {
    if (!accounts.data) return undefined; // not known (yet)

    return (
      accounts.data.rows.find((user) => user.user_id === userId)?.status ?? null
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const userId = normalizeUserId(typed);

    if (!userId) {
      setProblem("This is not a valid login ID.");

      return;
    }

    if (admins.data?.some((entry) => entry.user_id === userId)) {
      setProblem(`${userId} is an administrator already.`);

      return;
    }

    setProblem(null);
    ask("make-admin", { userId, isAdmin: false, status: null });
  };

  return (
    <AdminPage title="Admins">
      <form onSubmit={submit} className="flex shrink-0 flex-col gap-2">
        <label htmlFor="new-admin" className="text-sm font-semibold">
          Make a login ID an administrator
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex w-80 max-w-full items-center">
            <UserPlus
              className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="new-admin"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setProblem(null);
              }}
              placeholder="Login ID, for example gildong.hong"
              autoComplete="off"
              spellCheck={false}
              maxLength={255}
              aria-invalid={problem !== null || undefined}
              aria-describedby="new-admin-note"
              className="border-0 bg-input pl-9 shadow-none dark:bg-zinc-800"
            />
          </span>
          <Button type="submit">Make admin</Button>
          <RefreshButton />
        </div>

        {problem ? (
          <p
            id="new-admin-note"
            role="alert"
            className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : (
          <p id="new-admin-note" className="text-xs text-muted-foreground">
            This also works before the person has opened the app for the first
            time.
          </p>
        )}
      </form>

      {!admins.data ? (
        admins.error ? (
          <LoadError what="the admins" error={admins.error} />
        ) : (
          <ListSkeleton rows={3} />
        )
      ) : admins.data.length === 0 ? (
        <EmptyState title="No admins" />
      ) : (
        <TableFrame minWidth={780} busy={admins.loading}>
          <colgroup>
            <col />
            <col style={{ width: 290 }} />
            <col style={{ width: 172 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Login ID</th>
              <th className={TH}>Account</th>
              <th className={TH}>Admin since</th>
              <th className={TH}>Added by</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {admins.data.map((entry) => {
              const status = statusOf(entry.user_id);

              return (
                <tr key={entry.user_id}>
                  <td className={TD}>
                    <span className="flex min-w-0 items-center">
                      <UserLink
                        userId={entry.user_id}
                        className="truncate font-semibold no-underline"
                      />
                      {entry.user_id === me && <YouMark />}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-normal`}>
                    <span className="flex flex-wrap items-center gap-1">
                      {status === undefined ? (
                        <span className="text-muted-foreground">
                          {accounts.error ? "Not known" : "…"}
                        </span>
                      ) : status === null ? (
                        <>
                          <Badge tone="grey">No account yet</Badge>
                          <span className="text-xs text-muted-foreground">
                            Has never opened the app
                          </span>
                        </>
                      ) : (
                        <>
                          <StatusBadge status={status} />
                          {status !== "active" && <AdminAccessNote />}
                        </>
                      )}
                    </span>
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    {formatTime(entry.added_at)}
                  </td>
                  <td className={TD} title={entry.added_by ?? undefined}>
                    {entry.added_by === "bootstrap" ? (
                      <span
                        className="font-mono text-xs"
                        title="Put in by hand, in the database"
                      >
                        bootstrap
                      </span>
                    ) : (
                      (entry.added_by ?? "—")
                    )}
                  </td>
                  <td className={`${TD} overflow-visible text-right`}>
                    {/* Your own account does not offer it. Another admin can
                        still remove you. */}
                    {entry.user_id === me ? (
                      <span className="text-xs text-muted-foreground">
                        Your account
                      </span>
                    ) : (
                      <QuietButton
                        size="sm"
                        onClick={() =>
                          ask("remove-admin", {
                            userId: entry.user_id,
                            isAdmin: true,
                            status: status ?? null,
                          })
                        }
                      >
                        <ShieldX aria-hidden />
                        Remove admin
                      </QuietButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}

      {dialog}
    </AdminPage>
  );
}
