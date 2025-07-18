// sessionRoutes.js - Session management routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Create session endpoint
router.post('/create', async (req, res) => {
  try {
    const { hostId } = req.body;

    if (!hostId) {
      return res.status(400).json({
        success: false,
        error: 'Host ID is required'
      });
    }

    const db = req.app.locals.db;
    const gameManager = req.app.locals.gameManager;

    // Generate session details
    const sessionId = uuidv4();
    const roomCode = generateRoomCode();
    const baseUrl = process.env.BASE_URL || 'https://trivia.rsn8tv.com';
    const joinUrl = `${baseUrl}/join/${sessionId}`;

    // Generate QR code
    const qrCodeData = await QRCode.toDataURL(joinUrl);

    // Create session in database
    await db('sessions').insert({
      id: sessionId,
      host_id: hostId,
      room_code: roomCode,
      qr_code_data: qrCodeData,
      status: 'waiting',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 3600000) // 1 hour
    });

    console.log(`Session created: ${sessionId}`);

    // Fetch questions for the session
    try {
      console.log(`Fetching questions for session ${sessionId}...`);

      // Use the existing trivia API service if available
      const triviaAPIService = req.app.locals.triviaAPIService;
      let questions = [];

      if (triviaAPIService && triviaAPIService.fetchQuestions) {
        questions = await triviaAPIService.fetchQuestions(sessionId, 10);
      } else {
        // Use fallback questions
        console.log('Using fallback questions');
        questions = generateFallbackQuestions();
      }

      // Cache questions in memory if cache service exists
      const cache = req.app.locals.cache;
      if (cache) {
        await cache.set(`questions:${sessionId}`, questions, 3600);
        console.log(`Cached ${questions.length} questions for session ${sessionId}`);
      }

      // Create game in GameManager with questions
      if (gameManager) {
        gameManager.createGame(sessionId, questions);
        console.log(`Game created in GameManager for session ${sessionId}`);
      } else {
        console.error('GameManager not initialized!');
      }
    } catch (questionError) {
      console.error('Error fetching questions:', questionError);
      // Use fallback questions
      const fallbackQuestions = generateFallbackQuestions();

      if (gameManager) {
        gameManager.createGame(sessionId, fallbackQuestions);
      }
    }

    const wsUrl = process.env.WS_URL || 'wss://trivia.rsn8tv.com';

    res.json({
      success: true,
      sessionId,
      roomCode,
      qrCode: qrCodeData,
      joinUrl,
      wsUrl: `${wsUrl}?sessionId=${sessionId}&role=host`
    });

  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
});

// Join session endpoint
router.post('/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { playerId, nickname } = req.body;

    if (!playerId || !nickname) {
      return res.status(400).json({
        success: false,
        error: 'Player ID and nickname are required'
      });
    }

    const db = req.app.locals.db;
    const profanityMiddleware = req.app.locals.profanityMiddleware;

    // Check if session exists and is active
    const session = await db('sessions')
      .where({ id: sessionId })
      .first();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    // Check profanity
    try {
      if (profanityMiddleware && profanityMiddleware.checkProfanity) {
        const profanityCheck = await profanityMiddleware.checkProfanity(nickname);
        if (profanityCheck.hasProfanity) {
          return res.status(400).json({
            success: false,
            error: profanityCheck.message || 'Nickname contains inappropriate content'
          });
        }
      }
    } catch (profanityError) {
      console.error('Profanity check failed:', profanityError);
      // Continue without profanity check rather than crashing
    }

    // Check if player already exists
    const existingPlayer = await db('players')
      .where({ session_id: sessionId, client_id: playerId })
      .first();

    if (existingPlayer) {
      const wsUrl = process.env.WS_URL || 'wss://trivia.rsn8tv.com';
      return res.json({
        success: true,
        playerId: existingPlayer.client_id,
        nickname: existingPlayer.temporary_name,
        playerNumber: existingPlayer.player_number,
        isFirstPlayer: existingPlayer.player_number === 1,
        wsUrl: `${wsUrl}?sessionId=${sessionId}&role=player&clientId=${playerId}`
      });
    }

    // Get current player count
    const playerCount = await db('players')
      .where({ session_id: sessionId })
      .count('* as count')
      .first();

    const currentPlayerNumber = parseInt(playerCount.count) + 1;

    // Add player to session
    await db('players').insert({
      session_id: sessionId,
      client_id: playerId,
      temporary_name: nickname,
      // player_number not in schema
      created_at: new Date(),
      qr_scan_timestamp: new Date()
    });

    const wsUrl = process.env.WS_URL || 'wss://trivia.rsn8tv.com';

    res.json({
      success: true,
      playerId,
      nickname,
      playerNumber: currentPlayerNumber,
      isFirstPlayer: currentPlayerNumber === 1,
      wsUrl: `${wsUrl}?sessionId=${sessionId}&role=player&clientId=${playerId}`
    });

  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join session'
    });
  }
});

// Get session questions (for testing)
router.get('/:sessionId/questions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const cache = req.app.locals.cache;
    let questions = [];

    if (cache) {
      questions = await cache.get(`questions:${sessionId}`);
    }

    if (!questions || questions.length === 0) {
      const gameManager = req.app.locals.gameManager;
      if (gameManager) {
        const game = gameManager.getGameState(sessionId);
        questions = game?.questions || [];
      }
    }

    if (!questions || questions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No questions found for session'
      });
    }

    res.json({
      success: true,
      count: questions.length,
      questions: questions.slice(0, 3) // Return first 3 for testing
    });

  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});


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

// Helper function to generate room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper function to generate fallback questions
//function generateFallbackQuestions() {
//  const questions = [];
//  const difficulties = ['easy', 'medium', 'hard'];
//
//  for (let round = 1; round <= 3; round++) {
//    for (let q = 1; q <= 10; q++) {
//      questions.push({
//        id: `r${round}q${q}`,
//        question: `Round ${round} Question ${q}: What is the answer?`,
//        answers: ['Answer A', 'Answer B', 'Answer C', 'Answer D'],
//        correctAnswerIndex: Math.floor(Math.random() * 4),
//        category: 'General',
 //       difficulty: difficulties[round - 1],
//        text: `Round ${round} Question ${q}: What is the answer?` // Alternative property name
//      });
//    }
//  }
//
//  return questions;
//}

// Helper function to generate fallback questions
function generateFallbackQuestions() {
  const questions = [];

  // Generate 10 questions for single round
  for (let q = 1; q <= 10; q++) {
    const correctAnswer = 'Answer A';
    const incorrectAnswers = ['Answer B', 'Answer C', 'Answer D'];
    const allAnswers = [correctAnswer, ...incorrectAnswers];

    questions.push({
      id: `q${q}`,
      question: `Question ${q}: What is the answer?`,
      text: `Question ${q}: What is the answer?`,
      answers: allAnswers,
      all_answers: allAnswers,
      correct_answer: correctAnswer,
      incorrect_answers: incorrectAnswers,
      correctAnswerIndex: 0,
      category: 'General',
      difficulty: 'medium'
    });
  }

  return questions;
}
module.exports = router;
