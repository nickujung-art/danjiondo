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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          id: string
          points: number
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points: number
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points?: number
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          advertiser_id: string | null
          advertiser_name: string
          budget_won: number | null
          created_at: string
          ends_at: string
          id: string
          image_url: string
          link_url: string
          placement: string
          starts_at: string
          status: Database["public"]["Enums"]["ad_status"]
          target_lat: number | null
          target_lng: number | null
          target_sgg_code: string | null
          title: string
          updated_at: string
        }
        Insert: {
          advertiser_id?: string | null
          advertiser_name: string
          budget_won?: number | null
          created_at?: string
          ends_at: string
          id?: string
          image_url: string
          link_url: string
          placement: string
          starts_at: string
          status?: Database["public"]["Enums"]["ad_status"]
          target_lat?: number | null
          target_lng?: number | null
          target_sgg_code?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          advertiser_id?: string | null
          advertiser_name?: string
          budget_won?: number | null
          created_at?: string
          ends_at?: string
          id?: string
          image_url?: string
          link_url?: string
          placement?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["ad_status"]
          target_lat?: number | null
          target_lng?: number | null
          target_sgg_code?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_events: {
        Row: {
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          is_anomaly: boolean
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          is_anomaly?: boolean
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          is_anomaly?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_estimates: {
        Row: {
          confidence: number | null
          created_at: string
          estimated_value: Json
          id: string
          method: Database["public"]["Enums"]["estimate_method"]
          reference_complex_ids: string[] | null
          status: Database["public"]["Enums"]["estimate_status"]
          target_complex_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          estimated_value: Json
          id?: string
          method: Database["public"]["Enums"]["estimate_method"]
          reference_complex_ids?: string[] | null
          status?: Database["public"]["Enums"]["estimate_status"]
          target_complex_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          estimated_value?: Json
          id?: string
          method?: Database["public"]["Enums"]["estimate_method"]
          reference_complex_ids?: string[] | null
          status?: Database["public"]["Enums"]["estimate_status"]
          target_complex_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_estimates_target_complex_id_fkey"
            columns: ["target_complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_hash: string | null
          payload: Json | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cafe_articles: {
        Row: {
          article_url: string
          cafe_name: string | null
          complex_id: string
          description: string | null
          fetched_at: string
          id: string
          naver_article_id: string
          published_at: string | null
          title: string
        }
        Insert: {
          article_url: string
          cafe_name?: string | null
          complex_id: string
          description?: string | null
          fetched_at?: string
          id?: string
          naver_article_id: string
          published_at?: string | null
          title: string
        }
        Update: {
          article_url?: string
          cafe_name?: string | null
          complex_id?: string
          description?: string | null
          fetched_at?: string
          id?: string
          naver_article_id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cafe_articles_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      cafe_join_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          week_start: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          week_start: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          week_start?: string
        }
        Relationships: []
      }
      cafe_posts: {
        Row: {
          cafe_name: string | null
          complex_id: string | null
          confidence: number | null
          excerpt: string | null
          id: string
          is_verified: boolean
          matched_at: string
          posted_at: string | null
          title: string
          url: string
        }
        Insert: {
          cafe_name?: string | null
          complex_id?: string | null
          confidence?: number | null
          excerpt?: string | null
          id?: string
          is_verified?: boolean
          matched_at?: string
          posted_at?: string | null
          title: string
          url: string
        }
        Update: {
          cafe_name?: string | null
          complex_id?: string | null
          confidence?: number | null
          excerpt?: string | null
          id?: string
          is_verified?: boolean
          matched_at?: string
          posted_at?: string | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cafe_posts_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          review_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          review_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          review_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "complex_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_aliases: {
        Row: {
          alias_name: string
          complex_id: string
          confidence: number | null
          created_at: string
          external_id: string | null
          id: string
          source: string
        }
        Insert: {
          alias_name: string
          complex_id: string
          confidence?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          source: string
        }
        Update: {
          alias_name?: string
          complex_id?: string
          confidence?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "complex_aliases_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_area_types: {
        Row: {
          complex_id: string
          created_at: string | null
          exclusive_area_m2: number
          exclusive_pyeong: number | null
          id: string
          naver_pyeong_no: number
          pyeong_name: string
          supply_area_m2: number | null
        }
        Insert: {
          complex_id: string
          created_at?: string | null
          exclusive_area_m2: number
          exclusive_pyeong?: number | null
          id?: string
          naver_pyeong_no: number
          pyeong_name: string
          supply_area_m2?: number | null
        }
        Update: {
          complex_id?: string
          created_at?: string | null
          exclusive_area_m2?: number
          exclusive_pyeong?: number | null
          id?: string
          naver_pyeong_no?: number
          pyeong_name?: string
          supply_area_m2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complex_area_types_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_embeddings: {
        Row: {
          chunk_type: string
          complex_id: string
          content: string
          embedding: string | null
          id: string
          updated_at: string
        }
        Insert: {
          chunk_type: string
          complex_id: string
          content: string
          embedding?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          chunk_type?: string
          complex_id?: string
          content?: string
          embedding?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complex_embeddings_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_gap_stats: {
        Row: {
          complex_id: string
          computed_at: string
          gap_amount: number
          gap_ratio: number
          id: string
          jeonse_count: number
          jeonse_ratio: number
          median_jeonse_price: number
          median_sale_price: number
          risk_level: string
          sale_count: number
          window_months: number
        }
        Insert: {
          complex_id: string
          computed_at?: string
          gap_amount: number
          gap_ratio: number
          id?: string
          jeonse_count: number
          jeonse_ratio: number
          median_jeonse_price: number
          median_sale_price: number
          risk_level: string
          sale_count: number
          window_months?: number
        }
        Update: {
          complex_id?: string
          computed_at?: string
          gap_amount?: number
          gap_ratio?: number
          id?: string
          jeonse_count?: number
          jeonse_ratio?: number
          median_jeonse_price?: number
          median_sale_price?: number
          risk_level?: string
          sale_count?: number
          window_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "complex_gap_stats_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: true
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_match_queue: {
        Row: {
          candidate_ids: string[] | null
          created_at: string
          id: string
          raw_payload: Json
          reason: Database["public"]["Enums"]["match_reason"]
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: Database["public"]["Enums"]["match_status"]
          tie_reason: string | null
          updated_at: string
        }
        Insert: {
          candidate_ids?: string[] | null
          created_at?: string
          id?: string
          raw_payload: Json
          reason: Database["public"]["Enums"]["match_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          status?: Database["public"]["Enums"]["match_status"]
          tie_reason?: string | null
          updated_at?: string
        }
        Update: {
          candidate_ids?: string[] | null
          created_at?: string
          id?: string
          raw_payload?: Json
          reason?: Database["public"]["Enums"]["match_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["match_status"]
          tie_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complex_match_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_price_predictions: {
        Row: {
          ai_cached_at: string | null
          ai_commentary: string | null
          area_bucket: string
          complex_id: string
          computed_at: string
          id: string
          model_name: string
          predicted_month: string
          predicted_price_lower: number | null
          predicted_price_mean: number
          predicted_price_upper: number | null
          training_count: number | null
          training_mape: number | null
        }
        Insert: {
          ai_cached_at?: string | null
          ai_commentary?: string | null
          area_bucket: string
          complex_id: string
          computed_at?: string
          id?: string
          model_name: string
          predicted_month: string
          predicted_price_lower?: number | null
          predicted_price_mean: number
          predicted_price_upper?: number | null
          training_count?: number | null
          training_mape?: number | null
        }
        Update: {
          ai_cached_at?: string | null
          ai_commentary?: string | null
          area_bucket?: string
          complex_id?: string
          computed_at?: string
          id?: string
          model_name?: string
          predicted_month?: string
          predicted_price_lower?: number | null
          predicted_price_mean?: number
          predicted_price_upper?: number | null
          training_count?: number | null
          training_mape?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complex_price_predictions_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_rankings: {
        Row: {
          complex_id: string
          computed_at: string
          id: string
          metadata: Json | null
          rank: number
          rank_type: string
          score: number
          window_days: number
        }
        Insert: {
          complex_id: string
          computed_at?: string
          id?: string
          metadata?: Json | null
          rank: number
          rank_type: string
          score: number
          window_days?: number
        }
        Update: {
          complex_id?: string
          computed_at?: string
          id?: string
          metadata?: Json | null
          rank?: number
          rank_type?: string
          score?: number
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "complex_rankings_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      complex_reviews: {
        Row: {
          complex_id: string
          content: string
          created_at: string
          gps_verified: boolean
          id: string
          rating: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          complex_id: string
          content: string
          created_at?: string
          gps_verified?: boolean
          id?: string
          rating: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          complex_id?: string
          content?: string
          created_at?: string
          gps_verified?: boolean
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complex_reviews_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complex_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complexes: {
        Row: {
          avg_sale_per_pyeong: number | null
          building_type: string
          built_year: number | null
          canonical_name: string
          created_at: string
          data_completeness: Json
          dong: string | null
          floors_above: number | null
          floors_below: number | null
          geocoding_accuracy: number | null
          gu: string | null
          hagwon_score: number | null
          heat_type: string | null
          household_count: number | null
          id: string
          is_new_record_30d: boolean
          jibun_address: string | null
          kapt_code: string | null
          lat: number | null
          lng: number | null
          location: unknown
          molit_complex_code: string | null
          name_normalized: string
          naver_complex_no: string | null
          predecessor_id: string | null
          price_change_30d: number | null
          road_address: string | null
          sgg_code: string
          si: string | null
          status: Database["public"]["Enums"]["complex_status"]
          successor_id: string | null
          tx_count_30d: number
          updated_at: string
          url_slug: string | null
          view_count: number
        }
        Insert: {
          avg_sale_per_pyeong?: number | null
          building_type?: string
          built_year?: number | null
          canonical_name: string
          created_at?: string
          data_completeness?: Json
          dong?: string | null
          floors_above?: number | null
          floors_below?: number | null
          geocoding_accuracy?: number | null
          gu?: string | null
          hagwon_score?: number | null
          heat_type?: string | null
          household_count?: number | null
          id?: string
          is_new_record_30d?: boolean
          jibun_address?: string | null
          kapt_code?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown
          molit_complex_code?: string | null
          name_normalized: string
          naver_complex_no?: string | null
          predecessor_id?: string | null
          price_change_30d?: number | null
          road_address?: string | null
          sgg_code: string
          si?: string | null
          status?: Database["public"]["Enums"]["complex_status"]
          successor_id?: string | null
          tx_count_30d?: number
          updated_at?: string
          url_slug?: string | null
          view_count?: number
        }
        Update: {
          avg_sale_per_pyeong?: number | null
          building_type?: string
          built_year?: number | null
          canonical_name?: string
          created_at?: string
          data_completeness?: Json
          dong?: string | null
          floors_above?: number | null
          floors_below?: number | null
          geocoding_accuracy?: number | null
          gu?: string | null
          hagwon_score?: number | null
          heat_type?: string | null
          household_count?: number | null
          id?: string
          is_new_record_30d?: boolean
          jibun_address?: string | null
          kapt_code?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown
          molit_complex_code?: string | null
          name_normalized?: string
          naver_complex_no?: string | null
          predecessor_id?: string | null
          price_change_30d?: number | null
          road_address?: string | null
          sgg_code?: string
          si?: string | null
          status?: Database["public"]["Enums"]["complex_status"]
          successor_id?: string | null
          tx_count_30d?: number
          updated_at?: string
          url_slug?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "complexes_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complexes_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          cadence: string
          consecutive_failures: number
          error_message: string | null
          expected_freshness_hours: number
          id: string
          last_status: string | null
          last_synced_at: string | null
          ui_label: string | null
        }
        Insert: {
          cadence: string
          consecutive_failures?: number
          error_message?: string | null
          expected_freshness_hours: number
          id: string
          last_status?: string | null
          last_synced_at?: string | null
          ui_label?: string | null
        }
        Update: {
          cadence?: string
          consecutive_failures?: number
          error_message?: string | null
          expected_freshness_hours?: number
          id?: string
          last_status?: string | null
          last_synced_at?: string | null
          ui_label?: string | null
        }
        Relationships: []
      }
      district_stats: {
        Row: {
          adm_cd: string
          adm_nm: string
          data_quarter: number
          data_year: number
          fetched_at: string
          gu: string
          households: number | null
          id: string
          pop_20s: number | null
          pop_30s: number | null
          pop_40s: number | null
          pop_50s: number | null
          pop_60plus: number | null
          pop_under20: number | null
          population: number | null
          population_change: number | null
          si: string
        }
        Insert: {
          adm_cd: string
          adm_nm: string
          data_quarter: number
          data_year: number
          fetched_at?: string
          gu: string
          households?: number | null
          id?: string
          pop_20s?: number | null
          pop_30s?: number | null
          pop_40s?: number | null
          pop_50s?: number | null
          pop_60plus?: number | null
          pop_under20?: number | null
          population?: number | null
          population_change?: number | null
          si: string
        }
        Update: {
          adm_cd?: string
          adm_nm?: string
          data_quarter?: number
          data_year?: number
          fetched_at?: string
          gu?: string
          households?: number | null
          id?: string
          pop_20s?: number | null
          pop_30s?: number | null
          pop_40s?: number | null
          pop_50s?: number | null
          pop_60plus?: number | null
          pop_under20?: number | null
          population?: number | null
          population_change?: number | null
          si?: string
        }
        Relationships: []
      }
      facility_kapt: {
        Row: {
          building_count: number | null
          complex_id: string
          created_at: string
          data_month: string | null
          elevator_count: number | null
          heat_type: string | null
          id: string
          kapt_code: string | null
          management_cost_m2: number | null
          management_type: string | null
          parking_count: number | null
          total_area: number | null
          updated_at: string
        }
        Insert: {
          building_count?: number | null
          complex_id: string
          created_at?: string
          data_month?: string | null
          elevator_count?: number | null
          heat_type?: string | null
          id?: string
          kapt_code?: string | null
          management_cost_m2?: number | null
          management_type?: string | null
          parking_count?: number | null
          total_area?: number | null
          updated_at?: string
        }
        Update: {
          building_count?: number | null
          complex_id?: string
          created_at?: string
          data_month?: string | null
          elevator_count?: number | null
          heat_type?: string | null
          id?: string
          kapt_code?: string | null
          management_cost_m2?: number | null
          management_type?: string | null
          parking_count?: number | null
          total_area?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_kapt_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_poi: {
        Row: {
          category: string
          complex_id: string
          created_at: string
          distance_m: number | null
          id: string
          lat: number | null
          lng: number | null
          poi_name: string
          sport_type: string | null
        }
        Insert: {
          category: string
          complex_id: string
          created_at?: string
          distance_m?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          poi_name: string
          sport_type?: string | null
        }
        Update: {
          category?: string
          complex_id?: string
          created_at?: string
          distance_m?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          poi_name?: string
          sport_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_poi_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_school: {
        Row: {
          advancement_foreign: number | null
          advancement_private: number | null
          advancement_rate: number | null
          advancement_science: number | null
          afterschool_count: number | null
          class_count: number | null
          complex_id: string
          created_at: string
          data_year: number | null
          distance_m: number | null
          establishment_type: string | null
          founded_date: string | null
          homepage_url: string | null
          id: string
          is_assignment: boolean
          meal_type: string | null
          phone: string | null
          road_address: string | null
          school_code: string | null
          school_name: string
          school_type: string
          special_class_count: number | null
          students_per_class: number | null
          teacher_count: number | null
          teachers_ratio: number | null
          total_students: number | null
          univ_2year_rate: number | null
          univ_4year_rate: number | null
          univ_rate: number | null
          updated_at: string
        }
        Insert: {
          advancement_foreign?: number | null
          advancement_private?: number | null
          advancement_rate?: number | null
          advancement_science?: number | null
          afterschool_count?: number | null
          class_count?: number | null
          complex_id: string
          created_at?: string
          data_year?: number | null
          distance_m?: number | null
          establishment_type?: string | null
          founded_date?: string | null
          homepage_url?: string | null
          id?: string
          is_assignment?: boolean
          meal_type?: string | null
          phone?: string | null
          road_address?: string | null
          school_code?: string | null
          school_name: string
          school_type: string
          special_class_count?: number | null
          students_per_class?: number | null
          teacher_count?: number | null
          teachers_ratio?: number | null
          total_students?: number | null
          univ_2year_rate?: number | null
          univ_4year_rate?: number | null
          univ_rate?: number | null
          updated_at?: string
        }
        Update: {
          advancement_foreign?: number | null
          advancement_private?: number | null
          advancement_rate?: number | null
          advancement_science?: number | null
          afterschool_count?: number | null
          class_count?: number | null
          complex_id?: string
          created_at?: string
          data_year?: number | null
          distance_m?: number | null
          establishment_type?: string | null
          founded_date?: string | null
          homepage_url?: string | null
          id?: string
          is_assignment?: boolean
          meal_type?: string | null
          phone?: string | null
          road_address?: string | null
          school_code?: string | null
          school_name?: string
          school_type?: string
          special_class_count?: number | null
          students_per_class?: number | null
          teacher_count?: number | null
          teachers_ratio?: number | null
          total_students?: number | null
          univ_2year_rate?: number | null
          univ_4year_rate?: number | null
          univ_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_school_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          alert_enabled: boolean
          complex_id: string
          created_at: string
          id: string
          price_alert_threshold: number | null
          user_id: string
        }
        Insert: {
          alert_enabled?: boolean
          complex_id: string
          created_at?: string
          id?: string
          price_alert_threshold?: number | null
          user_id: string
        }
        Update: {
          alert_enabled?: boolean
          complex_id?: string
          created_at?: string
          id?: string
          price_alert_threshold?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_verification_requests: {
        Row: {
          complex_id: string
          created_at: string
          doc_type: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          user_id: string
        }
        Insert: {
          complex_id: string
          created_at?: string
          doc_type: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          user_id: string
        }
        Update: {
          complex_id?: string
          created_at?: string
          doc_type?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_verification_requests_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_visits: {
        Row: {
          complex_id: string
          id: string
          lat: number | null
          lng: number | null
          user_id: string
          verified_at: string
        }
        Insert: {
          complex_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id: string
          verified_at?: string
        }
        Update: {
          complex_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_visits_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hagwon_db: {
        Row: {
          aca_asnum: string
          address: string | null
          address_detail: string | null
          admst_zone_nm: string | null
          age_groups: string[] | null
          capacity: number | null
          created_at: string
          established_at: string | null
          fee_amount: number | null
          fee_text: string | null
          fee_tier: string | null
          id: string
          instructor_count: number | null
          is_active: boolean
          le_crse_nm: string | null
          le_ord_nm: string | null
          location: unknown
          name: string
          naver_blog_count: number | null
          phone: string | null
          popularity_score: number | null
          realm_sc_nm: string | null
          subject_category: string | null
          teaching_style: string | null
          updated_at: string
          zipcode: string | null
        }
        Insert: {
          aca_asnum: string
          address?: string | null
          address_detail?: string | null
          admst_zone_nm?: string | null
          age_groups?: string[] | null
          capacity?: number | null
          created_at?: string
          established_at?: string | null
          fee_amount?: number | null
          fee_text?: string | null
          fee_tier?: string | null
          id?: string
          instructor_count?: number | null
          is_active?: boolean
          le_crse_nm?: string | null
          le_ord_nm?: string | null
          location?: unknown
          name: string
          naver_blog_count?: number | null
          phone?: string | null
          popularity_score?: number | null
          realm_sc_nm?: string | null
          subject_category?: string | null
          teaching_style?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Update: {
          aca_asnum?: string
          address?: string | null
          address_detail?: string | null
          admst_zone_nm?: string | null
          age_groups?: string[] | null
          capacity?: number | null
          created_at?: string
          established_at?: string | null
          fee_amount?: number | null
          fee_text?: string | null
          fee_tier?: string | null
          id?: string
          instructor_count?: number | null
          is_active?: boolean
          le_crse_nm?: string | null
          le_ord_nm?: string | null
          location?: unknown
          name?: string
          naver_blog_count?: number | null
          phone?: string | null
          popularity_score?: number | null
          realm_sc_nm?: string | null
          subject_category?: string | null
          teaching_style?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Relationships: []
      }
      ingest_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          page: number | null
          rows_fetched: number
          rows_upserted: number
          sgg_code: string | null
          source_id: string
          started_at: string
          status: string
          year_month: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          page?: number | null
          rows_fetched?: number
          rows_upserted?: number
          sgg_code?: string | null
          source_id: string
          started_at?: string
          status?: string
          year_month?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          page?: number | null
          rows_fetched?: number
          rows_upserted?: number
          sgg_code?: string | null
          source_id?: string
          started_at?: string
          status?: string
          year_month?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingest_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      kakao_channel_subscriptions: {
        Row: {
          id: string
          is_active: boolean
          phone_number: string
          subscribed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          phone_number: string
          subscribed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          phone_number?: string
          subscribed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakao_channel_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_prices: {
        Row: {
          complex_id: string
          created_at: string
          created_by: string | null
          id: string
          price_per_py: number
          recorded_date: string
          source: string
        }
        Insert: {
          complex_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          price_per_py: number
          recorded_date: string
          source?: string
        }
        Update: {
          complex_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          price_per_py?: number
          recorded_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_prices_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      management_cost_monthly: {
        Row: {
          cleaning_cost: number | null
          common_cost_total: number | null
          complex_id: string
          consignment_fee: number | null
          created_at: string
          disinfection_cost: number | null
          electricity_cost: number | null
          elevator_cost: number | null
          gas_cost: number | null
          guard_cost: number | null
          heating_cost: number | null
          hot_water_cost: number | null
          id: string
          individual_cost_total: number | null
          kapt_code: string
          labor_cost: number | null
          long_term_repair_monthly: number | null
          long_term_repair_total: number | null
          network_cost: number | null
          repair_cost: number | null
          vehicle_cost: number | null
          water_cost: number | null
          year_month: string
        }
        Insert: {
          cleaning_cost?: number | null
          common_cost_total?: number | null
          complex_id: string
          consignment_fee?: number | null
          created_at?: string
          disinfection_cost?: number | null
          electricity_cost?: number | null
          elevator_cost?: number | null
          gas_cost?: number | null
          guard_cost?: number | null
          heating_cost?: number | null
          hot_water_cost?: number | null
          id?: string
          individual_cost_total?: number | null
          kapt_code: string
          labor_cost?: number | null
          long_term_repair_monthly?: number | null
          long_term_repair_total?: number | null
          network_cost?: number | null
          repair_cost?: number | null
          vehicle_cost?: number | null
          water_cost?: number | null
          year_month: string
        }
        Update: {
          cleaning_cost?: number | null
          common_cost_total?: number | null
          complex_id?: string
          consignment_fee?: number | null
          created_at?: string
          disinfection_cost?: number | null
          electricity_cost?: number | null
          elevator_cost?: number | null
          gas_cost?: number | null
          guard_cost?: number | null
          heating_cost?: number | null
          hot_water_cost?: number | null
          id?: string
          individual_cost_total?: number | null
          kapt_code?: string
          labor_cost?: number | null
          long_term_repair_monthly?: number | null
          long_term_repair_total?: number | null
          network_cost?: number | null
          repair_cost?: number | null
          vehicle_cost?: number | null
          water_cost?: number | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_cost_monthly_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      new_listings: {
        Row: {
          competition_rate: number | null
          complex_id: string | null
          created_at: string
          fetched_at: string
          hssply_adres: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          move_in_date: string | null
          mvn_prearnge_ym: string | null
          name: string
          pblanc_nm: string | null
          pblanc_no: string | null
          price_max: number | null
          price_min: number | null
          przwner_presnatn_de: string | null
          rcept_bgnde: string | null
          rcept_endde: string | null
          region: string
          sgg_code: string | null
          source_code: string | null
          supply_count: number | null
          supply_region: string | null
          total_units: number | null
        }
        Insert: {
          competition_rate?: number | null
          complex_id?: string | null
          created_at?: string
          fetched_at?: string
          hssply_adres?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          move_in_date?: string | null
          mvn_prearnge_ym?: string | null
          name: string
          pblanc_nm?: string | null
          pblanc_no?: string | null
          price_max?: number | null
          price_min?: number | null
          przwner_presnatn_de?: string | null
          rcept_bgnde?: string | null
          rcept_endde?: string | null
          region: string
          sgg_code?: string | null
          source_code?: string | null
          supply_count?: number | null
          supply_region?: string | null
          total_units?: number | null
        }
        Update: {
          competition_rate?: number | null
          complex_id?: string | null
          created_at?: string
          fetched_at?: string
          hssply_adres?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          move_in_date?: string | null
          mvn_prearnge_ym?: string | null
          name?: string
          pblanc_nm?: string | null
          pblanc_no?: string | null
          price_max?: number | null
          price_min?: number | null
          przwner_presnatn_de?: string | null
          rcept_bgnde?: string | null
          rcept_endde?: string | null
          region?: string
          sgg_code?: string | null
          source_code?: string | null
          supply_count?: number | null
          supply_region?: string | null
          total_units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "new_listings_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_topics: {
        Row: {
          created_at: string
          id: string
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          dedupe_key: string | null
          delivered_at: string | null
          event_type: string
          id: string
          is_read: boolean
          status: string
          target_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          delivered_at?: string | null
          event_type: string
          id?: string
          is_read?: boolean
          status?: string
          target_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          delivered_at?: string | null
          event_type?: string
          id?: string
          is_read?: boolean
          status?: string
          target_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      presale_discoveries: {
        Row: {
          admin_notes: string | null
          arch_hub_data: Json | null
          arch_hub_id: string | null
          arch_hub_matched_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          discovered_at: string
          hssply_adres: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          new_listing_id: string | null
          region: string
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          arch_hub_data?: Json | null
          arch_hub_id?: string | null
          arch_hub_matched_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discovered_at?: string
          hssply_adres?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          new_listing_id?: string | null
          region: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          arch_hub_data?: Json | null
          arch_hub_id?: string | null
          arch_hub_matched_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discovered_at?: string
          hssply_adres?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          new_listing_id?: string | null
          region?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presale_discoveries_new_listing_id_fkey"
            columns: ["new_listing_id"]
            isOneToOne: false
            referencedRelation: "new_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      presale_enriched: {
        Row: {
          address: string | null
          builder: string | null
          community: Json | null
          contractor: string | null
          crawled_at: string | null
          created_at: string
          id: string
          is_active: boolean
          move_in_date: string | null
          name: string
          sale_status: string
          sgg_code: string | null
          source_type: string
          source_url: string | null
          summary: Json | null
          total_units: number | null
          unit_types: Json | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          builder?: string | null
          community?: Json | null
          contractor?: string | null
          crawled_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          move_in_date?: string | null
          name: string
          sale_status?: string
          sgg_code?: string | null
          source_type?: string
          source_url?: string | null
          summary?: Json | null
          total_units?: number | null
          unit_types?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          builder?: string | null
          community?: Json | null
          contractor?: string | null
          crawled_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          move_in_date?: string | null
          name?: string
          sale_status?: string
          sgg_code?: string | null
          source_type?: string
          source_url?: string | null
          summary?: Json | null
          total_units?: number | null
          unit_types?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      presale_transactions: {
        Row: {
          area: number | null
          cancel_date: string | null
          created_at: string
          deal_date: string
          floor: number | null
          id: string
          listing_id: string
          price: number
          superseded_by: string | null
        }
        Insert: {
          area?: number | null
          cancel_date?: string | null
          created_at?: string
          deal_date: string
          floor?: number | null
          id?: string
          listing_id: string
          price: number
          superseded_by?: string | null
        }
        Update: {
          area?: number | null
          cancel_date?: string | null
          created_at?: string
          deal_date?: string
          floor?: number | null
          id?: string
          listing_id?: string
          price?: number
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presale_transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "new_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presale_transactions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "presale_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity_points: number
          avatar_url: string | null
          cafe_nickname: string | null
          created_at: string
          deleted_at: string | null
          gps_badge_level: number
          id: string
          member_tier: string
          nickname: string | null
          role: string
          signup_source: string | null
          suspended_at: string | null
          terms_agreed_at: string | null
          updated_at: string
        }
        Insert: {
          activity_points?: number
          avatar_url?: string | null
          cafe_nickname?: string | null
          created_at?: string
          deleted_at?: string | null
          gps_badge_level?: number
          id: string
          member_tier?: string
          nickname?: string | null
          role?: string
          signup_source?: string | null
          suspended_at?: string | null
          terms_agreed_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_points?: number
          avatar_url?: string | null
          cafe_nickname?: string | null
          created_at?: string
          deleted_at?: string | null
          gps_badge_level?: number
          id?: string
          member_tier?: string
          nickname?: string | null
          role?: string
          signup_source?: string | null
          suspended_at?: string | null
          terms_agreed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      realtor_assignments: {
        Row: {
          complex_id: string
          created_at: string
          display_order: number
          id: string
          realtor_id: string
        }
        Insert: {
          complex_id: string
          created_at?: string
          display_order?: number
          id?: string
          realtor_id: string
        }
        Update: {
          complex_id?: string
          created_at?: string
          display_order?: number
          id?: string
          realtor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "realtor_assignments_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realtor_assignments_realtor_id_fkey"
            columns: ["realtor_id"]
            isOneToOne: false
            referencedRelation: "realtors"
            referencedColumns: ["id"]
          },
        ]
      }
      realtors: {
        Row: {
          agency_name: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          license_no: string | null
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          agency_name: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          license_no?: string | null
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          agency_name?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          license_no?: string | null
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      redevelopment_projects: {
        Row: {
          complex_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          phase: Database["public"]["Enums"]["redevelopment_phase"]
          project_name: string
          updated_at: string
        }
        Insert: {
          complex_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          phase?: Database["public"]["Enums"]["redevelopment_phase"]
          project_name: string
          updated_at?: string
        }
        Update: {
          complex_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          phase?: Database["public"]["Enums"]["redevelopment_phase"]
          project_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "redevelopment_projects_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redevelopment_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      region_population_cache: {
        Row: {
          fetched_at: string
          population: number
          sgg_code: string
          sgg_name: string
          year: number
        }
        Insert: {
          fetched_at?: string
          population: number
          sgg_code: string
          sgg_name: string
          year: number
        }
        Update: {
          fetched_at?: string
          population?: number
          sgg_code?: string
          sgg_name?: string
          year?: number
        }
        Relationships: []
      }
      regional_income: {
        Row: {
          avg_income: number
          created_at: string | null
          id: string
          region_code: string
          source: string
          year: number
        }
        Insert: {
          avg_income: number
          created_at?: string | null
          id?: string
          region_code: string
          source?: string
          year: number
        }
        Update: {
          avg_income?: number
          created_at?: string | null
          id?: string
          region_code?: string
          source?: string
          year?: number
        }
        Relationships: []
      }
      regional_population: {
        Row: {
          fetched_at: string
          households: number | null
          id: string
          population: number
          sgg_code: string
          year_month: string
        }
        Insert: {
          fetched_at?: string
          households?: number | null
          id?: string
          population: number
          sgg_code: string
          year_month: string
        }
        Update: {
          fetched_at?: string
          households?: number | null
          id?: string
          population?: number
          sgg_code?: string
          year_month?: string
        }
        Relationships: []
      }
      regional_unsold: {
        Row: {
          fetched_at: string
          id: string
          sgg_code: string
          unsold_count: number
          year_month: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          sgg_code: string
          unsold_count?: number
          year_month: string
        }
        Update: {
          fetched_at?: string
          id?: string
          sgg_code?: string
          unsold_count?: number
          year_month?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          created_at: string
          gu: string | null
          is_active: boolean
          sgg_code: string
          sgg_name: string
          si: string
        }
        Insert: {
          created_at?: string
          gu?: string | null
          is_active?: boolean
          sgg_code: string
          sgg_name: string
          si: string
        }
        Update: {
          created_at?: string
          gu?: string | null
          is_active?: boolean
          sgg_code?: string
          sgg_name?: string
          si?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_district_schools: {
        Row: {
          district_id: string
          school_level: string
          school_name: string
        }
        Insert: {
          district_id: string
          school_level: string
          school_name: string
        }
        Update: {
          district_id?: string
          school_level?: string
          school_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_district_schools_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "school_districts"
            referencedColumns: ["id"]
          },
        ]
      }
      school_districts: {
        Row: {
          created_at: string
          geometry: unknown
          hakgudo_id: string
          id: string
          school_level: string
          source_file: string | null
        }
        Insert: {
          created_at?: string
          geometry: unknown
          hakgudo_id: string
          id?: string
          school_level: string
          source_file?: string | null
        }
        Update: {
          created_at?: string
          geometry?: unknown
          hakgudo_id?: string
          id?: string
          school_level?: string
          source_file?: string | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          area_m2: number
          area_type_id: string | null
          building_name: string | null
          cancel_date: string | null
          complex_id: string | null
          created_at: string
          deal_date: string
          deal_subtype: Database["public"]["Enums"]["deal_subtype"] | null
          deal_type: Database["public"]["Enums"]["deal_type"]
          dedupe_key: string
          floor: number | null
          id: number
          jibun: string | null
          monthly_rent: number | null
          price: number | null
          raw_complex_name: string | null
          raw_region_code: string | null
          sgg_code: string
          source_run_id: string | null
          superseded_by: number | null
          umd_nm: string | null
          updated_at: string
        }
        Insert: {
          area_m2: number
          area_type_id?: string | null
          building_name?: string | null
          cancel_date?: string | null
          complex_id?: string | null
          created_at?: string
          deal_date: string
          deal_subtype?: Database["public"]["Enums"]["deal_subtype"] | null
          deal_type: Database["public"]["Enums"]["deal_type"]
          dedupe_key: string
          floor?: number | null
          id?: number
          jibun?: string | null
          monthly_rent?: number | null
          price?: number | null
          raw_complex_name?: string | null
          raw_region_code?: string | null
          sgg_code: string
          source_run_id?: string | null
          superseded_by?: number | null
          umd_nm?: string | null
          updated_at?: string
        }
        Update: {
          area_m2?: number
          area_type_id?: string | null
          building_name?: string | null
          cancel_date?: string | null
          complex_id?: string | null
          created_at?: string
          deal_date?: string
          deal_subtype?: Database["public"]["Enums"]["deal_subtype"] | null
          deal_type?: Database["public"]["Enums"]["deal_type"]
          dedupe_key?: string
          floor?: number | null
          id?: number
          jibun?: string | null
          monthly_rent?: number | null
          price?: number | null
          raw_complex_name?: string | null
          raw_region_code?: string | null
          sgg_code?: string
          source_run_id?: string | null
          superseded_by?: number | null
          umd_nm?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_area_type_id_fkey"
            columns: ["area_type_id"]
            isOneToOne: false
            referencedRelation: "complex_area_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_child_profiles: {
        Row: {
          age_group: string
          created_at: string
          fee_tier_pref: string | null
          id: string
          nickname: string
          subject_prefs: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          age_group: string
          created_at?: string
          fee_tier_pref?: string | null
          id?: string
          nickname?: string
          subject_prefs?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          age_group?: string
          created_at?: string
          fee_tier_pref?: string | null
          id?: string
          nickname?: string
          subject_prefs?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_activity_points: {
        Args: { p_points: number; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      award_daily_login_points: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_gps_proximity: {
        Args: {
          p_complex_id: string
          p_distance_m?: number
          p_lat: number
          p_lng: number
        }
        Returns: boolean
      }
      complex_monthly_prices: {
        Args: { p_complex_id: string; p_deal_type: string; p_months?: number }
        Returns: {
          avg_area: number
          avg_price: number
          count: number
          year_month: string
        }[]
      }
      complex_transactions_for_chart: {
        Args: {
          p_area_m2?: number
          p_complex_id: string
          p_deal_type: string
          p_months?: number
        }
        Returns: {
          area_m2: number
          area_type_id: string
          deal_date: string
          price: number
          pyeong_name: string
          year_month: string
        }[]
      }
      compute_gap_stats: {
        Args: { p_window_months?: number }
        Returns: {
          complex_id: string
          gap_amount: number
          gap_ratio: number
          jeonse_count: number
          jeonse_ratio: number
          median_jeonse_price: number
          median_sale_price: number
          sale_count: number
        }[]
      }
      compute_predictions: {
        Args: { p_area_bucket: string; p_complex_id: string; p_months?: number }
        Returns: {
          avg_price: number
          tx_count: number
          year_month: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_complex_commentary_batch_inputs: {
        Args: {
          p_area_bucket?: string
          p_limit?: number
          p_offset?: number
          p_stale_days?: number
        }
        Returns: {
          area_bucket: string
          avg_mape: number
          avg_sale_per_pyeong: number
          built_year: number
          change_pct: number
          complex_id: string
          complex_name: string
          far_price: number
          gap_amount: number
          gap_risk_level: string
          gu: string
          hagwon_score: number
          household_count: number
          jeonse_ratio: number
          management_cost_m2: number
          model_name: string
          near_price: number
          price_change_30d: number
          primary_school_name: string
          si: string
          students_per_class: number
          training_count: number
          tx_count_30d: number
        }[]
      }
      get_hagwon_grade: { Args: { p_complex_id: string }; Returns: string }
      get_quadrant_data: {
        Args: { p_gu: string; p_si: string }
        Returns: {
          avg_jeonse_pp: number
          avg_sale_pp: number
          complex_id: string
          complex_name: string
        }[]
      }
      get_recent_complex_sales: {
        Args: { p_complex_ids: string[]; p_since?: string }
        Returns: {
          area_m2: number
          complex_id: string
          deal_date: string
          price: number
        }[]
      }
      get_schools_for_point: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          school_level: string
          school_name: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      hagwon_score_percentile: {
        Args: { target_score: number }
        Returns: number
      }
      hagwon_score_percentile_by_si: {
        Args: { p_si: string; target_score: number }
        Returns: number
      }
      increment_view_count: {
        Args: { p_complex_id: string }
        Returns: undefined
      }
      invest_prediction_ranking: {
        Args: {
          p_area_bucket?: string
          p_limit?: number
          p_max_mape?: number
          p_sgg_code?: string
        }
        Returns: {
          ai_commentary: string
          area_bucket: string
          avg_mape: number
          change_pct: number
          complex_id: string
          complex_name: string
          far_price: number
          gu: string
          near_price: number
          sgg_code: string
          si: string
          status: string
          url_slug: string
        }[]
      }
      invest_price_history: {
        Args: {
          p_area_bucket?: string
          p_complex_id: string
          p_deal_type?: string
          p_months?: number
        }
        Returns: {
          avg_price: number
          tx_count: number
          year_month: string
        }[]
      }
      invest_regional_jeonse_ratio: {
        Args: { p_area_bucket?: string; p_months?: number; p_sgg_code?: string }
        Returns: {
          jeonse_ratio: number
          rent_avg: number
          rent_count: number
          sale_avg: number
          sale_count: number
          year_month: string
        }[]
      }
      invest_regional_prediction_summary: {
        Args: { p_area_bucket?: string }
        Returns: {
          avg_far_price: number
          avg_near_price: number
          complex_count: number
          median_change_pct: number
          sgg_code: string
        }[]
      }
      invest_regional_prediction_timeseries: {
        Args: {
          p_area_bucket?: string
          p_max_mape?: number
          p_sgg_code: string
        }
        Returns: {
          complex_count: number
          lower_price: number
          median_price: number
          predicted_month: string
          upper_price: number
        }[]
      }
      invest_regional_price_history: {
        Args: { p_area_bucket?: string; p_months?: number; p_sgg_code?: string }
        Returns: {
          avg_price: number
          tx_count: number
          year_month: string
        }[]
      }
      link_transactions_batch: {
        Args: { p_limit?: number }
        Returns: {
          linked: number
          low_confidence: number
          no_match: number
          processed: number
        }[]
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      match_complex_by_admin: {
        Args: {
          p_min_similarity?: number
          p_name_normalized: string
          p_sgg_code: string
          p_umd_nm?: string
        }
        Returns: {
          canonical_name: string
          id: string
          trgm_sim: number
        }[]
      }
      match_complex_by_coord: {
        Args: {
          p_lat: number
          p_lng: number
          p_max_dist_m?: number
          p_min_similarity?: number
          p_name_normalized: string
        }
        Returns: {
          canonical_name: string
          distance_m: number
          id: string
          trgm_sim: number
        }[]
      }
      name_normalize_sql: { Args: { raw: string }; Returns: string }
      nearby_complex_price_compare: {
        Args: {
          p_complex_id: string
          p_limit?: number
          p_months?: number
          p_radius_m?: number
        }
        Returns: {
          avg_price_per_py: number
          built_year: number
          complex_id: string
          complex_name: string
          distance_m: number
          tx_count: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recommend_hagwons: {
        Args: {
          p_age_group?: string
          p_fee_tier?: string
          p_lat: number
          p_limit?: number
          p_lng: number
          p_subjects?: string[]
        }
        Returns: {
          address: string
          age_groups: string[]
          distance_m: number
          fee_tier: string
          id: string
          le_crse_nm: string
          name: string
          popularity_score: number
          realm_sc_nm: string
          score: number
          subject_category: string
        }[]
      }
      refresh_complex_price_stats: { Args: never; Returns: undefined }
      school_district_avg_price: {
        Args: { p_months?: number; p_school_name: string }
        Returns: {
          complex_count: number
          district_avg_py: number
          school_name: string
          si: string
          si_avg_py: number
        }[]
      }
      school_quality_percentile_by_si: {
        Args: { p_metric: string; p_si: string; p_target_value: number }
        Returns: number
      }
      school_ranking: {
        Args: { p_metric: string; p_school_type: string; p_si: string }
        Returns: {
          gu: string
          metric_value: number
          rank: number
          school_name: string
        }[]
      }
      search_complexes: {
        Args: { p_limit?: number; p_query: string; p_sgg_codes: string[] }
        Returns: {
          canonical_name: string
          dong: string
          gu: string
          id: string
          lat: number
          lng: number
          road_address: string
          sgg_code: string
          si: string
          similarity: number
          status: string
          url_slug: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      ad_status:
        | "draft"
        | "pending"
        | "approved"
        | "ended"
        | "rejected"
        | "paused"
      complex_status:
        | "pre_sale"
        | "under_construction"
        | "recently_built"
        | "active"
        | "in_redevelopment"
        | "demolished"
        | "merged"
        | "rental"
        | "inactive"
      deal_subtype: "sale" | "occupancy_right" | "pre_sale_right"
      deal_type: "sale" | "jeonse" | "monthly"
      estimate_method: "nearest_neighbors" | "similar_complex" | "regression"
      estimate_status: "active" | "superseded" | "rejected"
      match_reason: "low_confidence" | "conflict" | "no_match"
      match_status: "pending" | "resolved" | "rejected"
      redevelopment_phase:
        | "rumor"
        | "proposed"
        | "committee_formed"
        | "safety_eval"
        | "designated"
        | "business_approval"
        | "construction_permit"
        | "construction"
        | "completed"
        | "cancelled"
      report_status: "pending" | "accepted" | "rejected"
      report_target_type: "review" | "user" | "ad" | "comment"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ad_status: [
        "draft",
        "pending",
        "approved",
        "ended",
        "rejected",
        "paused",
      ],
      complex_status: [
        "pre_sale",
        "under_construction",
        "recently_built",
        "active",
        "in_redevelopment",
        "demolished",
        "merged",
        "rental",
        "inactive",
      ],
      deal_subtype: ["sale", "occupancy_right", "pre_sale_right"],
      deal_type: ["sale", "jeonse", "monthly"],
      estimate_method: ["nearest_neighbors", "similar_complex", "regression"],
      estimate_status: ["active", "superseded", "rejected"],
      match_reason: ["low_confidence", "conflict", "no_match"],
      match_status: ["pending", "resolved", "rejected"],
      redevelopment_phase: [
        "rumor",
        "proposed",
        "committee_formed",
        "safety_eval",
        "designated",
        "business_approval",
        "construction_permit",
        "construction",
        "completed",
        "cancelled",
      ],
      report_status: ["pending", "accepted", "rejected"],
      report_target_type: ["review", "user", "ad", "comment"],
    },
  },
} as const
