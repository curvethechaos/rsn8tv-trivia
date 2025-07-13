-- Migration: 009_enhance_leaderboard_system.sql
-- Purpose: Add period calculation functions and automatic leaderboard updates

-- 1. Add missing columns to scores table if they don't exist
ALTER TABLE scores ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at);
CREATE INDEX IF NOT EXISTS idx_scores_player_profile_id ON scores(player_profile_id);
CREATE INDEX IF NOT EXISTS idx_scores_session_id ON scores(session_id);
CREATE INDEX IF NOT EXISTS idx_scores_device_fingerprint ON scores(device_fingerprint);

-- Leaderboard indexes
CREATE INDEX IF NOT EXISTS idx_leaderboards_period_dates ON leaderboards(period_type, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_leaderboards_player_period ON leaderboards(player_profile_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_leaderboards_rank ON leaderboards(period_type, period_start, rank_position);

-- 3. Period calculation functions
CREATE OR REPLACE FUNCTION get_period_start(p_date DATE, p_period_type VARCHAR)
RETURNS DATE AS $$
BEGIN
    CASE p_period_type
        WHEN 'weekly' THEN
            -- Week starts on Monday
            RETURN p_date - ((EXTRACT(DOW FROM p_date) + 6) % 7)::INTEGER;
        WHEN 'monthly' THEN
            -- Month starts on the 1st
            RETURN DATE_TRUNC('month', p_date)::DATE;
        WHEN 'quarterly' THEN
            -- Quarter starts on Jan 1, Apr 1, Jul 1, Oct 1
            RETURN DATE_TRUNC('quarter', p_date)::DATE;
        WHEN 'yearly' THEN
            -- Year starts on Jan 1
            RETURN DATE_TRUNC('year', p_date)::DATE;
        ELSE
            RAISE EXCEPTION 'Invalid period type: %', p_period_type;
    END CASE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_period_end(p_date DATE, p_period_type VARCHAR)
RETURNS DATE AS $$
DECLARE
    v_start DATE;
BEGIN
    v_start := get_period_start(p_date, p_period_type);
    
    CASE p_period_type
        WHEN 'weekly' THEN
            -- Week ends on Sunday (6 days after Monday)
            RETURN v_start + INTERVAL '6 days';
        WHEN 'monthly' THEN
            -- Last day of the month
            RETURN (DATE_TRUNC('month', v_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        WHEN 'quarterly' THEN
            -- Last day of the quarter
            RETURN (DATE_TRUNC('quarter', v_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
        WHEN 'yearly' THEN
            -- December 31st
            RETURN (DATE_TRUNC('year', v_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
        ELSE
            RAISE EXCEPTION 'Invalid period type: %', p_period_type;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to update leaderboards after a score is submitted
CREATE OR REPLACE FUNCTION update_player_leaderboards(p_player_profile_id INTEGER, p_score INTEGER, p_submitted_at TIMESTAMP)
RETURNS VOID AS $$
DECLARE
    v_period_types VARCHAR[] := ARRAY['weekly', 'monthly', 'quarterly', 'yearly'];
    v_period_type VARCHAR;
    v_period_start DATE;
    v_period_end DATE;
    v_existing_score INTEGER;
    v_games_played INTEGER;
BEGIN
    -- Loop through each period type
    FOREACH v_period_type IN ARRAY v_period_types LOOP
        -- Calculate period boundaries
        v_period_start := get_period_start(p_submitted_at::DATE, v_period_type);
        v_period_end := get_period_end(p_submitted_at::DATE, v_period_type);
        
        -- Check if player already has an entry for this period
        SELECT total_score, games_played 
        INTO v_existing_score, v_games_played
        FROM leaderboards
        WHERE player_profile_id = p_player_profile_id
          AND period_type = v_period_type
          AND period_start = v_period_start;
        
        IF FOUND THEN
            -- Update existing entry
            UPDATE leaderboards
            SET total_score = v_existing_score + p_score,
                games_played = v_games_played + 1,
                average_score = (v_existing_score + p_score) / (v_games_played + 1)
            WHERE player_profile_id = p_player_profile_id
              AND period_type = v_period_type
              AND period_start = v_period_start;
        ELSE
            -- Insert new entry
            INSERT INTO leaderboards (
                player_profile_id,
                period_type,
                period_start,
                period_end,
                total_score,
                games_played,
                average_score,
                rank_position
            ) VALUES (
                p_player_profile_id,
                v_period_type,
                v_period_start,
                v_period_end,
                p_score,
                1,
                p_score,
                0 -- Will be updated by update_leaderboard_ranks
            );
        END IF;
    END LOOP;
    
    -- Update rankings for all affected periods
    PERFORM update_leaderboard_ranks(v_period_types, p_submitted_at::DATE);
END;
$$ LANGUAGE plpgsql;

-- 5. Function to update rankings within each period
CREATE OR REPLACE FUNCTION update_leaderboard_ranks(p_period_types VARCHAR[], p_date DATE)
RETURNS VOID AS $$
DECLARE
    v_period_type VARCHAR;
    v_period_start DATE;
BEGIN
    FOREACH v_period_type IN ARRAY p_period_types LOOP
        v_period_start := get_period_start(p_date, v_period_type);
        
        -- Update ranks using window function
        WITH ranked_scores AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (
                    ORDER BY total_score DESC, games_played DESC, player_profile_id
                ) as new_rank
            FROM leaderboards
            WHERE period_type = v_period_type
              AND period_start = v_period_start
        )
        UPDATE leaderboards l
        SET rank_position = rs.new_rank
        FROM ranked_scores rs
        WHERE l.id = rs.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to automatically update leaderboards when a score is inserted
CREATE OR REPLACE FUNCTION trigger_update_leaderboards()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if player has a profile (registered player)
    IF NEW.player_profile_id IS NOT NULL THEN
        PERFORM update_player_leaderboards(
            NEW.player_profile_id,
            NEW.score,
            COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS update_leaderboards_on_score ON scores;
CREATE TRIGGER update_leaderboards_on_score
    AFTER INSERT ON scores
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_leaderboards();

-- 7. Function to get current leaderboard for a specific period
CREATE OR REPLACE FUNCTION get_leaderboard(p_period_type VARCHAR, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    rank INTEGER,
    player_profile_id INTEGER,
    nickname VARCHAR,
    total_score INTEGER,
    games_played INTEGER,
    average_score NUMERIC,
    period_start DATE,
    period_end DATE
) AS $$
DECLARE
    v_current_start DATE;
    v_current_end DATE;
BEGIN
    -- Get current period boundaries
    v_current_start := get_period_start(CURRENT_DATE, p_period_type);
    v_current_end := get_period_end(CURRENT_DATE, p_period_type);
    
    RETURN QUERY
    SELECT 
        l.rank_position::INTEGER as rank,
        l.player_profile_id,
        pp.nickname,
        l.total_score,
        l.games_played,
        l.average_score,
        l.period_start,
        l.period_end
    FROM leaderboards l
    JOIN player_profiles pp ON l.player_profile_id = pp.id
    WHERE l.period_type = p_period_type
      AND l.period_start = v_current_start
      AND pp.nickname_approved = true
    ORDER BY l.rank_position
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 8. Function to check if a score qualifies for prizes
CREATE OR REPLACE FUNCTION check_prize_eligibility(p_score INTEGER, p_period_type VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_thresholds JSONB;
    v_result JSONB;
BEGIN
    -- Define minimum score thresholds for each period
    v_thresholds := '{
        "weekly": 1000,
        "monthly": 1500,
        "quarterly": 2000,
        "yearly": 2500
    }'::JSONB;
    
    v_result := jsonb_build_object(
        'qualifies', p_score >= (v_thresholds->>p_period_type)::INTEGER,
        'threshold', (v_thresholds->>p_period_type)::INTEGER,
        'score', p_score,
        'period', p_period_type
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 9. View for easy access to all current leaderboards
CREATE OR REPLACE VIEW current_leaderboards AS
SELECT 
    l.*,
    pp.nickname,
    pp.email,
    pp.real_name
FROM leaderboards l
JOIN player_profiles pp ON l.player_profile_id = pp.id
WHERE 
    (l.period_type = 'weekly' AND l.period_start = get_period_start(CURRENT_DATE, 'weekly'))
    OR (l.period_type = 'monthly' AND l.period_start = get_period_start(CURRENT_DATE, 'monthly'))
    OR (l.period_type = 'quarterly' AND l.period_start = get_period_start(CURRENT_DATE, 'quarterly'))
    OR (l.period_type = 'yearly' AND l.period_start = get_period_start(CURRENT_DATE, 'yearly'));

-- 10. Function to carry over leaderboards (for historical tracking)
CREATE OR REPLACE FUNCTION archive_expired_leaderboards()
RETURNS INTEGER AS $$
DECLARE
    v_archived_count INTEGER;
BEGIN
    -- Mark leaderboards as archived when their period ends
    UPDATE leaderboards
    SET aws_region = COALESCE(aws_region, '') || '_archived'
    WHERE period_end < CURRENT_DATE
      AND aws_region NOT LIKE '%_archived%';
    
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql;

-- Sample query to test period calculations
/*
SELECT 
    'weekly' as period,
    get_period_start(CURRENT_DATE, 'weekly') as start_date,
    get_period_end(CURRENT_DATE, 'weekly') as end_date
UNION ALL
SELECT 
    'monthly',
    get_period_start(CURRENT_DATE, 'monthly'),
    get_period_end(CURRENT_DATE, 'monthly')
UNION ALL
SELECT 
    'quarterly',
    get_period_start(CURRENT_DATE, 'quarterly'),
    get_period_end(CURRENT_DATE, 'quarterly')
UNION ALL
SELECT 
    'yearly',
    get_period_start(CURRENT_DATE, 'yearly'),
    get_period_end(CURRENT_DATE, 'yearly');
*/
