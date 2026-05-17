"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LayoutDashboard,
  MessageCircle,
  Plus,
  SendHorizonal,
  Truck,
} from "lucide-react";

import {
  buildChatDefinitions,
  ensureAdminSeedData,
  fetchDrivers,
  fetchMessages,
  fetchOrders,
  filterMessagesForChat,
  getChatKey,
  insertMessages,
  type ChatDefinition,
} from "@/lib/demo-data";
import { handleBotMessage, handleDriverMessage } from "@/lib/botLogic";
import { FALLBACK_BUSINESS_NAME, getDemoAdminId, getDemoBusinessName } from "@/lib/demo-settings";
import { getErrorMessage } from "@/lib/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DriverRow, MessageRow, OrderRow } from "@/types/database";

interface ComposerState {
  [chatId: string]: string;
}

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

function getBusinessNameSnapshot() {
  if (typeof window === "undefined") {
    return FALLBACK_BUSINESS_NAME;
  }

  return getDemoBusinessName();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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
  const businessName = useSyncExternalStore(
    subscribeToSessionChange,
    getBusinessNameSnapshot,
    () => FALLBACK_BUSINESS_NAME
  );
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedChatId, setSelectedChatId] = useState(getChatKey("customer"));
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [composerState, setComposerState] = useState<ComposerState>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [typingActor, setTypingActor] = useState<"admin" | "customer" | null>(null);
  const [isSimulatingCustomer, setIsSimulatingCustomer] = useState(false);
  const simulationRunRef = useRef(0);

  useEffect(() => {
    if (isHydrated && !adminId) {
      router.replace("/");
    }
  }, [adminId, isHydrated, router]);

  useEffect(() => {
    if (!adminId) {
      return;
    }

    const currentAdminId = adminId;

    let isMounted = true;

    async function loadChatData() {
      setIsLoading(true);
      setError(null);

      try {
        await ensureAdminSeedData(currentAdminId);
        const [driverRows, messageRows, orderRows] = await Promise.all([
          fetchDrivers(currentAdminId),
          fetchMessages(currentAdminId),
          fetchOrders(currentAdminId),
        ]);

        if (!isMounted) {
          return;
        }

        setDrivers(driverRows);
        setMessages(messageRows);
        setOrders(orderRows);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          getErrorMessage(loadError, "Failed to load chat workspace.")
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadChatData();

    return () => {
      isMounted = false;
    };
  }, [adminId]);

  useEffect(() => {
    if (!adminId) {
      return;
    }

    const currentAdminId = adminId;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`workspace:${currentAdminId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `admin_id=eq.${currentAdminId}`,
        },
        async () => {
          try {
            const freshMessages = await fetchMessages(currentAdminId);
            setMessages(freshMessages);
          } catch (syncError) {
            setError(getErrorMessage(syncError, "Failed to sync latest messages."));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `admin_id=eq.${currentAdminId}`,
        },
        async () => {
          try {
            const freshOrders = await fetchOrders(currentAdminId);
            setOrders(freshOrders);
          } catch (syncError) {
            setError(getErrorMessage(syncError, "Failed to sync latest orders."));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adminId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedChatId, typingActor]);

  useEffect(() => {
    return () => {
      simulationRunRef.current += 1;
    };
  }, []);

  const chats = buildChatDefinitions(drivers, messages);
  const selectedChat =
    chats.find((chat) => chat.id === selectedChatId) ?? chats[0] ?? null;

  const visibleMessages = selectedChat
    ? filterMessagesForChat(messages, selectedChat.chatType, selectedChat.driverName)
    : [];

  const currentDraft = selectedChat ? composerState[selectedChat.id] ?? "" : "";
  const activeOrdersCount = orders.filter((order) => order.status !== "delivered").length;

  function handleChatSelect(chat: ChatDefinition) {
    setSelectedChatId(chat.id);
    setMobileChatOpen(true);
  }

  async function handleSimulateCustomerFlow() {
    if (!adminId || isSimulatingCustomer) {
      return;
    }

    const runId = simulationRunRef.current + 1;
    simulationRunRef.current = runId;
    setSelectedChatId(getChatKey("customer"));
    setMobileChatOpen(true);
    setError(null);
    setIsSimulatingCustomer(true);
    setTypingActor("admin");

    try {
      await delay(1200);
      if (simulationRunRef.current !== runId) {
        return;
      }

      const adminMessage = `Thank you for contacting ${businessName}. Please fill the request below and we will get back to you as soon as possible.\n\nName:\nPickup:\nDropoff:\nPhone:\nItem:`;
      const adminInsertResult = await insertMessages([
        {
          admin_id: adminId,
          chat_type: "customer",
          sender: "admin",
          content: adminMessage,
          metadata: { simulated: true, scenario: "new-customer-demo" },
        },
      ]);

      if (adminInsertResult.error) {
        throw adminInsertResult.error;
      }

      setTypingActor(null);
      await delay(700);
      if (simulationRunRef.current !== runId) {
        return;
      }

      setTypingActor("customer");
      await delay(1600);
      if (simulationRunRef.current !== runId) {
        return;
      }

      const customerInsertResult = await insertMessages([
        {
          admin_id: adminId,
          chat_type: "customer",
          sender: "customer",
          content:
            "Hi, I am David. I need a package picked up from Lekki Phase 1 and delivered to Ikeja today. My number is 08012345678 and it is documents.",
          metadata: { simulated: true, scenario: "new-customer-demo" },
        },
      ]);

      if (customerInsertResult.error) {
        throw customerInsertResult.error;
      }
    } catch (simulationError) {
      setError(
        getErrorMessage(simulationError, "Failed to simulate customer conversation.")
      );
    } finally {
      if (simulationRunRef.current === runId) {
        setTypingActor(null);
        setIsSimulatingCustomer(false);
      }
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adminId || !selectedChat) {
      return;
    }

    const content = currentDraft.trim();
    if (!content) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const adminPayload = {
        admin_id: adminId,
        chat_type: selectedChat.chatType,
        driver_name: selectedChat.driverName,
        sender: "admin" as const,
        content,
      };

      const adminInsertResult = await insertMessages([adminPayload]);
      const { error: adminMessageError } = adminInsertResult;

      if (adminMessageError) {
        throw adminMessageError;
      }

      setComposerState((currentState) => ({
        ...currentState,
        [selectedChat.id]: "",
      }));

      if (selectedChat.chatType === "bot") {
        await handleBotMessage(adminId, content);
      }

      if (selectedChat.chatType === "driver" && selectedChat.driverName) {
        await handleDriverMessage(adminId, selectedChat.driverName, content);
      }
    } catch (sendError) {
      setError(getErrorMessage(sendError, "Failed to send message."));
    } finally {
      setIsSending(false);
    }
  }

  if (!isHydrated) {
    return <LoadingState label="Checking demo session..." />;
  }

  if (!adminId) {
    return <LoadingState label="Checking demo session..." />;
  }

  if (isLoading) {
    return <LoadingState label="Loading chats..." />;
  }

  if (error && chats.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-foreground">Unable to load chats</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-medium text-accent-foreground"
          >
            Return home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
        <aside
          className={[
            "w-full shrink-0 min-h-0 rounded-[28px] border border-border bg-card p-4 shadow-2xl shadow-black/30 lg:flex lg:w-[340px] lg:flex-col",
            mobileChatOpen ? "hidden lg:flex" : "flex flex-col",
          ].join(" ")}
        >
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Active inbox</p>
              <h1 className="mt-2 text-2xl font-semibold">Chats</h1>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-right text-xs text-accent">
              {drivers.length} drivers · {activeOrdersCount} active
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1">
            {chats.map((chat) => {
              const isActive = chat.id === selectedChatId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleChatSelect(chat)}
                  className={[
                    "w-full rounded-2xl border px-4 py-4 text-left transition",
                    isActive
                      ? "border-accent bg-accent/12 shadow-lg shadow-accent/10"
                      : "border-border bg-background/50 hover:border-accent/30 hover:bg-background",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ChatAvatar chat={chat} />
                      <div>
                        <p className="font-medium text-foreground">{chat.label}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted">
                          {chat.chatType}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted">
                    {chat.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className={[
            "min-h-0 min-w-0 flex-1 rounded-[28px] border border-border bg-card shadow-2xl shadow-black/30 lg:flex",
            mobileChatOpen ? "flex" : "hidden lg:flex",
          ].join(" ")}
        >
          {selectedChat ? (
            <div className="flex min-h-0 min-w-0 w-full flex-col overflow-hidden">
              <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <ChatAvatar chat={selectedChat} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-foreground">
                    {selectedChat.label}
                  </h2>
                  <p className="truncate text-sm text-muted">{selectedChat.subtitle}</p>
                </div>
                {selectedChat.chatType === "driver" && selectedChat.driverId ? (
                  <Link
                    href={`/driver/${selectedChat.driverId}`}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/15"
                  >
                    <Truck className="h-4 w-4" />
                    Driver dash
                  </Link>
                ) : null}
                {selectedChat.chatType === "customer" ? (
                  <button
                    type="button"
                    onClick={() => void handleSimulateCustomerFlow()}
                    disabled={isSimulatingCustomer}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    New customer demo
                  </button>
                ) : null}
              </header>

              <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
                {visibleMessages.map((message) => {
                  const isAdmin = message.sender === "admin";
                  return (
                    <div
                      key={message.id}
                      className={[
                        "flex w-full",
                        isAdmin ? "justify-end" : "justify-start",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-lg sm:max-w-[70%]",
                          isAdmin
                            ? "rounded-br-md bg-accent text-accent-foreground"
                            : "rounded-bl-md border border-border bg-background text-foreground",
                        ].join(" ")}
                      >
                        <MessageContent content={message.content} />
                        <p
                          className={[
                            "mt-2 text-[11px] uppercase tracking-[0.2em]",
                            isAdmin ? "text-white/70" : "text-muted",
                          ].join(" ")}
                        >
                          {message.sender ?? "system"} · {formatTimestamp(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {selectedChat.chatType === "customer" && typingActor ? (
                  <TypingIndicator actor={typingActor} />
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border px-4 py-4 sm:px-6">
                {error ? (
                  <p className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}

                <form className="flex items-end gap-3" onSubmit={sendMessage}>
                  <label className="flex-1">
                    <span className="sr-only">Message</span>
                    <textarea
                      rows={1}
                      value={currentDraft}
                      onChange={(event) => {
                        if (!selectedChat) {
                          return;
                        }

                        const nextValue = event.target.value;
                        setComposerState((currentState) => ({
                          ...currentState,
                          [selectedChat.id]: nextValue,
                        }));
                      }}
                      placeholder={`Message ${selectedChat.label}`}
                      className="max-h-40 min-h-12 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <SendHorizonal className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <nav className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-3 sm:gap-4">
          <Link
            href="/chat"
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-3 text-accent transition"
            aria-current="page"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Chats</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-muted transition hover:border-accent/30 hover:text-foreground"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
        </div>
      </nav>
    </main>
  );
}

function ChatAvatar({ chat }: { chat: ChatDefinition }) {
  const icon =
    chat.chatType === "driver" ? (
      <Truck className="h-4 w-4" />
    ) : (
      <MessageCircle className="h-4 w-4" />
    );

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
      {icon}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Deliver Track</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">{label}</h1>
      </div>
    </main>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "now";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(\[[^\]]+\]\([^\)]+\))/g).filter(Boolean);

  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => {
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
        if (!linkMatch) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <Link
            key={`${part}-${index}`}
            href={linkMatch[2]}
            className="font-medium text-inherit underline decoration-accent/60 underline-offset-4"
          >
            {linkMatch[1]}
          </Link>
        );
      })}
    </p>
  );
}

function TypingIndicator({ actor }: { actor: "admin" | "customer" }) {
  const isAdmin = actor === "admin";

  return (
    <div className={["flex w-full", isAdmin ? "justify-end" : "justify-start"].join(" ")}>
      <div
        className={[
          "inline-flex items-center gap-1 rounded-3xl px-4 py-3 shadow-lg",
          isAdmin
            ? "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md border border-border bg-background text-foreground",
        ].join(" ")}
      >
        <span className="sr-only">Typing</span>
        <span className="h-2 w-2 animate-pulse rounded-full bg-current/80 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-current/80 [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-current/80 [animation-delay:240ms]" />
      </div>
    </div>
  );
}