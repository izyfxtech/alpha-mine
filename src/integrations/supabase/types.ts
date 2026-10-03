export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alt_strategies: {
        Row: {
          created_at: string
          id: string
          journal_id: string
          name: string
          notes: string | null
          setup_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          journal_id: string
          name: string
          notes?: string | null
          setup_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          journal_id?: string
          name?: string
          notes?: string | null
          setup_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alt_strategies_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alt_strategies_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
        ]
      }
      alt_strategy_results: {
        Row: {
          alt_profit: number
          alt_r: number
          journal_id: string
          strategy_id: string
          trade_id: string
        }
        Insert: {
          alt_profit?: number
          alt_r?: number
          journal_id: string
          strategy_id: string
          trade_id: string
        }
        Update: {
          alt_profit?: number
          alt_r?: number
          journal_id?: string
          strategy_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alt_strategy_results_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alt_strategy_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "alt_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alt_strategy_results_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      backtests: {
        Row: {
          created_at: string
          id: string
          journal_id: string
          name: string
          notes: string | null
          outcomes: string[]
          results: Json
        }
        Insert: {
          created_at?: string
          id?: string
          journal_id: string
          name?: string
          notes?: string | null
          outcomes?: string[]
          results?: Json
        }
        Update: {
          created_at?: string
          id?: string
          journal_id?: string
          name?: string
          notes?: string | null
          outcomes?: string[]
          results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "backtests_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_definitions: {
        Row: {
          created_at: string
          id: string
          journal_id: string
          label: string
          phase: string
          position: number
          sentiment: string
        }
        Insert: {
          created_at?: string
          id?: string
          journal_id: string
          label: string
          phase: string
          position?: number
          sentiment?: string
        }
        Update: {
          created_at?: string
          id?: string
          journal_id?: string
          label?: string
          phase?: string
          position?: number
          sentiment?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_definitions_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_stat_categories: {
        Row: {
          created_at: string
          id: string
          journal_id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          journal_id: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          journal_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_stat_categories_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_stat_options: {
        Row: {
          category_id: string
          created_at: string
          id: string
          journal_id: string
          label: string
          position: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          journal_id: string
          label: string
          position?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          journal_id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_stat_options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "custom_stat_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_stat_options_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_sessions: {
        Row: {
          categories: string[]
          content: string | null
          created_at: string
          focus: string | null
          id: string
          journal_id: string
          mood_after: number | null
          mood_before: number | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          rating: number
          session_date: string
        }
        Insert: {
          categories?: string[]
          content?: string | null
          created_at?: string
          focus?: string | null
          id?: string
          journal_id: string
          mood_after?: number | null
          mood_before?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rating?: number
          session_date?: string
        }
        Update: {
          categories?: string[]
          content?: string | null
          created_at?: string
          focus?: string | null
          id?: string
          journal_id?: string
          mood_after?: number | null
          mood_before?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rating?: number
          session_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_sessions_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          asset_class: string | null
          created_at: string
          id: string
          journal_id: string
          position: number
          symbol: string
        }
        Insert: {
          asset_class?: string | null
          created_at?: string
          id?: string
          journal_id: string
          position?: number
          symbol: string
        }
        Update: {
          asset_class?: string | null
          created_at?: string
          id?: string
          journal_id?: string
          position?: number
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruments_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_cashflows: {
        Row: {
          amount: number
          created_at: string
          id: string
          journal_id: string
          note: string | null
          occurred_on: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          journal_id: string
          note?: string | null
          occurred_on?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          journal_id?: string
          note?: string | null
          occurred_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_cashflows_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      journals: {
        Row: {
          auto_pnl: boolean
          broker: string | null
          created_at: string
          currency: string
          deposit_date: string | null
          id: string
          last_used_at: string
          markets: string[]
          name: string
          owner_id: string
          session_categories: string[]
          share_token: string | null
          starting_balance: number
          trade_type: string
        }
        Insert: {
          auto_pnl?: boolean
          broker?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          id?: string
          last_used_at?: string
          markets?: string[]
          name: string
          owner_id?: string
          session_categories?: string[]
          share_token?: string | null
          starting_balance?: number
          trade_type?: string
        }
        Update: {
          auto_pnl?: boolean
          broker?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          id?: string
          last_used_at?: string
          markets?: string[]
          name?: string
          owner_id?: string
          session_categories?: string[]
          share_token?: string | null
          starting_balance?: number
          trade_type?: string
        }
        Relationships: []
      }
      missed_trade_custom_stats: {
        Row: {
          journal_id: string
          missed_trade_id: string
          option_id: string
        }
        Insert: {
          journal_id: string
          missed_trade_id: string
          option_id: string
        }
        Update: {
          journal_id?: string
          missed_trade_id?: string
          option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missed_trade_custom_stats_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_trade_custom_stats_missed_trade_id_fkey"
            columns: ["missed_trade_id"]
            isOneToOne: false
            referencedRelation: "missed_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_trade_custom_stats_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "custom_stat_options"
            referencedColumns: ["id"]
          },
        ]
      }
      missed_trades: {
        Row: {
          created_at: string
          direction: string
          entry_price: number | null
          exit_at: string | null
          exit_price: number | null
          hypothetical_r: number
          id: string
          instrument: string | null
          journal_id: string
          net_pnl: number
          notes: string | null
          occurred_at: string
          quantity: number
          reason: string | null
          setup: string | null
          stop_loss: number | null
          take_profit: number | null
          trade_type: string
        }
        Insert: {
          created_at?: string
          direction?: string
          entry_price?: number | null
          exit_at?: string | null
          exit_price?: number | null
          hypothetical_r?: number
          id?: string
          instrument?: string | null
          journal_id: string
          net_pnl?: number
          notes?: string | null
          occurred_at?: string
          quantity?: number
          reason?: string | null
          setup?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_type?: string
        }
        Update: {
          created_at?: string
          direction?: string
          entry_price?: number | null
          exit_at?: string | null
          exit_price?: number | null
          hypothetical_r?: number
          id?: string
          instrument?: string | null
          journal_id?: string
          net_pnl?: number
          notes?: string | null
          occurred_at?: string
          quantity?: number
          reason?: string | null
          setup?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "missed_trades_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_folders: {
        Row: {
          created_at: string
          id: string
          journal_id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          journal_id: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          journal_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "notebook_folders_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_pages: {
        Row: {
          content: string | null
          created_at: string
          folder: string
          id: string
          journal_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          folder?: string
          id?: string
          journal_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          folder?: string
          id?: string
          journal_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_pages_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_trades: {
        Row: {
          created_at: string
          direction: string
          entry_at: string
          entry_price: number | null
          id: string
          instrument: string | null
          journal_id: string
          notes: string | null
          quantity: number
          setup: string | null
          stop_loss: number | null
          take_profit: number | null
          trade_type: string
        }
        Insert: {
          created_at?: string
          direction?: string
          entry_at?: string
          entry_price?: number | null
          id?: string
          instrument?: string | null
          journal_id: string
          notes?: string | null
          quantity?: number
          setup?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_type?: string
        }
        Update: {
          created_at?: string
          direction?: string
          entry_at?: string
          entry_price?: number | null
          id?: string
          instrument?: string | null
          journal_id?: string
          notes?: string | null
          quantity?: number
          setup?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_trades_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_currency: string
          created_at: string
          display_name: string | null
          id: string
          settings: Json
        }
        Insert: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id: string
          settings?: Json
        }
        Update: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id?: string
          settings?: Json
        }
        Relationships: []
      }
      setups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          journal_id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          journal_id: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          journal_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "setups_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_comments: {
        Row: {
          comment_definition_id: string
          journal_id: string
          trade_id: string
        }
        Insert: {
          comment_definition_id: string
          journal_id: string
          trade_id: string
        }
        Update: {
          comment_definition_id?: string
          journal_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_comments_comment_definition_id_fkey"
            columns: ["comment_definition_id"]
            isOneToOne: false
            referencedRelation: "comment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_comments_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_comments_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_custom_stats: {
        Row: {
          journal_id: string
          option_id: string
          trade_id: string
        }
        Insert: {
          journal_id: string
          option_id: string
          trade_id: string
        }
        Update: {
          journal_id?: string
          option_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_custom_stats_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_custom_stats_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "custom_stat_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_custom_stats_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_screenshots: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          journal_id: string
          missed_trade_id: string | null
          path: string
          planned_trade_id: string | null
          trade_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          journal_id: string
          missed_trade_id?: string | null
          path: string
          planned_trade_id?: string | null
          trade_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          journal_id?: string
          missed_trade_id?: string | null
          path?: string
          planned_trade_id?: string | null
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_screenshots_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_screenshots_missed_trade_id_fkey"
            columns: ["missed_trade_id"]
            isOneToOne: false
            referencedRelation: "missed_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_screenshots_planned_trade_id_fkey"
            columns: ["planned_trade_id"]
            isOneToOne: false
            referencedRelation: "planned_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_screenshots_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          direction: string
          entry_at: string
          entry_price: number
          exit_at: string | null
          exit_price: number | null
          fees: number
          gross_pnl: number
          high_price: number | null
          id: string
          instrument_id: string | null
          is_break_even: boolean
          is_favorite: boolean
          journal_id: string
          low_price: number | null
          net_pnl: number
          notes: string | null
          otp_hit: boolean | null
          pnl_manual: boolean
          quantity: number
          risk_amount: number | null
          setup_id: string | null
          stop_loss: number | null
          take_profit: number | null
          trade_no: number
          trade_type: string
          trading_plan_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          entry_at: string
          entry_price: number
          exit_at?: string | null
          exit_price?: number | null
          fees?: number
          gross_pnl?: number
          high_price?: number | null
          id?: string
          instrument_id?: string | null
          is_break_even?: boolean
          is_favorite?: boolean
          journal_id: string
          low_price?: number | null
          net_pnl?: number
          notes?: string | null
          otp_hit?: boolean | null
          pnl_manual?: boolean
          quantity?: number
          risk_amount?: number | null
          setup_id?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_no?: number
          trade_type?: string
          trading_plan_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          entry_at?: string
          entry_price?: number
          exit_at?: string | null
          exit_price?: number | null
          fees?: number
          gross_pnl?: number
          high_price?: number | null
          id?: string
          instrument_id?: string | null
          is_break_even?: boolean
          is_favorite?: boolean
          journal_id?: string
          low_price?: number | null
          net_pnl?: number
          notes?: string | null
          otp_hit?: boolean | null
          pnl_manual?: boolean
          quantity?: number
          risk_amount?: number | null
          setup_id?: string | null
          stop_loss?: number | null
          take_profit?: number | null
          trade_no?: number
          trade_type?: string
          trading_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_trading_plan_id_fkey"
            columns: ["trading_plan_id"]
            isOneToOne: false
            referencedRelation: "trading_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_plans: {
        Row: {
          body: string | null
          created_at: string
          id: string
          journal_id: string
          name: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          journal_id: string
          name: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          journal_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_plans_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_journal: { Args: { _j: string }; Returns: boolean }
      shared_journal: { Args: { _token: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
