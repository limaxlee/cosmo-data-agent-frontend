"use client";

import { useCallback, useRef, useState } from "react";
import { Ban, Check, LoaderCircle, Shield, ShieldX, TriangleAlert } from "lucide-react";

import {
  AdminApiError,
  makeAdmin,
  removeAdmin,
  setActive,
  type AdminUser,
} from "@/lib/admin-api";
import { APP_TITLE } from "@/lib/app-title";
import { useUser } from "@/providers/user-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { useAdmin } from "./admin-context";
import { QuietButton } from "./parts";

export type AdminAction =
  | "activate"
  | "deactivate"
  | "make-admin"
  | "remove-admin";

/** The person an action is about, as far as the view knows them. */
export interface ActionTarget {
  userId: string;
  isAdmin: boolean;
  // Null for a login ID that has no account.
  status: string | null;
}

export function targetOf(user: AdminUser): ActionTarget {
  return { userId: user.user_id, isAdmin: user.is_admin, status: user.status };
}

interface Wording {
  title: string;
  // What will happen, in the person's terms.
  text: string;
  // A consequence that is easy to miss.
  warning?: string;
  confirm: string;
  danger: boolean;
}

function wordingFor(action: AdminAction, target: ActionTarget): Wording {
  const id = target.userId;

  switch (action) {
    case "activate":
      return {
        title: `Activate ${id}?`,
        text: `${id} will be able to use ${APP_TITLE}.`,
        confirm: "Activate",
        danger: false,
      };
    case "deactivate":
      return {
        title: `Deactivate ${id}?`,
        text: `${id} will be shut out at their next click.`,
        warning: target.isAdmin
          ? `${id} is an administrator. As an administrator they keep their access.`
          : undefined,
        confirm: "Deactivate",
        danger: true,
      };
    case "make-admin":
      return {
        title: `Make ${id} an administrator?`,
        text: `${id} will be able to use ${APP_TITLE} and this admin area, and to approve and remove people, including you.`,
        confirm: "Make admin",
        danger: false,
      };
    case "remove-admin":
      return {
        title: `Remove ${id} as administrator?`,
        text: `${id} will lose the admin area.`,
        warning:
          target.status !== null && target.status !== "active"
            ? `${id} is not approved, so they will also lose ${APP_TITLE}.`
            : undefined,
        confirm: "Remove admin",
        danger: true,
      };
  }
}

function send(action: AdminAction, userId: string): Promise<unknown> {
  switch (action) {
    case "activate":
      return setActive(userId, true);
    case "deactivate":
      return setActive(userId, false);
    case "make-admin":
      return makeAdmin(userId);
    case "remove-admin":
      return removeAdmin(userId);
  }
}

interface Failure {
  message: string;
  // Trying the same thing again cannot help.
  final: boolean;
  // Somebody else changed the list meanwhile: ask for it again.
  reload: boolean;
}

function failureOf(error: unknown): Failure {
  const status = error instanceof AdminApiError ? error.status : 0;
  const code = error instanceof AdminApiError ? error.code : undefined;

  if (status === 404 && code === "user_not_found") {
    return {
      message: "This account does not exist any more. The list was loaded again.",
      final: true,
      reload: true,
    };
  }

  if (status === 404 && code === "admin_not_found") {
    return {
      message:
        "This person is not an administrator any more. The list was loaded again.",
      final: true,
      reload: true,
    };
  }

  if (status === 409 && code === "last_admin") {
    return {
      message: "The last administrator cannot be removed.",
      final: true,
      reload: false,
    };
  }

  if (status === 400) {
    return { message: "This is not a valid login ID.", final: true, reload: false };
  }

  // Also a 401: after it, apiFetch() has fetched a new pass and deliberately
  // did not send the change a second time. The next press uses the new pass.
  return {
    message: "Could not save. Please try again.",
    final: false,
    reload: false,
  };
}

/**
 * Every action that changes something asks first. `ask()` opens the question;
 * `dialog` has to be rendered once by the view that uses it.
 *
 * After a change the admin area is refreshed, which asks the backend for the
 * lists and for the number of waiting people again. No row is changed by hand.
 * `onDone` runs after a change that succeeded.
 */
export function useConfirmAction(onDone?: () => void) {
  const { refresh } = useAdmin();
  const [asked, setAsked] = useState<{
    action: AdminAction;
    target: ActionTarget;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  // The button the question was opened from. The dialog has no trigger of its
  // own, so without this the keyboard focus would be lost when it closes.
  const openerRef = useRef<HTMLElement | null>(null);

  const ask = useCallback((action: AdminAction, target: ActionTarget) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setFailure(null);
    setAsked({ action, target });
  }, []);

  const confirm = async () => {
    // While a request is on its way it cannot be sent a second time.
    if (!asked || pending) return;

    setPending(true);
    setFailure(null);

    try {
      await send(asked.action, asked.target.userId);
      setAsked(null);
      refresh();
      onDone?.();
    } catch (error) {
      const failed = failureOf(error);

      setFailure(failed);
      if (failed.reload) refresh();
    } finally {
      setPending(false);
    }
  };

  const wording = asked ? wordingFor(asked.action, asked.target) : null;

  const dialog = (
    <Dialog
      open={asked !== null}
      onOpenChange={(open) => {
        if (!open && !pending) setAsked(null);
      }}
    >
      {wording && (
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();

            // Gone when the action removed its own row, for example.
            if (openerRef.current?.isConnected) openerRef.current.focus();
          }}
        >
          <DialogTitle>{wording.title}</DialogTitle>
          <DialogDescription>{wording.text}</DialogDescription>

          {wording.warning && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2.5 text-sm break-words text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{wording.warning}</span>
            </p>
          )}

          {failure && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{failure.message}</span>
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <QuietButton disabled={pending} onClick={() => setAsked(null)}>
              {failure?.final ? "Close" : "Cancel"}
            </QuietButton>

            {!failure?.final && (
              <Button
                variant={wording.danger ? "destructive" : "default"}
                disabled={pending}
                onClick={confirm}
              >
                {pending && <LoaderCircle className="animate-spin" aria-hidden />}
                {wording.confirm}
              </Button>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );

  return { ask, dialog };
}

/**
 * The actions on one person, as buttons.
 *
 * On your own account neither "Deactivate" nor "Remove admin" is offered.
 * Another admin can still do both to you: this only stops a slip of your own
 * hand.
 */
export function PersonActions({
  target,
  ask,
}: {
  target: ActionTarget;
  ask: (action: AdminAction, target: ActionTarget) => void;
}) {
  const { userId: me } = useUser();
  const mine = target.userId === me;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {target.status !== null && target.status !== "active" && (
        <Button onClick={() => ask("activate", target)}>
          <Check aria-hidden />
          Activate
        </Button>
      )}

      {target.status === "active" && !mine && (
        <QuietButton onClick={() => ask("deactivate", target)}>
          <Ban aria-hidden />
          Deactivate
        </QuietButton>
      )}

      {!target.isAdmin && (
        <QuietButton onClick={() => ask("make-admin", target)}>
          <Shield aria-hidden />
          Make admin
        </QuietButton>
      )}

      {target.isAdmin && !mine && (
        <QuietButton onClick={() => ask("remove-admin", target)}>
          <ShieldX aria-hidden />
          Remove admin
        </QuietButton>
      )}

      {mine && (
        <span className="text-xs text-muted-foreground">This is your account</span>
      )}
    </div>
  );
}
