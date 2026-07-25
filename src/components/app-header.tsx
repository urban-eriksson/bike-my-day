"use client";

import Link from "next/link";
import { ArrowLeft, LogOut, Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccount, signOut } from "@/app/dashboard/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shared top bar for signed-in pages. Sticky with safe-area padding so it
 * sits under the iOS status bar in standalone (home-screen) mode.
 *
 * Pass `back` on any page below the dashboard: the wordmark keeps its place
 * and its job (it already goes home) and gains a leading arrow, so there is
 * one obvious way back rather than two competing ones.
 */
export function AppHeader({ back = false }: { back?: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <header className="sticky top-0 z-40 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          aria-label={back ? "Back to your rides" : "Your rides"}
          className="group -ml-1 flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1 font-heading text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {back ? (
            <ArrowLeft
              aria-hidden
              className="size-5 text-primary transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
            />
          ) : null}
          bike my day
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <Settings className="size-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SlidersHorizontal /> Preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => startTransition(() => signOut())}>
              <LogOut /> Sign out
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Horizon line: the header's only decoration. */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your rides, preferences and notifications are removed for good. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteAccount())}
            >
              {pending ? (
                <>
                  <Spinner /> Deleting…
                </>
              ) : (
                "Delete account"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
