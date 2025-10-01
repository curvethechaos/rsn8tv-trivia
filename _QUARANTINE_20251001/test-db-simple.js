// test-db-simple.js - Simple database connection test
require('dotenv').config();

console.log('Database configuration:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD exists:', !!process.env.DB_PASSWORD);
console.log('DB_PASSWORD length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);

const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'rsn8tv_trivia',
    user: process.env.DB_USER || 'axiom',
    password: process.env.DB_PASSWORD
  }
});

async function test() {
  try {
    const result = await db.raw('SELECT 1 as test');
    console.log('✅ Connection successful!', result.rows);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await db.destroy();
  }
}

test();
