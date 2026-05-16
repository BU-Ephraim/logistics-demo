import { getBotWelcomeMessage } from "@/lib/botLogic";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { ChatType, Database, DriverRow, MessageRow, OrderRow } from "@/types/database";

type AdminInsert = Database["public"]["Tables"]["admins"]["Insert"];
type BotSessionInsert = Database["public"]["Tables"]["bot_sessions"]["Insert"];
type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"];
type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];

const defaultDrivers = [
  { name: "James", phone: "+2348011111111" },
  { name: "Sule", phone: "+2348022222222" },
  { name: "Amina", phone: "+2348033333333" },
] as const;

export interface ChatDefinition {
  id: string;
  label: string;
  subtitle: string;
  chatType: ChatType;
  driverName: string | null;
}

export function normalizeAdminId(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function getChatKey(chatType: ChatType, driverName?: string | null) {
  return chatType === "driver" ? `driver:${driverName ?? "unknown"}` : chatType;
}

export async function ensureAdminSeedData(adminId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: existingAdmins, error: adminsError } = await supabase
    .from("admins")
    .select("id")
    .eq("id", adminId)
    .limit(1);

  if (adminsError) {
    throw adminsError;
  }

  const adminRows = (existingAdmins ?? []) as Pick<Database["public"]["Tables"]["admins"]["Row"], "id">[];

  const { error: adminError } =
    adminRows.length === 0 ? await insertAdmins([{ id: adminId }]) : { error: null };

  if (adminError) {
    throw adminError;
  }

  const { data: existingBotSession, error: botSessionError } = await supabase
    .from("bot_sessions")
    .select("admin_id")
    .eq("admin_id", adminId)
    .limit(1);

  if (botSessionError) {
    throw botSessionError;
  }

  const botSessions =
    (existingBotSession ?? []) as Pick<Database["public"]["Tables"]["bot_sessions"]["Row"], "admin_id">[];

  if (botSessions.length === 0) {
    const { error } = await insertBotSessions([
      {
        admin_id: adminId,
        step: "idle",
        pending_order_data: null,
      },
    ]);

    if (error) {
      throw error;
    }
  }

  const { data: existingDrivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, name")
    .eq("admin_id", adminId);

  if (driversError) {
    throw driversError;
  }

  const driverRows = (existingDrivers ?? []) as Pick<DriverRow, "id" | "name">[];
  const existingDriverNames = new Set(driverRows.map((driver) => driver.name));
  const missingDrivers = defaultDrivers
    .filter((driver) => !existingDriverNames.has(driver.name))
    .map((driver) => ({ ...driver, admin_id: adminId }));

  if (missingDrivers.length > 0) {
    const { error } = await insertDrivers(missingDrivers);
    if (error) {
      throw error;
    }
  }

  const { data: existingCustomerMessages, error: messagesError } = await supabase
    .from("messages")
    .select("id")
    .eq("admin_id", adminId)
    .eq("chat_type", "customer")
    .limit(1);

  if (messagesError) {
    throw messagesError;
  }

  const seededMessages = (existingCustomerMessages ?? []) as Pick<MessageRow, "id">[];

  if (seededMessages.length === 0) {
    const { error } = await insertMessages([
      {
        admin_id: adminId,
        chat_type: "customer",
        sender: "customer",
        content:
          "Hi, I need a delivery picked up from Marina and dropped in Yaba today.",
        metadata: { seeded: true },
      },
    ]);

    if (error) {
      throw error;
    }
  }

  const { data: existingBotMessages, error: botMessagesError } = await supabase
    .from("messages")
    .select("id")
    .eq("admin_id", adminId)
    .eq("chat_type", "bot")
    .limit(1);

  if (botMessagesError) {
    throw botMessagesError;
  }

  const botMessageRows = (existingBotMessages ?? []) as Pick<MessageRow, "id">[];

  if (botMessageRows.length === 0) {
    const { error } = await insertMessages([
      {
        admin_id: adminId,
        chat_type: "bot",
        sender: "bot",
        content: getBotWelcomeMessage(),
      },
    ]);

    if (error) {
      throw error;
    }
  }
}

export async function fetchDrivers(adminId: string) {
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

export async function fetchMessages(adminId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, admin_id, chat_type, driver_name, sender, content, metadata, created_at")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as MessageRow[];
}

export async function fetchOrders(adminId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, admin_id, order_number, customer_name, pickup, dropoff, phone, item, amount, status, driver_name, created_at, delivered_at"
    )
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as OrderRow[];
}

export function buildChatDefinitions(drivers: DriverRow[], messages: MessageRow[]) {
  const customerMessage = messages.find((message) => message.chat_type === "customer");
  const botMessage = messages.find((message) => message.chat_type === "bot");

  return [
    {
      id: getChatKey("customer"),
      label: "Customer",
      subtitle: customerMessage?.content ?? "Customer support and delivery updates",
      chatType: "customer" as const,
      driverName: null,
    },
    {
      id: getChatKey("bot"),
      label: "Order Bot",
      subtitle: botMessage?.content ?? "Automations and workflow prompts",
      chatType: "bot" as const,
      driverName: null,
    },
    ...drivers.map((driver) => {
      const lastDriverMessage = [...messages]
        .reverse()
        .find(
          (message) =>
            message.chat_type === "driver" && message.driver_name === driver.name
        );

      return {
        id: getChatKey("driver", driver.name),
        label: driver.name,
        subtitle: lastDriverMessage?.content ?? driver.phone ?? "Driver channel",
        chatType: "driver" as const,
        driverName: driver.name,
      };
    }),
  ] satisfies ChatDefinition[];
}

export function filterMessagesForChat(
  messages: MessageRow[],
  chatType: ChatType,
  driverName?: string | null
) {
  return messages.filter((message) => {
    if (message.chat_type !== chatType) {
      return false;
    }

    if (chatType !== "driver") {
      return true;
    }

    return message.driver_name === driverName;
  });
}

export function insertDrivers(rows: DriverInsert[]) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("drivers").insert(rows as never[]);
}

export function insertMessages(rows: MessageInsert[]) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("messages").insert(rows as never[]);
}

export function insertAdmins(rows: AdminInsert[]) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("admins").insert(rows as never[]);
}

export function insertBotSessions(rows: BotSessionInsert[]) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("bot_sessions").insert(rows as never[]);
}