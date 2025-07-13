-- test-leaderboard-functions.sql
-- Test script to verify leaderboard functions are working correctly

-- 1. Test period calculations for various dates
SELECT '=== Testing Period Calculations ===' as test_section;

-- Test current periods
SELECT 
    'Current' as date_type,
    CURRENT_DATE as test_date,
    period,
    start_date,
    end_date,
    end_date - start_date + 1 as days
FROM (
    SELECT 'weekly' as period, get_period_start(CURRENT_DATE, 'weekly') as start_date, get_period_end(CURRENT_DATE, 'weekly') as end_date
    UNION ALL
    SELECT 'monthly', get_period_start(CURRENT_DATE, 'monthly'), get_period_end(CURRENT_DATE, 'monthly')
    UNION ALL
    SELECT 'quarterly', get_period_start(CURRENT_DATE, 'quarterly'), get_period_end(CURRENT_DATE, 'quarterly')
    UNION ALL
    SELECT 'yearly', get_period_start(CURRENT_DATE, 'yearly'), get_period_end(CURRENT_DATE, 'yearly')
) current_periods;

-- Test specific dates to verify correctness
SELECT 
    'Specific Test' as date_type,
    test_date,
    period,
    start_date,
    end_date,
    CASE 
        WHEN period = 'weekly' THEN to_char(start_date, 'Day')
        WHEN period = 'monthly' THEN to_char(start_date, 'DD')
        WHEN period = 'quarterly' THEN to_char(start_date, 'Mon DD')
        WHEN period = 'yearly' THEN to_char(start_date, 'Mon DD')
    END as start_validation
FROM (
    -- Test a Wednesday (should give Monday start for weekly)
    SELECT '2025-06-25'::DATE as test_date, 'weekly' as period, 
           get_period_start('2025-06-25'::DATE, 'weekly') as start_date,
           get_period_end('2025-06-25'::DATE, 'weekly') as end_date
    UNION ALL
    -- Test mid-month (should give 1st of month)
    SELECT '2025-06-15'::DATE, 'monthly',
           get_period_start('2025-06-15'::DATE, 'monthly'),
           get_period_end('2025-06-15'::DATE, 'monthly')
    UNION ALL
    -- Test Q2 date (should give April 1)
    SELECT '2025-05-15'::DATE, 'quarterly',
           get_period_start('2025-05-15'::DATE, 'quarterly'),
           get_period_end('2025-05-15'::DATE, 'quarterly')
    UNION ALL
    -- Test mid-year (should give Jan 1)
    SELECT '2025-08-15'::DATE, 'yearly',
           get_period_start('2025-08-15'::DATE, 'yearly'),
           get_period_end('2025-08-15'::DATE, 'yearly')
) specific_tests;

-- 2. Test prize eligibility function
SELECT '=== Testing Prize Eligibility ===' as test_section;

SELECT 
    score,
    period,
    (check_prize_eligibility(score, period))->>'qualifies' as qualifies,
    (check_prize_eligibility(score, period))->>'threshold' as threshold
FROM (
    SELECT 500 as score, 'weekly' as period
    UNION ALL SELECT 1000, 'weekly'
    UNION ALL SELECT 1200, 'monthly'
    UNION ALL SELECT 1500, 'monthly'
    UNION ALL SELECT 1800, 'quarterly'
    UNION ALL SELECT 2000, 'quarterly'
    UNION ALL SELECT 2400, 'yearly'
    UNION ALL SELECT 2500, 'yearly'
) test_scores
ORDER BY period, score;

-- 3. Create test data and verify leaderboard updates
SELECT '=== Testing Leaderboard Updates ===' as test_section;

-- First, let's check if we have any test players
SELECT COUNT(*) as existing_test_players FROM player_profiles WHERE email LIKE 'test%@example.com';

-- Create test players if they don't exist
INSERT INTO player_profiles (email, nickname, real_name, marketing_consent, nickname_approved)
SELECT 
    'test' || generate_series || '@example.com',
    'TestPlayer' || generate_series,
    'Test Player ' || generate_series,
    true,
    true
FROM generate_series(1, 5)
WHERE NOT EXISTS (
    SELECT 1 FROM player_profiles WHERE email LIKE 'test%@example.com'
);

-- Insert test scores (this should trigger automatic leaderboard updates)
WITH test_players AS (
    SELECT id, nickname FROM player_profiles WHERE email LIKE 'test%@example.com' LIMIT 5
)
INSERT INTO scores (player_profile_id, session_id, score, submitted_at, device_fingerprint)
SELECT 
    tp.id,
    'test-session-' || tp.id || '-' || gs,
    (random() * 2000 + 500)::INTEGER, -- Random score between 500-2500
    CURRENT_TIMESTAMP - (gs || ' hours')::INTERVAL, -- Spread over last few hours
    'test-device-' || tp.id
FROM test_players tp
CROSS JOIN generate_series(1, 3) gs -- 3 games per player
ON CONFLICT DO NOTHING;

-- Check if leaderboards were updated
SELECT '=== Current Leaderboard Entries ===' as test_section;

SELECT 
    pp.nickname,
    l.period_type,
    l.period_start,
    l.period_end,
    l.total_score,
    l.games_played,
    l.average_score::NUMERIC(10,2),
    l.rank_position
FROM leaderboards l
JOIN player_profiles pp ON l.player_profile_id = pp.id
WHERE pp.email LIKE 'test%@example.com'
  AND l.period_start <= CURRENT_DATE
  AND l.period_end >= CURRENT_DATE
ORDER BY l.period_type, l.rank_position
LIMIT 20;

-- 4. Test the get_leaderboard function
SELECT '=== Testing get_leaderboard Function ===' as test_section;

-- Weekly leaderboard
SELECT 'Weekly Leaderboard:' as leaderboard_type;
SELECT * FROM get_leaderboard('weekly', 10);

-- Monthly leaderboard
SELECT 'Monthly Leaderboard:' as leaderboard_type;
SELECT * FROM get_leaderboard('monthly', 10);

-- 5. Test the current_leaderboards view
SELECT '=== Testing current_leaderboards View ===' as test_section;

SELECT 
    period_type,
    COUNT(*) as player_count,
    MAX(total_score) as high_score,
    MIN(total_score) as low_score,
    AVG(total_score)::NUMERIC(10,2) as avg_score
FROM current_leaderboards
GROUP BY period_type
ORDER BY period_type;

-- 6. Clean up test data (optional - comment out if you want to keep test data)
/*
DELETE FROM scores WHERE session_id LIKE 'test-session-%';
DELETE FROM leaderboards WHERE player_profile_id IN (
    SELECT id FROM player_profiles WHERE email LIKE 'test%@example.com'
);
DELETE FROM player_profiles WHERE email LIKE 'test%@example.com';
*/

SELECT '=== All tests completed! ===' as status;
