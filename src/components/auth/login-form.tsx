"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signIn, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

type LoginFormProps = {
  redirectTo?: string;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="mt-6 space-y-4">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <Input
        label="Email"
        type="email"
        name="email"
        placeholder="admin@dcs.com"
        autoComplete="email"
        required
      />
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <Link
            href="/support"
            className="text-xs font-semibold text-cyan-700 hover:text-cyan-600"
          >
            Need help?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="flex h-11 w-full rounded-xl border border-border bg-white px-4 text-sm text-foreground placeholder:text-muted transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
