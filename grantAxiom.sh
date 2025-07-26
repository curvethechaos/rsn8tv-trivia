#!/bin/bash

# Grant full database permissions to axiom user

echo "========================================="
echo "Granting Full Database Control to Axiom"
echo "========================================="
echo ""

echo "Step 1: Granting database ownership and permissions..."
echo "-----------------------------------------------------"

sudo -u postgres psql << 'EOF'
-- Connect to the rsn8tv_trivia database
\c rsn8tv_trivia

-- Make axiom the owner of the database
ALTER DATABASE rsn8tv_trivia OWNER TO axiom;

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE rsn8tv_trivia TO axiom;

-- Grant all privileges on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO axiom;

-- Grant all privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO axiom;

-- Grant all privileges on all functions
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO axiom;

-- Grant usage on schema
GRANT ALL ON SCHEMA public TO axiom;

-- Make axiom owner of all tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO axiom';
    END LOOP;
END $$;

-- Make axiom owner of all sequences
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT sequencename FROM pg_sequences 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' OWNER TO axiom';
    END LOOP;
END $$;

-- Make axiom owner of all views
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT viewname FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER VIEW ' || quote_ident(r.viewname) || ' OWNER TO axiom';
    END LOOP;
END $$;

-- Make axiom owner of all functions
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, oidvectortypes(proargtypes) as argtypes
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE 'ALTER FUNCTION ' || quote_ident(r.proname) || '(' || r.argtypes || ') OWNER TO axiom';
    END LOOP;
END $$;

-- Grant privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO axiom;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO axiom;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO axiom;

-- Make axiom a superuser for this database (optional - remove if too permissive)
-- ALTER USER axiom WITH SUPERUSER;

-- Show current ownership
\echo ''
\echo 'Current database owner:'
SELECT d.datname as database, pg_catalog.pg_get_userbyid(d.datdba) as owner
FROM pg_catalog.pg_database d
WHERE d.datname = 'rsn8tv_trivia';

\echo ''
\echo 'Table ownership:'
SELECT tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
LIMIT 5;

\echo ''
\echo 'User privileges:'
\du axiom
EOF

echo ""
echo "Step 2: Re-running the migration now that axiom has ownership..."
echo "-----------------------------------------------------------------"

cd ~/rsn8tv-trivia/trivia-server

# Remove the failed migration record if it exists
sudo -u postgres psql rsn8tv_trivia -c "DELETE FROM knex_migrations WHERE name = '20250724030217_fix_player_scores.js';"

# Now run the migration again
npx knex migrate:latest

echo ""
echo "Step 3: Verifying permissions and data..."
echo "-----------------------------------------"

# Test that axiom can create triggers
psql -U axiom -d rsn8tv_trivia -h localhost << 'EOF'
-- Test creating a trigger (then drop it)
CREATE OR REPLACE FUNCTION test_trigger_func() RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER test_trigger
AFTER INSERT ON scores
FOR EACH ROW
EXECUTE FUNCTION test_trigger_func();

DROP TRIGGER test_trigger ON scores;
DROP FUNCTION test_trigger_func();

-- Show scores were updated
SELECT 'Scores have been updated for these players:' as message;
SELECT nickname, total_score, total_games_played 
FROM player_profiles 
WHERE total_score > 0 
ORDER BY total_score DESC 
LIMIT 10;
EOF

echo ""
echo "Step 4: Restarting the server..."
echo "---------------------------------"

pm2 restart rsn8tv

echo ""
echo "========================================="
echo "Database Permissions Fixed!"
echo "========================================="
echo ""
echo "The axiom user now has full control over the rsn8tv_trivia database."
echo ""
echo "Summary of changes:"
echo "- axiom is now the database owner"
echo "- axiom owns all tables, sequences, views, and functions"
echo "- axiom can create/modify triggers, functions, etc."
echo "- Future objects will automatically be owned by axiom"
echo ""
echo "The migration should have run successfully this time."
echo "Check the Players tab to verify scores are showing correctly."
echo ""
