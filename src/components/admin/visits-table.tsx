"use client";

import type { AccessLogEntry } from "@/lib/admin-api";
import { formatTime } from "@/lib/admin-format";

import { TableFrame, TD, TH, UserLink } from "./parts";

/**
 * Visits: one row each time a person opened the app.
 *
 * `withUser` adds the login ID column (left out on a person's own page).
 * `withBrowser` adds the browser's name, which is around 120 characters: it is
 * cut, and the full text shows on hover.
 */
export function VisitsTable({
  rows,
  withUser = true,
  withBrowser = true,
  busy,
  fill,
}: {
  rows: AccessLogEntry[];
  withUser?: boolean;
  withBrowser?: boolean;
  busy?: boolean;
  fill?: boolean;
}) {
  const minWidth = withBrowser ? (withUser ? 760 : 560) : 0;

  return (
    <TableFrame minWidth={minWidth} busy={busy} fill={fill}>
      <colgroup>
        <col style={{ width: 172 }} />
        {withUser && <col style={withBrowser ? { width: 210 } : undefined} />}
        <col style={{ width: 150 }} />
        {withBrowser && <col />}
      </colgroup>
      <thead>
        <tr>
          <th className={TH}>Time</th>
          {withUser && <th className={TH}>Login ID</th>}
          <th className={TH}>IP address</th>
          {withBrowser && <th className={TH}>Browser</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((visit, index) => (
          <tr key={`${visit.user_id}-${visit.accessed_at}-${index}`}>
            <td className={`${TD} tabular-nums`}>
              {formatTime(visit.accessed_at)}
            </td>
            {withUser && (
              <td className={TD}>
                <UserLink userId={visit.user_id} />
              </td>
            )}
            <td className={`${TD} tabular-nums`}>{visit.ip_address || "—"}</td>
            {withBrowser && (
              <td
                className={`${TD} text-muted-foreground`}
                title={visit.user_agent ?? undefined}
              >
                {visit.user_agent || "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}
