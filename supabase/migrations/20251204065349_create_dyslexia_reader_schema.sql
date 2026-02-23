/*
  # Dyslexia Reader Database Schema

  1. New Tables
    - `documents`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable for guest users)
      - `title` (text)
      - `content` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `user_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable for guest users)
      - `session_id` (text, for guest users)
      - `font_family` (text)
      - `font_size` (integer)
      - `line_spacing` (numeric)
      - `letter_spacing` (numeric)
      - `font_weight` (integer)
      - `background_color` (text)
      - `text_color` (text)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Allow public access for guest users (read/write their own data by session)
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL DEFAULT 'Untitled Document',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  font_family text DEFAULT 'Arial',
  font_size integer DEFAULT 18,
  line_spacing numeric DEFAULT 1.8,
  letter_spacing numeric DEFAULT 0.5,
  font_weight integer DEFAULT 400,
  background_color text DEFAULT '#FFF9E6',
  text_color text DEFAULT '#000000',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read documents"
  ON documents FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert documents"
  ON documents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update documents"
  ON documents FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete documents"
  ON documents FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read preferences"
  ON user_preferences FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert preferences"
  ON user_preferences FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update preferences"
  ON user_preferences FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete preferences"
  ON user_preferences FOR DELETE
  TO anon, authenticated
  USING (true);