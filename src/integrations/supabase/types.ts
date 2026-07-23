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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_events: {
        Row: {
          agent_id: string | null
          context: Json | null
          created_at: string
          database_id: string | null
          error_detail: string | null
          event_type: string
          id: string
          latency_ms: number | null
          level: string | null
          message: string | null
          step: string | null
        }
        Insert: {
          agent_id?: string | null
          context?: Json | null
          created_at?: string
          database_id?: string | null
          error_detail?: string | null
          event_type: string
          id?: string
          latency_ms?: number | null
          level?: string | null
          message?: string | null
          step?: string | null
        }
        Update: {
          agent_id?: string | null
          context?: Json | null
          created_at?: string
          database_id?: string | null
          error_detail?: string | null
          event_type?: string
          id?: string
          latency_ms?: number | null
          level?: string | null
          message?: string | null
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_token_history: {
        Row: {
          created_at: string
          database_id: string
          id: string
          revoked_at: string | null
          revoked_reason: string | null
          token: string
        }
        Insert: {
          created_at?: string
          database_id: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          token: string
        }
        Update: {
          created_at?: string
          database_id?: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          token?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          agent_uid: string
          agent_version: string | null
          alias: string | null
          database_id: string | null
          first_seen_at: string
          heartbeat_interval_seconds: number
          id: string
          ip_address: string | null
          last_heartbeat_at: string | null
          pending_commands: Json
          push_only: boolean
          status: string
          system_info: Json | null
          total_syncs: number
          tunnel_url: string | null
        }
        Insert: {
          agent_uid: string
          agent_version?: string | null
          alias?: string | null
          database_id?: string | null
          first_seen_at?: string
          heartbeat_interval_seconds?: number
          id?: string
          ip_address?: string | null
          last_heartbeat_at?: string | null
          pending_commands?: Json
          push_only?: boolean
          status?: string
          system_info?: Json | null
          total_syncs?: number
          tunnel_url?: string | null
        }
        Update: {
          agent_uid?: string
          agent_version?: string | null
          alias?: string | null
          database_id?: string | null
          first_seen_at?: string
          heartbeat_interval_seconds?: number
          id?: string
          ip_address?: string | null
          last_heartbeat_at?: string | null
          pending_commands?: Json
          push_only?: boolean
          status?: string
          system_info?: Json | null
          total_syncs?: number
          tunnel_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      api_access_log: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: number
          params: Json | null
          rows_returned: number | null
          status: number | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: number
          params?: Json | null
          rows_returned?: number | null
          status?: number | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: number
          params?: Json | null
          rows_returned?: number | null
          status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_access_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string | null
          created_at: string
          database_id: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          revoked_reason: string | null
          scopes: string[]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          database_id?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: string[]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          database_id?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      command_results: {
        Row: {
          agent_id: string | null
          command_id: string
          command_type: string
          completed_at: string | null
          created_at: string
          database_id: string | null
          duration_ms: number | null
          enqueued_at: string
          error_message: string | null
          id: string
          payload: Json | null
          picked_up_at: string | null
          result: Json | null
          status: string
        }
        Insert: {
          agent_id?: string | null
          command_id: string
          command_type: string
          completed_at?: string | null
          created_at?: string
          database_id?: string | null
          duration_ms?: number | null
          enqueued_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          picked_up_at?: string | null
          result?: Json | null
          status?: string
        }
        Update: {
          agent_id?: string | null
          command_id?: string
          command_type?: string
          completed_at?: string | null
          created_at?: string
          database_id?: string | null
          duration_ms?: number | null
          enqueued_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          picked_up_at?: string | null
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          city: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          razao_social: string | null
          state: string | null
        }
        Insert: {
          active?: boolean
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          razao_social?: string | null
          state?: string | null
        }
        Update: {
          active?: boolean
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          razao_social?: string | null
          state?: string | null
        }
        Relationships: []
      }
      databases: {
        Row: {
          agent_endpoint: string | null
          agent_token: string | null
          agent_uid: string | null
          charset: string | null
          company_id: string
          created_at: string
          filepath: string | null
          firebird_version: string | null
          host: string | null
          id: string
          last_sync_at: string | null
          name: string
          notes: string | null
          password_encrypted: string | null
          port: number | null
          status: string | null
          sync_interval: number | null
          sync_tables: string | null
          username: string | null
        }
        Insert: {
          agent_endpoint?: string | null
          agent_token?: string | null
          agent_uid?: string | null
          charset?: string | null
          company_id: string
          created_at?: string
          filepath?: string | null
          firebird_version?: string | null
          host?: string | null
          id?: string
          last_sync_at?: string | null
          name: string
          notes?: string | null
          password_encrypted?: string | null
          port?: number | null
          status?: string | null
          sync_interval?: number | null
          sync_tables?: string | null
          username?: string | null
        }
        Update: {
          agent_endpoint?: string | null
          agent_token?: string | null
          agent_uid?: string | null
          charset?: string | null
          company_id?: string
          created_at?: string
          filepath?: string | null
          firebird_version?: string | null
          host?: string | null
          id?: string
          last_sync_at?: string | null
          name?: string
          notes?: string | null
          password_encrypted?: string | null
          port?: number | null
          status?: string | null
          sync_interval?: number | null
          sync_tables?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "databases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas_sync: {
        Row: {
          bairr: string | null
          cdclides: number | null
          cdfilentg: number
          cdfilentgdes: number | null
          cdreg: number | null
          database_id: string
          dtentg: string | null
          endcp: string | null
          endnr: string | null
          endrf: string | null
          flagentg: string | null
          munic: string | null
          nomecli: string | null
          nrcep: string | null
          nrentg: number
          nrtel: string | null
          obsentg: string | null
          periodo: number | null
          qtform: number | null
          synced_at: string
          unfed: string | null
        }
        Insert: {
          bairr?: string | null
          cdclides?: number | null
          cdfilentg: number
          cdfilentgdes?: number | null
          cdreg?: number | null
          database_id: string
          dtentg?: string | null
          endcp?: string | null
          endnr?: string | null
          endrf?: string | null
          flagentg?: string | null
          munic?: string | null
          nomecli?: string | null
          nrcep?: string | null
          nrentg: number
          nrtel?: string | null
          obsentg?: string | null
          periodo?: number | null
          qtform?: number | null
          synced_at?: string
          unfed?: string | null
        }
        Update: {
          bairr?: string | null
          cdclides?: number | null
          cdfilentg?: number
          cdfilentgdes?: number | null
          cdreg?: number | null
          database_id?: string
          dtentg?: string | null
          endcp?: string | null
          endnr?: string | null
          endrf?: string | null
          flagentg?: string | null
          munic?: string | null
          nomecli?: string | null
          nrcep?: string | null
          nrentg?: number
          nrtel?: string | null
          obsentg?: string | null
          periodo?: number | null
          qtform?: number | null
          synced_at?: string
          unfed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_sync_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas_sync_status: {
        Row: {
          database_id: string
          last_sync_at: string | null
          rows_synced: number | null
          window_days: number | null
        }
        Insert: {
          database_id: string
          last_sync_at?: string | null
          rows_synced?: number | null
          window_days?: number | null
        }
        Update: {
          database_id?: string
          last_sync_at?: string | null
          rows_synced?: number | null
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_sync_status_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: true
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_queries: {
        Row: {
          created_at: string
          database_id: string | null
          description: string | null
          favorite: boolean
          id: string
          last_run_at: string | null
          name: string
          sql_content: string
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          database_id?: string | null
          description?: string | null
          favorite?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          sql_content: string
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          database_id?: string | null
          description?: string | null
          favorite?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          sql_content?: string
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_queries_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_cache: {
        Row: {
          cached_at: string
          database_id: string
          id: string
          tables: Json
        }
        Insert: {
          cached_at?: string
          database_id: string
          id?: string
          tables?: Json
        }
        Update: {
          cached_at?: string
          database_id?: string
          id?: string
          tables?: Json
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          database_id: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          records_count: number | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          database_id: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_count?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          database_id?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_count?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
