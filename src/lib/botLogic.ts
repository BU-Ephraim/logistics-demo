import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  BotSessionRow,
  BotSessionStep,
  Database,
  DriverRow,
  OrderRow,
} from "@/types/database";

type BotSessionInsert = Database["public"]["Tables"]["bot_sessions"]["Insert"];
type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

interface PendingOrderData {
  customer_name?: string;
  pickup?: string;
  dropoff?: string;
  phone?: string;
  item?: string | null;
  amount?: string | null;
  order_id?: string;
  order_number?: number | null;
}

interface ParsedCustomerMessage {
  customer_name: string;
  pickup: string;
  dropoff: string;
  phone: string;
  item: string | null;
}

export function getBotWelcomeMessage() {
  return "Welcome! Reply with:\n\n1. Create new order\n2. Help";
}

function getBotHelpMessage() {
  return `Reply with 1 to create a new order, then copy and fill this format:\n\n${getCustomerTemplateMessage()}`;
}

function getCustomerPromptMessage() {
  return `Copy and fill this format exactly, then send it back here:\n\n${getCustomerTemplateMessage()}`;
}

function getCustomerTemplateMessage() {
  return [
    "Name:",
    "Pickup:",
    "Dropoff:",
    "Phone:",
    "Item:",
  ].join("\n");
}

function normalizeReply(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }

  return value.trim();
}

function parseCustomerText(input: string): ParsedCustomerMessage | null {
  const phonePattern = /(?:\+234|234|0)(?:7|8|9)\d{9}/;
  const normalizedInput = input
    .replace(/\|/g, "\n")
    .replace(/;\s*/g, "\n")
    .replace(/\r/g, "")
    .trim();
  const lines = normalizedInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const values = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z ]+)\s*:\s*(.+)$/);
    if (!match) {
      continue;
    }

    const rawKey = match[1]?.trim().toLowerCase() ?? "";
    const value = match[2]?.trim() ?? "";
    if (!value) {
      continue;
    }

    const normalizedKey = rawKey.replace(/\s+/g, " ");
    values.set(normalizedKey, value);
  }

  const customer_name =
    values.get("name") ?? values.get("customer name") ?? values.get("customer");
  const pickup = values.get("pickup");
  const dropoff = values.get("dropoff") ?? values.get("drop off");
  const phoneValue = values.get("phone") ?? values.get("number");
  const item = values.get("item") ?? null;

  if (!customer_name || !pickup || !dropoff || !phoneValue) {
    return null;
  }

  const phoneMatch = phoneValue.replace(/\s+/g, "").match(phonePattern);
  if (!phoneMatch) {
    return null;
  }

  return {
    customer_name,
    pickup,
    dropoff,
    phone: normalizePhone(phoneMatch[0]),
    item,
  };
}

function parseAmount(input: string) {
  const normalized = normalizeReply(input);
  if (normalized === "pending") {
    return "pending";
  }

  const amountMatch = input.replace(/\s+/g, "").match(/^₦?([\d,]+)$/);
  if (!amountMatch) {
    return null;
  }

  return `₦${amountMatch[1]}`;
}

function toPendingOrderData(value: BotSessionRow["pending_order_data"]): PendingOrderData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as PendingOrderData;
}

async function insertBotMessages(rows: MessageInsert[]) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("messages").insert(rows as never[]);
}

async function fetchDrivers(adminId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, admin_id, name, phone, created_at")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as DriverRow[];
}

async function getBotSession(adminId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("admin_id, step, pending_order_data")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data as BotSessionRow;
  }

  const { error: insertError } = await supabase.from("bot_sessions").insert([
    {
      admin_id: adminId,
      step: "idle",
      pending_order_data: null,
    } as BotSessionInsert,
  ] as never[]);

  if (insertError) {
    throw insertError;
  }

  return {
    admin_id: adminId,
    step: "idle",
    pending_order_data: null,
  };
}

async function updateBotSession(
  adminId: string,
  step: BotSessionStep,
  pending_order_data: PendingOrderData | null
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("bot_sessions")
    .update({ step, pending_order_data } as never)
    .eq("admin_id", adminId);

  if (error) {
    throw error;
  }
}

