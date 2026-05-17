"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, MessageCircle, X } from "lucide-react";

import { assignOrderToDriver } from "@/lib/botLogic";
import { fetchDrivers, fetchOrders, insertDrivers } from "@/lib/demo-data";
import { getDemoAdminId } from "@/lib/demo-settings";
import { getErrorMessage } from "@/lib/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DriverRow, OrderRow } from "@/types/database";

type AssignmentState = Record<string, string>;
type DashboardView = "active" | "completed";
type DriverFormState = {
  name: string;
  phone: string;
};

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

export default function DashboardPage() {
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
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [assignmentState, setAssignmentState] = useState<AssignmentState>({});
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>("active");
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverForm, setDriverForm] = useState<DriverFormState>({ name: "", phone: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isSavingDriver, setIsSavingDriver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.warn(
      "Demo security note: this app relies on client-side admin_id filtering. Add Supabase Auth or a server-validated token flow before treating this as production-safe multi-tenant isolation."
    );
  }, []);

  useEffect(() => {
    if (isHydrated && !adminId) {
      router.replace("/");
    }
  }, [adminId, isHydrated, router]);

  useEffect(() => {
    if (!adminId) {
      return;
    }

    const activeAdminId = adminId;
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [orderRows, driverRows] = await Promise.all([
          fetchOrders(activeAdminId),
          fetchDrivers(activeAdminId),
        ]);

        if (!isMounted) {
          return;
        }

        setOrders(orderRows);
        setDrivers(driverRows);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(getErrorMessage(loadError, "Failed to load dashboard."));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [adminId]);

  useEffect(() => {
    if (!adminId) {
      return;
    }

    const activeAdminId = adminId;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`dashboard:${activeAdminId}`)
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
            const freshOrders = await fetchOrders(activeAdminId);
            setOrders(freshOrders);
          } catch (syncError) {
            setError(getErrorMessage(syncError, "Failed to sync orders."));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adminId]);

  const todayStart = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const activeOrders = useMemo(
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

  const stats = useMemo(() => {
    const totalOrdersToday = orders.filter((order) => isOnOrAfter(order.created_at, todayStart)).length;
    const deliveredToday = orders.filter((order) => isOnOrAfter(order.delivered_at, todayStart)).length;
    const pendingOrders = orders.filter(
      (order) =>
        order.status === "pending" ||
        order.status === "assigned" ||
        order.status === "picked_up"
    ).length;
    const totalDrivers = drivers.length;
    const busyDrivers = new Set(
      orders
        .filter(
          (order) =>
            (order.status === "assigned" || order.status === "picked_up") &&
            order.driver_name
        )
        .map((order) => order.driver_name)
    ).size;
    const totalAmountMade = orders
      .filter((order) => order.status === "delivered")
      .reduce((sum, order) => sum + parseAmount(order.amount), 0);
    const completionRate = orders.length === 0 ? 0 : Math.round((completedOrders.length / orders.length) * 100);

    return {
      totalOrdersToday,
      deliveredToday,
      pendingOrders,
      totalDrivers,
      busyDrivers,
      totalAmountMade,
      completionRate,
    };
  }, [completedOrders.length, drivers.length, orders, todayStart]);

  async function handleAssignDriver(order: OrderRow) {
    if (!adminId) {
      return;
    }

    const activeAdminId = adminId;
    const driverName = assignmentState[order.id];
    if (!driverName) {
      setError("Select a driver before assigning.");
      return;
    }

    setIsAssigning(order.id);
    setError(null);

    try {
      await assignOrderToDriver(activeAdminId, order.id, driverName);
    } catch (assignError) {
      setError(getErrorMessage(assignError, "Failed to assign driver."));
    } finally {
      setIsAssigning(null);
    }
  }

  async function handleAddDriver() {
    if (!adminId) {
      return;
    }

    const activeAdminId = adminId;
    const name = driverForm.name.trim();
    const phone = driverForm.phone.trim();

    if (!name || !phone) {
      setError("Enter both driver name and phone number.");
      return;
    }

    setIsSavingDriver(true);
    setError(null);

    try {
      const { error: insertError } = await insertDrivers([
        {
          admin_id: activeAdminId,
          name,
          phone,
        },
      ]);

      if (insertError) {
        throw insertError;
      }

      const freshDrivers = await fetchDrivers(activeAdminId);
      setDrivers(freshDrivers);
      setDriverForm({ name: "", phone: "" });
      setIsDriverModalOpen(false);
    } catch (driverError) {
      setError(getErrorMessage(driverError, "Failed to add driver."));
    } finally {
      setIsSavingDriver(false);
    }
  }

  async function handleDownloadCompletedOrdersCsv() {
    if (!adminId) {
      return;
    }

    const activeAdminId = adminId;
    setIsDownloadingCsv(true);
    setError(null);

    try {
      const orderRows = await fetchOrders(activeAdminId);
      const deliveredOrders = orderRows.filter((order) => order.status === "delivered");
      const csv = buildCompletedOrdersCsv(deliveredOrders);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateSuffix = new Date().toISOString().slice(0, 10);

      link.href = objectUrl;
      link.download = `completed-orders-${dateSuffix}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, "Failed to download completed orders CSV."));
    } finally {
      setIsDownloadingCsv(false);
    }
  }

  if (!isHydrated || !adminId || isLoading) {
    return <DashboardLoadingState />;
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Operations</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Dashboard</h1>
          </div>
          <Link
            href="/chat"
            className="hidden h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-background sm:inline-flex"
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
          <StatCard label="Total Orders Today" value={stats.totalOrdersToday} />
          <StatCard label="Delivered Today" value={stats.deliveredToday} />
          <StatCard label="Pending Orders" value={stats.pendingOrders} />
          <StatCard
            label="Drivers"
            value={stats.totalDrivers}
            detail={`${stats.busyDrivers} handling live orders`}
            action={
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(true)}
                className="inline-flex w-fit items-center justify-center self-start rounded-lg border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-accent transition hover:bg-accent/20 sm:self-auto sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.18em]"
              >
                Add Driver
              </button>
            }
          />
          <StatCard
            label="Total Amount Made"
            value={formatCurrency(stats.totalAmountMade)}
            detail="Delivered orders only"
          />
          <StatCard label="Completion Rate" value={`${stats.completionRate}%`} detail="Delivered vs total orders" />
        </section>

        <div className="mt-6 flex flex-col gap-4 pb-6">
          <section className="rounded-[24px] border border-border bg-card p-2 shadow-2xl shadow-black/20">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDashboardView("active")}
                aria-pressed={dashboardView === "active"}
                className={getDashboardTabClassName(dashboardView === "active")}
              >
                <span>Active Orders</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                  {activeOrders.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDashboardView("completed")}
                aria-pressed={dashboardView === "completed"}
                className={getDashboardTabClassName(dashboardView === "completed")}
              >
                <span>Completed Orders</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                  {completedOrders.length}
                </span>
              </button>
            </div>
          </section>

          {dashboardView === "active" ? (
            <OrdersPanel title="Active Orders" subtitle="Manual dispatch fallback for pending, assigned, and picked up deliveries.">
            <OrdersTable>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.2em] text-muted">
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/80 align-top last:border-0">
                    <TableCell>#{order.order_number ?? "..."}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>{order.pickup} → {order.dropoff}</TableCell>
                    <TableCell>{order.amount ?? "pending"}</TableCell>
                    <TableCell>{order.driver_name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <StatusPill status={order.status ?? "pending"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[220px] items-center gap-2">
                        <select
                          value={assignmentState[order.id] ?? order.driver_name ?? ""}
                          onChange={(event) =>
                            setAssignmentState((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                        >
                          <option value="">Select driver</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.name}>
                              {driver.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleAssignDriver(order)}
                          disabled={isAssigning === order.id}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAssigning === order.id ? "Assigning..." : "Assign Driver"}
                        </button>
                      </div>
                    </TableCell>
                  </tr>
                ))}
                {activeOrders.length === 0 ? (
                  <EmptyTableRow label="No active orders yet." colSpan={7} />
                ) : null}
              </tbody>
            </OrdersTable>
            </OrdersPanel>
          ) : (
            <OrdersPanel
              title="Completed Orders"
              subtitle="Delivered runs with full payout and customer details."
              action={
                <button
                  type="button"
                  onClick={() => void handleDownloadCompletedOrdersCsv()}
                  disabled={isDownloadingCsv}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:border-accent/30 hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-xl sm:px-4 sm:text-sm"
                >
                  {isDownloadingCsv ? "Preparing CSV..." : "Download CSV"}
                </button>
              }
            >
            <OrdersTable>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.2em] text-muted">
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {completedOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/80 align-top last:border-0">
                    <TableCell>#{order.order_number ?? "..."}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>{order.pickup} → {order.dropoff}</TableCell>
                    <TableCell>{order.amount ?? "pending"}</TableCell>
                    <TableCell>{order.driver_name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <StatusPill status={order.status ?? "delivered"} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-accent/30 hover:bg-card"
                      >
                        Details
                      </button>
                    </TableCell>
                  </tr>
                ))}
                {completedOrders.length === 0 ? (
                  <EmptyTableRow label="No completed orders yet." colSpan={7} />
                ) : null}
              </tbody>
            </OrdersTable>
            </OrdersPanel>
          )}
        </div>
      </div>

      <nav className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-3 sm:gap-4">
          <Link
            href="/chat"
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-muted transition hover:border-accent/30 hover:text-foreground"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Chats</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-3 text-accent transition"
            aria-current="page"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
        </div>
      </nav>

      {selectedOrder ? (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      ) : null}

      {isDriverModalOpen ? (
        <DriverOnboardingModal
          driverForm={driverForm}
          isSaving={isSavingDriver}
          onChange={(field, value) =>
            setDriverForm((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onClose={() => {
            if (isSavingDriver) {
              return;
            }

            setIsDriverModalOpen(false);
            setDriverForm({ name: "", phone: "" });
          }}
          onSubmit={() => void handleAddDriver()}
        />
      ) : null}
    </main>
  );
}

function DashboardLoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Operations</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Loading dashboard...</h1>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  action,
}: {
  label: string;
  value: number | string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-[18px] border border-border bg-card p-3 shadow-2xl shadow-black/20 sm:rounded-[24px] sm:p-5">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <p className="min-w-0 text-[10px] uppercase leading-4 tracking-[0.12em] text-muted sm:text-sm sm:tracking-[0.24em]">
          {label}
        </p>
        {action}
      </div>
      <p className="mt-3 break-words text-lg font-semibold leading-tight text-foreground sm:mt-4 sm:text-4xl">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-[10px] leading-4 text-muted sm:mt-2 sm:text-sm sm:leading-5">
          {detail}
        </p>
      ) : null}
    </article>
  );
}

function OrdersPanel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[28px] border border-border bg-card shadow-2xl shadow-black/20">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {action}
        </div>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function OrdersTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 w-full overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">{children}</table>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-4 text-sm leading-6 text-foreground">{children}</td>;
}

function EmptyTableRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-muted">
        {label}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: string }) {
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

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose: () => void;
}) {
  const assignedLabel =
    order.status === "pending"
      ? "Pending assignment"
      : formatTimelineTimestamp(order.created_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-border bg-card shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Order details</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Order #{order.order_number ?? "..."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:border-accent/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
          <DetailItem label="Customer" value={order.customer_name} />
          <DetailItem label="Phone" value={order.phone} />
          <DetailItem label="Pickup" value={order.pickup} />
          <DetailItem label="Dropoff" value={order.dropoff} />
          <DetailItem label="Item" value={order.item ?? "Not specified"} />
          <DetailItem label="Amount" value={order.amount ?? "pending"} />
          <DetailItem label="Driver" value={order.driver_name ?? "Unassigned"} />
          <DetailItem label="Status" value={order.status ?? "pending"} />
        </div>
        <div className="border-t border-border px-6 py-5">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Timeline</p>
          <div className="mt-4 grid gap-3">
            <TimelineRow label="Created" value={formatTimelineTimestamp(order.created_at)} />
            <TimelineRow label="Assigned" value={assignedLabel} />
            <TimelineRow label="Delivered" value={formatTimelineTimestamp(order.delivered_at)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverOnboardingModal({
  driverForm,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  driverForm: DriverFormState;
  isSaving: boolean;
  onChange: (field: keyof DriverFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-border bg-card shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Driver onboarding</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Add a new driver</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-6">
          <label className="grid gap-2 text-sm text-muted">
            <span className="uppercase tracking-[0.18em]">Driver name</span>
            <input
              value={driverForm.name}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="Amina Bello"
              className="h-12 rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <label className="grid gap-2 text-sm text-muted">
            <span className="uppercase tracking-[0.18em]">Phone number</span>
            <input
              value={driverForm.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              placeholder="+2348012345678"
              className="h-12 rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Add driver"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function isOnOrAfter(value: string | null, start: Date) {
  if (!value) {
    return false;
  }

  return new Date(value) >= start;
}

function formatTimelineTimestamp(value: string | null) {
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

function parseAmount(value: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function getDashboardTabClassName(isActive: boolean) {
  return isActive
    ? "inline-flex items-center justify-between gap-3 rounded-[18px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition"
    : "inline-flex items-center justify-between gap-3 rounded-[18px] border border-border bg-background px-4 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground";
}

function buildCompletedOrdersCsv(orders: OrderRow[]) {
  const headers = [
    "Order #",
    "Customer Name",
    "Pickup",
    "Dropoff",
    "Phone",
    "Item",
    "Amount",
    "Driver",
    "Delivered At",
  ];

  const rows = orders.map((order) => [
    order.order_number ?? "",
    order.customer_name,
    order.pickup,
    order.dropoff,
    order.phone,
    order.item ?? "",
    order.amount ?? "",
    order.driver_name ?? "",
    formatCsvDateTime(order.delivered_at),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}

function escapeCsvValue(value: string | number) {
  const normalized = String(value ?? "");
  const escaped = normalized.replaceAll('"', '""');
  return `"${escaped}"`;
}

function formatCsvDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}