-- Run this in your Supabase SQL Editor to create the high_scores table

CREATE TABLE high_scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE high_scores ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read high scores
CREATE POLICY "Anyone can read high scores"
  ON high_scores FOR SELECT
  USING (true);

-- Allow anyone to insert high scores
CREATE POLICY "Anyone can insert high scores"
  ON high_scores FOR INSERT
  WITH CHECK (true);
