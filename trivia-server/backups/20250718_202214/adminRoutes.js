// routes/adminRoutes.js - Admin management routes

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const questionService  = require('../services/questionService');
const PrizeService    = require('../services/prizeService');
const prizeService   = new PrizeService();
const exportService    = require('../services/exportService');
const themeService     = require('../services/themeService');
const brandingService  = require('../services/brandingService');
// GOOD: grab the instance, then export just its verifyToken method
const authInstance    = require('../middleware/authMiddleware');
const authMiddleware  = authInstance.verifyToken.bind(authInstance);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --- System statistics ---
router.get('/stats', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const cache = req.app.locals.cache;

    const [
      totalSessions,
      activeSessions,
      totalPlayers,
      registeredPlayers,
      totalQuestions,
      cacheStats
    ] = await Promise.all([
      db('sessions').count('id as count'),
      db('sessions').where('is_active', true).count('id as count'),
      db('players').count('id as count'),
      db('player_profiles').count('id as count'),
      db('question_cache').count('id as count'),
      Promise.resolve(cache ? cache.getStats() : { hits:0, misses:0, keys:0 })
    ]);

    const recentSessions = await db('sessions')
      .orderBy('created_at','desc')
      .limit(10)
      .select('id','room_code','is_active','created_at');

    const recentPlayers = await db('player_profiles')
      .orderBy('created_at','desc')
      .limit(10)
      .select('id','nickname','email','created_at');

    res.json({
      success: true,
      stats: {
        sessions: { total: +totalSessions[0].count, active: +activeSessions[0].count },
        players:  { total: +totalPlayers[0].count, registered: +registeredPlayers[0].count },
        questions:{ cached: +totalQuestions[0].count },
        cache: cacheStats
      },
      recentActivity: { sessions: recentSessions, players: recentPlayers }
    });
  } catch(err) { next(err) }
});

// --- Sessions pagination ---
router.get('/sessions', async (req,res,next) => {
  try {
    const db = req.app.locals.db;
    const { page=1, limit=50, active } = req.query;
    const offset = (page-1)*limit;

    let q = db('sessions as s')
      .leftJoin(
        db('players')
          .select('session_id')
          .count('* as player_count')
          .groupBy('session_id')
          .as('p'),
        's.id','p.session_id'
      )
      .select('s.id','s.room_code','s.is_active','s.created_at',
              db.raw('COALESCE(p.player_count,0) as player_count'));
    if(active !== undefined) q = q.where('s.is_active', active==='true');

    const data = await q.orderBy('s.created_at','desc').limit(limit).offset(offset);
    const [{ count }] = await db('sessions')
      .where(active!==undefined?{is_active:active==='true'}:{})
      .count('id as count');

    res.json({
      success: true,
      data,
      pagination: {
        page: +page, limit: +limit,
        total: +count, pages: Math.ceil(count/limit)
      }
    });
  } catch(err){ next(err) }
});

// --- Cache clear ---
router.post('/cache/clear', async (req,res,next) => {
  try {
    const cache = req.app.locals.cache;
    const { pattern } = req.body;
    if(cache && cache.flushAll){
      if(pattern){
        const keys = await cache.keys(pattern);
        await Promise.all(keys.map(k=>cache.del(k)));
        res.json({ success:true, message:`Cleared ${keys.length} entries` });
      } else {
        await cache.flushAll();
        res.json({ success:true, message:'All cache cleared' });
      }
    } else {
      res.json({ success:true, message:'No cache configured' });
    }
  } catch(err){ next(err) }
});

// --- Theme management ---
router.get('/theme', authMiddleware, async (req,res,next) => {
  try {
    const theme = await themeService.getCurrentTheme();
    res.json({ success:true, data:theme });
  } catch(err){ next(err) }
});
router.post('/theme',
  authMiddleware,
  [ body('colors').isObject(), body('fonts').optional().isObject(), body('animations').optional().isObject() ],
  async (req,res,next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) return res.status(400).json({ success:false, errors:errors.array() });
    try {
      const updated = await themeService.updateTheme(req.body, req.user.id);
      res.json({ success:true, data:updated });
    } catch(err){ next(err) }
});

// --- Branding management ---
router.get('/branding', authMiddleware, async (req,res,next) => {
  try {
    const b = await brandingService.getCurrentBranding();
    res.json({ success:true, data:b });
  } catch(err){ next(err) }
});
router.post('/branding/logo', authMiddleware, upload.single('logo'),
  async (req,res,next) => {
    if(!req.file) return res.status(400).json({ success:false, error:'No file uploaded'});
    try{
      const r = await brandingService.uploadLogo(req.file,'main');
      res.json({ success:true, data:r });
    }catch(err){ next(err) }
  }
);
router.post('/branding/favicon', authMiddleware, upload.single('favicon'),
  async (req,res,next)=>{
    if(!req.file) return res.status(400).json({ success:false, error:'No file uploaded'});
    try{
      const r = await brandingService.uploadLogo(req.file,'favicon');
      res.json({ success:true, data:r });
    }catch(err){ next(err) }
  }
);
router.post('/branding/sponsors', authMiddleware, upload.single('sponsor'),
  async (req,res,next)=>{
    if(!req.file) return res.status(400).json({ success:false, error:'No file uploaded'});
    try{
      const r = await brandingService.uploadSponsorLogo(req.file);
      res.json({ success:true, data:r });
    }catch(err){ next(err) }
  }
);

