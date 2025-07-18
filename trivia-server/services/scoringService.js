// trivia-server/services/scoringService.js
const db = require('../db/connection');

const ROUND_CONFIG = {
  1: {
    basePoints: 100,
    timeLimit: 15,
    difficulty: 'easy',
    wrongAnswerPenalty: -25
  },
  2: {
    basePoints: 200,
    timeLimit: 12,
    difficulty: 'medium',
    wrongAnswerPenalty: -50
  },
  3: {
    basePoints: 300,
    timeLimit: 10,
    difficulty: 'hard',
    wrongAnswerPenalty: -75
  }
};

const STREAK_BONUSES = {
  3: 50,   // 3 in a row
  5: 100,  // 5 in a row
  7: 200,  // 7 in a row
  10: 500  // Perfect round
};

const PERFECT_ROUND_BONUS = {
  1: 250,  // Easy perfect round
  2: 500,  // Medium perfect round
  3: 1000  // Hard perfect round
};

async function calculateQuestionScore(round, responseTimeMs, isCorrect, playerId, sessionId) {
  const config = ROUND_CONFIG[round];
  const responseTimeSeconds = responseTimeMs / 1000;

  // Get current streak
  const currentStreak = await getCurrentStreak(playerId, sessionId);
  
  let scoreResult = {
    basePoints: 0,
    timeBonus: 0,
    penaltyPoints: 0,
    streakBonus: 0,
    finalScore: 0,
    speedPercentage: 0,
    streakCount: 0,
    responseTimeSeconds
  };

  if (!isCorrect) {
    // Wrong answer penalty
    scoreResult.penaltyPoints = config.wrongAnswerPenalty;
    scoreResult.finalScore = config.wrongAnswerPenalty;
    scoreResult.streakCount = 0; // Reset streak
    return scoreResult;
  }

  // Too slow - no points but no penalty
  if (responseTimeSeconds > config.timeLimit) {
    scoreResult.streakCount = 0; // Reset streak
    return scoreResult;
  }

  // Calculate base points
  scoreResult.basePoints = config.basePoints;

  // Calculate time bonus (up to 50% extra for instant answers)
  const timeRemaining = config.timeLimit - responseTimeSeconds;
  scoreResult.speedPercentage = (timeRemaining / config.timeLimit) * 100;
  const speedMultiplier = timeRemaining / config.timeLimit;
  scoreResult.timeBonus = Math.floor(config.basePoints * speedMultiplier * 0.5);

  // Update streak
  scoreResult.streakCount = currentStreak + 1;

  // Calculate streak bonus
  for (const [streakLength, bonus] of Object.entries(STREAK_BONUSES).reverse()) {
    if (scoreResult.streakCount >= parseInt(streakLength)) {
      scoreResult.streakBonus = bonus;
      break;
    }
  }

  // Check for comeback bonus (20% extra if previous answer was wrong)
  const previousAnswer = await getPreviousAnswer(playerId, sessionId);
  if (previousAnswer && !previousAnswer.is_correct) {
    const comebackBonus = Math.floor((scoreResult.basePoints + scoreResult.timeBonus) * 0.2);
    scoreResult.streakBonus += comebackBonus;
  }

  // Check for clutch bonus (30% extra for answering in last 2 seconds)
  if (timeRemaining <= 2 && timeRemaining > 0) {
    const clutchBonus = Math.floor((scoreResult.basePoints + scoreResult.timeBonus) * 0.3);
    scoreResult.streakBonus += clutchBonus;
  }

  // Calculate final score
  scoreResult.finalScore = scoreResult.basePoints + 
                          scoreResult.timeBonus + 
                          scoreResult.penaltyPoints + 
                          scoreResult.streakBonus;

  return scoreResult;
}

