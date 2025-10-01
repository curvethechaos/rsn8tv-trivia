// test-server.js - Simple test to ensure server starts correctly
const axios = require('axios');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function testServer() {
  try {
    logger.info('Starting server tests...');
    
    // Test 1: Health check
    logger.info('Test 1: Checking health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    
    if (healthResponse.data.status === 'ok') {
      logger.info('✅ Health check passed');
      logger.info(`Server uptime: ${healthResponse.data.uptime} seconds`);
    } else {
      logger.error('❌ Health check failed');
    }
    
    // Test 2: Check if API endpoints are responding
    logger.info('\nTest 2: Checking API endpoints...');
    const endpoints = [
      '/api/sessions',
      '/api/leaderboards',
      '/api/players'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`);
        logger.info(`✅ ${endpoint} - Status: ${response.status}`);
      } catch (error) {
        if (error.response) {
          logger.info(`⚠️  ${endpoint} - Status: ${error.response.status} (This might be expected without data)`);
        } else {
          logger.error(`❌ ${endpoint} - Error: ${error.message}`);
        }
      }
    }
    
    logger.info('\n✨ Server test completed!');
    
  } catch (error) {
    logger.error('Server test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      logger.error('Make sure the server is running on port', PORT);
    }
  }
}

// Run tests after a short delay to ensure server is ready
setTimeout(testServer, 2000);

logger.info(`Server test will run in 2 seconds...`);
logger.info(`Make sure the server is running with: npm run dev`);
