// services/brandingService.js - Branding and asset management service
const AWS = require('aws-sdk');
const sharp = require('sharp');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

class BrandingService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.bucket = process.env.S3_BUCKET || 'rsn8tv-exports-302263084554';
    this.cdnUrl = process.env.CDN_URL || `https://${this.bucket}.s3.amazonaws.com`;
  }

  // Get current branding configuration
  async getCurrentBranding() {
    const branding = await db('branding_config')
      .where('is_active', true)
      .first();

    if (!branding) {
      // Return default configuration
      return {
        main_logo: null,
        favicon: null,
        sponsor_logos: [],
        company_name: 'RSN8TV Trivia',
        tagline: 'Real-time multiplayer trivia',
        footer_text: '© 2025 RSN8TV. All rights reserved.'
      };
    }

    return {
      id: branding.id,
      main_logo: branding.main_logo_url,
      favicon: branding.favicon_url,
      sponsor_logos: branding.sponsor_logos ? JSON.parse(branding.sponsor_logos) : [],
      company_name: branding.company_name,
      tagline: branding.tagline,
      footer_text: branding.footer_text,
      updated_at: branding.updated_at
    };
  }

  // Upload logo (main or favicon)
  async uploadLogo(file, type = 'main') {
    const validTypes = ['main', 'favicon'];
    if (!validTypes.includes(type)) {
      throw new Error('Invalid logo type');
    }

    // Process image based on type
    let processedImage;
    let filename;

    if (type === 'main') {
      // Resize main logo to reasonable dimensions
      processedImage = await sharp(file.buffer)
        .resize(300, 100, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .png()
        .toBuffer();
      filename = `branding/main-logo-${Date.now()}.png`;
    } else {
      // Create multiple favicon sizes
      const sizes = [16, 32, 192];
      const favicons = [];

      for (const size of sizes) {
        const resized = await sharp(file.buffer)
          .resize(size, size)
          .png()
          .toBuffer();

        const key = `branding/favicon-${size}x${size}-${Date.now()}.png`;
        await this.uploadToS3(key, resized, 'image/png');
        favicons.push({
          size: `${size}x${size}`,
          url: `${this.cdnUrl}/${key}`
        });
      }

      // Upload the original as well
      processedImage = await sharp(file.buffer)
        .resize(32, 32)
        .png()
        .toBuffer();
      filename = `branding/favicon-${Date.now()}.png`;
    }

    // Upload to S3
    const key = filename;
    await this.uploadToS3(key, processedImage, 'image/png');
    const url = `${this.cdnUrl}/${key}`;

    // Update database
    const branding = await db('branding_config')
      .where('is_active', true)
      .first();

    if (branding) {
      const updateData = {};
      if (type === 'main') {
        updateData.main_logo_url = url;
      } else {
        updateData.favicon_url = url;
      }
      updateData.updated_at = new Date();

      await db('branding_config')
        .where('id', branding.id)
        .update(updateData);
    } else {
      // Create new branding config
      await db('branding_config').insert({
        main_logo_url: type === 'main' ? url : null,
        favicon_url: type === 'favicon' ? url : null,
        is_active: true,
        created_at: new Date()
      });
    }

    return { url, type };
  }

  // Upload sponsor logo
  async uploadSponsorLogo(file) {
    // Process sponsor logo
    const processedImage = await sharp(file.buffer)
      .resize(200, 80, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .png()
      .toBuffer();

    const filename = `branding/sponsor-${uuidv4()}.png`;
    const key = filename;
    await this.uploadToS3(key, processedImage, 'image/png');
    const url = `${this.cdnUrl}/${key}`;

    // Update database
    const branding = await db('branding_config')
      .where('is_active', true)
      .first();

    const sponsorLogo = {
      id: uuidv4(),
      url,
      name: file.originalname,
      uploaded_at: new Date()
    };

    if (branding) {
      const sponsorLogos = branding.sponsor_logos 
        ? JSON.parse(branding.sponsor_logos) 
        : [];
      
      sponsorLogos.push(sponsorLogo);

      await db('branding_config')
        .where('id', branding.id)
        .update({
          sponsor_logos: JSON.stringify(sponsorLogos),
          updated_at: new Date()
        });
    } else {
      // Create new branding config
      await db('branding_config').insert({
        sponsor_logos: JSON.stringify([sponsorLogo]),
        is_active: true,
        created_at: new Date()
      });
    }

    return sponsorLogo;
  }

  // Remove sponsor logo
  async removeSponsorLogo(logoId) {
    const branding = await db('branding_config')
      .where('is_active', true)
      .first();

    if (!branding || !branding.sponsor_logos) {
      throw new Error('No sponsor logos found');
    }

    const sponsorLogos = JSON.parse(branding.sponsor_logos);
    const logoIndex = sponsorLogos.findIndex(logo => logo.id === logoId);

    if (logoIndex === -1) {
      throw new Error('Sponsor logo not found');
    }

    // Remove from array
    const removed = sponsorLogos.splice(logoIndex, 1)[0];

    // Update database
    await db('branding_config')
      .where('id', branding.id)
      .update({
        sponsor_logos: JSON.stringify(sponsorLogos),
        updated_at: new Date()
      });

    // Delete from S3
    try {
      const key = removed.url.replace(`${this.cdnUrl}/`, '');
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();
    } catch (error) {
      console.error('Error deleting from S3:', error);
    }

    return true;
  }

  // Update text branding
  async updateTextBranding(updates) {
    const branding = await db('branding_config')
      .where('is_active', true)
      .first();

    const updateData = {
      company_name: updates.company_name,
      tagline: updates.tagline,
      footer_text: updates.footer_text,
      updated_at: new Date()
    };

    if (branding) {
      await db('branding_config')
        .where('id', branding.id)
        .update(updateData);
    } else {
      // Create new branding config
      await db('branding_config').insert({
        ...updateData,
        is_active: true,
        created_at: new Date()
      });
    }

    return this.getCurrentBranding();
  }

  // Upload to S3
  async uploadToS3(key, buffer, contentType) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000' // 1 year cache
    };

    return this.s3.upload(params).promise();
  }

  // Generate asset URLs for frontend
  async getAssetUrls() {
    const branding = await this.getCurrentBranding();
    
    return {
      mainLogo: branding.main_logo || '/images/default-logo.png',
      favicon: branding.favicon || '/favicon.ico',
      sponsorLogos: branding.sponsor_logos || [],
      css: await this.generateBrandingCSS(branding)
    };
  }

  // Generate branding CSS
  async generateBrandingCSS(branding) {
    return `
/* Branding Overrides */
.logo {
  background-image: url('${branding.main_logo || '/images/default-logo.png'}');
}

.company-name::after {
  content: "${branding.company_name || 'RSN8TV Trivia'}";
}

.tagline::after {
  content: "${branding.tagline || 'Real-time multiplayer trivia'}";
}

.footer-text::after {
  content: "${branding.footer_text || '© 2025 RSN8TV. All rights reserved.'}";
}
    `.trim();
  }
}

module.exports = new BrandingService();
