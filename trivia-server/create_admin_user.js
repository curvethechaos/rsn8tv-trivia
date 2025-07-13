// Script to create admin user
require('dotenv').config();
const authService = require('./services/authService');

const username = process.argv[2];
const email = process.argv[3];
const password = process.argv[4];

if (!username || !email || !password) {
    console.error('Usage: node create_admin_user.js <username> <email> <password>');
    process.exit(1);
}

authService.createAdminUser(username, email, password)
    .then(user => {
        console.log('Admin user created successfully:', user);
        process.exit(0);
    })
    .catch(error => {
        console.error('Failed to create admin user:', error);
        process.exit(1);
    });
