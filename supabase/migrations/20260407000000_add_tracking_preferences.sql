/*
  # Add tracking preference columns

  Persists user-tunable webcam guidance settings so head and iris sensitivity
  can be customized per user and restored across sessions.
*/

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS head_tracking_sensitivity numeric DEFAULT 1.35,
  ADD COLUMN IF NOT EXISTS iris_tracking_sensitivity numeric DEFAULT 0.16,
  ADD COLUMN IF NOT EXISTS tracking_steadiness integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS tracking_neutral_line_height numeric DEFAULT 0.34;
