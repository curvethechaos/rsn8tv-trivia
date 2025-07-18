const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../db/connection');

async function createSession(hostId, config = {}) {
  const sessionId = uuidv4();
  const roomCode = generateRoomCode();
  
  try {
    // Generate QR code
    const sessionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join/${sessionId}/${Date.now()}`;
    const qrCodeData = await QRCode.toDataURL(sessionUrl);

    // Create session in database
    await db('sessions').insert({
      id: sessionId,
      host_id: hostId,
      room_code: roomCode,
      qr_code_data: qrCodeData,
      question_set: JSON.stringify([]), // Empty for now
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    return {
      sessionId,
      roomCode,
      qrCodeData,
      sessionUrl
    };
  } catch (error) {
    console.error('Create session error:', error);
    throw error;
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function validateSession(sessionId) {
  const session = await db('sessions')
    .where({ id: sessionId, is_active: true })
    .first();
  return session;
}

module.exports = {
  createSession,
  validateSession,
  generateRoomCode
};