// --- Question management ---
router.get('/questions', authMiddleware, async (req,res,next)=>{
  try {
    const { page=1, limit=50, difficulty, category, status, search } = req.query;
    const result = await questionService.getQuestions({
      page:+page, limit:+limit,
      difficulty, category, status, search
    });
    res.json(result);
  } catch(err){ next(err) }
});
router.get('/questions/export', authMiddleware, async (req,res,next)=>{
  try {
    const { category, difficulty, status } = req.query;
    const id = await exportService.createExport(
      'questions',{category,difficulty,status},req.user.id
    );
    res.json({ exportId:id });
  } catch(err){ next(err) }
});
router.post('/questions/:id/flag', authMiddleware, async (req,res,next)=>{
  try {
    await questionService.flagQuestion(req.params.id, req.user.id, req.body.reason);
    res.json({ success:true });
  } catch(err){ next(err) }
});
router.put('/questions/:id', authMiddleware, async (req,res,next)=>{
  try {
    await questionService.update(req.params.id, req.body);
    res.json({ success:true });
  } catch(err){ next(err) }
});
router.get('/questions/categories', authMiddleware, async (req,res,next)=>{
  try {
    const cats = questionService.categories||[];
    res.json(cats);
  } catch(err){ next(err) }
});

// --- Prize management ---
router.get('/prizes/time-based', authMiddleware, async (req,res,next)=>{
  try {
    const p = await prizeService.getTimeBasedPrizes();
    res.json({ success:true, data:p });
  } catch(err){ next(err) }
});
router.get('/prizes/threshold', authMiddleware, async (req,res,next)=>{
  try {
    const t = await prizeService.getThresholdPrize();
    res.json({ success:true, data:t });
  } catch(err){ next(err) }
});
router.get('/prizes/winners', authMiddleware, async (req,res,next)=>{
  try {
    const { period='weekly', type='time-based' }=req.query;
    const w = await prizeService.getPrizeWinners(period,type);
    res.json({ success:true, data:w });
  } catch(err){ next(err) }
});

// --- Player management & export ---
router.get('/players', authMiddleware, async (req,res,next)=>{
  try {
    // build your DB query here…
    const players = []; 
    res.json({ success:true, data:players });
  } catch(err){ next(err) }
});
router.get('/players/export', authMiddleware, async (req,res,next)=>{
  try {
    const id = await exportService.createExport('players',req.query,req.user.id);
    res.json({ success:true, exportId:id });
  } catch(err){ next(err) }
});

// --- Current games listing ---
router.get('/current-games', authMiddleware, async (req,res,next)=>{
  try {
    const gm = req.app.locals.gameManager;
    const db = req.app.locals.db;
    const games = [];
    if(gm?.games){
      for(const [sid,game] of gm.games){
        const sess = await db('sessions').where('id',sid).first();
        games.push({
          sessionId: sid,
          roomCode: sess?.room_code,
          status: game.status,
          currentRound: game.currentRound,
          playerCount: game.players.size,
          startedAt: game.startedAt,
          createdAt: game.createdAt
        });
      }
    }
    res.json({ success:true, data:games });
  } catch(err){ next(err) }
});

// --- Analytics overview ---
router.get('/analytics/overview', authMiddleware, async (req,res,next)=>{
  try {
    const db = req.app.locals.db;
    const { startDate,endDate } = req.query;
    const analytics = await db.raw(`
      SELECT DATE(s.created_at) as date,
             COUNT(DISTINCT s.id) as games_played,
             COUNT(DISTINCT p.id) as unique_players,
             AVG(sc.score) as avg_score,
             MAX(sc.score) as high_score
      FROM sessions s
      JOIN players p ON p.session_id=s.id
      LEFT JOIN scores sc ON sc.player_id=p.id
      WHERE s.created_at BETWEEN ? AND ?
      GROUP BY DATE(s.created_at)
      ORDER BY date DESC
    `,[startDate,endDate]);

    const catStats = await db('question_responses as qr')
      .join('question_cache as q','qr.question_id','q.id')
      .select('q.category')
      .count('* as attempts')
      .sum({correct: db.raw('CASE WHEN qr.is_correct THEN 1 ELSE 0 END')})
      .groupBy('q.category');

    res.json({ success:true, daily:analytics.rows, categories:catStats });
  } catch(err){ next(err) }
});

module.exports = router;
