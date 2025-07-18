// services/profanityService.js
const logger = require('../utils/logger');
const PROFANE_WORDS = require('profane-words');

/**
 * Service for checking profanity using local word list
 * Handles text sanitization and provides cleaned alternatives
 */
class ProfanityService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour
  }

  /**
   * Split compound words to find hidden profanity
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of potential words
   */
  splitCompoundWords(text) {
    // Common separators including underscores, hyphens, etc.
    const separators = /[\s_\-\.\,\!\@\#\$\%\^\&\*\(\)\[\]\{\}\|\\\/:;"'<>?`~+=]/g;
    const words = text.split(separators).filter(word => word.length > 0);

    // Also split camelCase and numbers
    const additionalWords = [];
    words.forEach(word => {
      // Split on case changes (camelCase)
      const camelSplit = word.split(/(?=[A-Z])/).filter(w => w.length > 0);
      additionalWords.push(...camelSplit);

      // Split on number boundaries
      const numberSplit = word.split(/(?=\d)|(?<=\d)/).filter(w => w.length > 0);
      additionalWords.push(...numberSplit);
    });

    return [...new Set([...words, ...additionalWords])];
  }

  /**
   * Check text for profanity
   * @param {string} text - Text to check
   * @returns {boolean} - True if clean (no profanity), false if profane
   */
  async checkText(text) {
    if (!text || typeof text !== 'string') {
      return true; // Allow empty/null values
    }

    // Check cache first
    const cached = this.cache.get(text.toLowerCase());
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.isClean;
    }

    // Check for profanity
    let hasProfanity = false;
    const lowerText = text.toLowerCase();

    // Check for exact profane words and substrings
    for (const profaneWord of PROFANE_WORDS) {
      if (lowerText.includes(profaneWord.toLowerCase())) {
        hasProfanity = true;
        logger.debug(`Found "${profaneWord}" as substring in "${text}"`);
        break;
      }
    }

    // Also check split words
    const words = this.splitCompoundWords(text);
    for (const word of words) {
      if (word.length < 3) continue; // Skip very short words
      
      const lowerWord = word.toLowerCase();
      for (const profaneWord of PROFANE_WORDS) {
        if (lowerWord === profaneWord.toLowerCase()) {
          hasProfanity = true;
          logger.debug(`Found "${profaneWord}" as word in "${text}"`);
          break;
        }
      }
      if (hasProfanity) break;
    }

    // Cache result
    const isClean = !hasProfanity;
    this.cache.set(lowerText, { isClean, timestamp: Date.now() });

    return isClean;
  }

  /**
   * Check multiple fields for profanity
   * @param {Object} fields - Object with field names and values
   * @returns {Object} - Detailed profanity check results
   */
  async checkFields(fields) {
    const results = {
      hasProfileProfanity: false,
      details: {}
    };

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (!fieldValue || typeof fieldValue !== 'string') {
        results.details[fieldName] = {
          clean: true,
          original: fieldValue,
          cleaned: fieldValue,
          profanityFound: []
        };
        continue;
      }

      const profanityInField = [];
      const lowerValue = fieldValue.toLowerCase();

      // Check for profanity within the text
      for (const profaneWord of PROFANE_WORDS) {
        if (lowerValue.includes(profaneWord.toLowerCase())) {
          profanityInField.push(profaneWord);
        }
      }

      const hasProfanity = profanityInField.length > 0;

      // Store results
      results.details[fieldName] = {
        clean: !hasProfanity,
        original: fieldValue,
        cleaned: hasProfanity ? this.cleanText(fieldValue, profanityInField) : fieldValue,
        profanityFound: [...new Set(profanityInField)]
      };

      if (hasProfanity) {
        results.hasProfileProfanity = true;
      }
    }

    return results;
  }

  /**
   * Clean text by replacing profanity with asterisks
   * @param {string} text - Original text
   * @param {Array} profanityWords - Words to clean
   * @returns {string} - Cleaned text
   */
  cleanText(text, profanityWords) {
    let cleaned = text;

    for (const word of profanityWords) {
      // Create regex to match the word (case insensitive)
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const replacement = word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
      cleaned = cleaned.replace(regex, replacement);
    }

    return cleaned;
  }

  /**
   * Simple profanity check for quick validation
   * @param {string} text - Text to check
   * @returns {boolean} - True if profane
   */
  async isProfane(text) {
    const isClean = await this.checkText(text);
    return !isClean;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Profanity service cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout
    };
  }

  /**
   * Enhanced check for player names with specific rules
   * @param {string} realName - Real name to check
   * @param {string} nickname - Nickname to check
   * @returns {Object} - Validation result
   */
  async checkPlayerNames(realName, nickname) {
    const result = await this.checkFields({
      realName: realName,
      nickname: nickname
    });

    if (result.hasProfileProfanity) {
      const problematicFields = Object.entries(result.details)
        .filter(([_, detail]) => !detail.clean)
        .map(([field, detail]) => ({
          field,
          words: detail.profanityFound
        }));

      return {
        valid: false,
        message: `Please choose an appropriate nickname.`,
        details: result.details,
        problematicFields,
        suggestions: {
          realName: result.details.realName.cleaned,
          nickname: result.details.nickname.cleaned
        }
      };
    }

    return {
      valid: true,
      message: 'Names are appropriate',
      details: result.details
    };
  }
}

module.exports = ProfanityService;
