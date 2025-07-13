# RSN8TV Trivia System

A real-time multiplayer trivia platform designed for restaurant/bar venues.

## Project Structure rsn8tv-trivia/
├── trivia-server/          # Backend Node.js application
│   ├── server.js           # Main server file
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   ├── db/                 # Database migrations and connection
│   └── ws/                 # WebSocket handlers
├── frontend/               # Frontend files (served via Apache/Nginx)
│   ├── trivia/            # Player and host interfaces
│   │   ├── index.html     # Player game interface
│   │   ├── host.html      # Host display
│   │   └── *.css          # Styles
│   └── admin/             # Admin dashboard
│       └── monitoring/
│           ├── dashboard.html
│           └── dashboard.css
└── docs/                   # Documentation
└── database-schema.sql # Current DB schema ## System Status (July 13, 2025)

### ✅ Fully Functional
- Real-time game engine (single-round, 30-second timer)
- Player registration and profiles  
- JWT authentication for admin
- Automated leaderboards with tie-breaking
- WebSocket game communication
- Complete admin dashboard with 13 tabs
- All database tables properly configured
- Backend API endpoints implemented

### 📊 Database
- PostgreSQL with 20+ tables
- Automated triggers for leaderboard updates
- Prize configurations with tie-breaking rules
- Player profiles and game history tracking

### 🎮 Game Features
- QR code join system
- Real-time multiplayer (50+ players)
- Post-game registration
- Device fingerprinting ready
- Profanity filtering

### 🏆 Prize System
- Time-based prizes (weekly/monthly/quarterly/yearly)
- Threshold achievement prizes (8,500 points)
- Automated winner calculation
- Newest submission wins on ties

## URLs
- Game: https://trivia.rsn8tv.com
- Admin: https://trivia.rsn8tv.com/admin/monitoring/dashboard.html

## Admin Credentials
- Username: axiom
- Password: [Secure password in production]

## Quick Start

1. Clone the repository
2. Install dependencies: `cd trivia-server && npm install`
3. Set up PostgreSQL database
4. Copy `.env.example` to `.env` and configure
5. Run migrations: `npx knex migrate:latest`
6. Start server: `pm2 start server.js --name rsn8tv-trivia`
7. Copy frontend files to web server directory

## Deployment
Deployed on Ubuntu 22.04 with Node.js, PostgreSQL, Nginx, PM2, and Let's Encrypt SSL.
