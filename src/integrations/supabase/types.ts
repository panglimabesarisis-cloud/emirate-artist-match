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
      agent_settings: {
        Row: {
          artist_id: string
          enabled: boolean
          extra_instructions: string | null
          knowledge: string | null
          max_discount_pct: number
          tone: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          enabled?: boolean
          extra_instructions?: string | null
          knowledge?: string | null
          max_discount_pct?: number
          tone?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          enabled?: boolean
          extra_instructions?: string | null
          knowledge?: string | null
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
      ai_flow_templates: {
        Row: {
          description: string
          edges: Json
          id: string
          name: string
          nodes: Json
          published: boolean
          updated_at: string
        }
        Insert: {
          description?: string
          edges?: Json
          id?: string
          name: string
          nodes?: Json
          published?: boolean
          updated_at?: string
        }
        Update: {
          description?: string
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          published?: boolean
          updated_at?: string
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
          updated_at: string
        }
        Insert: {
          artist_id?: string | null
          edges?: Json
          enabled?: boolean
          id?: string
          nodes?: Json
          updated_at?: string
        }
        Update: {
          artist_id?: string | null
          edges?: Json
          enabled?: boolean
          id?: string
          nodes?: Json
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
      artist_media: {
        Row: {
          artist_id: string
          caption: string | null
          created_at: string
          id: string
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
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          email: string
          id?: string
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: string
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
        ]
      }
      artist_order_forms: {
        Row: {
          artist_id: string
          description: string | null
          enabled: boolean
          fields: Json
          title: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          description?: string | null
          enabled?: boolean
          fields?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          description?: string | null
          enabled?: boolean
          fields?: Json
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
      artists: {
        Row: {
          area_id: string | null
          base_price: number | null
          bio: string | null
          calendar_token: string
          category_id: string | null
          contract_accepted_at: string | null
          created_at: string
          emirate_id: string | null
          event_type_slugs: string[] | null
          featured: boolean
          hue: number | null
          id: string
          is_seed: boolean
          languages: string[] | null
          manager_phone: string | null
          notify_phone: string | null
          plan: string
          response_rate: number | null
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
          calendar_token?: string
          category_id?: string | null
          contract_accepted_at?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          is_seed?: boolean
          languages?: string[] | null
          manager_phone?: string | null
          notify_phone?: string | null
          plan?: string
          response_rate?: number | null
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
          calendar_token?: string
          category_id?: string | null
          contract_accepted_at?: string | null
          created_at?: string
          emirate_id?: string | null
          event_type_slugs?: string[] | null
          featured?: boolean
          hue?: number | null
          id?: string
          is_seed?: boolean
          languages?: string[] | null
          manager_phone?: string | null
          notify_phone?: string | null
          plan?: string
          response_rate?: number | null
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
          completed_at: string | null
          contract_accepted_at: string | null
          conversation_id: string | null
          created_at: string
          deposit_pct: number
          drafted_by: string
          end_time: string | null
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
          completed_at?: string | null
          contract_accepted_at?: string | null
          conversation_id?: string | null
          created_at?: string
          deposit_pct?: number
          drafted_by?: string
          end_time?: string | null
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
          completed_at?: string | null
          contract_accepted_at?: string | null
          conversation_id?: string | null
          created_at?: string
          deposit_pct?: number
          drafted_by?: string
          end_time?: string | null
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
      payment_orders: {
        Row: {
          amount_minor: number
          artist_id: string
          created_at: string
          credits: number
          currency: string
          environment: string
          id: string
          kind: string
          package_id: string | null
          paid_at: string | null
          plan_code: string | null
          status: string
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
          id?: string
          kind: string
          package_id?: string | null
          paid_at?: string | null
          plan_code?: string | null
          status?: string
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
          id?: string
          kind?: string
          package_id?: string | null
          paid_at?: string | null
          plan_code?: string | null
          status?: string
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
          bank_details: string
          created_at: string
          decided_at: string | null
          id: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          artist_id: string
          bank_details: string
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          artist_id?: string
          bank_details?: string
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
      plan_tiers: {
        Row: {
          ai_credits: number
          code: string
          commission_pct: number
          features: Json
          max_photos: number
          max_videos: number
          name: string
          price_monthly: number
          price_yearly: number
          sort: number
          updated_at: string
        }
        Insert: {
          ai_credits?: number
          code: string
          commission_pct?: number
          features?: Json
          max_photos?: number
          max_videos?: number
          name: string
          price_monthly?: number
          price_yearly?: number
          sort?: number
          updated_at?: string
        }
        Update: {
          ai_credits?: number
          code?: string
          commission_pct?: number
          features?: Json
          max_photos?: number
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
      service_invoices: {
        Row: {
          artist_id: string
          booking_id: string | null
          conversation_id: string
          created_at: string
          document: Json
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
          document: Json
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
          document?: Json
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
      [_ in never]: never
    }
    Functions: {
      accept_artist_invites: { Args: never; Returns: number }
      apply_fonnte_approval: { Args: { _event: string }; Returns: string }
      apply_fonnte_revision: {
        Args: { _amount: number; _event: string; _note: string }
        Returns: Json
      }
      apply_fonnte_revision_change: {
        Args: { _changes: Json; _event: string }
        Returns: Json
      }
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
      claim_fonnte_revision: { Args: { _event: string }; Returns: Json }
      fonnte_phone: { Args: { _phone: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_artist_team: { Args: never; Returns: boolean }
      is_artist_owner: { Args: { _artist: string }; Returns: boolean }
      is_artist_team: { Args: { _artist: string }; Returns: boolean }
      next_invoice_no: { Args: never; Returns: string }
      refresh_top_performer: { Args: { _artist: string }; Returns: undefined }
      release_due_escrow: { Args: never; Returns: number }
      reserve_fonnte_revision_credit: {
        Args: { _event: string }
        Returns: boolean
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
