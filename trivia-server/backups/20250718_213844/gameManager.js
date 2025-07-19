// gameManager.js - Complete fix for mobile experience and game flow
class GameManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.games = new Map();
    this.questionTimers = new Map();
    this.lightningTimers = new Map();
    this.fadeTimers = new Map();
    this.triviaAPIService = require('../services/triviaAPIService');
  }

  // Create a new game with questions
  createGame(sessionId, questions) {
    console.log(`[GameManager] Creating game for session ${sessionId} with ${questions.length} questions`);

    // FIX: Ensure all questions have correctAnswerIndex
    questions.forEach((q, index) => {
      if (q.correctAnswerIndex === undefined || q.correctAnswerIndex === null) {
        if (q.all_answers && q.correct_answer) {
          q.correctAnswerIndex = q.all_answers.findIndex(
            answer => answer === q.correct_answer
          );
          console.log(`[GameManager] Set correctAnswerIndex to ${q.correctAnswerIndex} for question ${index}`);
        }
      }
    });

    // Add extra questions for speed round (keeping for future use but not active)
    const lightningQuestions = this.generateLightningQuestions(20);

    this.games.set(sessionId, {
      sessionId,
      questions: [...questions, ...lightningQuestions],
      status: 'waiting',
      currentRound: 1,
      currentQuestion: 0,
      players: new Map(),
      playerNicknames: new Map(), // Store nicknames
      startedAt: null,
      showingIntro: false, // ADD THIS LINE - Flag to pause timeouts during intros
      roundScores: {
        1: new Map(),
        2: new Map(),
        3: new Map(),
        4: new Map() // Speed round
      },
      lightningRound: {
        questionsAnswered: 0,
        frozenPlayers: new Set(),
        startTime: null,
        currentQuestionIndex: 30,
        active: false
      }
    });

    return true;
  }

  // Add player to game
  addPlayer(sessionId, clientId, nickname) {
    const game = this.games.get(sessionId);
    if (!game) return false;

    game.playerNicknames.set(clientId, nickname);

    if (!game.players.has(clientId)) {
      game.players.set(clientId, {
        totalScore: 0,
        correctCount: 0,
        currentStreak: 0,
        longestStreak: 0,
        roundCorrect: { 1: 0, 2: 0, 3: 0, 4: 0 },
        hasAnswered: false,
        nickname: nickname
      });
    }

    // Emit updated player count and list to host
    this.emitPlayerUpdate(sessionId);
    return true;
  }

  // Emit player update to host
  emitPlayerUpdate(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) return;

    const playerList = Array.from(game.players.entries()).map(([clientId, player]) => ({
      clientId,
      nickname: player.nickname,
      score: player.totalScore
    }));

    this.io.to(sessionId).emit('PLAYER_UPDATE', {
      playerCount: game.players.size,
      players: playerList
    });
  }

  // Generate speed round questions
  generateLightningQuestions(count) {
    const questions = [];
    for (let i = 0; i < count; i++) {
      questions.push({
        id: `lightning_${i}`,
        text: `Speed Question ${i + 1}`,
        question: `Speed Question ${i + 1}`,
        correct_answer: 'Answer A',
        incorrect_answers: ['Answer B', 'Answer C', 'Answer D'],
        all_answers: ['Answer A', 'Answer B', 'Answer C', 'Answer D'],
        correctAnswerIndex: 0,
        difficulty: 'speed',
        category: 'Speed Round'
      });
    }
    return questions;
  }

  // Start the game with countdown
  startGame(sessionId) {
    console.log(`[GameManager] Starting game for session: ${sessionId}`);

    const game = this.games.get(sessionId);
    if (!game) {
      console.error(`[GameManager] No game found for session: ${sessionId}`);
      return false;
    }

    // Start countdown from 5
    let countdown = 5;
    const countdownInterval = setInterval(() => {
      this.io.to(sessionId).emit('COUNTDOWN', {
        count: countdown,
        message: countdown > 0 ? `Game starting in ${countdown}...` : 'GO!'
      });

      countdown--;

      if (countdown < 0) {
        clearInterval(countdownInterval);

        game.status = 'playing';
        game.startedAt = new Date();
        game.currentRound = 1;
        game.currentQuestion = 0;

        // CHANGED: Skip round intro - go straight to first question
        this.nextQuestion(sessionId);
      }
    }, 1000);

    return true;
  }

  // Show round intro with sponsor and countdown
  showRoundIntro(sessionId, roundNumber) {
    console.log(`[GameManager] Showing round ${roundNumber} intro for session ${sessionId}`);

    const game = this.games.get(sessionId);
    if (!game) return;

    // Set flag to indicate we're showing an intro
    game.showingIntro = true; // ADD THIS LINE

    const sponsors = {
      1: 'Sponsor A',
      2: 'Sponsor B',
      3: 'Sponsor C',
      4: 'RSN8TV' // Speed round sponsor
    };

    let countdown = 5;

    // Initial emit
    this.io.to(sessionId).emit('ROUND_INTRO', {
      round: roundNumber,
      sponsor: sponsors[roundNumber],
      difficulty: this.getDifficultyForRound(roundNumber),
      points: this.getBasePoints(roundNumber),
    });

    // Countdown interval
    const introInterval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(introInterval);

        // Clear the showingIntro flag
        game.showingIntro = false; // ADD THIS LINE

        // Start questions after intro
        this.nextQuestion(sessionId);
      }
    }, 1000);
  }

  // Move to next question
  nextQuestion(sessionId) {
    // FIX: Block if intro is showing - FIXED SYNTAX ERROR HERE
    if (this.games.get(sessionId)?.showingIntro === true) {
      console.log('[GameManager] nextQuestion BLOCKED - intro showing');
      return;
    }

    const game = this.games.get(sessionId);
    if (!game || game.status !== 'playing') {
      console.log(`[GameManager] Game not in playing state for session: ${sessionId}`);
      return;
    }

    // Don't start next question if we're showing an intro
    if (game.showingIntro) { // ADD THIS CHECK
      console.log(`[GameManager] Skipping nextQuestion - showing intro for session ${sessionId}`);
      return;
    }

    // REMOVED: Speed round handling - single round only

    // CHANGED: Single round logic - use currentQuestion directly
    const questionIndex = game.currentQuestion;

    if (questionIndex >= 10) { // CHANGED: End game after 10 questions
      this.endGame(sessionId);
      return;
    }

    const question = game.questions[questionIndex];
    if (!question) {
      console.error(`[GameManager] Question not found at index ${questionIndex}`);
      return;
    }

    // FIX: Ensure correctAnswerIndex is set before sending
    if (question.correctAnswerIndex === undefined || question.correctAnswerIndex === null) {
      if (question.all_answers && question.correct_answer) {
        question.correctAnswerIndex = question.all_answers.findIndex(
          answer => answer === question.correct_answer
        );
        console.log(`[GameManager] Question ${questionIndex} was missing correctAnswerIndex, calculated: ${question.correctAnswerIndex}`);
      }
    }

    // Clear any existing timers
    this.clearQuestionTimer(sessionId);
    this.clearFadeTimers(sessionId);

    // Prepare question data
    const questionData = {
      questionId: question.id || `q${questionIndex}`,
      question: question.text || question.question,
      answers: question.all_answers || [],
      category: question.category || 'General',
      difficulty: question.difficulty || this.getDifficultyForRound(game.currentRound),
      round: game.currentRound,
      questionNumber: game.currentQuestion + 1,
      totalQuestions: 10,
      timeLimit: this.getTimeLimit(game.currentRound),
      points: this.getBasePoints(game.currentRound),
      fadeAnswers: true
    };

    // Store current question info
    game.currentQuestionData = {
      ...question,
      correctAnswerIndex: question.correctAnswerIndex, // FIX: Ensure it's stored
      startTime: Date.now(),
      answered: new Set(),
      playerAnswers: new Map(), // Track each player's latest answer
      lockedAnswers: new Set(), // NEW: Track who has locked in their answer
      autoAdvanceStarted: false
    };

    console.log(`[GameManager] Question ready - correctAnswerIndex: ${game.currentQuestionData.correctAnswerIndex}`);

    // Reset hasAnswered flag for all players
    game.players.forEach(player => {
      player.hasAnswered = false;
    });

    // Emit question to all players and host
    this.io.to(sessionId).emit('QUESTION_READY', questionData);

    // Update host display
    this.emitGameState(sessionId);

    // Start question timer
    this.startQuestionTimer(sessionId);
  }

  // Emit current game state to host
  emitGameState(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) return;

    const playerScores = Array.from(game.players.entries()).map(([clientId, player]) => ({
      clientId,
      nickname: player.nickname,
      score: player.totalScore,
      hasAnswered: player.hasAnswered,
      streak: player.currentStreak
    }));

    this.io.to(sessionId).emit('GAME_STATE_UPDATE', {
      round: game.currentRound,
      question: game.currentQuestion + 1,
      playerScores: playerScores,
      isSpeedRound: game.currentRound === 4
    });
  }

  // Start timer for current question
  startQuestionTimer(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) return;

    const timeLimit = this.getTimeLimit(game.currentRound) * 1000;

    const timer = setTimeout(() => {
      console.log(`[GameManager] Time's up for question in session ${sessionId}`);
      this.handleQuestionTimeout(sessionId);
    }, timeLimit);

    this.questionTimers.set(sessionId, timer);

    // Start progressive answer fading for regular rounds
    if (game.currentRound <= 3) {
      this.startProgressiveFading(sessionId);
    }
  }

  // Start progressive fading of incorrect answers
  startProgressiveFading(sessionId) {
    const game = this.games.get(sessionId);
    if (!game || !game.currentQuestionData) return;

    const correctIndex = game.currentQuestionData.correctAnswerIndex;
    const totalAnswers = game.currentQuestionData.all_answers.length;

    // Get all incorrect answer indices
    const incorrectIndices = [];
    for (let i = 0; i < totalAnswers; i++) {
      if (i !== correctIndex) incorrectIndices.push(i);
    }

    // Shuffle incorrect indices
    const shuffled = [...incorrectIndices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // CHANGED: Adjusted fade timings for 18-second timer
    // Fade first incorrect answer at 10 seconds (8s into question)
    const firstFadeTimer = setTimeout(() => {
      this.io.to(sessionId).emit('FADE_ANSWERS', {
        fadeIndices: [shuffled[0]],
        keepIndices: [correctIndex, shuffled[1], shuffled[2]]
      });
    }, 8000); // 18s - 10s = 8s delay

    // Fade second incorrect answer at 5 seconds (13s into question)
    const secondFadeTimer = setTimeout(() => {
      this.io.to(sessionId).emit('FADE_ANSWERS', {
        fadeIndices: [shuffled[0], shuffled[1]],
        keepIndices: [correctIndex, shuffled[2]]
      });
    }, 13000); // 18s - 5s = 13s delay

    // Store timers for cleanup
    this.fadeTimers.set(sessionId, [firstFadeTimer, secondFadeTimer]);
  }

  // Clear fade timers
  clearFadeTimers(sessionId) {
    const timers = this.fadeTimers.get(sessionId);
    if (timers) {
      timers.forEach(timer => clearTimeout(timer));
      this.fadeTimers.delete(sessionId);
    }
  }

  // Clear question timer
  clearQuestionTimer(sessionId) {
    const timer = this.questionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.questionTimers.delete(sessionId);
    }
  }

  // Handle question timeout - PROCESS FINAL ANSWERS
  handleQuestionTimeout(sessionId) {
    const game = this.games.get(sessionId);

    // Don't process timeout if game doesn't exist or we're showing an intro
    if (!game || game.showingIntro) return;

    this.clearFadeTimers(sessionId);

    // Process all players - both those who answered and those who didn't
    game.players.forEach((playerStats, clientId) => {
      let finalResult;

      // Check if player answered
      const playerAnswer = game.currentQuestionData.playerAnswers?.get(clientId);

      if (playerAnswer) {
        // Player answered - calculate their final score
        const isCorrect = playerAnswer.answerIndex === game.currentQuestionData.correctAnswerIndex;

        // Calculate final score with the answer's response time
        const scoring = this.calculateScore(
          game.currentRound,
          isCorrect,
          playerAnswer.responseTime,
          this.getTimeLimit(game.currentRound) * 1000,
          playerStats.currentStreak || 0
        );

        // FIX: Update player stats properly
        playerStats.totalScore += scoring.finalScore;

        if (isCorrect) {
          playerStats.correctCount++;
          playerStats.currentStreak++;
          playerStats.longestStreak = Math.max(playerStats.longestStreak, playerStats.currentStreak);
          playerStats.roundCorrect[game.currentRound]++;
        } else {
          playerStats.currentStreak = 0;
        }

        finalResult = {
          isFinal: true,
          isCorrect,
          correctAnswerIndex: game.currentQuestionData.correctAnswerIndex,
          correctAnswerText: game.currentQuestionData.correct_answer,
          scoring: {
            ...scoring,
            responseTimeSeconds: (playerAnswer.responseTime / 1000).toFixed(1),
            timeLimitSeconds: this.getTimeLimit(game.currentRound)
          },
          playerStats: {
            totalScore: playerStats.totalScore,
            correctCount: playerStats.correctCount,
            currentStreak: playerStats.currentStreak
          }
        };
      } else {
        // Player didn't answer - apply penalty
        const penalty = this.getPenalty(game.currentRound);
        playerStats.totalScore -= penalty;
        playerStats.currentStreak = 0;

        finalResult = {
          isFinal: true,
          isCorrect: false,
          correctAnswerIndex: game.currentQuestionData.correctAnswerIndex,
          correctAnswerText: game.currentQuestionData.correct_answer,
          scoring: {
            basePoints: 0,
            timeBonus: 0,
            penaltyPoints: -penalty,
            streakBonus: 0,
            finalScore: -penalty,
            responseTimeSeconds: '0',
            timeLimitSeconds: this.getTimeLimit(game.currentRound),
            breakdown: `No answer: -${penalty} points`
          },
          playerStats: {
            totalScore: playerStats.totalScore,
            correctCount: playerStats.correctCount,
            currentStreak: 0
          }
        };
      }

      // Send final result to each player (assuming they're in their clientId room)
      this.io.to(clientId).emit('ANSWER_RESULT', finalResult);
    });

    // Emit time up event to all
    this.io.to(sessionId).emit('TIME_UP', {
      correctAnswer: game.currentQuestionData.correctAnswerIndex || 0,
      correctAnswerText: game.currentQuestionData.correct_answer
    });

    // Auto-advance after timeout
    setTimeout(() => {
      this.moveToNextQuestion(sessionId);
    }, 3500); // Give players time to see results
  }

  // Move to next question or round
  moveToNextQuestion(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) return;

    game.currentQuestion++;

    // CHANGED: Simplified logic for single round
    if (game.currentQuestion >= 10) {
      // End game after 10 questions
      this.endGame(sessionId);
    } else {
      // Next question
      this.nextQuestion(sessionId);
    }
  }

  // Submit answer - NOW LOCKS ANSWERS AND CHECKS FOR EARLY END
  async submitAnswer(sessionId, clientId, answerData) {
    const game = this.games.get(sessionId);
    if (!game || !game.currentQuestionData) {
      return { error: 'No active question' };
    }

    // NEW: Check if this player has already locked their answer
    if (game.currentQuestionData.lockedAnswers.has(clientId)) {
      return { error: 'Answer already locked', locked: true };
    }

    // Track player's answers (latest submission wins)
    if (!game.currentQuestionData.playerAnswers) {
      game.currentQuestionData.playerAnswers = new Map();
    }

    const responseTime = Date.now() - game.currentQuestionData.startTime;
    const timeLimit = this.getTimeLimit(game.currentRound) * 1000;

    // Store the answer submission
    game.currentQuestionData.playerAnswers.set(clientId, {
      answerIndex: answerData.answerIndex,
      responseTime: responseTime,
      submittedAt: Date.now()
    });

    // NEW: Lock this answer
    game.currentQuestionData.lockedAnswers.add(clientId);

    // Mark that this player has participated (for UI updates)
    game.currentQuestionData.answered.add(clientId);

    const playerStats = game.players.get(clientId);
    playerStats.hasAnswered = true;

    // Emit answer confirmation (not final result)
    this.io.to(clientId).emit('ANSWER_UPDATE', {
      isPreview: true,
      selectedAnswer: answerData.answerIndex,
      canChange: false,  // CHANGED: No more changes allowed
      locked: true,
      timeRemaining: Math.max(0, timeLimit - responseTime)
    });

    // Update host display to show player has answered
    this.emitGameState(sessionId);

    // NEW: Check if all players have answered
    const totalPlayers = game.players.size;
    const answeredPlayers = game.currentQuestionData.lockedAnswers.size;

    console.log(`[GameManager] ${answeredPlayers}/${totalPlayers} players have answered`);

    if (answeredPlayers === totalPlayers) {
      console.log(`[GameManager] All players answered - ending question early`);
      
      // Clear the timer to prevent double processing
      this.clearQuestionTimer(sessionId);
      
      // End the question immediately
      this.handleQuestionTimeout(sessionId);
    }

    return {
      success: true,
      message: 'Answer locked in',
      locked: true
    };
  }

  // Calculate score with enhanced streak bonuses
  calculateScore(round, isCorrect, responseTimeMs, timeLimitMs, currentStreak = 0) {
    const basePoints = this.getBasePoints(round);
    const penalty = this.getPenalty(round);

    if (!isCorrect) {
      return {
        basePoints: 0,
        timeBonus: 0,
        penaltyPoints: round === 4 ? 0 : -penalty,
        streakBonus: 0,
        finalScore: round === 4 ? 0 : -penalty,
        breakdown: round === 4 ? 'Wrong answer - FROZEN!' : `Wrong answer: -${penalty} points`
      };
    }

    // Calculate time bonus (up to 50% extra for instant answers)
    const responseTimeSeconds = responseTimeMs / 1000;
    const timeLimitSeconds = timeLimitMs / 1000;

    const effectiveResponseTime = Math.min(responseTimeMs, timeLimitMs);
    const timeRatio = Math.max(0, 1 - (effectiveResponseTime / timeLimitMs));
    const timeBonus = round === 4 ? 0 : Math.floor(basePoints * 0.5 * timeRatio);
    const timeBonusPercentage = Math.floor(timeRatio * 50);

    // Calculate streak bonus
    let streakBonus = 0;
    let nextStreak = currentStreak + 1;

    if (nextStreak === 3) {
      streakBonus = 50;  // FIX: Correct values from handoff doc
    } else if (nextStreak === 5) {
      streakBonus = 100;
    } else if (nextStreak === 10) {
      streakBonus = 300;
    }

    const finalScore = basePoints + timeBonus + streakBonus;

    return {
      basePoints,
      timeBonus,
      penaltyPoints: 0,
      streakBonus,
      finalScore,
      responseTimeSeconds: responseTimeSeconds.toFixed(1),
      timeBonusPercentage,
      breakdown: `Base: ${basePoints} pts + Time bonus: ${timeBonus} pts + Streak bonus: ${streakBonus} pts = ${finalScore} pts`
    };
  }

  // End game
  async endGame(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) return;

    game.status = 'completed';
    this.clearQuestionTimer(sessionId);
    this.clearFadeTimers(sessionId);

    // Update database
    try {
      await this.db('sessions')
        .where({ id: sessionId })
        .update({
          status: 'completed',
          ended_at: new Date()
        });
    } catch (error) {
      console.error(`[GameManager] Error updating session end time:`, error);
    }

    // CHANGED: Calculate final scores for single round
    const totalQuestions = 10; // Only 10 questions now
    const finalScores = Array.from(game.players.entries()).map(([clientId, stats]) => ({
      clientId,
      nickname: stats.nickname,
      totalScore: stats.totalScore,
      correctCount: stats.correctCount,
      accuracy: totalQuestions > 0 ? (stats.correctCount / totalQuestions) * 100 : 0,
      longestStreak: stats.longestStreak,
      perfectRounds: [] // No perfect rounds in single-round format
    }));

    // Sort by score
    finalScores.sort((a, b) => b.totalScore - a.totalScore);

    console.log(`[GameManager] Game complete for session ${sessionId}`);

    // Emit game complete event
    this.io.to(sessionId).emit('GAME_COMPLETE', {
      finalScores,
      sessionId
    });

    // Clean up after delay
    setTimeout(() => {
      this.games.delete(sessionId);
    }, 300000); // Keep for 5 minutes
  }

  // Create a new game with existing players
  async playAgain(oldSessionId) {
    const oldGame = this.games.get(oldSessionId);
    if (!oldGame) {
      return { error: 'Original game not found' };
    }

    try {
      // Create new session in database
      const crypto = require('crypto');
      const newSessionId = crypto.randomUUID();
      const roomCode = this.generateRoomCode();

      await this.db('sessions').insert({
        id: newSessionId,
        room_code: roomCode,
        host_id: 'host-' + newSessionId,
        is_active: true,
        status: 'waiting',
        created_at: new Date()
      });

      // Fetch fresh questions
      const questions = await this.triviaAPIService.fetchQuestions(newSessionId, 10);

      // Create new game with same players
      this.createGame(newSessionId, questions);
      const newGame = this.games.get(newSessionId);

      // Copy players to new game
      oldGame.players.forEach((playerData, clientId) => {
        newGame.players.set(clientId, {
          totalScore: 0,
          correctCount: 0,
          currentStreak: 0,
          longestStreak: 0,
          roundCorrect: { 1: 0, 2: 0, 3: 0, 4: 0 },
          hasAnswered: false,
          nickname: playerData.nickname
        });
      });

      // Move all sockets to new room
      const oldRoom = this.io.sockets.adapter.rooms.get(oldSessionId);
      if (oldRoom) {
        oldRoom.forEach(socketId => {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            // Leave old room
            socket.leave(oldSessionId);
            // Join new room
            socket.join(newSessionId);
            // Update socket session info
            socket.sessionId = newSessionId;
          }
        });
      }

      // Notify all clients about the new game
      this.io.to(newSessionId).emit('PLAY_AGAIN', {
        newSessionId,
        roomCode,
        message: 'Starting new game with same players!'
      });

      // Clean up old game
      this.games.delete(oldSessionId);

      return {
        success: true,
        newSessionId,
        roomCode
      };
    } catch (error) {
      console.error('Error creating play again session:', error);
      return { error: 'Failed to create new game' };
    }
  }

  // Generate a 4-character room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Helper methods
  getTimeLimit(round) {
    // CHANGED: Always return 18 seconds
    return 30;
  }

  getBasePoints(round) {
    // CHANGED: Always return 100 points
    return 100;
  }

  getPenalty(round) {
    // CHANGED: Always return 25 points penalty
    return 25;
  }

  getDifficultyForRound(round) {
    const difficulties = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'speed' };
    return difficulties[round] || 'medium';
  }

  // Get game state
  getGameState(sessionId) {
    return this.games.get(sessionId);
  }
}

module.exports = GameManager;
