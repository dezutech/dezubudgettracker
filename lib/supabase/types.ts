// Types matching the Supabase schema in supabase/schema.sql.
// Prefer regenerating with `supabase gen types typescript` after remote changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TransactionType = "income" | "expense" | "transfer";
export type CategoryType = "income" | "expense";
export type GoalStatus = "active" | "completed" | "paused" | "cancelled";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringTransactionType = Exclude<TransactionType, "transfer">;
export type BillStatus = "unpaid" | "paid" | "overdue" | "scheduled";
export type DebtType = "i_owe" | "owes_me";
export type DebtStatus = "active" | "paid" | "overdue";

type CommonRow = {
  id: string;
  user_id: string;
  local_id: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  is_deleted: boolean;
};

type CommonInsert = {
  id?: string;
  user_id?: string;
  local_id?: string | null;
  created_at?: string;
  updated_at?: string;
  synced_at?: string | null;
  is_deleted?: boolean;
};

type CommonUpdate = {
  id?: string;
  user_id?: string;
  local_id?: string | null;
  created_at?: string;
  updated_at?: string;
  synced_at?: string | null;
  is_deleted?: boolean;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          base_currency: string | null;
          created_at: string;
          updated_at: string;
          synced_at: string | null;
          is_deleted: boolean;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          base_currency?: string | null;
          created_at?: string;
          updated_at?: string;
          synced_at?: string | null;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          base_currency?: string | null;
          created_at?: string;
          updated_at?: string;
          synced_at?: string | null;
          is_deleted?: boolean;
        };
      };
      wallets: {
        Row: CommonRow & {
          name: string;
          type: string;
          balance: number;
          color: string | null;
          icon: string | null;
          logo_url: string | null;
        };
        Insert: CommonInsert & {
          name: string;
          type: string;
          balance?: number;
          color?: string | null;
          icon?: string | null;
          logo_url?: string | null;
        };
        Update: CommonUpdate & {
          name?: string;
          type?: string;
          balance?: number;
          color?: string | null;
          icon?: string | null;
          logo_url?: string | null;
        };
      };
      categories: {
        Row: CommonRow & {
          name: string;
          type: CategoryType;
          icon: string | null;
          color: string | null;
          is_default: boolean;
        };
        Insert: CommonInsert & {
          name: string;
          type: CategoryType;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
        };
        Update: CommonUpdate & {
          name?: string;
          type?: CategoryType;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
        };
      };
      transactions: {
        Row: CommonRow & {
          wallet_id: string;
          destination_wallet_id: string | null;
          goal_id: string | null;
          debt_id: string | null;
          debt_type: DebtType | null;
          person_name: string | null;
          category_id: string | null;
          amount: number;
          transaction_type: TransactionType;
          description: string | null;
          notes: string | null;
          transaction_date: string;
        };
        Insert: CommonInsert & {
          wallet_id: string;
          destination_wallet_id?: string | null;
          goal_id?: string | null;
          debt_id?: string | null;
          debt_type?: DebtType | null;
          person_name?: string | null;
          category_id?: string | null;
          amount: number;
          transaction_type: TransactionType;
          description?: string | null;
          notes?: string | null;
          transaction_date: string;
        };
        Update: CommonUpdate & {
          wallet_id?: string;
          destination_wallet_id?: string | null;
          goal_id?: string | null;
          debt_id?: string | null;
          debt_type?: DebtType | null;
          person_name?: string | null;
          category_id?: string | null;
          amount?: number;
          transaction_type?: TransactionType;
          description?: string | null;
          notes?: string | null;
          transaction_date?: string;
        };
      };
      budgets: {
        Row: CommonRow & {
          category_id: string;
          amount: number;
          month: string;
        };
        Insert: CommonInsert & {
          category_id: string;
          amount: number;
          month: string;
        };
        Update: CommonUpdate & {
          category_id?: string;
          amount?: number;
          month?: string;
        };
      };
      goals: {
        Row: CommonRow & {
          name: string;
          target_amount: number;
          current_amount: number;
          wallet_id: string | null;
          target_date: string | null;
          status: GoalStatus;
        };
        Insert: CommonInsert & {
          name: string;
          target_amount: number;
          current_amount?: number;
          wallet_id?: string | null;
          target_date?: string | null;
          status?: GoalStatus;
        };
        Update: CommonUpdate & {
          name?: string;
          target_amount?: number;
          current_amount?: number;
          wallet_id?: string | null;
          target_date?: string | null;
          status?: GoalStatus;
        };
      };
      notifications: {
        Row: CommonRow & {
          title: string;
          message: string;
          notification_type: string;
          is_read: boolean;
        };
        Insert: CommonInsert & {
          title: string;
          message: string;
          notification_type: string;
          is_read?: boolean;
        };
        Update: CommonUpdate & {
          title?: string;
          message?: string;
          notification_type?: string;
          is_read?: boolean;
        };
      };
      recurring_transactions: {
        Row: CommonRow & {
          wallet_id: string | null;
          category_id: string | null;
          title: string;
          amount: number;
          transaction_type: RecurringTransactionType;
          frequency: RecurringFrequency;
          next_run_date: string;
          is_active: boolean;
        };
        Insert: CommonInsert & {
          wallet_id?: string | null;
          category_id?: string | null;
          title: string;
          amount: number;
          transaction_type?: RecurringTransactionType;
          frequency: RecurringFrequency;
          next_run_date: string;
          is_active?: boolean;
        };
        Update: CommonUpdate & {
          wallet_id?: string | null;
          category_id?: string | null;
          title?: string;
          amount?: number;
          transaction_type?: RecurringTransactionType;
          frequency?: RecurringFrequency;
          next_run_date?: string;
          is_active?: boolean;
        };
      };
      bills: {
        Row: CommonRow & {
          title: string;
          amount: number;
          due_date: string;
          category_id: string | null;
          wallet_id: string | null;
          status: BillStatus;
          notes: string | null;
          is_recurring: boolean;
          recurring_id: string | null;
        };
        Insert: CommonInsert & {
          title: string;
          amount: number;
          due_date: string;
          category_id?: string | null;
          wallet_id?: string | null;
          status?: BillStatus;
          notes?: string | null;
          is_recurring?: boolean;
          recurring_id?: string | null;
        };
        Update: CommonUpdate & {
          title?: string;
          amount?: number;
          due_date?: string;
          category_id?: string | null;
          wallet_id?: string | null;
          status?: BillStatus;
          notes?: string | null;
          is_recurring?: boolean;
          recurring_id?: string | null;
        };
      };
      debts: {
        Row: CommonRow & {
          person_name: string;
          debt_type: DebtType;
          wallet_id: string | null;
          original_amount: number;
          remaining_balance: number;
          borrowed_date: string;
          due_date: string | null;
          notes: string | null;
          status: DebtStatus;
        };
        Insert: CommonInsert & {
          person_name: string;
          debt_type: DebtType;
          wallet_id?: string | null;
          original_amount: number;
          remaining_balance?: number;
          borrowed_date: string;
          due_date?: string | null;
          notes?: string | null;
          status?: DebtStatus;
        };
        Update: CommonUpdate & {
          person_name?: string;
          debt_type?: DebtType;
          wallet_id?: string | null;
          original_amount?: number;
          remaining_balance?: number;
          borrowed_date?: string;
          due_date?: string | null;
          notes?: string | null;
          status?: DebtStatus;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      set_current_user_id: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      set_updated_at: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type ProfileUpdate = Updates<"profiles">;
export type Wallet = Tables<"wallets">;
export type Category = Tables<"categories">;
export type Transaction = Tables<"transactions">;
export type Budget = Tables<"budgets">;
export type Goal = Tables<"goals">;
export type Notification = Tables<"notifications">;
export type RecurringTransaction = Tables<"recurring_transactions">;
export type Bill = Tables<"bills">;
export type Debt = Tables<"debts">;
