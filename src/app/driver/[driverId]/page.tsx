"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { markOrderDelivered, markOrderPickedUp } from "@/lib/botLogic";
import { getDemoAdminId } from "@/lib/demo-settings";
import { getErrorMessage } from "@/lib/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DriverRow, OrderRow } from "@/types/database";

type DriverDashboardView = "pending" | "completed";

function subscribeToSessionChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === "demo_admin_id") {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function getAdminIdSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return getDemoAdminId();
}

export default function DriverDashboardPage() {
  const params = useParams<{ driverId: string }>();
  const router = useRouter();
  const adminId = useSyncExternalStore(
    subscribeToSessionChange,
    getAdminIdSnapshot,
    () => null
  );
  const isHydrated = useSyncExternalStore(
    subscribeToSessionChange,
    () => true,
    () => false
  );
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [view, setView] = useState<DriverDashboardView>("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingOrderId, setIsUpdatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && !adminId) {
      router.replace("/");
    }
  }, [adminId, isHydrated, router]);

  useEffect(() => {
    if (!adminId || !params.driverId) {
      return;
    }

    const activeAdminId = adminId;
    const activeDriverId = params.driverId;
    let isMounted = true;

    async function loadDriverDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [driverRow, orderRows] = await Promise.all([
          fetchDriver(activeAdminId, activeDriverId),
          fetchDriverOrders(activeAdminId, activeDriverId),
        ]);

        if (!isMounted) {
          return;
        }

        setDriver(driverRow);
        setOrders(orderRows);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(getErrorMessage(loadError, "Failed to load driver dashboard."));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDriverDashboard();

    return () => {
      isMounted = false;
    };
  }, [adminId, params.driverId]);

  useEffect(() => {
    if (!adminId || !params.driverId) {
      return;
    }

    const activeAdminId = adminId;
    const activeDriverId = params.driverId;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`driver-dashboard:${activeDriverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `admin_id=eq.${activeAdminId}`,
        },
        async () => {
          try {
            const freshOrders = await fetchDriverOrders(activeAdminId, activeDriverId);
            setOrders(freshOrders);
          } catch (syncError) {
            setError(getErrorMessage(syncError, "Failed to sync driver orders."));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adminId, params.driverId]);

  const todayStart = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "pending" ||
          order.status === "assigned" ||
          order.status === "picked_up"
      ),
    [orders]
  );
  const completedOrders = useMemo(
    () => orders.filter((order) => order.status === "delivered"),
    [orders]
  );

  const completedToday = useMemo(
    () => completedOrders.filter((order) => isOnOrAfter(order.delivered_at, todayStart)).length,
    [completedOrders, todayStart]
  );

  async function handlePickup(order: OrderRow) {
    if (!adminId || !driver?.name) {
      return;
    }

    setIsUpdatingOrderId(order.id);
    setError(null);

    try {
      await markOrderPickedUp(adminId, order.id, driver.name);
    } catch (updateError) {
      setError(getErrorMessage(updateError, "Failed to mark order as picked up."));
    } finally {
      setIsUpdatingOrderId(null);
    }
  }

  async function handleDeliver(order: OrderRow) {
    if (!adminId || !driver?.name) {
      return;
    }

    setIsUpdatingOrderId(order.id);
    setError(null);

    try {
      await markOrderDelivered(adminId, order.id, driver.name);
    } catch (updateError) {
      setError(getErrorMessage(updateError, "Failed to mark order as delivered."));
    } finally {
      setIsUpdatingOrderId(null);
    }
  }

  if (!isHydrated || !adminId || isLoading) {
    return <DriverLoadingState />;
  }

  if (!driver) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-[28px] border border-border bg-card p-8 text-center shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-foreground">Driver not found</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            The requested driver could not be found for this admin workspace.
          </p>
          <Link
            href="/chat"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-medium text-accent-foreground"
          >
            Return to chat
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Driver dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">{driver.name}</h1>
            <p className="mt-2 text-sm text-muted">{formatDriverHeaderDate(new Date())}</p>
          </div>
          <Link
            href="/chat"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-background"
          >
            Back to chat
          </Link>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-3 gap-2 sm:gap-4">
          <DriverStatCard label="Pending Orders" value={pendingOrders.length} />
          <DriverStatCard label="Completed Today" value={completedToday} />
          <DriverStatCard label="Total Completed" value={completedOrders.length} />
        </section>

        <div className="mt-6 flex flex-col gap-4 pb-6">
          <section className="rounded-[24px] border border-border bg-card p-2 shadow-2xl shadow-black/20">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setView("pending")}
                aria-pressed={view === "pending"}
                className={getDriverTabClassName(view === "pending")}
              >
                <span>Pending Orders</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                  {pendingOrders.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView("completed")}
                aria-pressed={view === "completed"}
                className={getDriverTabClassName(view === "completed")}
              >
                <span>Completed Orders</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                  {completedOrders.length}
                </span>
              </button>
            </div>
          </section>

          {view === "pending" ? (
            <DriverOrdersPanel title="Pending Orders" subtitle="Current assignments and pickups in progress.">
              <DriverOrdersTable>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.2em] text-muted">
                    <DriverTableHead>Order #</DriverTableHead>
                    <DriverTableHead>Pickup → Dropoff</DriverTableHead>
                    <DriverTableHead>Customer</DriverTableHead>
                    <DriverTableHead>Phone</DriverTableHead>
                    <DriverTableHead>Item</DriverTableHead>
                    <DriverTableHead>Status</DriverTableHead>
                    <DriverTableHead>Actions</DriverTableHead>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/80 align-top last:border-0">
                      <DriverTableCell>#{order.order_number ?? "..."}</DriverTableCell>
                      <DriverTableCell>{order.pickup} → {order.dropoff}</DriverTableCell>
                      <DriverTableCell>{order.customer_name}</DriverTableCell>
                      <DriverTableCell>{order.phone}</DriverTableCell>
                      <DriverTableCell>{order.item ?? "Not specified"}</DriverTableCell>
                      <DriverTableCell>
                        <DriverStatusPill status={order.status ?? "pending"} />
                      </DriverTableCell>
                      <DriverTableCell>
                        <div className="flex min-w-[220px] flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePickup(order)}
                            disabled={isUpdatingOrderId === order.id || order.status === "picked_up"}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Mark Picked Up
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeliver(order)}
                            disabled={isUpdatingOrderId === order.id}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Mark Delivered
                          </button>
                        </div>
                      </DriverTableCell>
                    </tr>
                  ))}
                  {pendingOrders.length === 0 ? (
                    <DriverEmptyRow label="No pending orders." colSpan={7} />
                  ) : null}
                </tbody>
              </DriverOrdersTable>
            </DriverOrdersPanel>
          ) : (
            <DriverOrdersPanel title="Completed Orders" subtitle="Recent completed deliveries.">
              <DriverOrdersTable>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.2em] text-muted">
                    <DriverTableHead>Order #</DriverTableHead>
                    <DriverTableHead>Pickup → Dropoff</DriverTableHead>
                    <DriverTableHead>Customer</DriverTableHead>
                    <DriverTableHead>Phone</DriverTableHead>
                    <DriverTableHead>Item</DriverTableHead>
                    <DriverTableHead>Delivered At</DriverTableHead>
                  </tr>
                </thead>
                <tbody>
                  {completedOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/80 align-top last:border-0">
                      <DriverTableCell>#{order.order_number ?? "..."}</DriverTableCell>
                      <DriverTableCell>{order.pickup} → {order.dropoff}</DriverTableCell>
                      <DriverTableCell>{order.customer_name}</DriverTableCell>
                      <DriverTableCell>{order.phone}</DriverTableCell>
                      <DriverTableCell>{order.item ?? "Not specified"}</DriverTableCell>
                      <DriverTableCell>{formatDriverDate(order.delivered_at)}</DriverTableCell>
                    </tr>
                  ))}
                  {completedOrders.length === 0 ? (
                    <DriverEmptyRow label="No completed orders yet." colSpan={6} />
                  ) : null}
                </tbody>
              </DriverOrdersTable>
            </DriverOrdersPanel>
          )}
        </div>
      </div>
    </main>
  );
}

async function fetchDriver(adminId: string, driverId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, admin_id, name, phone, created_at")
    .eq("admin_id", adminId)
    .eq("id", driverId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as DriverRow | null;
}

async function fetchDriverOrders(adminId: string, driverId: string) {
  const driver = await fetchDriver(adminId, driverId);
  if (!driver) {
    return [];
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, admin_id, order_number, customer_name, pickup, dropoff, phone, item, status, driver_name, created_at, delivered_at"
    )
    .eq("admin_id", adminId)
    .eq("driver_name", driver.name)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as OrderRow[];
}

function DriverLoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Driver dashboard</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Loading orders...</h1>
      </div>
    </main>
  );
}

function DriverStatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-border bg-card p-3 shadow-2xl shadow-black/20 sm:rounded-[24px] sm:p-5">
      <p className="text-[10px] uppercase leading-4 tracking-[0.12em] text-muted sm:text-sm sm:tracking-[0.24em]">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold leading-tight text-foreground sm:mt-4 sm:text-4xl">
        {value}
      </p>
    </article>
  );
}

function DriverOrdersPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[28px] border border-border bg-card shadow-2xl shadow-black/20">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function DriverOrdersTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse">{children}</table>
    </div>
  );
}

function DriverTableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function DriverTableCell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-4 text-sm leading-6 text-foreground">{children}</td>;
}

function DriverEmptyRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-muted">
        {label}
      </td>
    </tr>
  );
}

function DriverStatusPill({ status }: { status: string }) {
  const tone =
    status === "delivered"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : status === "picked_up"
        ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
        : status === "assigned"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function getDriverTabClassName(isActive: boolean) {
  return isActive
    ? "inline-flex items-center justify-between gap-3 rounded-[18px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition"
    : "inline-flex items-center justify-between gap-3 rounded-[18px] border border-border bg-background px-4 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground";
}

function isOnOrAfter(value: string | null, start: Date) {
  if (!value) {
    return false;
  }

  return new Date(value) >= start;
}

function formatDriverHeaderDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDriverDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}