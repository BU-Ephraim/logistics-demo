"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ensureAdminSeedData, normalizeAdminId } from "@/lib/demo-data";
import {
  clearDemoAdminId,
  getDemoAdminId,
  normalizeBusinessName,
  setDemoAdminId,
  setDemoBusinessName,
} from "@/lib/demo-settings";
import { getErrorMessage } from "@/lib/supabase-errors";

export function DemoLanding({
  defaultAdminId,
  defaultBusinessName,
}: {
  defaultAdminId: string;
  defaultBusinessName: string;
}) {
  const router = useRouter();
  const [adminId, setAdminId] = useState(defaultAdminId);
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedId = getDemoAdminId();
    if (storedId) {
      router.replace("/chat");
      return;
    }

    if (defaultAdminId) {
      async function bootstrapDefaultAdmin() {
        try {
          setDemoAdminId(defaultAdminId);
          setDemoBusinessName(defaultBusinessName);
          await ensureAdminSeedData(defaultAdminId);
          router.replace("/chat");
        } catch {
          clearDemoAdminId();
        }
      }

      void bootstrapDefaultAdmin();
    }
  }, [defaultAdminId, defaultBusinessName, router]);

  async function startDemo(candidateId: string, candidateBusinessName: string) {
    const parsedId = normalizeAdminId(candidateId);
    const parsedBusinessName = normalizeBusinessName(candidateBusinessName);

    if (!parsedId) {
      setError("Enter a valid demo admin ID before continuing.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      setDemoAdminId(parsedId);
      setDemoBusinessName(parsedBusinessName);
      await ensureAdminSeedData(parsedId);
      router.replace("/chat");
    } catch (seedError) {
      clearDemoAdminId();
      setError(getErrorMessage(seedError, "Failed to load the demo workspace."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void startDemo(adminId, businessName);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur xl:p-10">
          <div className="mb-10 inline-flex rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
            Dispatch demo workspace
          </div>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Run a live logistics chat demo with one admin ID.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
            Customer, bot, and driver channels stay synchronized through Supabase so you can demo dispatch workflows in one place.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <FeatureCard title="Realtime inbox" description="Messages update instantly across every chat thread." />
            <FeatureCard title="Driver seeding" description="James, Sule, and Amina are created automatically for new admins." />
            <FeatureCard title="Mobile-first" description="Chat list and detail views collapse cleanly on small screens." />
          </div>
        </section>

        <section className="rounded-[28px] border border-border bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.25em] text-muted">Start demo</p>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">Enter your admin ID</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              During development, set <span className="font-medium text-foreground">DEFAULT_ADMIN_ID</span> in your environment to skip this form.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Demo admin ID</span>
              <input
                value={adminId}
                onChange={(event) => setAdminId(event.target.value)}
                placeholder="Paste a UUID"
                className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Business name</span>
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="SwiftSend"
                className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-accent px-4 font-medium text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Preparing workspace..." : "Start Demo"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}