async function getCurrentStreak(playerId, sessionId) {
  // Get all answers for this player in order
  const answers = await db('answers')
    .where({ 
      player_id: playerId,
      session_id: sessionId 
    })
    .orderBy('question_index', 'desc')
    .limit(10);

  let streak = 0;
  for (const answer of answers) {
    if (answer.is_correct && answer.final_score > 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

async function getPreviousAnswer(playerId, sessionId) {
  return await db('answers')
    .where({ 
      player_id: playerId,
      session_id: sessionId 
    })
    .orderBy('question_index', 'desc')
    .first();
}

async function calculateRoundBonus(playerId, sessionId, round) {
  // Check if player got all 10 questions correct in the round
  const roundStart = (round - 1) * 10;
  const roundEnd = round * 10;
  
  const answers = await db('answers')
    .where({ 
      player_id: playerId,
      session_id: sessionId 
    })
    .whereBetween('question_index', [roundStart, roundEnd - 1])
    .select('is_correct');

  const allCorrect = answers.length === 10 && 
                     answers.every(a => a.is_correct);

  if (allCorrect) {
    return PERFECT_ROUND_BONUS[round];
  }

  return 0;
}

async function getPlayerSpeedRank(sessionId, questionIndex, responseTimeMs) {
  // Get all response times for this question
  const responses = await db('answers')
    .where({ 
      session_id: sessionId,
      question_index: questionIndex 
    })
    .select('response_time_ms')
    .orderBy('response_time_ms', 'asc');

  const rank = responses.findIndex(r => r.response_time_ms >= responseTimeMs) + 1;
  return rank || responses.length + 1;
}

async function calculateFinalGameScore(playerId, sessionId) {
  const stats = await db('player_statistics')
    .where({ 
      player_id: playerId,
      session_id: sessionId 
    })
    .first();

  if (!stats) return 0;

  let totalScore = stats.total_score || 0;

  // Add perfect round bonuses
  for (let round = 1; round <= 3; round++) {
    if (stats[`round_${round}_perfect`]) {
      totalScore += PERFECT_ROUND_BONUS[round];
    }
  }

  // Special achievements
  const achievements = [];

  // Speed Demon - all answers under 3 seconds
  const fastAnswers = await db('answers')
    .where({ 
      player_id: playerId,
      session_id: sessionId,
      is_correct: true
    })
    .where('response_time_ms', '<', 3000)
    .count('id as count');

  if (fastAnswers[0].count === stats.total_correct) {
    totalScore += 500;
    achievements.push({
      type: 'SPEED_DEMON',
      bonus: 500,
      description: 'Lightning fast reflexes!'
    });
  }

  // Perfect Game - all 30 questions correct
  if (stats.total_correct === 30) {
    totalScore += 1000;
    achievements.push({
      type: 'PERFECT_GAME',
      bonus: 1000,
      description: 'Flawless victory!'
    });
  }

  return {
    totalScore,
    achievements,
    breakdown: {
      baseScore: stats.total_score,
      perfectRoundBonuses: [
        stats.round_1_perfect ? PERFECT_ROUND_BONUS[1] : 0,
        stats.round_2_perfect ? PERFECT_ROUND_BONUS[2] : 0,
        stats.round_3_perfect ? PERFECT_ROUND_BONUS[3] : 0
      ],
      achievementBonuses: achievements.reduce((sum, a) => sum + a.bonus, 0)
    }
  };
}

// Scoring validation to prevent cheating
function validateResponseTime(questionStartTime, clientResponseTime, serverTime) {
  const serverResponseTime = serverTime - questionStartTime;
  const timeDifference = Math.abs(serverResponseTime - clientResponseTime);
  
  // Allow 500ms variance for network latency
  if (timeDifference > 500) {
    console.warn('Suspicious response time detected:', {
      client: clientResponseTime,
      server: serverResponseTime,
      difference: timeDifference
    });
    
    // Use server time as source of truth
    return serverResponseTime;
  }
  
  return Math.min(clientResponseTime, serverResponseTime);
}

// Maximum possible scores
function getMaximumPossibleScore() {
  let maxScore = 0;
  
  // Perfect play with instant answers
  for (let round = 1; round <= 3; round++) {
    const config = ROUND_CONFIG[round];
    // Base points + 50% time bonus for 10 questions
    const roundMax = (config.basePoints * 1.5) * 10;
    // Add perfect round bonus
    maxScore += roundMax + PERFECT_ROUND_BONUS[round];
  }
  
  // Add streak bonuses (10 correct = 500 bonus per round)
  maxScore += STREAK_BONUSES[10] * 3;
  
  // Add special achievements
  maxScore += 500; // Speed Demon
  maxScore += 1000; // Perfect Game
  
  return maxScore; // Approximately 6,000+ points
}

module.exports = {
  calculateQuestionScore,
  calculateRoundBonus,
  calculateFinalGameScore,
  getPlayerSpeedRank,
  validateResponseTime,
  getMaximumPossibleScore,
  ROUND_CONFIG,
  STREAK_BONUSES,
  PERFECT_ROUND_BONUS
};
