// sessionRoutes.js - Session management routes with host support
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const knex = require('../db/connection');
const triviaAPIService = require('../services/triviaAPIService');
const { getIO } = require('../ws/wsServer');
const GameManager = require('../services/gameManager');

// Generate random room code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// Create new session
router.post('/create', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const roomCode = generateRoomCode();
    
    // Create session in database
    await knex('sessions').insert({
      id: sessionId,
      room_code: roomCode,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      status: 'waiting'
    });

    // Fetch questions
    let questions;
    try {
      questions = await triviaAPIService.fetchQuestions(sessionId, 30);
    } catch (error) {
      console.error('Error fetching questions:', error);
      // Use fallback questions if API fails - FIXED: was sessionID, now sessionId
      questions = generateFallbackQuestions(sessionId, 30);
    }

    // Create game in GameManager
    const io = getIO();
    const gameManager = new GameManager(io, knex);
    gameManager.createGame(sessionId, questions);

    res.json({
      sessionId,
      roomCode,
      hostUrl: `/host/${sessionId}`,
      joinUrl: `/join/${sessionId}`,
      qrCodeData: `${req.protocol}://${req.get('host')}/join/${sessionId}`
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session details
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await knex('sessions')
      .where({ id: sessionId })
      .first();
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session.id,
      room_code: session.room_code,
      status: session.status,
      created_at: session.created_at,
      expires_at: session.expires_at
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Join session
router.post('/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { nickname, playerId } = req.body;
    
    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    // Check if session exists
    const session = await knex('sessions')
      .where({ id: sessionId })
      .first();
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'waiting' && session.status !== 'playing') {
      return res.status(400).json({ error: 'Session is not accepting new players' });
    }

    // Add player to game manager
    const io = getIO();
    const gameManager = new GameManager(io, knex);
    const success = gameManager.addPlayer(sessionId, playerId, nickname);

    res.json({
      success: true,
      playerId,
      sessionId,
      nickname: nickname.trim()
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// Submit score (post-game registration)
router.post('/:sessionId/submit-score', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { real_name, email, nickname, consent, score, playerId } = req.body;
    
    // Validate required fields
    if (!real_name || !email || !nickname || consent === undefined) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // TODO: Add profanity filter check here
    // const isProfane = await checkProfanity(real_name, nickname);
    // if (isProfane) {
    //   return res.status(400).json({ error: 'Inappropriate content detected' });
    // }

    // Check if player already registered
    const existingPlayer = await knex('players')
      .where({ email })
      .first();
    
    let player;
    if (existingPlayer) {
      player = existingPlayer;
    } else {
      // Create new player
      const [newPlayer] = await knex('players')
        .insert({
          real_name,
          email,
          nickname,
          consent,
          created_at: new Date()
        })
        .returning('*');
      player = newPlayer;
    }

    // Save score
    await knex('scores').insert({
      player_id: player.id,
      session_id: sessionId,
      score,
      submitted_at: new Date()
    });

    // Check if qualified for prizes (example threshold)
    const PRIZE_THRESHOLD = 1500;
    const qualified = score >= PRIZE_THRESHOLD;

    res.json({
      success: true,
      qualified,
      message: qualified ? 'Congratulations! You qualify for prizes!' : 'Thanks for playing!'
    });
  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// Get questions for a session
router.get('/:sessionId/questions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get questions from game manager
    const io = getIO();
    const gameManager = new GameManager(io, knex);
    const gameState = gameManager.getGameState(sessionId);
    
    if (!gameState || !gameState.questions) {
      return res.status(404).json({ error: 'Questions not found for session' });
    }

    // Return questions without answers for security
    const questionsWithoutAnswers = gameState.questions.map(q => ({
      id: q.id,
      text: q.text || q.question,
      category: q.category,
      difficulty: q.difficulty,
      options: q.all_answers || []
    }));

    res.json({
      questions: questionsWithoutAnswers,
      totalQuestions: questionsWithoutAnswers.length
    });
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// Fallback questions generator
function generateFallbackQuestions(sessionId, count) {
  const questions = [];
  const difficulties = ['easy', 'medium', 'hard'];
  const questionsPerDifficulty = Math.floor(count / 3);
  
  // Sample trivia questions for each difficulty
  const questionBank = {
    easy: [
      {
        text: "What is the capital of France?",
        correct: "Paris",
        incorrect: ["London", "Berlin", "Madrid"]
      },
      {
        text: "Which planet is known as the Red Planet?",
        correct: "Mars",
        incorrect: ["Venus", "Jupiter", "Saturn"]
      },
      {
        text: "How many continents are there?",
        correct: "7",
        incorrect: ["5", "6", "8"]
      },
      {
        text: "What is 2 + 2?",
        correct: "4",
        incorrect: ["3", "5", "6"]
      },
      {
        text: "Which ocean is the largest?",
        correct: "Pacific",
        incorrect: ["Atlantic", "Indian", "Arctic"]
      }
    ],
    medium: [
      {
        text: "Who painted the Mona Lisa?",
        correct: "Leonardo da Vinci",
        incorrect: ["Pablo Picasso", "Vincent van Gogh", "Michelangelo"]
      },
      {
        text: "What year did World War II end?",
        correct: "1945",
        incorrect: ["1944", "1946", "1943"]
      },
      {
        text: "What is the smallest country in the world?",
        correct: "Vatican City",
        incorrect: ["Monaco", "San Marino", "Liechtenstein"]
      },
      {
        text: "How many bones are in the human body?",
        correct: "206",
        incorrect: ["208", "204", "210"]
      },
      {
        text: "What is the chemical symbol for gold?",
        correct: "Au",
        incorrect: ["Go", "Gd", "Ag"]
      }
    ],
    hard: [
      {
        text: "What is the speed of light in meters per second?",
        correct: "299,792,458",
        incorrect: ["186,282", "300,000,000", "299,000,000"]
      },
      {
        text: "Who wrote 'One Hundred Years of Solitude'?",
        correct: "Gabriel García Márquez",
        incorrect: ["Jorge Luis Borges", "Pablo Neruda", "Isabel Allende"]
      },
      {
        text: "What is the capital of Kazakhstan?",
        correct: "Nur-Sultan (Astana)",
        incorrect: ["Almaty", "Bishkek", "Tashkent"]
      },
      {
        text: "In what year was the first iPhone released?",
        correct: "2007",
        incorrect: ["2006", "2008", "2005"]
      },
      {
        text: "What is the deepest point in the ocean?",
        correct: "Mariana Trench",
        incorrect: ["Puerto Rico Trench", "Java Trench", "Philippine Trench"]
      }
    ]
  };
  
  difficulties.forEach((difficulty, diffIndex) => {
    const bank = questionBank[difficulty];
    for (let i = 0; i < questionsPerDifficulty; i++) {
      const questionData = bank[i % bank.length];
      const allAnswers = [questionData.correct, ...questionData.incorrect];
      
      // Shuffle answers
      for (let j = allAnswers.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [allAnswers[j], allAnswers[k]] = [allAnswers[k], allAnswers[j]];
      }
      
      const correctIndex = allAnswers.indexOf(questionData.correct);
      
      questions.push({
        id: `fallback_${diffIndex * questionsPerDifficulty + i + 1}`,
        text: questionData.text,
        question: questionData.text,
        correct_answer: questionData.correct,
        incorrect_answers: questionData.incorrect,
        all_answers: allAnswers,
        correctAnswerIndex: correctIndex,
        category: 'General Knowledge',
        difficulty: difficulty,
        type: 'multiple',
        source: 'fallback'
      });
    }
  });
  
  return questions;
}

module.exports = router;

