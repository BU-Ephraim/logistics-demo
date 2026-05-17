import { NextResponse } from "next/server";

type NotifyDemoPayload = {
  adminId?: string;
  businessName?: string;
};

export async function POST(request: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

    if (!token || !chatId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const payload = (await request.json()) as NotifyDemoPayload;
    const adminId = payload.adminId?.trim();
    const businessName = payload.businessName?.trim();

    if (!adminId) {
      return NextResponse.json({ ok: false, error: "Missing adminId." }, { status: 400 });
    }

    const timestamp = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());

    const message = [
      "🚀 Demo accessed",
      `Admin ID: ${adminId}`,
      `Timestamp: ${timestamp}`,
      `Business name: ${businessName || "Not provided"}`,
    ].join("\n");

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: `Telegram notification failed: ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}