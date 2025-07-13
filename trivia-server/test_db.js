require('dotenv').config();
const knex = require('knex');
const knexConfig = require('./knexfile.js');

const db = knex(knexConfig[process.env.NODE_ENV || 'development']);

db.raw('SELECT current_user, current_database()')
  .then(result => {
    console.log('Connected successfully!', result.rows[0]);
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    console.log('Config used:', knexConfig[process.env.NODE_ENV || 'development']);
    process.exit(1);
  });
