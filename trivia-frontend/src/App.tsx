import React, { useEffect, useState } from 'react';
import socketService from './services/socketService';
import { QuestionData, AnswerResult } from './types/socket.types';
import './App.css';

function App() {
  const [connected, setConnected] = useState(false);
  const [gameData, setGameData] = useState<QuestionData | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    // Get sessionId from URL path
    const pathParts = window.location.pathname.split('/');
    const sessionFromUrl = pathParts[pathParts.indexOf('join') + 1] || '';
    
    if (sessionFromUrl) {
      setSessionId(sessionFromUrl);
      
      // Generate or get clientId
      const clientId = localStorage.getItem('clientId') || 
        `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('clientId', clientId);

      // Connect to WebSocket
      const socket = socketService.connect(sessionFromUrl, clientId);
      
      socket.on('connect', () => {
        setConnected(true);
        console.log('Connected!');
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('QUESTION_READY', (data: QuestionData) => {
        setGameData(data);
        setLastResult(null);
        console.log('Question received:', data);
      });

      socket.on('ANSWER_RESULT', (result: AnswerResult) => {
        setLastResult(result);
        console.log('Result:', result);
      });

      return () => socketService.disconnect();
    }
  }, []);

  const submitAnswer = (index: number) => {
    if (!gameData) return;
    
    socketService.emit('submit_answer', {
      questionNumber: gameData.questionNumber,
      answerIndex: index,
      responseTime: Date.now()
    });
  };

  return (
    <div className="App">
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>RSN8TV Trivia</h1>
        <div style={{ marginBottom: '20px' }}>
          <p>Session: <code>{sessionId || 'No session'}</code></p>
          <p>Status: {connected ? '✅ Connected' : '❌ Disconnected'}</p>
        </div>
        
        {gameData && (
          <div style={{ background: '#f0f0f0', padding: '20px', borderRadius: '10px' }}>
            <h3>Round {gameData.round} - Question {gameData.questionNumber}/10</h3>
            <p><strong>Category:</strong> {gameData.category} | <strong>Difficulty:</strong> {gameData.difficulty}</p>
            <h2>{gameData.question}</h2>
            <div style={{ marginTop: '20px' }}>
              {gameData.answers.map((answer: string, index: number) => (
                <button 
                  key={index}
                  onClick={() => submitAnswer(index)}
                  disabled={lastResult !== null}
                  style={{ 
                    display: 'block', 
                    margin: '10px 0', 
                    padding: '15px',
                    width: '100%',
                    fontSize: '16px',
                    backgroundColor: lastResult ? 
                      (lastResult.correctAnswer === index ? '#4CAF50' : 
                       lastResult.correct === false && index === gameData.answers.indexOf(answer) ? '#f44336' : '#e0e0e0') 
                      : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: lastResult ? 'not-allowed' : 'pointer'
                  }}
                >
                  {String.fromCharCode(65 + index)}: {answer}
                </button>
              ))}
            </div>
            
            {lastResult && (
              <div style={{ marginTop: '20px', padding: '15px', background: lastResult.correct ? '#d4edda' : '#f8d7da', borderRadius: '5px' }}>
                <p>{lastResult.correct ? '✅ Correct!' : '❌ Incorrect'}</p>
                <p>Score: {lastResult.score} | Rank: #{lastResult.rank}</p>
                {lastResult.timeBonus > 0 && <p>Time Bonus: +{lastResult.timeBonus}</p>}
                {lastResult.streak > 1 && <p>Streak: {lastResult.streak} 🔥</p>}
              </div>
            )}
          </div>
        )}
        
        {!gameData && connected && (
          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <p>Waiting for game to start...</p>
            <p>Make sure the host has started the game!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
