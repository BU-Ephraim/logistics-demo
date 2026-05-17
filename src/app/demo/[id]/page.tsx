"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { ensureAdminSeedData, normalizeAdminId } from "@/lib/demo-data";
import {
  clearDemoAdminId,
  setDemoAdminId,
  setDemoBusinessName,
} from "@/lib/demo-settings";

export default function DemoRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    const adminId = normalizeAdminId(params.id);

    if (!adminId) {
      router.replace("/");
      return;
    }

    const currentAdminId = adminId;

    async function bootstrap() {
      try {
        setDemoAdminId(currentAdminId);
        setDemoBusinessName("SwiftSend");
        await ensureAdminSeedData(currentAdminId);
        await fetch("/api/notify-demo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminId: currentAdminId,
            businessName: "SwiftSend",
          }),
          keepalive: true,
        }).catch(() => undefined);
        router.replace("/chat");
      } catch {
        clearDemoAdminId();
        router.replace("/");
      }
    }

    void bootstrap();
  }, [params.id, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Demo</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Preparing your workspace...</h1>
      </div>
    </main>
  );
}