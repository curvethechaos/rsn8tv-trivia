const API_BASE_URL = 'http://localhost:3000/api';

interface JoinSessionResponse {
  success: boolean;
  roomCode: string;
  playerNumber: number;
}

interface SubmitScoreData {
  real_name: string;
  email: string;
  nickname: string;
  marketing_consent: boolean;
  score: number;
}

class ApiService {
  async joinSession(sessionId: string, clientId: string, nickname: string): Promise<JoinSessionResponse> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, nickname })
    });

    if (!response.ok) {
      throw new Error('Failed to join session');
    }

    return response.json();
  }

  async submitScore(sessionId: string, data: SubmitScoreData) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/submit-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to submit score');
    }

    return response.json();
  }
}

export default new ApiService();
