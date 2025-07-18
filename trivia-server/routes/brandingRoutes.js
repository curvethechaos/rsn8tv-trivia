// routes/brandingRoutes.js - Branding management routes
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/admin/branding
router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const brandingService = req.app.locals.brandingService;

    let branding;
    
    // Try service first
    if (brandingService && brandingService.getCurrentBranding) {
      branding = await brandingService.getCurrentBranding();
    } else {
      // Fallback to direct database query
      const brandingRow = await db('branding_config')
        .orderBy('updated_at', 'desc')
        .first();
      
      branding = brandingRow || null;
    }

    const defaultBranding = {
      logo: '/images/default-logo.png',
      favicon: '/favicon.ico',
      sponsors: [],
      appName: 'RSN8TV Trivia',
      tagline: 'Test Your Knowledge!',
      updated_at: new Date()
    };

    res.json({
      success: true,
      data: branding || defaultBranding
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    next(error);
  }
});

// POST /api/admin/branding/logo
router.post('/logo', upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const db = req.app.locals.db;
    const brandingService = req.app.locals.brandingService;
    
    // Save file
    const filename = `logo-${Date.now()}${path.extname(req.file.originalname)}`;
    const filepath = path.join('/var/www/html/uploads', filename);
    const publicPath = `/uploads/${filename}`;

    // Ensure upload directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, req.file.buffer);

    // Update branding config
    if (brandingService && brandingService.uploadLogo) {
      const result = await brandingService.uploadLogo(req.file, 'main');
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database update
    const currentBranding = await db('settings')
      .where('key', 'branding_config')
      .first();

    const brandingData = currentBranding ? JSON.parse(currentBranding.value) : {};
    brandingData.logo = publicPath;
    brandingData.updated_at = new Date();

    await db('settings')
      .insert({
        key: 'branding_config',
        value: JSON.stringify(brandingData),
        updated_at: new Date()
      })
      .onConflict('key')
      .merge();

    res.json({
      success: true,
      data: {
        logo: publicPath,
        message: 'Logo uploaded successfully'
      }
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    next(error);
  }
});

// POST /api/admin/branding/favicon
router.post('/favicon', upload.single('favicon'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const db = req.app.locals.db;
    const brandingService = req.app.locals.brandingService;

    // For favicon, we need to save it to the root directory
    const faviconPath = '/var/www/html/favicon.ico';
    
    // Convert to .ico if needed (simplified - just copy for now)
    await fs.writeFile(faviconPath, req.file.buffer);

    // Update branding config
    if (brandingService && brandingService.uploadLogo) {
      const result = await brandingService.uploadLogo(req.file, 'favicon');
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database update
    const currentBranding = await db('settings')
      .where('key', 'branding_config')
      .first();

    const brandingData = currentBranding ? JSON.parse(currentBranding.value) : {};
    brandingData.favicon = '/favicon.ico';
    brandingData.updated_at = new Date();

    await db('settings')
      .insert({
        key: 'branding_config',
        value: JSON.stringify(brandingData),
        updated_at: new Date()
      })
      .onConflict('key')
      .merge();

    res.json({
      success: true,
      data: {
        favicon: '/favicon.ico',
        message: 'Favicon uploaded successfully'
      }
    });
  } catch (error) {
    console.error('Error uploading favicon:', error);
    next(error);
  }
});

// POST /api/admin/branding/sponsors
router.post('/sponsors', upload.single('sponsor'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const db = req.app.locals.db;
    const brandingService = req.app.locals.brandingService;
    
    // Save sponsor logo
    const filename = `sponsor-${Date.now()}${path.extname(req.file.originalname)}`;
    const filepath = path.join('/var/www/html/uploads/sponsors', filename);
    const publicPath = `/uploads/sponsors/${filename}`;

    // Ensure upload directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, req.file.buffer);

    // Update branding config
    if (brandingService && brandingService.uploadSponsorLogo) {
      const result = await brandingService.uploadSponsorLogo(req.file);
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database update
    const currentBranding = await db('settings')
      .where('key', 'branding_config')
      .first();

    const brandingData = currentBranding ? JSON.parse(currentBranding.value) : {};
    if (!brandingData.sponsors) {
      brandingData.sponsors = [];
    }

    // Add new sponsor
    brandingData.sponsors.push({
      id: Date.now(),
      logo: publicPath,
      name: req.body.name || 'Sponsor',
      link: req.body.link || '#',
      active: true,
      added_at: new Date()
    });

    brandingData.updated_at = new Date();

    await db('settings')
      .insert({
        key: 'branding_config',
        value: JSON.stringify(brandingData),
        updated_at: new Date()
      })
      .onConflict('key')
      .merge();

    res.json({
      success: true,
      data: {
        sponsor: brandingData.sponsors[brandingData.sponsors.length - 1],
        message: 'Sponsor logo uploaded successfully'
      }
    });
  } catch (error) {
    console.error('Error uploading sponsor logo:', error);
    next(error);
  }
});

// DELETE /api/admin/branding/sponsors/:id
router.delete('/sponsors/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const sponsorId = parseInt(req.params.id);

    const currentBranding = await db('settings')
      .where('key', 'branding_config')
      .first();

    if (!currentBranding) {
      return res.status(404).json({
        success: false,
        error: 'Branding configuration not found'
      });
    }

    const brandingData = JSON.parse(currentBranding.value);
    
    if (!brandingData.sponsors) {
      return res.status(404).json({
        success: false,
        error: 'No sponsors found'
      });
    }

    // Remove sponsor
    const initialLength = brandingData.sponsors.length;
    brandingData.sponsors = brandingData.sponsors.filter(s => s.id !== sponsorId);

    if (brandingData.sponsors.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Sponsor not found'
      });
    }

    brandingData.updated_at = new Date();

    await db('settings')
      .where('key', 'branding_config')
      .update({
        value: JSON.stringify(brandingData),
        updated_at: new Date()
      });

    res.json({
      success: true,
      message: 'Sponsor removed successfully'
    });
  } catch (error) {
    console.error('Error removing sponsor:', error);
    next(error);
  }
});

// PUT /api/admin/branding
router.put('/', [
  body('appName').optional().isString().isLength({ min: 1, max: 100 }),
  body('tagline').optional().isString().isLength({ max: 200 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const { appName, tagline } = req.body;

    const currentBranding = await db('settings')
      .where('key', 'branding_config')
      .first();

    const brandingData = currentBranding ? JSON.parse(currentBranding.value) : {};
    
    if (appName !== undefined) brandingData.appName = appName;
    if (tagline !== undefined) brandingData.tagline = tagline;
    brandingData.updated_at = new Date();

    await db('settings')
      .insert({
        key: 'branding_config',
        value: JSON.stringify(brandingData),
        updated_at: new Date()
      })
      .onConflict('key')
      .merge();

    res.json({
      success: true,
      data: brandingData
    });
  } catch (error) {
    console.error('Error updating branding:', error);
    next(error);
  }
});

module.exports = router;
