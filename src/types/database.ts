export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChatType = "customer" | "bot" | "driver";
export type MessageSender = "admin" | "bot" | "customer" | "driver";
export type OrderStatus = "pending" | "assigned" | "picked_up" | "delivered";
export type BotSessionStep =
  | "idle"
  | "awaiting_customer_text"
  | "awaiting_amount"
  | "awaiting_driver_selection";

export interface AdminRow {
  id: string;
  created_at: string | null;
}

export interface DriverRow {
  id: string;
  admin_id: string | null;
  name: string;
  phone: string | null;
  created_at: string | null;
}

export interface OrderRow {
  id: string;
  admin_id: string | null;
  order_number: number | null;
  customer_name: string;
  pickup: string;
  dropoff: string;
  phone: string;
  item: string | null;
  amount: string | null;
  status: OrderStatus | null;
  driver_name: string | null;
  created_at: string | null;
  delivered_at: string | null;
}

export interface MessageRow {
  id: string;
  admin_id: string | null;
  chat_type: ChatType | null;
  driver_name: string | null;
  sender: MessageSender | null;
  content: string;
  metadata: Json | null;
  created_at: string | null;
}

export interface BotSessionRow {
  admin_id: string;
  step: BotSessionStep | null;
  pending_order_data: Json | null;
}

export interface Database {
  public: {
    Tables: {
      admins: {
        Row: AdminRow;
        Insert: {
          id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      bot_sessions: {
        Row: BotSessionRow;
        Insert: {
          admin_id: string;
          step?: BotSessionStep | null;
          pending_order_data?: Json | null;
        };
        Update: {
          admin_id?: string;
          step?: BotSessionStep | null;
          pending_order_data?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "bot_sessions_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "admins";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: DriverRow;
        Insert: {
          id?: string;
          admin_id?: string | null;
          name: string;
          phone?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          name?: string;
          phone?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "admins";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: OrderRow;
        Insert: {
          id?: string;
          admin_id?: string | null;
          order_number?: number | null;
          customer_name: string;
          pickup: string;
          dropoff: string;
          phone: string;
          item?: string | null;
          amount?: string | null;
          status?: OrderStatus | null;
          driver_name?: string | null;
          created_at?: string | null;
          delivered_at?: string | null;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          order_number?: number | null;
          customer_name?: string;
          pickup?: string;
          dropoff?: string;
          phone?: string;
          item?: string | null;
          amount?: string | null;
          status?: OrderStatus | null;
          driver_name?: string | null;
          created_at?: string | null;
          delivered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "admins";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: MessageRow;
        Insert: {
          id?: string;
          admin_id?: string | null;
          chat_type?: ChatType | null;
          driver_name?: string | null;
          sender?: MessageSender | null;
          content: string;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          chat_type?: ChatType | null;
          driver_name?: string | null;
          sender?: MessageSender | null;
          content?: string;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_admin_id_fkey";
            columns: ["admin_id"];
            referencedRelation: "admins";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];