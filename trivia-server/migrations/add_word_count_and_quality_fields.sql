-- migrations/add_word_count_and_quality_fields.sql
-- Run this migration to prepare your database for local question storage

-- Add new columns to question_cache table
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 50;
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS player_rating DECIMAL(3,2);
ALTER TABLE question_cache ADD COLUMN IF NOT EXISTS last_reviewed TIMESTAMP;

-- Update word_count for existing questions
UPDATE question_cache 
SET word_count = array_length(string_to_array(question_text, ' '), 1)
WHERE word_count IS NULL;

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_word_count ON question_cache(word_count);
CREATE INDEX IF NOT EXISTS idx_quality_filter ON question_cache(is_active, word_count, difficulty, category);
CREATE INDEX IF NOT EXISTS idx_usage_tracking ON question_cache(times_used, last_used);
CREATE INDEX IF NOT EXISTS idx_quality_score ON question_cache(quality_score DESC);

-- Create a view for easy question selection
CREATE OR REPLACE VIEW active_short_questions AS
SELECT 
  id,
  question_text,
  correct_answer,
  incorrect_answers,
  category,
  difficulty,
  word_count,
  quality_score,
  times_used,
  player_rating
FROM question_cache
WHERE is_active = true
  AND word_count <= 15
ORDER BY quality_score DESC, times_used ASC;

-- Create a statistics view
CREATE OR REPLACE VIEW question_statistics AS
SELECT 
  difficulty,
  category,
  COUNT(*) as total_questions,
  COUNT(CASE WHEN word_count <= 15 THEN 1 END) as short_questions,
  COUNT(CASE WHEN word_count BETWEEN 16 AND 20 THEN 1 END) as medium_questions,
  COUNT(CASE WHEN word_count > 20 THEN 1 END) as long_questions,
  AVG(word_count) as avg_word_count,
  AVG(quality_score) as avg_quality_score,
  SUM(times_used) as total_uses
FROM question_cache
WHERE is_active = true
GROUP BY difficulty, category
ORDER BY difficulty, category;

-- Function to get balanced questions
CREATE OR REPLACE FUNCTION get_balanced_questions(
  p_count INTEGER,
  p_difficulty VARCHAR,
  p_category VARCHAR DEFAULT NULL,
  p_max_words INTEGER DEFAULT 15
)
RETURNS TABLE (
  id INTEGER,
  question_text TEXT,
  correct_answer VARCHAR,
  incorrect_answers JSONB,
  category VARCHAR,
  difficulty VARCHAR,
  word_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    qc.id,
    qc.question_text,
    qc.correct_answer,
    qc.incorrect_answers,
    qc.category,
    qc.difficulty,
    qc.word_count
  FROM question_cache qc
  WHERE qc.is_active = true
    AND qc.word_count <= p_max_words
    AND qc.difficulty = p_difficulty
    AND (p_category IS NULL OR qc.category = p_category)
  ORDER BY 
    qc.quality_score DESC,
    qc.times_used ASC,
    RANDOM()
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update quality score based on player ratings
CREATE OR REPLACE FUNCTION update_quality_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.player_rating IS NOT NULL THEN
    NEW.quality_score = GREATEST(
      0, 
      LEAST(
        100,
        NEW.quality_score + ((NEW.player_rating - 3) * 5)
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quality_score
BEFORE UPDATE OF player_rating ON question_cache
FOR EACH ROW
EXECUTE FUNCTION update_quality_score();