async function fetchOrderById(orderId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, admin_id, order_number, customer_name, pickup, dropoff, phone, item, amount, status, driver_name, created_at, delivered_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Order not found after write.");
  }

  return data as OrderRow;
}

async function createOrder(row: OrderInsert) {
  const supabase = getSupabaseBrowserClient();
  if (!row.admin_id) {
    throw new Error("Orders require an admin_id.");
  }

  const { error } = await supabase.from("orders").insert([row] as never[]);

  if (error) {
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, admin_id, order_number, customer_name, pickup, dropoff, phone, item, amount, status, driver_name, created_at, delivered_at"
    )
    .eq("admin_id", row.admin_id)
    .eq("customer_name", row.customer_name)
    .eq("phone", row.phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!data) {
    throw new Error("Order not found after creation.");
  }

  return data as OrderRow;
}

async function updateOrder(orderId: string, patch: OrderUpdate) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("orders")
    .update(patch as never)
    .eq("id", orderId);

  if (error) {
    throw error;
  }

  return fetchOrderById(orderId);
}

async function findDriverActiveOrder(adminId: string, driverName: string) {
  const supabase = getSupabaseBrowserClient();
  const result = await supabase
    .from("orders")
    .select(
      "id, admin_id, order_number, customer_name, pickup, dropoff, phone, item, amount, status, driver_name, created_at, delivered_at"
    )
    .eq("admin_id", adminId)
    .eq("driver_name", driverName)
    .neq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as OrderRow | null;
}

export function formatOrderDetails(
  order: Pick<
    OrderRow,
    | "order_number"
    | "pickup"
    | "dropoff"
    | "customer_name"
    | "phone"
    | "item"
    | "amount"
  >
) {
  const itemLabel = order.item?.trim() ? order.item : "Not specified";
  const amountLabel = order.amount?.trim() ? order.amount : "pending";

  return `#${order.order_number ?? "..."}: ${order.pickup} → ${order.dropoff}, Customer ${order.customer_name} (${order.phone}), Item ${itemLabel}, Amount ${amountLabel}`;
}

async function sendBotChatMessage(adminId: string, content: string) {
  const { error } = await insertBotMessages([
    {
      admin_id: adminId,
      chat_type: "bot",
      sender: "bot",
      content,
    },
  ]);

  if (error) {
    throw error;
  }
}

async function sendDriverBotMessage(adminId: string, driverName: string, content: string) {
  const { error } = await insertBotMessages([
    {
      admin_id: adminId,
      chat_type: "driver",
      driver_name: driverName,
      sender: "bot",
      content,
    },
  ]);

  if (error) {
    throw error;
  }
}

export async function assignOrderToDriver(
  adminId: string,
  orderId: string,
  driverName: string
) {
  const updatedOrder = await updateOrder(orderId, {
    driver_name: driverName,
    status: "assigned",
  });

  await sendDriverBotMessage(
    adminId,
    driverName,
    `📦 New order ${formatOrderDetails(updatedOrder)}

Reply with:
1. Mark picked up
2. Mark delivered`
  );

  return updatedOrder;
}

async function resetBotFlow(adminId: string, reason: string) {
  await updateBotSession(adminId, "idle", null);
  await sendBotChatMessage(adminId, `${reason}\n\n${getBotWelcomeMessage()}`);
}

