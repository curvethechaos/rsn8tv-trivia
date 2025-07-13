#!/bin/bash
# create-missing-files.sh - Create the missing dependency files

cd /home/ubuntu/rsn8tv-trivia/trivia-server

echo "📁 Creating missing dependency files..."

# 1. Create config.js if it doesn't exist
if [ ! -f "config.js" ]; then
    echo "Creating config.js..."
    cat > config.js << 'EOF'
module.exports = {
  app: {
    baseUrl: process.env.BASE_URL || 'https://trivia.rsn8tv.com',
    wsUrl: process.env.WS_URL || 'wss://trivia.rsn8tv.com',
    corsOrigins: ['https://trivia.rsn8tv.com', 'http://localhost:3000']
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'axiom',
    password: process.env.DB_PASSWORD || 'HirschF843',
    database: process.env.DB_NAME || 'rsn8tv_trivia'
  }
};
EOF
fi

# 2. Create utils/cache.js if it doesn't exist
mkdir -p utils
if [ ! -f "utils/cache.js" ]; then
    echo "Creating utils/cache.js..."
    cat > utils/cache.js << 'EOF'
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour default

module.exports = {
  cache: {
    async get(key) {
      return cache.get(key);
    },
    async set(key, value, ttl) {
      return cache.set(key, value, ttl);
    },
    async del(key) {
      return cache.del(key);
    }
  }
};
EOF
fi

# 3. Create utils/validation.js if it doesn't exist
if [ ! -f "utils/validation.js" ]; then
    echo "Creating utils/validation.js..."
    cat > utils/validation.js << 'EOF'
async function isValidSession(sessionId, db) {
  if (!sessionId) return false;
  
  try {
    const session = await db('sessions')
      .where({ id: sessionId, is_active: true })
      .first();
    
    return !!session;
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
}

module.exports = { isValidSession };
EOF
fi

# 4. Create services/triviaAPIService.js if it doesn't exist
mkdir -p services
if [ ! -f "services/triviaAPIService.js" ]; then
    echo "Creating services/triviaAPIService.js..."
    cat > services/triviaAPIService.js << 'EOF'
const axios = require('axios');

async function fetchQuestionsFromAPIs() {
  try {
    // Try OpenTDB first
    const response = await axios.get('https://opentdb.com/api.php', {
      params: {
        amount: 30,
        type: 'multiple',
        encode: 'url3986'
      }
    });
    
    if (response.data && response.data.results) {
      return response.data.results.map((q, index) => ({
        id: `q${index}`,
        question: decodeURIComponent(q.question),
        answers: [
          ...q.incorrect_answers.map(a => decodeURIComponent(a)),
          decodeURIComponent(q.correct_answer)
        ].sort(() => Math.random() - 0.5),
        correctAnswerIndex: 0, // Will be set after shuffle
        category: decodeURIComponent(q.category),
        difficulty: q.difficulty
      }));
    }
  } catch (error) {
    console.error('Error fetching from OpenTDB:', error);
  }
  
  // Fallback to static questions
  return require('../data/fallbackQuestions.json');
}

module.exports = { fetchQuestionsFromAPIs };
EOF
fi

# 5. Install missing npm packages
echo -e "\n📦 Installing missing packages..."
npm install node-cache axios --save

# 6. Create fallback questions if not exist
mkdir -p data
if [ ! -f "data/fallbackQuestions.json" ]; then
    echo "Creating fallback questions..."
    cat > data/fallbackQuestions.json << 'EOF'
[
  {
    "id": "q1",
    "question": "What is the capital of France?",
    "answers": ["London", "Berlin", "Paris", "Madrid"],
    "correctAnswerIndex": 2,
    "category": "Geography",
    "difficulty": "easy"
  },
  {
    "id": "q2",
    "question": "Which planet is known as the Red Planet?",
    "answers": ["Venus", "Mars", "Jupiter", "Saturn"],
    "correctAnswerIndex": 1,
    "category": "Science",
    "difficulty": "easy"
  }
]
EOF
fi

echo -e "\n✅ All missing files created!"
echo "🚀 Now restarting server..."

pm2 restart rsn8tv-backend
sleep 3
pm2 status

echo -e "\n🧪 Testing server..."
curl -s http://localhost:3000/health | jq '.'
