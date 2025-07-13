export interface SocketAuth {
  role: 'player';
  sessionId: string;
  clientId: string;
}

export interface QuestionData {
  round: number;
  questionNumber: number;
  totalQuestions: number;
  question: string;
  answers: string[];
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
}

export interface AnswerResult {
  correct: boolean;
  correctAnswer: number;
  score: number;
  rank: number;
  streak: number;
  timeBonus: number;
  penaltyPoints: number;
}

export interface GameCompleteData {
  finalScore: number;
  rank: number;
  totalPlayers: number;
  perfectRounds: number;
  longestStreak: number;
}

export interface PlayerJoinedData {
  playerCount: number;
  players: Array<{
    id: string;
    nickname: string;
  }>;
}