export async function handleBotMessage(adminId: string, content: string) {
  const session = await getBotSession(adminId);
  const normalized = normalizeReply(content);
  const step = session.step ?? "idle";

  if (step === "idle") {
    if (
      normalized === "1" ||
      normalized === "create new order" ||
      normalized === "create order" ||
      normalized === "new order"
    ) {
      await updateBotSession(adminId, "awaiting_customer_text", null);
      await sendBotChatMessage(adminId, getCustomerPromptMessage());
      return;
    }

    if (normalized === "2" || normalized === "help") {
      await sendBotChatMessage(adminId, `${getBotHelpMessage()}\n\n${getBotWelcomeMessage()}`);
      return;
    }

    await sendBotChatMessage(adminId, getBotWelcomeMessage());
    return;
  }

  if (step === "awaiting_customer_text") {
    const parsed = parseCustomerText(content);
    if (!parsed) {
      await resetBotFlow(
        adminId,
        `That did not match the required format. Please start again and choose an option first. When you choose 1, copy and fill this exactly:\n\n${getCustomerTemplateMessage()}`
      );
      return;
    }

    await updateBotSession(adminId, "awaiting_amount", parsed);
    await sendBotChatMessage(
      adminId,
      `Extracted: Name ${parsed.customer_name}, Pickup ${parsed.pickup}, Dropoff ${parsed.dropoff}, Phone ${parsed.phone}. Amount? Reply with ₦amount or 'pending'.`
    );
    return;
  }

  if (step === "awaiting_amount") {
    const amount = parseAmount(content);
    if (!amount) {
      await resetBotFlow(
        adminId,
        "That amount was not valid. Please start again and choose an option first."
      );
      return;
    }

    const pending = toPendingOrderData(session.pending_order_data);
    if (!pending.customer_name || !pending.pickup || !pending.dropoff || !pending.phone) {
      await resetBotFlow(adminId, "Session reset.");
      return;
    }

    const order = await createOrder({
      admin_id: adminId,
      customer_name: pending.customer_name,
      pickup: pending.pickup,
      dropoff: pending.dropoff,
      phone: pending.phone,
      item: pending.item ?? null,
      amount,
      status: "pending",
    });

    const nextPending: PendingOrderData = {
      ...pending,
      amount,
      order_id: order.id,
      order_number: order.order_number,
    };
    await updateBotSession(adminId, "awaiting_driver_selection", nextPending);

    const drivers = await fetchDrivers(adminId);
    const driverMenu = drivers
      .slice(0, 3)
      .map((driver, index) => `${index + 1}. ${driver.name}`)
      .join("\n");
    await sendBotChatMessage(
      adminId,
      `Order #${order.order_number ?? "..."} created. Assign driver:\n${driverMenu}\n\nReply with the driver number.`
    );
    return;
  }

  if (step === "awaiting_driver_selection") {
    const drivers = await fetchDrivers(adminId);
    const selection = Number.parseInt(normalized, 10);
    const selectedDriver = Number.isNaN(selection) ? null : drivers[selection - 1] ?? null;

    if (!selectedDriver) {
      await resetBotFlow(
        adminId,
        "That driver selection was not valid. Please start again and choose an option first."
      );
      return;
    }

    const pending = toPendingOrderData(session.pending_order_data);
    if (!pending.order_id) {
      await resetBotFlow(adminId, "Session reset.");
      return;
    }

    await assignOrderToDriver(adminId, pending.order_id, selectedDriver.name);

    await updateBotSession(adminId, "idle", null);
    await sendBotChatMessage(
      adminId,
      `Assigned to ${selectedDriver.name}. Driver contacted.\n\n[View order on Dashboard →](/dashboard)`
    );

    return;
  }
}

export async function handleDriverMessage(
  adminId: string,
  driverName: string,
  content: string
) {
  const normalized = normalizeReply(content);
  if (normalized !== "1" && normalized !== "2") {
    return;
  }

  const order = await findDriverActiveOrder(adminId, driverName);
  if (!order) {
    await sendDriverBotMessage(
      adminId,
      driverName,
      "No active order found for this driver right now."
    );
    return;
  }

  if (normalized === "1") {
    await updateOrder(order.id, {
      status: "assigned",
    });
    await sendDriverBotMessage(
      adminId,
      driverName,
      `✓ Picked up order #${order.order_number ?? "..."}.\n\nReply with:\n2. Mark delivered`
    );
    return;
  }

  const deliveredOrder = await updateOrder(order.id, {
    status: "delivered",
    delivered_at: new Date().toISOString(),
  });

  await sendDriverBotMessage(
    adminId,
    driverName,
    `✓ Delivered order #${deliveredOrder.order_number ?? "..."}.`
  );
  await sendBotChatMessage(
    adminId,
    `✅ Driver ${driverName} marked order #${deliveredOrder.order_number ?? "..."} as delivered. Customer notified: 'Your order has been delivered. Thank you for using SwiftSend.'`
  );
}