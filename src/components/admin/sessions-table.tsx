"use client";

import type { AdminSession } from "@/lib/admin-api";
import { formatTime } from "@/lib/admin-format";

import { Badge, SUB, TableFrame, TD, TH, UserLink } from "./parts";

/**
 * Chats: who owns one, its title and its times. Never the conversation: an
 * admin does not read other people's chats, the backend has no address for
 * it, and a row is not a link.
 *
 * `withOwner` adds the owner column (left out on a person's own page).
 * `withActivity` adds the time of the last activity.
 */
export function SessionsTable({
  rows,
  withOwner = true,
  withActivity = true,
  busy,
  fill,
}: {
  rows: AdminSession[];
  withOwner?: boolean;
  withActivity?: boolean;
  busy?: boolean;
  fill?: boolean;
}) {
  const minWidth = withActivity ? (withOwner ? 860 : 660) : 0;

  return (
    <TableFrame minWidth={minWidth} busy={busy} fill={fill}>
      <colgroup>
        <col />
        {withOwner && <col style={{ width: withActivity ? 210 : 140 }} />}
        <col style={{ width: 172 }} />
        {withActivity && <col style={{ width: 172 }} />}
        <col style={{ width: 112 }} />
      </colgroup>
      <thead>
        <tr>
          <th className={TH}>Chat</th>
          {withOwner && <th className={TH}>Owner</th>}
          <th className={TH}>Created</th>
          {withActivity && <th className={TH}>Last activity</th>}
          <th className={TH}>State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((session) => (
          <tr key={`${session.user_id}-${session.session_id}`}>
            <td className={TD}>
              {/* A chat without a title shows its ID, as the chat sidebar does. */}
              <span
                className={
                  session.session_title
                    ? "block truncate font-semibold"
                    : "block truncate font-mono text-xs"
                }
                title={session.session_title || session.session_id}
              >
                {session.session_title || session.session_id}
              </span>
              <span className={`${SUB} font-mono`}>
                {session.session_title ? session.session_id : "No title yet"}
              </span>
            </td>
            {withOwner && (
              <td className={TD}>
                <UserLink userId={session.user_id} />
              </td>
            )}
            <td className={`${TD} tabular-nums`}>
              {formatTime(session.created_at)}
            </td>
            {withActivity && (
              <td className={`${TD} tabular-nums`}>
                {formatTime(session.last_update_time)}
              </td>
            )}
            <td className={TD}>
              {session.run_state === "running" ? (
                <Badge tone="blue">
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
                  />
                  Running
                </Badge>
              ) : (
                <span className="text-muted-foreground">Idle</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}
