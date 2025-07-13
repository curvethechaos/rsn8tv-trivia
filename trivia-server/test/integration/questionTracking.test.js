const request = require('supertest');
const app = require('../../server');
const db = require('../../db/connection');

describe('Question Tracking Integration', () => {
  let authToken;
  let sessionId;

  beforeAll(async () => {
    // Setup test data and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'test123' });
    
    authToken = loginResponse.body.token;
  });

  it('should update statistics after game completion', async () => {
    // 1. Create game session
    const sessionResponse = await request(app)
      .post('/api/sessions/create')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ hostId: 'test-host' });
    
    sessionId = sessionResponse.body.id;

    // 2. Submit answers
    await request(app)
      .post(`/api/sessions/${sessionId}/answer`)
      .send({
        questionId: 1,
        playerId: 1,
        answer: 'Paris',
        isCorrect: true,
        timeToAnswer: 5.2
      });

    // 3. Verify question statistics updated
    const question = await db('questions').where({ id: 1 }).first();
    expect(question.times_used).toBeGreaterThan(0);
    expect(question.times_correct).toBeGreaterThan(0);

    // 4. Check question_usage and question_answers tables
    const usage = await db('question_usage')
      .where({ question_id: 1, session_id: sessionId })
      .first();
    expect(usage).toBeDefined();
  });
});
