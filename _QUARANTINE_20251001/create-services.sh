#!/bin/bash

cd /home/ubuntu/rsn8tv-trivia/trivia-server
mkdir -p services

# triviaApiService.js
cat > services/triviaApiService.js << 'EOF'
async function generateQuestionSet(config) {
  // For now, return empty question set
  return { questions: [], source: 'fallback' };
}

async function initializeTriviaCache() {
  console.log('Trivia cache initialized (mock)');
}

async function getCategories() {
  return ['General', 'Science', 'History', 'Geography'];
}

module.exports = {
  generateQuestionSet,
  initializeTriviaCache,
  getCategories
};
EOF

# redisService.js
cat > services/redisService.js << 'EOF'
function getRedisClient() {
  // Mock Redis client for now
  return {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1
  };
}

module.exports = { getRedisClient };
EOF

# scoringService.js
cat > services/scoringService.js << 'EOF'
const ROUND_CONFIG = {
  1: { basePoints: 100, timeLimit: 15, difficulty: 'easy', wrongAnswerPenalty: -25 },
  2: { basePoints: 200, timeLimit: 12, difficulty: 'medium', wrongAnswerPenalty: -50 },
  3: { basePoints: 300, timeLimit: 10, difficulty: 'hard', wrongAnswerPenalty: -75 }
};

async function calculateQuestionScore(round, responseTimeMs, isCorrect) {
  const config = ROUND_CONFIG[round];
  if (!isCorrect) {
    return {
      basePoints: 0,
      timeBonus: 0,
      penaltyPoints: config.wrongAnswerPenalty,
      streakBonus: 0,
      finalScore: config.wrongAnswerPenalty,
      speedPercentage: 0,
      streakCount: 0
    };
  }
  
  return {
    basePoints: config.basePoints,
    timeBonus: 50,
    penaltyPoints: 0,
    streakBonus: 0,
    finalScore: config.basePoints + 50,
    speedPercentage: 80,
    streakCount: 1
  };
}

module.exports = {
  calculateQuestionScore,
  ROUND_CONFIG
};
EOF

# gameService.js
cat > services/gameService.js << 'EOF'
async function startRound(sessionId, roundNumber) {
  console.log(`Starting round ${roundNumber} for session ${sessionId}`);
}

async function endRound(sessionId, roundNumber) {
  console.log(`Ending round ${roundNumber} for session ${sessionId}`);
}

async function nextQuestion(sessionId) {
  console.log(`Next question for session ${sessionId}`);
}

module.exports = {
  startRound,
  endRound,
  nextQuestion
};
EOF

echo "✅ All services created!"
