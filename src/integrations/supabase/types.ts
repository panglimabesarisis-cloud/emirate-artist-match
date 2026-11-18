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
      agent_settings: {
        Row: {
          artist_id: string
          enabled: boolean
          extra_instructions: string | null
          max_discount_pct: number
          tone: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          enabled?: boolean
          extra_instructions?: string | null
          max_discount_pct?: number
          tone?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          enabled?: boolean
          extra_instructions?: string | null
          max_discount_pct?: number
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          emirate_id: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          emirate_id: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          emirate_id?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_badges: {
        Row: {
          artist_id: string
          badge: string
          granted_at: string
          id: string
        }
        Insert: {
          artist_id: string
          badge: string
          granted_at?: string
          id?: string
        }
        Update: {
          artist_id?: string
          badge?: string
          granted_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_badges_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          area_id: string | null
          base_price: number | null
          bio: string | null
          category_id: string | null
          created_at: string
          emirate_id: string | null
          event_type_slugs: string[] | null
          featured: boolean
          hue: number | null
          id: string
          is_seed: boolean
          languages: string[] | null
          plan: string
          response_rate: number | null
          slug: string
          stage_name: string
          status: string
          subcategory_id: string | null
          tagline: string | null
          travel_radius_km: number | null
          user_id: string | null
        }
        Insert: {
          area_id?: string | null
          base_price?: number | null
          bio?: string | null
          category_id?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          is_seed?: boolean
          languages?: string[] | null
          plan?: string
          response_rate?: number | null
          slug: string
          stage_name: string
          status?: string
          subcategory_id?: string | null
          tagline?: string | null
          travel_radius_km?: number | null
          user_id?: string | null
        }
        Update: {
          area_id?: string | null
          base_price?: number | null
          bio?: string | null
          category_id?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          is_seed?: boolean
          languages?: string[] | null
          plan?: string
          response_rate?: number | null
          slug?: string
          stage_name?: string
          status?: string
          subcategory_id?: string | null
          tagline?: string | null
          travel_radius_km?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artists_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artists_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artists_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          artist_id: string
          date: string
          id: string
          note: string | null
        }
        Insert: {
          artist_id: string
          date: string
          id?: string
          note?: string | null
        }
        Update: {
          artist_id?: string
          date?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount: number
          artist_id: string
          client_name: string
          client_user_id: string | null
          created_at: string
          event_date: string
          event_type_id: string | null
          id: string
          is_seed: boolean
          status: string
        }
        Insert: {
          amount: number
          artist_id: string
          client_name: string
          client_user_id?: string | null
          created_at?: string
          event_date: string
          event_type_id?: string | null
          id?: string
          is_seed?: boolean
          status?: string
        }
        Update: {
          amount?: number
          artist_id?: string
          client_name?: string
          client_user_id?: string | null
          created_at?: string
          event_date?: string
          event_type_id?: string | null
          id?: string
          is_seed?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          name_ar: string | null
          slug: string
          sort: number | null
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          name_ar?: string | null
          slug: string
          sort?: number | null
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          slug?: string
          sort?: number | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          access_key: string
          ai_replies: number
          artist_id: string
          created_at: string
          id: string
          last_message_at: string
          mode: string
          quote_request_id: string | null
        }
        Insert: {
          access_key?: string
          ai_replies?: number
          artist_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          mode?: string
          quote_request_id?: string | null
        }
        Update: {
          access_key?: string
          ai_replies?: number
          artist_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          mode?: string
          quote_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: true
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          artist_id: string
          created_at: string
          delta: number
          id: string
          reason: string
          ref: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          delta: number
          id?: string
          reason: string
          ref?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_wallets: {
        Row: {
          artist_id: string
          balance: number
          updated_at: string
        }
        Insert: {
          artist_id: string
          balance?: number
          updated_at?: string
        }
        Update: {
          artist_id?: string
          balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_wallets_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      emirates: {
        Row: {
          id: string
          name: string
          name_ar: string | null
          slug: string
          sort: number | null
        }
        Insert: {
          id?: string
          name: string
          name_ar?: string | null
          slug: string
          sort?: number | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string | null
          slug?: string
          sort?: number | null
        }
        Relationships: []
      }
      event_types: {
        Row: {
          id: string
          name: string
          slug: string
          sort: number | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort?: number | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          sort?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          area_id: string | null
          artist_id: string
          budget: number | null
          client_user_id: string | null
          created_at: string
          email: string
          event_date: string | null
          event_type_id: string | null
          guests: number | null
          id: string
          message: string | null
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          area_id?: string | null
          artist_id: string
          budget?: number | null
          client_user_id?: string | null
          created_at?: string
          email: string
          event_date?: string | null
          event_type_id?: string | null
          guests?: number | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          area_id?: string | null
          artist_id?: string
          budget?: number | null
          client_user_id?: string | null
          created_at?: string
          email?: string
          event_date?: string | null
          event_type_id?: string | null
          guests?: number | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_cards: {
        Row: {
          artist_id: string
          description: string | null
          duration_minutes: number | null
          id: string
          price: number
          sort: number | null
          title: string
        }
        Insert: {
          artist_id: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          price: number
          sort?: number | null
          title: string
        }
        Update: {
          artist_id?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          price?: number
          sort?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          artist_id: string
          body: string | null
          booking_id: string | null
          client_name: string
          created_at: string
          event_label: string | null
          id: string
          is_seed: boolean
          rating: number
          reply: string | null
          status: string
        }
        Insert: {
          artist_id: string
          body?: string | null
          booking_id?: string | null
          client_name: string
          created_at?: string
          event_label?: string | null
          id?: string
          is_seed?: boolean
          rating: number
          reply?: string | null
          status?: string
        }
        Update: {
          artist_id?: string
          body?: string | null
          booking_id?: string | null
          client_name?: string
          created_at?: string
          event_label?: string | null
          id?: string
          is_seed?: boolean
          rating?: number
          reply?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_visibility: {
        Row: {
          artist_id: string
          revenue_mode: string
          show_member_since: boolean
          show_orders: boolean
          show_rating: boolean
          show_repeat: boolean
          show_response: boolean
        }
        Insert: {
          artist_id: string
          revenue_mode?: string
          show_member_since?: boolean
          show_orders?: boolean
          show_rating?: boolean
          show_repeat?: boolean
          show_response?: boolean
        }
        Update: {
          artist_id?: string
          revenue_mode?: string
          show_member_since?: boolean
          show_orders?: boolean
          show_rating?: boolean
          show_repeat?: boolean
          show_response?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stat_visibility_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          category_id: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          category_id?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_applications: {
        Row: {
          admin_note: string | null
          artist_id: string
          badge_type: string
          created_at: string
          decided_at: string | null
          doc_path: string | null
          id: string
          note: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          artist_id: string
          badge_type: string
          created_at?: string
          decided_at?: string | null
          doc_path?: string | null
          id?: string
          note?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          artist_id?: string
          badge_type?: string
          created_at?: string
          decided_at?: string | null
          doc_path?: string | null
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_applications_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      artist_public_stats: {
        Args: never
        Returns: {
          artist_id: string
          completed_orders: number
          member_since: string
          rating: number
          repeat_clients: number
          response_rate: number
          revenue_label: string
          review_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "artist" | "client"
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
    Enums: {
      app_role: ["admin", "artist", "client"],
    },
  },
} as const
