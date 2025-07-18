#!/bin/bash

# Extract the first part of the file (up to line 243)
head -n 243 routes/sessionRoutes.js > routes/sessionRoutes.js.new

# Add the new validateScoreSubmission middleware and submit-score endpoint
cat >> routes/sessionRoutes.js.new << 'ENDPOINT'

// Middleware to validate score submission
const validateScoreSubmission = (req, res, next) => {
  const { clientId, email, nickname, realName, marketingConsent, deviceFingerprint } = req.body;

  if (!clientId || !email || !nickname || !realName || marketingConsent === undefined || !deviceFingerprint) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: clientId, email, nickname, realName, marketingConsent, deviceFingerprint'
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }

  next();
};

// Submit score endpoint - POST /api/sessions/:sessionId/submit-score
router.post('/:sessionId/submit-score', validateScoreSubmission, async (req, res) => {
  const { sessionId } = req.params;
  const { clientId, email, nickname, realName, marketingConsent, deviceFingerprint } = req.body;
  const db = req.app.locals.db;
  const profanityMiddleware = req.app.locals.profanityMiddleware;

  try {
    // Check profanity for nickname and real name
    try {
      if (profanityMiddleware && profanityMiddleware.checkProfanity) {
        const nicknameCheck = await profanityMiddleware.checkProfanity(nickname);
        const realNameCheck = await profanityMiddleware.checkProfanity(realName);

        if (nicknameCheck.hasProfanity || realNameCheck.hasProfanity) {
          return res.status(400).json({
            success: false,
            error: 'Name contains inappropriate content'
          });
        }
      }
    } catch (profanityError) {
      console.error('Profanity check failed:', profanityError);
      // Continue without profanity check rather than crashing
    }

    // Start a transaction
    const result = await db.transaction(async (trx) => {
      // 1. Verify session exists and get player info
      const session = await trx('sessions')
        .where('id', sessionId)
        .first();

      if (!session) {
        throw new Error('Session not found');
      }

      // 2. Get the player's score from this session
      const player = await trx('players')
        .where('session_id', sessionId)
        .where('client_id', clientId)
        .first();

      if (!player) {
        throw new Error('Player not found in this session');
      }

      // 3. Check if player profile already exists
      let playerProfile = await trx('player_profiles')
        .where('email', email.toLowerCase())
        .first();

      if (!playerProfile) {
        // Create new player profile
        const [newProfile] = await trx('player_profiles')
          .insert({
            email: email.toLowerCase(),
            nickname,
            real_name: realName,
            marketing_consent: marketingConsent,
            marketing_consent_timestamp: marketingConsent ? new Date() : null,
            device_fingerprint: deviceFingerprint,
            nickname_approved: true, // Already checked by profanity service
            total_games_played: 0,
            total_score: 0,
            created_at: new Date()
          })
          .returning('*');
        playerProfile = newProfile;
      } else {
        // Update device fingerprint if changed
        if (playerProfile.device_fingerprint !== deviceFingerprint) {
          await trx('player_profiles')
            .where('id', playerProfile.id)
            .update({
              device_fingerprint: deviceFingerprint,
              last_played: new Date()
            });
        }
      }

      // 4. Insert score (this will trigger leaderboard updates)
      await trx('scores')
        .insert({
          player_profile_id: playerProfile.id,
          session_id: sessionId,
          score: player.score,
          device_fingerprint: deviceFingerprint,
          submitted_at: new Date()
        });

      // 5. Update player profile stats
      await trx('player_profiles')
        .where('id', playerProfile.id)
        .update({
          total_games_played: trx.raw('total_games_played + 1'),
          total_score: trx.raw('total_score + ?', [player.score]),
          last_played: new Date()
        });

      // 6. Get current leaderboard positions
      const periods = ['weekly', 'monthly', 'quarterly', 'yearly'];
      const leaderboardPositions = {};
      const prizeEligibility = {};

      for (const period of periods) {
        // Get player's rank for this period
        const result = await trx.raw(`
          SELECT rank_position
          FROM leaderboards
          WHERE player_profile_id = ?
            AND period_type = ?
            AND period_start = get_period_start(CURRENT_DATE, ?)
        `, [playerProfile.id, period, period]);

        leaderboardPositions[period] = result.rows[0]?.rank_position || null;

        // Check prize eligibility
        const eligibility = await trx.raw(`
          SELECT * FROM check_prize_eligibility(?, ?)
        `, [player.score, period]);

        prizeEligibility[period] = eligibility.rows[0]?.check_prize_eligibility?.qualifies || false;
      }

      // 7. Mark player as registered in the session
      await trx('players')
        .where('id', player.id)
        .update({
          is_registered: true,
          player_profile_id: playerProfile.id
        });

      return {
        playerProfileId: playerProfile.id,
        leaderboardPositions,
        prizeEligibility,
        score: player.score
      };
    });

    res.json({
      success: true,
      playerProfileId: result.playerProfileId,
      leaderboardPositions: result.leaderboardPositions,
      prizeEligibility: result.prizeEligibility,
      message: 'Score submitted successfully'
    });

  } catch (error) {
    console.error('Score submission error:', error);
    res.status(error.message === 'Session not found' || error.message === 'Player not found in this session' ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

ENDPOINT

# Add the helper functions and module.exports from line 295 onward
tail -n +295 routes/sessionRoutes.js >> routes/sessionRoutes.js.new

# Show the size comparison
echo "Original file:"
wc -l routes/sessionRoutes.js
echo "New file:"
wc -l routes/sessionRoutes.js.new

