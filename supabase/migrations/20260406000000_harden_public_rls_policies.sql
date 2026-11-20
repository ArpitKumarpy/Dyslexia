/*
  # Harden public RLS policies

  This migration removes the fully permissive policies that allowed any anon or
  authenticated client to read and write every row. After this migration:

  - only authenticated users can access `documents`
  - only authenticated users can access `user_preferences`
  - each user can only access rows where `user_id = auth.uid()`

  Anonymous visitors should use browser-local storage instead of the database.
*/

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read documents" ON documents;
DROP POLICY IF EXISTS "Anyone can insert documents" ON documents;
DROP POLICY IF EXISTS "Anyone can update documents" ON documents;
DROP POLICY IF EXISTS "Anyone can delete documents" ON documents;

DROP POLICY IF EXISTS "Anyone can read preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can insert preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can update preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can delete preferences" ON user_preferences;

CREATE POLICY "Authenticated users can read their own documents"
  ON documents FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can insert their own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can update their own documents"
  ON documents FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can delete their own documents"
  ON documents FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can read their own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can insert their own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can update their own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can delete their own preferences"
  ON user_preferences FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS documents_user_id_updated_at_idx
  ON documents (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx
  ON user_preferences (user_id);
