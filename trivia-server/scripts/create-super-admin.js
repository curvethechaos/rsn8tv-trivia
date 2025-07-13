#!/usr/bin/env node

// scripts/create-super-admin.js
const authService = require('../services/authService');
const db = require('../db/connection');
const readline = require('readline');
const bcrypt = require('bcrypt');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (prompt) => {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
};

async function createSuperAdmin() {
    console.log('=== RSN8TV Trivia - Create Super Admin User ===\n');
    
    try {
        // Check if any admin users exist
        const existingAdmins = await db('admin_users').count('id as count').first();
        if (existingAdmins.count > 0) {
            console.log('⚠️  Admin users already exist in the database.');
            const proceed = await question('Do you want to create another admin? (yes/no): ');
            if (proceed.toLowerCase() !== 'yes') {
                console.log('Exiting...');
                process.exit(0);
            }
        }
        
        // Get user input
        const username = await question('Username: ');
        const email = await question('Email: ');
        const password = await question('Password (min 8 chars): ');
        
        // Validate inputs
        if (username.length < 3) {
            throw new Error('Username must be at least 3 characters');
        }
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new Error('Invalid email address');
        }
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }
        
        // Create the admin user
        console.log('\nCreating super admin user...');
        const user = await authService.createAdminUser(username, email, password);
        
        console.log('\n✅ Super admin user created successfully!');
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log('\nYou can now login at /admin with these credentials.');
        
    } catch (error) {
        console.error('\n❌ Error creating admin user:', error.message);
    } finally {
        rl.close();
        process.exit(0);
    }
}

// Run the script
createSuperAdmin();
