// Placeholder. Regenerate with:
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
// The real file describes every table, view, enum, and function in the project.
// Until then we expose a permissive shape so the supabase clients still type-check.

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      }
    >;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
};
