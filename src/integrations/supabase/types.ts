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
      account_closure_requests: {
        Row: {
          created_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_closure_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          artist_id: string
          chat_id: string
          created_at: string
          id: string
          kind: string
          message_id: string
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          chat_id: string
          created_at?: string
          id?: string
          kind: string
          message_id: string
          payload: Json
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          chat_id?: string
          created_at?: string
          id?: string
          kind?: string
          message_id?: string
          payload?: Json
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "agent_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_files: {
        Row: {
          artist_id: string
          bytes: number
          id: string
          message_id: string | null
          mime: string
          name: string
          storage_path: string
        }
        Insert: {
          artist_id: string
          bytes: number
          id?: string
          message_id?: string | null
          mime: string
          name: string
          storage_path: string
        }
        Update: {
          artist_id?: string
          bytes?: number
          id?: string
          message_id?: string | null
          mime?: string
          name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_files_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chat_files_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_messages: {
        Row: {
          body: string
          chat_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          body: string
          chat_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          body?: string
          chat_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "agent_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chats: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          title?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chats_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_enabled: {
        Row: {
          artist_id: string
          enabled_at: string
          prompt_id: string
        }
        Insert: {
          artist_id: string
          enabled_at?: string
          prompt_id: string
        }
        Update: {
          artist_id?: string
          enabled_at?: string
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_enabled_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_enabled_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "agent_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_enabled_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "agent_prompts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_purchases: {
        Row: {
          artist_id: string
          paid_at: string | null
          prompt_id: string
          refunded_at: string | null
          stripe_session_id: string | null
        }
        Insert: {
          artist_id: string
          paid_at?: string | null
          prompt_id: string
          refunded_at?: string | null
          stripe_session_id?: string | null
        }
        Update: {
          artist_id?: string
          paid_at?: string | null
          prompt_id?: string
          refunded_at?: string | null
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_purchases_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_purchases_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "agent_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_purchases_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "agent_prompts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompts: {
        Row: {
          applies_when: string | null
          body: string
          category: string | null
          description: string | null
          id: string
          is_active: boolean
          kind: string
          price_aed: number
          priority: string
          tier: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          applies_when?: string | null
          body?: string
          category?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          price_aed?: number
          priority?: string
          tier?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          applies_when?: string | null
          body?: string
          category?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          price_aed?: number
          priority?: string
          tier?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompts_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      agent_settings: {
        Row: {
          artist_id: string
          enabled: boolean
          extra_instructions: string | null
          handoff: Json
          knowledge: string | null
          languages: string[]
          max_discount_pct: number
          model: string | null
          reply_length: string
          tone: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          enabled?: boolean
          extra_instructions?: string | null
          handoff?: Json
          knowledge?: string | null
          languages?: string[]
          max_discount_pct?: number
          model?: string | null
          reply_length?: string
          tone?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          enabled?: boolean
          extra_instructions?: string | null
          handoff?: Json
          knowledge?: string | null
          languages?: string[]
          max_discount_pct?: number
          model?: string | null
          reply_length?: string
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
      ai_flow_template_purchases: {
        Row: {
          artist_id: string
          paid_at: string | null
          refunded_at: string | null
          stripe_session_id: string | null
          template_id: string
        }
        Insert: {
          artist_id: string
          paid_at?: string | null
          refunded_at?: string | null
          stripe_session_id?: string | null
          template_id: string
        }
        Update: {
          artist_id?: string
          paid_at?: string | null
          refunded_at?: string | null
          stripe_session_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_flow_template_purchases_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_flow_template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_flow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_flow_templates: {
        Row: {
          description: string
          edges: Json
          id: string
          name: string
          nodes: Json
          price_aed: number
          published: boolean
          tier: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          description?: string
          edges?: Json
          id?: string
          name: string
          nodes?: Json
          price_aed?: number
          published?: boolean
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          description?: string
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          price_aed?: number
          published?: boolean
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      ai_flows: {
        Row: {
          artist_id: string | null
          edges: Json
          enabled: boolean
          id: string
          nodes: Json
          source_template_id: string | null
          source_version: number | null
          updated_at: string
        }
        Insert: {
          artist_id?: string | null
          edges?: Json
          enabled?: boolean
          id?: string
          nodes?: Json
          source_template_id?: string | null
          source_version?: number | null
          updated_at?: string
        }
        Update: {
          artist_id?: string | null
          edges?: Json
          enabled?: boolean
          id?: string
          nodes?: Json
          source_template_id?: string | null
          source_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_flows_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_rates: {
        Row: {
          effective_from: string
          is_active: boolean
          label: string | null
          model: string
          usd_cached_per_mtok: number
          usd_in_per_mtok: number
          usd_out_per_mtok: number
        }
        Insert: {
          effective_from?: string
          is_active?: boolean
          label?: string | null
          model: string
          usd_cached_per_mtok?: number
          usd_in_per_mtok?: number
          usd_out_per_mtok?: number
        }
        Update: {
          effective_from?: string
          is_active?: boolean
          label?: string | null
          model?: string
          usd_cached_per_mtok?: number
          usd_in_per_mtok?: number
          usd_out_per_mtok?: number
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      artist_bank_details: {
        Row: {
          account_type: string
          artist_id: string
          bank_name: string | null
          branch: string | null
          holder_name: string | null
          iban: string | null
          id_number_enc: string | null
          id_type: string | null
          swift: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          artist_id: string
          bank_name?: string | null
          branch?: string | null
          holder_name?: string | null
          iban?: string | null
          id_number_enc?: string | null
          id_type?: string | null
          swift?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          artist_id?: string
          bank_name?: string | null
          branch?: string | null
          holder_name?: string | null
          iban?: string | null
          id_number_enc?: string | null
          id_type?: string | null
          swift?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_bank_details_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_calendar: {
        Row: {
          artist_id: string
          created_at: string
          token: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          token?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_calendar_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_clients: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          is_public: boolean
          name: string
          year: number | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          year?: number | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_clients_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_media: {
        Row: {
          artist_id: string
          caption: string | null
          created_at: string
          id: string
          is_cover: boolean
          kind: string
          sort: number
          storage_path: string | null
          url: string
        }
        Insert: {
          artist_id: string
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          kind: string
          sort?: number
          storage_path?: string | null
          url: string
        }
        Update: {
          artist_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          kind?: string
          sort?: number
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_media_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_members: {
        Row: {
          artist_id: string
          created_at: string
          email: string
          id: string
          last_active_at: string | null
          role: string
          role_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          email: string
          id?: string
          last_active_at?: string | null
          role?: string
          role_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          email?: string
          id?: string
          last_active_at?: string | null
          role?: string
          role_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_members_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "team_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_order_forms: {
        Row: {
          artist_id: string
          description: string | null
          enabled: boolean
          fields: Json
          source_template_id: string | null
          source_version: number | null
          title: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          description?: string | null
          enabled?: boolean
          fields?: Json
          source_template_id?: string | null
          source_version?: number | null
          title?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          description?: string | null
          enabled?: boolean
          fields?: Json
          source_template_id?: string | null
          source_version?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_order_forms_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_portfolio: {
        Row: {
          artist_id: string
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          kind: string | null
          link: string | null
          sort: number
          title: string
          year: number | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          kind?: string | null
          link?: string | null
          sort?: number
          title: string
          year?: number | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          kind?: string | null
          link?: string | null
          sort?: number
          title?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_portfolio_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_subscriptions: {
        Row: {
          artist_id: string
          billing_interval: string
          cancel_at_period_end: boolean
          created_at: string
          customer_id: string
          environment: string
          id: string
          paid_from: string | null
          paid_until: string | null
          pending_interval: string | null
          pending_plan: string | null
          period_end: string
          period_start: string
          plan_code: string
          schedule_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          billing_interval: string
          cancel_at_period_end?: boolean
          created_at?: string
          customer_id: string
          environment?: string
          id: string
          paid_from?: string | null
          paid_until?: string | null
          pending_interval?: string | null
          pending_plan?: string | null
          period_end: string
          period_start: string
          plan_code: string
          schedule_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          billing_interval?: string
          cancel_at_period_end?: boolean
          created_at?: string
          customer_id?: string
          environment?: string
          id?: string
          paid_from?: string | null
          paid_until?: string | null
          pending_interval?: string | null
          pending_plan?: string | null
          period_end?: string
          period_start?: string
          plan_code?: string
          schedule_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_subscriptions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      artists: {
        Row: {
          area_id: string | null
          base_price: number | null
          bio: string | null
          body: Json
          calendar_token: string
          category_id: string | null
          category_ids: string[]
          contract_accepted_at: string | null
          created_at: string
          emirate_id: string | null
          event_type_slugs: string[] | null
          featured: boolean
          hue: number | null
          id: string
          intended_plan: string | null
          is_seed: boolean
          languages: string[] | null
          manager_phone: string | null
          notify_phone: string | null
          onboarding_complete: boolean | null
          photo_path: string | null
          plan: string
          registration_paid_at: string | null
          response_rate: number | null
          skills: string[]
          slug: string
          specialty_ids: string[]
          stage_name: string
          status: string
          subcategory_id: string | null
          tagline: string | null
          travel_radius_km: number | null
          trn: string | null
          user_id: string | null
        }
        Insert: {
          area_id?: string | null
          base_price?: number | null
          bio?: string | null
          body?: Json
          calendar_token?: string
          category_id?: string | null
          category_ids?: string[]
          contract_accepted_at?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          intended_plan?: string | null
          is_seed?: boolean
          languages?: string[] | null
          manager_phone?: string | null
          notify_phone?: string | null
          onboarding_complete?: boolean | null
          photo_path?: string | null
          plan?: string
          registration_paid_at?: string | null
          response_rate?: number | null
          skills?: string[]
          slug: string
          specialty_ids?: string[]
          stage_name: string
          status?: string
          subcategory_id?: string | null
          tagline?: string | null
          travel_radius_km?: number | null
          trn?: string | null
          user_id?: string | null
        }
        Update: {
          area_id?: string | null
          base_price?: number | null
          bio?: string | null
          body?: Json
          calendar_token?: string
          category_id?: string | null
          category_ids?: string[]
          contract_accepted_at?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          intended_plan?: string | null
          is_seed?: boolean
          languages?: string[] | null
          manager_phone?: string | null
          notify_phone?: string | null
          onboarding_complete?: boolean | null
          photo_path?: string | null
          plan?: string
          registration_paid_at?: string | null
          response_rate?: number | null
          skills?: string[]
          slug?: string
          specialty_ids?: string[]
          stage_name?: string
          status?: string
          subcategory_id?: string | null
          tagline?: string | null
          travel_radius_km?: number | null
          trn?: string | null
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
      billing_entitlement_periods: {
        Row: {
          artist_id: string
          line_id: string
          period_end: string
          period_start: string
          plan_code: string
          subscription_id: string
        }
        Insert: {
          artist_id: string
          line_id: string
          period_end: string
          period_start: string
          plan_code: string
          subscription_id: string
        }
        Update: {
          artist_id?: string
          line_id?: string
          period_end?: string
          period_start?: string
          plan_code?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_entitlement_periods_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlement_periods_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "billing_entitlement_periods_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "artist_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_minor: number
          artist_id: string
          created_at: string
          currency: string
          hosted_url: string | null
          id: string
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string
          subscription_id: string
        }
        Insert: {
          amount_minor: number
          artist_id: string
          created_at?: string
          currency: string
          hosted_url?: string | null
          id: string
          pdf_url?: string | null
          period_end: string
          period_start: string
          status: string
          subscription_id: string
        }
        Update: {
          amount_minor?: number
          artist_id?: string
          created_at?: string
          currency?: string
          hosted_url?: string | null
          id?: string
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "artist_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          access_key: string
          amount: number
          artist_id: string
          artist_invoice_required: boolean
          artist_key: string
          calendar_event_id: string | null
          calendar_sync_error: string | null
          calendar_sync_status: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_user_id: string | null
          commission_basis: string | null
          commission_rate: number | null
          completed_at: string | null
          contract_accepted_at: string | null
          contract_template_id: string | null
          contract_terms: Json | null
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          deposit_pct: number
          drafted_by: string
          end_time: string | null
          escrow_released_at: string | null
          escrow_status: string
          event_date: string
          event_type_id: string | null
          guests: number | null
          id: string
          invoice_items: Json
          invoice_no: string | null
          is_seed: boolean
          job_detail: string | null
          notes: string | null
          package_title: string | null
          paid_amount: number
          paid_at: string | null
          refund_amount: number
          reminder_claimed_at: string | null
          reminder_sent_at: string | null
          revision_note: string | null
          send_invoice_after_approval: boolean
          start_time: string | null
          status: string
          total: number
          vat_amount: number
        }
        Insert: {
          access_key?: string
          amount: number
          artist_id: string
          artist_invoice_required?: boolean
          artist_key?: string
          calendar_event_id?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_user_id?: string | null
          commission_basis?: string | null
          commission_rate?: number | null
          completed_at?: string | null
          contract_accepted_at?: string | null
          contract_template_id?: string | null
          contract_terms?: Json | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          deposit_pct?: number
          drafted_by?: string
          end_time?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          event_date: string
          event_type_id?: string | null
          guests?: number | null
          id?: string
          invoice_items?: Json
          invoice_no?: string | null
          is_seed?: boolean
          job_detail?: string | null
          notes?: string | null
          package_title?: string | null
          paid_amount?: number
          paid_at?: string | null
          refund_amount?: number
          reminder_claimed_at?: string | null
          reminder_sent_at?: string | null
          revision_note?: string | null
          send_invoice_after_approval?: boolean
          start_time?: string | null
          status?: string
          total?: number
          vat_amount?: number
        }
        Update: {
          access_key?: string
          amount?: number
          artist_id?: string
          artist_invoice_required?: boolean
          artist_key?: string
          calendar_event_id?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_user_id?: string | null
          commission_basis?: string | null
          commission_rate?: number | null
          completed_at?: string | null
          contract_accepted_at?: string | null
          contract_template_id?: string | null
          contract_terms?: Json | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          deposit_pct?: number
          drafted_by?: string
          end_time?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          event_date?: string
          event_type_id?: string | null
          guests?: number | null
          id?: string
          invoice_items?: Json
          invoice_no?: string | null
          is_seed?: boolean
          job_detail?: string | null
          notes?: string | null
          package_title?: string | null
          paid_amount?: number
          paid_at?: string | null
          refund_amount?: number
          reminder_claimed_at?: string | null
          reminder_sent_at?: string | null
          revision_note?: string | null
          send_invoice_after_approval?: boolean
          start_time?: string | null
          status?: string
          total?: number
          vat_amount?: number
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
            foreignKeyName: "bookings_contract_template_id_fkey"
            columns: ["contract_template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
      client_ratings: {
        Row: {
          artist_id: string
          booking_id: string
          client_email: string
          created_at: string
          created_by: string
          id: string
          note: string | null
          rating: number
        }
        Insert: {
          artist_id: string
          booking_id: string
          client_email: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          rating: number
        }
        Update: {
          artist_id?: string
          booking_id?: string
          client_email?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_ratings_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_template_purchases: {
        Row: {
          artist_id: string
          created_at: string
          paid_at: string | null
          price_aed: number
          refunded_at: string | null
          template_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          paid_at?: string | null
          price_aed?: number
          refunded_at?: string | null
          template_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          paid_at?: string | null
          price_aed?: number
          refunded_at?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_template_purchases_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          artist_id: string | null
          category: string | null
          clauses: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_aed: number
          rider: string | null
          role: string | null
          tier: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          artist_id?: string | null
          category?: string | null
          clauses?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_aed?: number
          rider?: string | null
          role?: string | null
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          artist_id?: string | null
          category?: string | null
          clauses?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_aed?: number
          rider?: string | null
          role?: string | null
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      conversations: {
        Row: {
          access_key: string
          ai_replies: number
          artist_id: string
          client_name: string | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          id: string
          label: string | null
          last_message_at: string
          mode: string
          quote_request_id: string | null
        }
        Insert: {
          access_key?: string
          ai_replies?: number
          artist_id: string
          client_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: string
          label?: string | null
          last_message_at?: string
          mode?: string
          quote_request_id?: string | null
        }
        Update: {
          access_key?: string
          ai_replies?: number
          artist_id?: string
          client_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: string
          label?: string | null
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
          cost_usd_micros: number | null
          created_at: string
          delta: number
          id: string
          kind: string | null
          model: string | null
          rate_snapshot: Json | null
          reason: string
          ref: string | null
          tokens_cached: number | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          artist_id: string
          cost_usd_micros?: number | null
          created_at?: string
          delta: number
          id?: string
          kind?: string | null
          model?: string | null
          rate_snapshot?: Json | null
          reason: string
          ref?: string | null
          tokens_cached?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          artist_id?: string
          cost_usd_micros?: number | null
          created_at?: string
          delta?: number
          id?: string
          kind?: string | null
          model?: string | null
          rate_snapshot?: Json | null
          reason?: string
          ref?: string | null
          tokens_cached?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
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
      disputes: {
        Row: {
          admin_note: string | null
          booking_id: string
          created_at: string
          id: string
          opened_by: string
          reason: string
          refund_amount: number
          resolution: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          booking_id: string
          created_at?: string
          id?: string
          opened_by: string
          reason: string
          refund_amount?: number
          resolution?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          reason?: string
          refund_amount?: number
          resolution?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_folders: {
        Row: {
          created_at: string
          drive_id: string
          key: string
        }
        Insert: {
          created_at?: string
          drive_id: string
          key: string
        }
        Update: {
          created_at?: string
          drive_id?: string
          key?: string
        }
        Relationships: []
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
      expiry_runs: {
        Row: {
          bookings_hidden: number
          id: string
          invoices_hidden: number
          purged: number
          ran_at: string
        }
        Insert: {
          bookings_hidden?: number
          id?: string
          invoices_hidden?: number
          purged?: number
          ran_at?: string
        }
        Update: {
          bookings_hidden?: number
          id?: string
          invoices_hidden?: number
          purged?: number
          ran_at?: string
        }
        Relationships: []
      }
      fonnte_approval_events: {
        Row: {
          applied_at: string | null
          booking_id: string | null
          decision: string
          delivery_id: string
          effects_started_at: string | null
          effects_state: string
          id: string
          message_at: string
          outcome: string | null
          processed_at: string | null
          processing_error: string | null
          received_at: string
          reference: string | null
          reply_id: string | null
          reply_status: string | null
          retry_at: string
          sender: string
        }
        Insert: {
          applied_at?: string | null
          booking_id?: string | null
          decision: string
          delivery_id: string
          effects_started_at?: string | null
          effects_state?: string
          id?: string
          message_at: string
          outcome?: string | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          reference?: string | null
          reply_id?: string | null
          reply_status?: string | null
          retry_at?: string
          sender: string
        }
        Update: {
          applied_at?: string | null
          booking_id?: string | null
          decision?: string
          delivery_id?: string
          effects_started_at?: string | null
          effects_state?: string
          id?: string
          message_at?: string
          outcome?: string | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          reference?: string | null
          reply_id?: string | null
          reply_status?: string | null
          retry_at?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "fonnte_approval_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      fonnte_revision_events: {
        Row: {
          booking_id: string | null
          created_at: string
          delivery_id: string
          id: string
          message: string
          message_at: string
          outcome: string | null
          proposed_amount: number | null
          proposed_note: string | null
          reference: string | null
          reply_id: string | null
          reply_status: string | null
          sender: string
          state: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          delivery_id: string
          id?: string
          message: string
          message_at: string
          outcome?: string | null
          proposed_amount?: number | null
          proposed_note?: string | null
          reference?: string | null
          reply_id?: string | null
          reply_status?: string | null
          sender: string
          state?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          delivery_id?: string
          id?: string
          message?: string
          message_at?: string
          outcome?: string | null
          proposed_amount?: number | null
          proposed_note?: string | null
          reference?: string | null
          reply_id?: string | null
          reply_status?: string | null
          sender?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "fonnte_revision_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_archive_jobs: {
        Row: {
          attempts: number
          created_at: string
          drive_file_id: string | null
          drive_file_name: string | null
          drive_folder_path: string | null
          id: string
          invoice_id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_path?: string | null
          id?: string
          invoice_id: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_path?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_archive_jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      library_audit: {
        Row: {
          action: string
          actor: string | null
          changed_at: string
          id: string
          item_id: string
          kind: string
          summary: Json
        }
        Insert: {
          action: string
          actor?: string | null
          changed_at?: string
          id?: string
          item_id: string
          kind: string
          summary?: Json
        }
        Update: {
          action?: string
          actor?: string | null
          changed_at?: string
          id?: string
          item_id?: string
          kind?: string
          summary?: Json
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
      notifications: {
        Row: {
          audience: string
          booking_id: string | null
          channel: string
          created_at: string
          delivered_at: string | null
          error: string | null
          failed_at: string | null
          id: string
          kind: string
          provider_message_id: string | null
          read_at: string | null
          recipient: string | null
          sent_at: string | null
          status: string
          status_at: string | null
        }
        Insert: {
          audience: string
          booking_id?: string | null
          channel: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          kind: string
          provider_message_id?: string | null
          read_at?: string | null
          recipient?: string | null
          sent_at?: string | null
          status?: string
          status_at?: string | null
        }
        Update: {
          audience?: string
          booking_id?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          kind?: string
          provider_message_id?: string | null
          read_at?: string | null
          recipient?: string | null
          sent_at?: string | null
          status?: string
          status_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_template_purchases: {
        Row: {
          artist_id: string
          paid_at: string | null
          refunded_at: string | null
          stripe_session_id: string | null
          template_id: string
        }
        Insert: {
          artist_id: string
          paid_at?: string | null
          refunded_at?: string | null
          stripe_session_id?: string | null
          template_id: string
        }
        Update: {
          artist_id?: string
          paid_at?: string | null
          refunded_at?: string | null
          stripe_session_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_template_purchases_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_form_templates_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_templates: {
        Row: {
          category: string | null
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          name: string
          price_aed: number
          question_count: number | null
          tier: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          name: string
          price_aed?: number
          question_count?: number | null
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_aed?: number
          question_count?: number | null
          tier?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_form_templates_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_event_inbox: {
        Row: {
          attempted_at: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          status: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          event_type: string
          id: string
          last_error?: string | null
          payload: Json
          status?: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          status?: string
        }
        Relationships: []
      }
      payment_followups: {
        Row: {
          attempted_at: string | null
          booking_id: string
          created_at: string
          last_error: string | null
          order_id: string
          status: string
        }
        Insert: {
          attempted_at?: string | null
          booking_id: string
          created_at?: string
          last_error?: string | null
          order_id: string
          status?: string
        }
        Update: {
          attempted_at?: string | null
          booking_id?: string
          created_at?: string
          last_error?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_followups_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_followups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount_minor: number
          artist_id: string
          created_at: string
          credits: number
          currency: string
          environment: string
          exchange_rate: number | null
          id: string
          kind: string
          last_error: string | null
          package_id: string | null
          paid_at: string | null
          plan_code: string | null
          processor_amount_minor: number | null
          processor_currency: string | null
          purchase_key: string | null
          refunded_accounting_amount: number
          refunded_processor_amount: number
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          target_id: string | null
        }
        Insert: {
          amount_minor: number
          artist_id: string
          created_at?: string
          credits?: number
          currency?: string
          environment?: string
          exchange_rate?: number | null
          id?: string
          kind: string
          last_error?: string | null
          package_id?: string | null
          paid_at?: string | null
          plan_code?: string | null
          processor_amount_minor?: number | null
          processor_currency?: string | null
          purchase_key?: string | null
          refunded_accounting_amount?: number
          refunded_processor_amount?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          target_id?: string | null
        }
        Update: {
          amount_minor?: number
          artist_id?: string
          created_at?: string
          credits?: number
          currency?: string
          environment?: string
          exchange_rate?: number | null
          id?: string
          kind?: string
          last_error?: string | null
          package_id?: string | null
          paid_at?: string | null
          plan_code?: string | null
          processor_amount_minor?: number | null
          processor_currency?: string | null
          purchase_key?: string | null
          refunded_accounting_amount?: number
          refunded_processor_amount?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          amount: number
          artist_id: string
          bank_details: string | null
          bank_snapshot: Json | null
          created_at: string
          decided_at: string | null
          id: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          artist_id: string
          bank_details?: string | null
          bank_snapshot?: Json | null
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          artist_id?: string
          bank_details?: string | null
          bank_snapshot?: Json | null
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_credit_periods: {
        Row: {
          artist_id: string
          created_at: string
          credits: number
          month_start: string
          plan_code: string
          source: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          credits: number
          month_start: string
          plan_code: string
          source: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          credits?: number
          month_start?: string
          plan_code?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_credit_periods_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tiers: {
        Row: {
          ai_credits: number
          allowed_models: string[]
          code: string
          commission_pct: number
          features: Json
          max_active_prompts: number
          max_categories: number
          max_clients: number
          max_flow_blocks: number
          max_form_questions: number
          max_own_prompts: number
          max_photos: number
          max_portfolio: number
          max_specialties: number
          max_team_members: number
          max_videos: number
          name: string
          price_monthly: number
          price_yearly: number
          sort: number
          updated_at: string
        }
        Insert: {
          ai_credits?: number
          allowed_models?: string[]
          code: string
          commission_pct?: number
          features?: Json
          max_active_prompts?: number
          max_categories?: number
          max_clients?: number
          max_flow_blocks?: number
          max_form_questions?: number
          max_own_prompts?: number
          max_photos?: number
          max_portfolio?: number
          max_specialties?: number
          max_team_members?: number
          max_videos?: number
          name: string
          price_monthly?: number
          price_yearly?: number
          sort?: number
          updated_at?: string
        }
        Update: {
          ai_credits?: number
          allowed_models?: string[]
          code?: string
          commission_pct?: number
          features?: Json
          max_active_prompts?: number
          max_categories?: number
          max_clients?: number
          max_flow_blocks?: number
          max_form_questions?: number
          max_own_prompts?: number
          max_photos?: number
          max_portfolio?: number
          max_specialties?: number
          max_team_members?: number
          max_videos?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
          sort?: number
          updated_at?: string
        }
        Relationships: []
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
          deleted_at: string | null
          email: string
          end_time: string | null
          event_date: string | null
          event_type_id: string | null
          guests: number | null
          id: string
          message: string | null
          name: string
          perform_minutes: number | null
          phone: string | null
          start_time: string | null
          status: string
        }
        Insert: {
          area_id?: string | null
          artist_id: string
          budget?: number | null
          client_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          end_time?: string | null
          event_date?: string | null
          event_type_id?: string | null
          guests?: number | null
          id?: string
          message?: string | null
          name: string
          perform_minutes?: number | null
          phone?: string | null
          start_time?: string | null
          status?: string
        }
        Update: {
          area_id?: string | null
          artist_id?: string
          budget?: number | null
          client_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          end_time?: string | null
          event_date?: string | null
          event_type_id?: string | null
          guests?: number | null
          id?: string
          message?: string | null
          name?: string
          perform_minutes?: number | null
          phone?: string | null
          start_time?: string | null
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
          rating_communication: number | null
          rating_performance: number | null
          rating_punctuality: number | null
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
          rating_communication?: number | null
          rating_performance?: number | null
          rating_punctuality?: number | null
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
          rating_communication?: number | null
          rating_performance?: number | null
          rating_punctuality?: number | null
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
      schedule_items: {
        Row: {
          artist_id: string
          created_at: string
          created_by: string | null
          end_time: string
          event_date: string
          id: string
          notes: string | null
          source: string
          start_time: string
          title: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          event_date: string
          id?: string
          notes?: string | null
          source?: string
          start_time: string
          title: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          event_date?: string
          id?: string
          notes?: string | null
          source?: string
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      service_invoices: {
        Row: {
          artist_id: string
          booking_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          document: Json
          hidden_at: string | null
          id: string
          number: string
          paid_at: string | null
          status: string
          total: number
        }
        Insert: {
          artist_id: string
          booking_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          document: Json
          hidden_at?: string | null
          id?: string
          number: string
          paid_at?: string | null
          status?: string
          total: number
        }
        Update: {
          artist_id?: string
          booking_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          document?: Json
          hidden_at?: string | null
          id?: string
          number?: string
          paid_at?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_invoices_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_invoices_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_pages: {
        Row: {
          body: string
          id: string
          in_menu: boolean
          published: boolean
          slug: string
          sort: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          id?: string
          in_menu?: boolean
          published?: boolean
          slug: string
          sort?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          id?: string
          in_menu?: boolean
          published?: boolean
          slug?: string
          sort?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
      subscription_checkouts: {
        Row: {
          artist_id: string
          attempt_key: string
          billing_interval: string
          created_at: string
          customer_id: string
          plan_code: string
          session_id: string | null
        }
        Insert: {
          artist_id: string
          attempt_key?: string
          billing_interval: string
          created_at?: string
          customer_id: string
          plan_code: string
          session_id?: string | null
        }
        Update: {
          artist_id?: string
          attempt_key?: string
          billing_interval?: string
          created_at?: string
          customer_id?: string
          plan_code?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_checkouts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roles: {
        Row: {
          artist_id: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          menus: string[]
          name: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          menus?: string[]
          name: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          menus?: string[]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_roles_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      test_refunds: {
        Row: {
          accounting_amount: number
          created_at: string
          id: string
          last_error: string | null
          order_id: string
          processor_amount: number
          status: string
          stripe_refund_id: string | null
        }
        Insert: {
          accounting_amount: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id: string
          processor_amount: number
          status?: string
          stripe_refund_id?: string | null
        }
        Update: {
          accounting_amount?: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id?: string
          processor_amount?: number
          status?: string
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
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
      verification_access_log: {
        Row: {
          admin_id: string
          application_id: string
          file_id: string | null
          id: string
          opened_at: string
        }
        Insert: {
          admin_id: string
          application_id: string
          file_id?: string | null
          id?: string
          opened_at?: string
        }
        Update: {
          admin_id?: string
          application_id?: string
          file_id?: string | null
          id?: string
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_access_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "verification_applications"
            referencedColumns: ["id"]
          },
        ]
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
          privacy_purged_at: string | null
          reasons: string[]
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
          privacy_purged_at?: string | null
          reasons?: string[]
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
          privacy_purged_at?: string | null
          reasons?: string[]
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
      verification_details: {
        Row: {
          address: Json | null
          application_id: string
          created_at: string
          dob: string | null
          doc_expiry: string | null
          doc_number: string | null
          full_name: string | null
          nationality: string | null
          phone: string | null
          phone_confirmed_at: string | null
          redacted_at: string | null
          residency: string | null
        }
        Insert: {
          address?: Json | null
          application_id: string
          created_at?: string
          dob?: string | null
          doc_expiry?: string | null
          doc_number?: string | null
          full_name?: string | null
          nationality?: string | null
          phone?: string | null
          phone_confirmed_at?: string | null
          redacted_at?: string | null
          residency?: string | null
        }
        Update: {
          address?: Json | null
          application_id?: string
          created_at?: string
          dob?: string | null
          doc_expiry?: string | null
          doc_number?: string | null
          full_name?: string | null
          nationality?: string | null
          phone?: string | null
          phone_confirmed_at?: string | null
          redacted_at?: string | null
          residency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_details_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "verification_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_files: {
        Row: {
          application_id: string
          created_at: string
          id: string
          kind: string
          storage_path: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          kind: string
          storage_path: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_files_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "verification_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_otps: {
        Row: {
          artist_id: string
          attempts: number
          code_hash: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          provider_message_id: string | null
          send_status: string
        }
        Insert: {
          artist_id: string
          attempts?: number
          code_hash: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          provider_message_id?: string | null
          send_status?: string
        }
        Update: {
          artist_id?: string
          attempts?: number
          code_hash?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          provider_message_id?: string | null
          send_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_otps_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
          retry_at: string
        }
        Insert: {
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          retry_at?: string
        }
        Update: {
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          retry_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_prompts_public: {
        Row: {
          applies_when: string | null
          category: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          kind: string | null
          price_aed: number | null
          priority: string | null
          tier: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          applies_when?: string | null
          category?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          kind?: string | null
          price_aed?: number | null
          priority?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          applies_when?: string | null
          category?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          kind?: string | null
          price_aed?: number | null
          priority?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompts_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      order_form_templates_public: {
        Row: {
          category: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          price_aed: number | null
          question_count: number | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price_aed?: number | null
          question_count?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price_aed?: number | null
          question_count?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_templates_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      accept_artist_invites: { Args: never; Returns: number }
      admin_agent_prompt_bodies: {
        Args: never
        Returns: {
          body: string
          id: string
        }[]
      }
      admin_contract_template_content: {
        Args: never
        Returns: {
          artist_id: string | null
          category: string | null
          clauses: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_aed: number
          rider: string | null
          role: string | null
          tier: string
          updated_at: string
          updated_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "contract_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_flow_template_content: {
        Args: never
        Returns: {
          description: string
          edges: Json
          id: string
          name: string
          nodes: Json
          price_aed: number
          published: boolean
          tier: string
          updated_at: string
          updated_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_flow_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_library_usage: {
        Args: never
        Returns: {
          artists_using: number
          item_id: string
          kind: string
          last_used: string
          purchases: number
          refunded_aed: number
          revenue_aed: number
        }[]
      }
      admin_order_form_template_fields: { Args: { _id: string }; Returns: Json }
      ai_usage: {
        Args: { _artist: string; _from: string; _to: string }
        Returns: {
          cost_usd_micros: number
          day: string
          model: string
          replies: number
          tokens_cached: number
          tokens_in: number
          tokens_out: number
        }[]
      }
      allocate_plan_month: {
        Args: { _artist: string; _month: string }
        Returns: boolean
      }
      apply_fonnte_approval: { Args: { _event: string }; Returns: string }
      apply_fonnte_revision: {
        Args: { _amount: number; _event: string; _note: string }
        Returns: Json
      }
      apply_fonnte_revision_change: {
        Args: { _changes: Json; _event: string }
        Returns: Json
      }
      apply_test_subscription: { Args: { _state: Json }; Returns: undefined }
      apply_whatsapp_status: {
        Args: { _at: string; _error: string; _message: string; _status: string }
        Returns: boolean
      }
      approve_flow_booking: {
        Args: {
          _amount: number
          _date: string
          _id: string
          _key: string
          _notes: string
          _revision: string
          _title: string
        }
        Returns: boolean
      }
      approve_invoice_booking: {
        Args: { _id: string; _items: Json; _key: string }
        Returns: boolean
      }
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
      artist_wallet: {
        Args: { _artist: string }
        Returns: {
          available: number
          commission_pct: number
          fee: number
          gross: number
          jobs: number
          net: number
          paid_out: number
          pending: number
        }[]
      }
      become_artist: { Args: never; Returns: undefined }
      begin_subscription_checkout: {
        Args: {
          _artist: string
          _customer: string
          _interval: string
          _plan: string
        }
        Returns: {
          artist_id: string
          attempt_key: string
          billing_interval: string
          created_at: string
          customer_id: string
          plan_code: string
          session_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscription_checkouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_test_purchase: {
        Args: { _customer: string; _key: string; _order: Json }
        Returns: {
          amount_minor: number
          artist_id: string
          created_at: string
          credits: number
          currency: string
          environment: string
          exchange_rate: number | null
          id: string
          kind: string
          last_error: string | null
          package_id: string | null
          paid_at: string | null
          plan_code: string | null
          processor_amount_minor: number | null
          processor_currency: string | null
          purchase_key: string | null
          refunded_accounting_amount: number
          refunded_processor_amount: number
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          target_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_contract_terms: { Args: { _booking: string }; Returns: Json }
      can_use_library_item: {
        Args: { _artist: string; _id: string; _kind: string }
        Returns: boolean
      }
      charge_agent_reply: {
        Args: {
          _artist: string
          _cost: number
          _model: string
          _rate: Json
          _ref: string
          _tokens_cached: number
          _tokens_in: number
          _tokens_out: number
        }
        Returns: boolean
      }
      check_verification_otp: {
        Args: { _artist: string; _hash: string; _id: string }
        Returns: Json
      }
      claim_fonnte_revision: { Args: { _event: string }; Returns: Json }
      claim_invoice_archive_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          drive_file_id: string | null
          drive_file_name: string | null
          drive_folder_path: string | null
          id: string
          invoice_id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          run_after: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_archive_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_payment_followup: { Args: { _id: string }; Returns: boolean }
      effective_artist_plan: { Args: { _artist: string }; Returns: string }
      expire_unpaid_records: { Args: never; Returns: Json }
      finalize_verification_retention: {
        Args: { _application: string }
        Returns: boolean
      }
      finalize_verification_retention_batch: {
        Args: { _applications: string[] }
        Returns: Json
      }
      fonnte_phone: { Args: { _phone: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inbox_deletable_conversations: {
        Args: { _artist: string }
        Returns: string[]
      }
      is_any_artist_team: { Args: never; Returns: boolean }
      is_artist_owner: { Args: { _artist: string }; Returns: boolean }
      is_artist_team: { Args: { _artist: string }; Returns: boolean }
      library_updates: {
        Args: { _artist: string }
        Returns: {
          current_version: number
          kind: string
          source_template_id: string
          source_version: number
          template_name: string
        }[]
      }
      list_contract_templates: {
        Args: { _artist: string }
        Returns: {
          artist_id: string
          category: string
          clauses: Json
          description: string
          id: string
          is_active: boolean
          name: string
          price_aed: number
          rider: string
          role: string
          tier: string
          unlocked: boolean
          updated_at: string
          updated_by: string
          version: number
        }[]
      }
      list_flow_templates: {
        Args: never
        Returns: {
          block_types: string[]
          description: string
          edges: Json
          id: string
          name: string
          nodes: Json
          price_aed: number
          unlocked: boolean
        }[]
      }
      my_verification_rank: { Args: { _artist: string }; Returns: Json }
      next_invoice_no: { Args: never; Returns: string }
      record_test_refund: {
        Args: { _order: string; _processor: number }
        Returns: undefined
      }
      refresh_top_badges: { Args: never; Returns: Json }
      refresh_top_performer: { Args: { _artist: string }; Returns: undefined }
      release_due_escrow: { Args: never; Returns: number }
      reserve_fonnte_revision_credit: {
        Args: { _event: string }
        Returns: boolean
      }
      reserve_verification_otp: {
        Args: { _artist: string; _hash: string; _id: string; _phone: string }
        Returns: Json
      }
      resolve_booking_contract: {
        Args: {
          _booking: Database["public"]["Tables"]["bookings"]["Row"]
          _template: Database["public"]["Tables"]["contract_templates"]["Row"]
        }
        Returns: Json
      }
      resolve_contract_text: {
        Args: { _text: string; _values: Json }
        Returns: string
      }
      restore_conversations: { Args: { _ids: string[] }; Returns: number }
      set_conversation_label: {
        Args: { _id: string; _label: string }
        Returns: undefined
      }
      set_invoices_hidden: {
        Args: { _hidden: boolean; _ids: string[] }
        Returns: number
      }
      settle_sandbox_order: {
        Args: {
          _amount: number
          _currency: string
          _id: string
          _session: string
        }
        Returns: boolean
      }
      settle_test_purchase: {
        Args: {
          _amount: number
          _currency: string
          _id: string
          _session: string
        }
        Returns: boolean
      }
      soft_delete_bookings: { Args: { _ids: string[] }; Returns: number }
      soft_delete_conversations: { Args: { _ids: string[] }; Returns: number }
      soft_delete_invoices: { Args: { _ids: string[] }; Returns: number }
      soft_delete_quote_requests: { Args: { _ids: string[] }; Returns: number }
      storage_artist_team: { Args: { _name: string }; Returns: boolean }
      submit_verification: {
        Args: { _artist: string; _details: Json; _files: Json }
        Returns: Json
      }
      use_contract_template: {
        Args: { _booking: string; _template: string }
        Returns: undefined
      }
      use_flow_template: { Args: { _id: string }; Returns: string }
      use_order_form_template: { Args: { _id: string }; Returns: undefined }
      verification_category_ranks: {
        Args: never
        Returns: {
          artist_id: string
          category: string
          clients: number
          disputes: number
          percentile: number
        }[]
      }
      verification_file_owned_path: {
        Args: { _application: string; _path: string }
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
