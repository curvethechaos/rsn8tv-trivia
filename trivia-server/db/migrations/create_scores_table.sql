-- 004a_create_scores_table.sql
-- This creates the missing scores table

CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    player_profile_id INTEGER REFERENCES player_profiles(id),
    session_id VARCHAR(255) REFERENCES sessions(id),
    score INTEGER NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    round_scores INTEGER[],
    device_fingerprint VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for the scores table
CREATE INDEX IF NOT EXISTS idx_scores_player_profile_id ON scores(player_profile_id);
CREATE INDEX IF NOT EXISTS idx_scores_session_id ON scores(session_id);
CREATE INDEX IF NOT EXISTS idx_scores_submitted_at ON scores(submitted_at);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at);
CREATE INDEX IF NOT EXISTS idx_scores_device_fingerprint ON scores(device_fingerprint);

-- Now add the trigger that failed before
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
