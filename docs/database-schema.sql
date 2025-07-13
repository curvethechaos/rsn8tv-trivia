--
-- PostgreSQL database dump
--

-- Dumped from database version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: archive_expired_leaderboards(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.archive_expired_leaderboards() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.archive_expired_leaderboards() OWNER TO postgres;

--
-- Name: check_prize_eligibility(integer, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_prize_eligibility(p_score integer, p_period_type character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.check_prize_eligibility(p_score integer, p_period_type character varying) OWNER TO postgres;

--
-- Name: get_balanced_questions(integer, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_balanced_questions(p_count integer, p_difficulty character varying, p_category character varying DEFAULT NULL::character varying, p_max_words integer DEFAULT 15) RETURNS TABLE(id integer, question_text text, correct_answer character varying, incorrect_answers jsonb, category character varying, difficulty character varying, word_count integer)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.get_balanced_questions(p_count integer, p_difficulty character varying, p_category character varying, p_max_words integer) OWNER TO postgres;

--
-- Name: get_leaderboard(character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_leaderboard(p_period_type character varying, p_limit integer DEFAULT 100) RETURNS TABLE(rank integer, player_profile_id integer, nickname character varying, total_score integer, games_played integer, average_score numeric, period_start date, period_end date)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.get_leaderboard(p_period_type character varying, p_limit integer) OWNER TO postgres;

--
-- Name: get_period_end(date, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_period_end(p_date date, p_period_type character varying) RETURNS date
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.get_period_end(p_date date, p_period_type character varying) OWNER TO postgres;

--
-- Name: get_period_start(date, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_period_start(p_date date, p_period_type character varying) RETURNS date
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.get_period_start(p_date date, p_period_type character varying) OWNER TO postgres;

--
-- Name: trigger_update_leaderboards(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_update_leaderboards() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.trigger_update_leaderboards() OWNER TO postgres;

--
-- Name: update_leaderboard_ranks(character varying[], date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_leaderboard_ranks(p_period_types character varying[], p_date date) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.update_leaderboard_ranks(p_period_types character varying[], p_date date) OWNER TO postgres;

--
-- Name: update_player_leaderboards(integer, integer, timestamp without time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_player_leaderboards(p_player_profile_id integer, p_score integer, p_submitted_at timestamp without time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.update_player_leaderboards(p_player_profile_id integer, p_score integer, p_submitted_at timestamp without time zone) OWNER TO postgres;

--
-- Name: update_player_leaderboards(integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_player_leaderboards(p_player_profile_id integer, p_score integer, p_submitted_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Just call the original function with a cast
    PERFORM update_player_leaderboards(
        p_player_profile_id, 
        p_score, 
        p_submitted_at::TIMESTAMP
    );
END;
$$;


ALTER FUNCTION public.update_player_leaderboards(p_player_profile_id integer, p_score integer, p_submitted_at timestamp with time zone) OWNER TO postgres;

--
-- Name: update_quality_score(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_quality_score() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.update_quality_score() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: question_cache; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.question_cache (
    id integer NOT NULL,
    api_question_id character varying(255) NOT NULL,
    question_text text NOT NULL,
    correct_answer character varying(500) NOT NULL,
    incorrect_answers jsonb NOT NULL,
    category character varying(100) NOT NULL,
    difficulty text NOT NULL,
    tags jsonb,
    regions jsonb,
    cached_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp with time zone,
    usage_count integer DEFAULT 0,
    word_count integer,
    quality_score integer DEFAULT 50,
    is_active boolean DEFAULT true,
    times_used integer DEFAULT 0,
    player_rating numeric(3,2),
    last_reviewed timestamp without time zone,
    CONSTRAINT question_cache_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])))
);


ALTER TABLE public.question_cache OWNER TO axiom;

--
-- Name: active_short_questions; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.active_short_questions AS
 SELECT question_cache.id,
    question_cache.question_text,
    question_cache.correct_answer,
    question_cache.incorrect_answers,
    question_cache.category,
    question_cache.difficulty,
    question_cache.word_count,
    question_cache.quality_score,
    question_cache.times_used,
    question_cache.player_rating
   FROM public.question_cache
  WHERE ((question_cache.is_active = true) AND (question_cache.word_count <= 15))
  ORDER BY question_cache.quality_score DESC, question_cache.times_used;


ALTER TABLE public.active_short_questions OWNER TO postgres;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.admin_audit_logs (
    id integer NOT NULL,
    admin_user_id integer,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id character varying(255),
    ip_address inet,
    user_agent text,
    request_data jsonb,
    response_status integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admin_audit_logs OWNER TO axiom;

--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.admin_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_audit_logs_id_seq OWNER TO axiom;

--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.admin_audit_logs_id_seq OWNED BY public.admin_audit_logs.id;


--
-- Name: admin_login_attempts; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.admin_login_attempts (
    id integer NOT NULL,
    username character varying(255),
    ip_address inet NOT NULL,
    user_agent text,
    success boolean NOT NULL,
    failure_reason character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admin_login_attempts OWNER TO axiom;

--
-- Name: admin_login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.admin_login_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_login_attempts_id_seq OWNER TO axiom;

--
-- Name: admin_login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.admin_login_attempts_id_seq OWNED BY public.admin_login_attempts.id;


--
-- Name: admin_refresh_tokens; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.admin_refresh_tokens (
    id integer NOT NULL,
    admin_user_id integer,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_ip inet,
    revoked_at timestamp with time zone,
    revoked_reason character varying(255),
    replaced_by_token character varying(255)
);


ALTER TABLE public.admin_refresh_tokens OWNER TO axiom;

--
-- Name: admin_refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.admin_refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_refresh_tokens_id_seq OWNER TO axiom;

--
-- Name: admin_refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.admin_refresh_tokens_id_seq OWNED BY public.admin_refresh_tokens.id;


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.admin_users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'admin'::character varying,
    is_active boolean DEFAULT true,
    mfa_enabled boolean DEFAULT false,
    mfa_secret character varying(255),
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    last_login_ip inet,
    password_changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admin_users OWNER TO axiom;

--
-- Name: admin_users_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.admin_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_users_id_seq OWNER TO axiom;

--
-- Name: admin_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.admin_users_id_seq OWNED BY public.admin_users.id;


--
-- Name: answers; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.answers (
    id integer NOT NULL,
    player_id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    question_index integer NOT NULL,
    answer_index integer NOT NULL,
    is_correct boolean NOT NULL,
    response_time_ms integer NOT NULL,
    base_points integer NOT NULL,
    time_bonus integer DEFAULT 0,
    penalty_points integer DEFAULT 0,
    streak_bonus integer DEFAULT 0,
    final_score integer NOT NULL,
    speed_percentage numeric(5,2),
    streak_count integer DEFAULT 0,
    time_remaining_ms integer,
    answer_speed_rank integer,
    is_perfect_round boolean DEFAULT false,
    round_bonus integer DEFAULT 0,
    answered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.answers OWNER TO axiom;

--
-- Name: answers_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.answers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.answers_id_seq OWNER TO axiom;

--
-- Name: answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.answers_id_seq OWNED BY public.answers.id;


--
-- Name: branding_config; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.branding_config (
    id integer NOT NULL,
    main_logo_url character varying(255),
    favicon_url character varying(255),
    sponsor_logos jsonb,
    company_name character varying(255) DEFAULT 'RSN8TV Trivia'::character varying,
    tagline character varying(255) DEFAULT 'Real-time multiplayer trivia'::character varying,
    footer_text text DEFAULT '© 2025 RSN8TV. All rights reserved.'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.branding_config OWNER TO axiom;

--
-- Name: branding_config_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.branding_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.branding_config_id_seq OWNER TO axiom;

--
-- Name: branding_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.branding_config_id_seq OWNED BY public.branding_config.id;


--
-- Name: leaderboards; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.leaderboards (
    id integer NOT NULL,
    player_profile_id integer NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_score integer DEFAULT 0,
    games_played integer DEFAULT 0,
    average_score numeric(10,2),
    rank_position integer,
    aws_region character varying(255) DEFAULT 'us-east-1'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    period character varying(32) DEFAULT 'weekly'::character varying NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    CONSTRAINT leaderboards_period_type_check CHECK ((period_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text])))
);


ALTER TABLE public.leaderboards OWNER TO axiom;

--
-- Name: player_profiles; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.player_profiles (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    nickname character varying(255) NOT NULL,
    nickname_approved boolean DEFAULT true,
    marketing_consent boolean DEFAULT false,
    marketing_consent_timestamp timestamp with time zone,
    device_fingerprint character varying(255),
    email_verified boolean DEFAULT false,
    total_games_played integer DEFAULT 0,
    total_score integer DEFAULT 0,
    last_played timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    real_name character varying(255)
);


ALTER TABLE public.player_profiles OWNER TO axiom;

--
-- Name: current_leaderboards; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.current_leaderboards AS
 SELECT l.id,
    l.player_profile_id,
    l.period_type,
    l.period_start,
    l.period_end,
    l.total_score,
    l.games_played,
    l.average_score,
    l.rank_position,
    l.aws_region,
    l.created_at,
    l.updated_at,
    l.period,
    l.score,
    pp.nickname,
    pp.email,
    pp.real_name
   FROM (public.leaderboards l
     JOIN public.player_profiles pp ON ((l.player_profile_id = pp.id)))
  WHERE (((l.period_type = 'weekly'::text) AND (l.period_start = public.get_period_start(CURRENT_DATE, 'weekly'::character varying))) OR ((l.period_type = 'monthly'::text) AND (l.period_start = public.get_period_start(CURRENT_DATE, 'monthly'::character varying))) OR ((l.period_type = 'quarterly'::text) AND (l.period_start = public.get_period_start(CURRENT_DATE, 'quarterly'::character varying))) OR ((l.period_type = 'yearly'::text) AND (l.period_start = public.get_period_start(CURRENT_DATE, 'yearly'::character varying))));


ALTER TABLE public.current_leaderboards OWNER TO postgres;

--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.email_campaigns (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    content text NOT NULL,
    target_audience jsonb,
    status text DEFAULT 'draft'::text,
    sent_count integer DEFAULT 0,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    CONSTRAINT email_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.email_campaigns OWNER TO axiom;

--
-- Name: email_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.email_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.email_campaigns_id_seq OWNER TO axiom;

--
-- Name: email_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.email_campaigns_id_seq OWNED BY public.email_campaigns.id;


--
-- Name: exports; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.exports (
    id integer NOT NULL,
    export_type character varying(50) NOT NULL,
    export_format character varying(20) DEFAULT 'csv'::character varying,
    user_id integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    filters jsonb,
    file_path character varying(255),
    file_size bigint,
    row_count integer,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone
);


ALTER TABLE public.exports OWNER TO axiom;

--
-- Name: exports_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.exports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.exports_id_seq OWNER TO axiom;

--
-- Name: exports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.exports_id_seq OWNED BY public.exports.id;


--
-- Name: game_rounds; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.game_rounds (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    round_number integer NOT NULL,
    questions jsonb NOT NULL,
    round_started_at timestamp with time zone,
    round_completed_at timestamp with time zone,
    average_response_time integer,
    total_correct_answers integer DEFAULT 0
);


ALTER TABLE public.game_rounds OWNER TO axiom;

--
-- Name: game_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.game_rounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.game_rounds_id_seq OWNER TO axiom;

--
-- Name: game_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.game_rounds_id_seq OWNED BY public.game_rounds.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: trivia_user
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO trivia_user;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: trivia_user
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_id_seq OWNER TO trivia_user;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: trivia_user
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: trivia_user
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO trivia_user;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: trivia_user
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_lock_index_seq OWNER TO trivia_user;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: trivia_user
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: leaderboards_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.leaderboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.leaderboards_id_seq OWNER TO axiom;

--
-- Name: leaderboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.leaderboards_id_seq OWNED BY public.leaderboards.id;


--
-- Name: player_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.player_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.player_profiles_id_seq OWNER TO axiom;

--
-- Name: player_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.player_profiles_id_seq OWNED BY public.player_profiles.id;


--
-- Name: player_statistics; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.player_statistics (
    id integer NOT NULL,
    player_profile_id integer,
    session_id character varying(255) NOT NULL,
    round_1_score integer DEFAULT 0,
    round_1_correct integer DEFAULT 0,
    round_1_perfect boolean DEFAULT false,
    round_2_score integer DEFAULT 0,
    round_2_correct integer DEFAULT 0,
    round_2_perfect boolean DEFAULT false,
    round_3_score integer DEFAULT 0,
    round_3_correct integer DEFAULT 0,
    round_3_perfect boolean DEFAULT false,
    total_score integer DEFAULT 0,
    total_correct integer DEFAULT 0,
    total_wrong integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    average_response_time integer,
    fastest_answer_time integer,
    total_time_bonuses integer DEFAULT 0,
    total_penalties integer DEFAULT 0,
    speed_rank integer,
    accuracy_rank integer,
    final_rank integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.player_statistics OWNER TO axiom;

--
-- Name: player_statistics_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.player_statistics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.player_statistics_id_seq OWNER TO axiom;

--
-- Name: player_statistics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.player_statistics_id_seq OWNED BY public.player_statistics.id;


--
-- Name: players; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.players (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    player_profile_id integer,
    temporary_name character varying(255) NOT NULL,
    client_id character varying(255) NOT NULL,
    score integer DEFAULT 0,
    is_registered boolean DEFAULT false,
    registration_prompted boolean DEFAULT false,
    qr_scan_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    player_number integer,
    joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


ALTER TABLE public.players OWNER TO axiom;

--
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.players_id_seq OWNER TO axiom;

--
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- Name: prize_claims; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.prize_claims (
    id integer NOT NULL,
    player_profile_id integer NOT NULL,
    prize_type text NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    claimed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prize_claims_period_type_check CHECK ((period_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text]))),
    CONSTRAINT prize_claims_prize_type_check CHECK ((prize_type = ANY (ARRAY['time-based'::text, 'threshold'::text])))
);


ALTER TABLE public.prize_claims OWNER TO axiom;

--
-- Name: prize_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.prize_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.prize_claims_id_seq OWNER TO axiom;

--
-- Name: prize_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.prize_claims_id_seq OWNED BY public.prize_claims.id;


--
-- Name: prize_configurations; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.prize_configurations (
    id integer NOT NULL,
    type text NOT NULL,
    period text NOT NULL,
    period_order integer,
    description text,
    prize_value character varying(255),
    min_score integer,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prize_configurations_period_check CHECK ((period = ANY (ARRAY['weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text]))),
    CONSTRAINT prize_configurations_type_check CHECK ((type = ANY (ARRAY['time-based'::text, 'threshold'::text])))
);


ALTER TABLE public.prize_configurations OWNER TO axiom;

--
-- Name: prize_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.prize_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.prize_configurations_id_seq OWNER TO axiom;

--
-- Name: prize_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.prize_configurations_id_seq OWNED BY public.prize_configurations.id;


--
-- Name: question_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.question_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.question_cache_id_seq OWNER TO axiom;

--
-- Name: question_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.question_cache_id_seq OWNED BY public.question_cache.id;


--
-- Name: question_responses; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.question_responses (
    id integer NOT NULL,
    question_id integer NOT NULL,
    player_id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    is_correct boolean NOT NULL,
    response_time integer,
    answered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.question_responses OWNER TO axiom;

--
-- Name: question_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.question_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.question_responses_id_seq OWNER TO axiom;

--
-- Name: question_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.question_responses_id_seq OWNED BY public.question_responses.id;


--
-- Name: question_statistics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.question_statistics AS
 SELECT question_cache.difficulty,
    question_cache.category,
    count(*) AS total_questions,
    count(
        CASE
            WHEN (question_cache.word_count <= 15) THEN 1
            ELSE NULL::integer
        END) AS short_questions,
    count(
        CASE
            WHEN ((question_cache.word_count >= 16) AND (question_cache.word_count <= 20)) THEN 1
            ELSE NULL::integer
        END) AS medium_questions,
    count(
        CASE
            WHEN (question_cache.word_count > 20) THEN 1
            ELSE NULL::integer
        END) AS long_questions,
    avg(question_cache.word_count) AS avg_word_count,
    avg(question_cache.quality_score) AS avg_quality_score,
    sum(question_cache.times_used) AS total_uses
   FROM public.question_cache
  WHERE (question_cache.is_active = true)
  GROUP BY question_cache.difficulty, question_cache.category
  ORDER BY question_cache.difficulty, question_cache.category;


ALTER TABLE public.question_statistics OWNER TO postgres;

--
-- Name: questions; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.questions (
    id integer NOT NULL,
    question text NOT NULL,
    correct_answer character varying(255) NOT NULL,
    incorrect_answers jsonb NOT NULL,
    category character varying(255) NOT NULL,
    difficulty text NOT NULL,
    is_flagged boolean DEFAULT false,
    is_custom boolean DEFAULT false,
    flagged_by integer,
    flagged_at timestamp with time zone,
    updated_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT questions_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])))
);


ALTER TABLE public.questions OWNER TO axiom;

--
-- Name: questions_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.questions_id_seq OWNER TO axiom;

--
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.questions_id_seq OWNED BY public.questions.id;


--
-- Name: scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scores (
    id integer NOT NULL,
    player_profile_id integer,
    session_id character varying(255),
    score integer NOT NULL,
    submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    round_scores integer[],
    device_fingerprint character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scores OWNER TO postgres;

--
-- Name: scores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.scores_id_seq OWNER TO postgres;

--
-- Name: scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scores_id_seq OWNED BY public.scores.id;


--
-- Name: session_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session_questions (
    id integer NOT NULL,
    session_id character varying(255),
    question_cache_id integer,
    question_order integer NOT NULL,
    round_number integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.session_questions OWNER TO postgres;

--
-- Name: session_questions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.session_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.session_questions_id_seq OWNER TO postgres;

--
-- Name: session_questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.session_questions_id_seq OWNED BY public.session_questions.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.sessions (
    id character varying(255) NOT NULL,
    host_id character varying(255) NOT NULL,
    room_code character varying(50) DEFAULT substr(md5((random())::text), 0, 7) NOT NULL,
    qr_code_data text,
    is_active boolean DEFAULT true,
    total_rounds integer DEFAULT 3,
    current_round integer DEFAULT 1,
    current_question integer DEFAULT 0,
    questions_source text DEFAULT 'trivia_api'::text,
    question_set jsonb,
    round_1_complete boolean DEFAULT false,
    round_2_complete boolean DEFAULT false,
    round_3_complete boolean DEFAULT false,
    offline_mode boolean DEFAULT false,
    device_group character varying(255),
    branding_assets jsonb,
    aws_region character varying(255) DEFAULT 'us-east-1'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    settings jsonb,
    ended_at timestamp without time zone,
    status character varying(50) DEFAULT 'waiting'::character varying,
    started_at timestamp with time zone,
    CONSTRAINT sessions_questions_source_check CHECK ((questions_source = ANY (ARRAY['trivia_api'::text, 'cache'::text, 'fallback'::text])))
);


ALTER TABLE public.sessions OWNER TO axiom;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.system_settings (
    key character varying(255) NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.system_settings OWNER TO axiom;

--
-- Name: themes; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.themes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    is_default boolean DEFAULT false,
    player_theme jsonb,
    host_theme jsonb,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.themes OWNER TO axiom;

--
-- Name: themes_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.themes_id_seq OWNER TO axiom;

--
-- Name: themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.themes_id_seq OWNED BY public.themes.id;


--
-- Name: venues; Type: TABLE; Schema: public; Owner: axiom
--

CREATE TABLE public.venues (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    contact_info jsonb,
    xibo_display_id character varying(255),
    settings jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.venues OWNER TO axiom;

--
-- Name: venues_id_seq; Type: SEQUENCE; Schema: public; Owner: axiom
--

CREATE SEQUENCE public.venues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.venues_id_seq OWNER TO axiom;

--
-- Name: venues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: axiom
--

ALTER SEQUENCE public.venues_id_seq OWNED BY public.venues.id;


--
-- Name: admin_audit_logs id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_logs_id_seq'::regclass);


--
-- Name: admin_login_attempts id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_login_attempts ALTER COLUMN id SET DEFAULT nextval('public.admin_login_attempts_id_seq'::regclass);


--
-- Name: admin_refresh_tokens id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.admin_refresh_tokens_id_seq'::regclass);


--
-- Name: admin_users id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_users ALTER COLUMN id SET DEFAULT nextval('public.admin_users_id_seq'::regclass);


--
-- Name: answers id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers ALTER COLUMN id SET DEFAULT nextval('public.answers_id_seq'::regclass);


--
-- Name: branding_config id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.branding_config ALTER COLUMN id SET DEFAULT nextval('public.branding_config_id_seq'::regclass);


--
-- Name: email_campaigns id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.email_campaigns ALTER COLUMN id SET DEFAULT nextval('public.email_campaigns_id_seq'::regclass);


--
-- Name: exports id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.exports ALTER COLUMN id SET DEFAULT nextval('public.exports_id_seq'::regclass);


--
-- Name: game_rounds id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.game_rounds ALTER COLUMN id SET DEFAULT nextval('public.game_rounds_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: trivia_user
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: trivia_user
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: leaderboards id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.leaderboards ALTER COLUMN id SET DEFAULT nextval('public.leaderboards_id_seq'::regclass);


--
-- Name: player_profiles id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_profiles ALTER COLUMN id SET DEFAULT nextval('public.player_profiles_id_seq'::regclass);


--
-- Name: player_statistics id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_statistics ALTER COLUMN id SET DEFAULT nextval('public.player_statistics_id_seq'::regclass);


--
-- Name: players id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- Name: prize_claims id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_claims ALTER COLUMN id SET DEFAULT nextval('public.prize_claims_id_seq'::regclass);


--
-- Name: prize_configurations id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_configurations ALTER COLUMN id SET DEFAULT nextval('public.prize_configurations_id_seq'::regclass);


--
-- Name: question_cache id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_cache ALTER COLUMN id SET DEFAULT nextval('public.question_cache_id_seq'::regclass);


--
-- Name: question_responses id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_responses ALTER COLUMN id SET DEFAULT nextval('public.question_responses_id_seq'::regclass);


--
-- Name: questions id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.questions ALTER COLUMN id SET DEFAULT nextval('public.questions_id_seq'::regclass);


--
-- Name: scores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scores ALTER COLUMN id SET DEFAULT nextval('public.scores_id_seq'::regclass);


--
-- Name: session_questions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions ALTER COLUMN id SET DEFAULT nextval('public.session_questions_id_seq'::regclass);


--
-- Name: themes id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.themes ALTER COLUMN id SET DEFAULT nextval('public.themes_id_seq'::regclass);


--
-- Name: venues id; Type: DEFAULT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.venues ALTER COLUMN id SET DEFAULT nextval('public.venues_id_seq'::regclass);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_login_attempts admin_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_login_attempts
    ADD CONSTRAINT admin_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: admin_refresh_tokens admin_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: admin_refresh_tokens admin_refresh_tokens_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_token_hash_unique UNIQUE (token_hash);


--
-- Name: admin_users admin_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_unique UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_unique UNIQUE (username);


--
-- Name: answers answers_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);


--
-- Name: answers answers_player_id_session_id_question_index_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_player_id_session_id_question_index_unique UNIQUE (player_id, session_id, question_index);


--
-- Name: branding_config branding_config_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.branding_config
    ADD CONSTRAINT branding_config_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: exports exports_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.exports
    ADD CONSTRAINT exports_pkey PRIMARY KEY (id);


--
-- Name: game_rounds game_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_pkey PRIMARY KEY (id);


--
-- Name: game_rounds game_rounds_session_id_round_number_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_session_id_round_number_unique UNIQUE (session_id, round_number);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: trivia_user
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: trivia_user
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: leaderboards leaderboards_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.leaderboards
    ADD CONSTRAINT leaderboards_pkey PRIMARY KEY (id);


--
-- Name: leaderboards leaderboards_player_profile_id_period_type_period_start_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.leaderboards
    ADD CONSTRAINT leaderboards_player_profile_id_period_type_period_start_unique UNIQUE (player_profile_id, period_type, period_start);


--
-- Name: player_profiles player_profiles_email_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_email_unique UNIQUE (email);


--
-- Name: player_profiles player_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_pkey PRIMARY KEY (id);


--
-- Name: player_statistics player_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_statistics
    ADD CONSTRAINT player_statistics_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: players players_session_id_client_id_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_session_id_client_id_unique UNIQUE (session_id, client_id);


--
-- Name: prize_claims prize_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_claims
    ADD CONSTRAINT prize_claims_pkey PRIMARY KEY (id);


--
-- Name: prize_claims prize_claims_player_profile_id_prize_type_period_type_period_st; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_claims
    ADD CONSTRAINT prize_claims_player_profile_id_prize_type_period_type_period_st UNIQUE (player_profile_id, prize_type, period_type, period_start);


--
-- Name: prize_configurations prize_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_configurations
    ADD CONSTRAINT prize_configurations_pkey PRIMARY KEY (id);


--
-- Name: prize_configurations prize_configurations_type_period_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_configurations
    ADD CONSTRAINT prize_configurations_type_period_unique UNIQUE (type, period);


--
-- Name: question_cache question_cache_api_question_id_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_cache
    ADD CONSTRAINT question_cache_api_question_id_unique UNIQUE (api_question_id);


--
-- Name: question_cache question_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_cache
    ADD CONSTRAINT question_cache_pkey PRIMARY KEY (id);


--
-- Name: question_responses question_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_responses
    ADD CONSTRAINT question_responses_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: scores scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scores
    ADD CONSTRAINT scores_pkey PRIMARY KEY (id);


--
-- Name: session_questions session_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions
    ADD CONSTRAINT session_questions_pkey PRIMARY KEY (id);


--
-- Name: session_questions session_questions_session_id_question_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions
    ADD CONSTRAINT session_questions_session_id_question_order_key UNIQUE (session_id, question_order);


--
-- Name: session_questions session_questions_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions
    ADD CONSTRAINT session_questions_unique UNIQUE (session_id, question_cache_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_room_code_unique; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_room_code_unique UNIQUE (room_code);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs_admin_user_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_audit_logs_admin_user_id_index ON public.admin_audit_logs USING btree (admin_user_id);


--
-- Name: admin_audit_logs_created_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_audit_logs_created_at_index ON public.admin_audit_logs USING btree (created_at);


--
-- Name: admin_login_attempts_ip_address_created_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_login_attempts_ip_address_created_at_index ON public.admin_login_attempts USING btree (ip_address, created_at);


--
-- Name: admin_login_attempts_username_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_login_attempts_username_index ON public.admin_login_attempts USING btree (username);


--
-- Name: admin_refresh_tokens_admin_user_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_refresh_tokens_admin_user_id_index ON public.admin_refresh_tokens USING btree (admin_user_id);


--
-- Name: admin_refresh_tokens_expires_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX admin_refresh_tokens_expires_at_index ON public.admin_refresh_tokens USING btree (expires_at);


--
-- Name: answers_player_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX answers_player_id_index ON public.answers USING btree (player_id);


--
-- Name: answers_session_id_question_index_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX answers_session_id_question_index_index ON public.answers USING btree (session_id, question_index);


--
-- Name: branding_config_is_active_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX branding_config_is_active_index ON public.branding_config USING btree (is_active);


--
-- Name: email_campaigns_status_scheduled_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX email_campaigns_status_scheduled_at_index ON public.email_campaigns USING btree (status, scheduled_at);


--
-- Name: idx_leaderboards_dates; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_leaderboards_dates ON public.leaderboards USING btree (period_start, period_end);


--
-- Name: idx_leaderboards_period_dates; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_leaderboards_period_dates ON public.leaderboards USING btree (period_type, period_start, period_end);


--
-- Name: idx_leaderboards_player_period; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_leaderboards_player_period ON public.leaderboards USING btree (player_profile_id, period_type, period_start);


--
-- Name: idx_leaderboards_rank; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_leaderboards_rank ON public.leaderboards USING btree (period_type, period_start, rank_position);


--
-- Name: idx_quality_filter; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_quality_filter ON public.question_cache USING btree (is_active, word_count, difficulty, category);


--
-- Name: idx_quality_score; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_quality_score ON public.question_cache USING btree (quality_score DESC);


--
-- Name: idx_scores_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scores_created_at ON public.scores USING btree (created_at);


--
-- Name: idx_scores_device_fingerprint; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scores_device_fingerprint ON public.scores USING btree (device_fingerprint);


--
-- Name: idx_scores_player_profile_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scores_player_profile_id ON public.scores USING btree (player_profile_id);


--
-- Name: idx_scores_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scores_session_id ON public.scores USING btree (session_id);


--
-- Name: idx_scores_submitted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scores_submitted_at ON public.scores USING btree (submitted_at);


--
-- Name: idx_session_questions_round; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_questions_round ON public.session_questions USING btree (session_id, round_number);


--
-- Name: idx_session_questions_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_questions_session_id ON public.session_questions USING btree (session_id);


--
-- Name: idx_usage_tracking; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_usage_tracking ON public.question_cache USING btree (times_used, last_used);


--
-- Name: idx_word_count; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX idx_word_count ON public.question_cache USING btree (word_count);


--
-- Name: leaderboards_aws_region_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX leaderboards_aws_region_index ON public.leaderboards USING btree (aws_region);


--
-- Name: leaderboards_period_type_period_start_rank_position_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX leaderboards_period_type_period_start_rank_position_index ON public.leaderboards USING btree (period_type, period_start, rank_position);


--
-- Name: leaderboards_player_profile_id_period_type_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX leaderboards_player_profile_id_period_type_index ON public.leaderboards USING btree (player_profile_id, period_type);


--
-- Name: player_profiles_device_fingerprint_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX player_profiles_device_fingerprint_index ON public.player_profiles USING btree (device_fingerprint);


--
-- Name: player_profiles_email_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX player_profiles_email_index ON public.player_profiles USING btree (email);


--
-- Name: player_profiles_last_played_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX player_profiles_last_played_index ON public.player_profiles USING btree (last_played);


--
-- Name: player_statistics_player_profile_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX player_statistics_player_profile_id_index ON public.player_statistics USING btree (player_profile_id);


--
-- Name: player_statistics_session_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX player_statistics_session_id_index ON public.player_statistics USING btree (session_id);


--
-- Name: players_player_profile_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX players_player_profile_id_index ON public.players USING btree (player_profile_id);


--
-- Name: players_session_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX players_session_id_index ON public.players USING btree (session_id);


--
-- Name: prize_claims_period_type_period_start_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX prize_claims_period_type_period_start_index ON public.prize_claims USING btree (period_type, period_start);


--
-- Name: prize_configurations_enabled_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX prize_configurations_enabled_index ON public.prize_configurations USING btree (enabled);


--
-- Name: question_cache_cached_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX question_cache_cached_at_index ON public.question_cache USING btree (cached_at);


--
-- Name: question_cache_category_difficulty_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX question_cache_category_difficulty_index ON public.question_cache USING btree (category, difficulty);


--
-- Name: question_cache_usage_count_last_used_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX question_cache_usage_count_last_used_index ON public.question_cache USING btree (usage_count, last_used);


--
-- Name: question_responses_question_id_is_correct_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX question_responses_question_id_is_correct_index ON public.question_responses USING btree (question_id, is_correct);


--
-- Name: question_responses_session_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX question_responses_session_id_index ON public.question_responses USING btree (session_id);


--
-- Name: questions_category_difficulty_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX questions_category_difficulty_index ON public.questions USING btree (category, difficulty);


--
-- Name: questions_is_custom_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX questions_is_custom_index ON public.questions USING btree (is_custom);


--
-- Name: questions_is_flagged_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX questions_is_flagged_index ON public.questions USING btree (is_flagged);


--
-- Name: sessions_created_at_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX sessions_created_at_index ON public.sessions USING btree (created_at);


--
-- Name: sessions_is_active_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX sessions_is_active_index ON public.sessions USING btree (is_active);


--
-- Name: sessions_room_code_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX sessions_room_code_index ON public.sessions USING btree (room_code);


--
-- Name: venues_is_active_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX venues_is_active_index ON public.venues USING btree (is_active);


--
-- Name: venues_xibo_display_id_index; Type: INDEX; Schema: public; Owner: axiom
--

CREATE INDEX venues_xibo_display_id_index ON public.venues USING btree (xibo_display_id);


--
-- Name: question_cache trigger_update_quality_score; Type: TRIGGER; Schema: public; Owner: axiom
--

CREATE TRIGGER trigger_update_quality_score BEFORE UPDATE OF player_rating ON public.question_cache FOR EACH ROW EXECUTE FUNCTION public.update_quality_score();


--
-- Name: scores update_leaderboards_on_score; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_leaderboards_on_score AFTER INSERT ON public.scores FOR EACH ROW EXECUTE FUNCTION public.trigger_update_leaderboards();


--
-- Name: admin_audit_logs admin_audit_logs_admin_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_user_id_foreign FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id);


--
-- Name: admin_refresh_tokens admin_refresh_tokens_admin_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.admin_refresh_tokens
    ADD CONSTRAINT admin_refresh_tokens_admin_user_id_foreign FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: answers answers_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: answers answers_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: answers answers_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.admin_users(id);


--
-- Name: game_rounds game_rounds_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: leaderboards leaderboards_player_profile_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.leaderboards
    ADD CONSTRAINT leaderboards_player_profile_id_foreign FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id) ON DELETE CASCADE;


--
-- Name: player_statistics player_statistics_player_profile_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_statistics
    ADD CONSTRAINT player_statistics_player_profile_id_foreign FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id);


--
-- Name: player_statistics player_statistics_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.player_statistics
    ADD CONSTRAINT player_statistics_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: players players_player_profile_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_player_profile_id_foreign FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id);


--
-- Name: players players_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: prize_claims prize_claims_player_profile_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.prize_claims
    ADD CONSTRAINT prize_claims_player_profile_id_foreign FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id);


--
-- Name: question_responses question_responses_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_responses
    ADD CONSTRAINT question_responses_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: question_responses question_responses_question_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_responses
    ADD CONSTRAINT question_responses_question_id_foreign FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- Name: question_responses question_responses_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: axiom
--

ALTER TABLE ONLY public.question_responses
    ADD CONSTRAINT question_responses_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: scores scores_player_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scores
    ADD CONSTRAINT scores_player_profile_id_fkey FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id);


--
-- Name: scores scores_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scores
    ADD CONSTRAINT scores_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: session_questions session_questions_question_cache_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions
    ADD CONSTRAINT session_questions_question_cache_id_fkey FOREIGN KEY (question_cache_id) REFERENCES public.question_cache(id) ON DELETE CASCADE;


--
-- Name: session_questions session_questions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_questions
    ADD CONSTRAINT session_questions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

GRANT ALL ON SCHEMA public TO axiom;


--
-- Name: TABLE question_cache; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.question_cache TO trivia_user;


--
-- Name: TABLE active_short_questions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.active_short_questions TO trivia_user;
GRANT ALL ON TABLE public.active_short_questions TO axiom;


--
-- Name: TABLE answers; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.answers TO trivia_user;


--
-- Name: SEQUENCE answers_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.answers_id_seq TO trivia_user;


--
-- Name: TABLE leaderboards; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.leaderboards TO trivia_user;


--
-- Name: TABLE player_profiles; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.player_profiles TO trivia_user;


--
-- Name: TABLE current_leaderboards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.current_leaderboards TO trivia_user;
GRANT ALL ON TABLE public.current_leaderboards TO axiom;


--
-- Name: TABLE game_rounds; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.game_rounds TO trivia_user;


--
-- Name: SEQUENCE game_rounds_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.game_rounds_id_seq TO trivia_user;


--
-- Name: TABLE knex_migrations; Type: ACL; Schema: public; Owner: trivia_user
--

GRANT ALL ON TABLE public.knex_migrations TO axiom;


--
-- Name: SEQUENCE knex_migrations_id_seq; Type: ACL; Schema: public; Owner: trivia_user
--

GRANT ALL ON SEQUENCE public.knex_migrations_id_seq TO axiom;


--
-- Name: TABLE knex_migrations_lock; Type: ACL; Schema: public; Owner: trivia_user
--

GRANT ALL ON TABLE public.knex_migrations_lock TO axiom;


--
-- Name: SEQUENCE knex_migrations_lock_index_seq; Type: ACL; Schema: public; Owner: trivia_user
--

GRANT ALL ON SEQUENCE public.knex_migrations_lock_index_seq TO axiom;


--
-- Name: SEQUENCE leaderboards_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.leaderboards_id_seq TO trivia_user;


--
-- Name: SEQUENCE player_profiles_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.player_profiles_id_seq TO trivia_user;


--
-- Name: TABLE player_statistics; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.player_statistics TO trivia_user;


--
-- Name: SEQUENCE player_statistics_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.player_statistics_id_seq TO trivia_user;


--
-- Name: TABLE players; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.players TO trivia_user;


--
-- Name: SEQUENCE players_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.players_id_seq TO trivia_user;


--
-- Name: SEQUENCE question_cache_id_seq; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON SEQUENCE public.question_cache_id_seq TO trivia_user;


--
-- Name: TABLE question_statistics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.question_statistics TO trivia_user;
GRANT ALL ON TABLE public.question_statistics TO axiom;


--
-- Name: TABLE scores; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scores TO trivia_user;
GRANT ALL ON TABLE public.scores TO axiom;


--
-- Name: SEQUENCE scores_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scores_id_seq TO trivia_user;
GRANT ALL ON SEQUENCE public.scores_id_seq TO axiom;


--
-- Name: TABLE session_questions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.session_questions TO axiom;
GRANT ALL ON TABLE public.session_questions TO trivia_user;


--
-- Name: SEQUENCE session_questions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.session_questions_id_seq TO axiom;
GRANT ALL ON SEQUENCE public.session_questions_id_seq TO trivia_user;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: axiom
--

GRANT ALL ON TABLE public.sessions TO trivia_user;


--
-- PostgreSQL database dump complete
--

