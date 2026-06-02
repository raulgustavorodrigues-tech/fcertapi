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
      agents: {
        Row: {
          agent_uid: string
          agent_version: string | null
          alias: string | null
          database_id: string | null
          first_seen_at: string
          id: string
          ip_address: string | null
          last_heartbeat_at: string | null
          status: string
          total_syncs: number
        }
        Insert: {
          agent_uid: string
          agent_version?: string | null
          alias?: string | null
          database_id?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          last_heartbeat_at?: string | null
          status?: string
          total_syncs?: number
        }
        Update: {
          agent_uid?: string
          agent_version?: string | null
          alias?: string | null
          database_id?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          last_heartbeat_at?: string | null
          status?: string
          total_syncs?: number
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
      connectivity_logs: {
        Row: {
          database_id: string | null
          error_detail: string | null
          id: string
          latency_ms: number | null
          result: string
          step_failed: string | null
          tested_at: string
        }
        Insert: {
          database_id?: string | null
          error_detail?: string | null
          id?: string
          latency_ms?: number | null
          result: string
          step_failed?: string | null
          tested_at?: string
        }
        Update: {
          database_id?: string | null
          error_detail?: string | null
          id?: string
          latency_ms?: number | null
          result?: string
          step_failed?: string | null
          tested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectivity_logs_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
