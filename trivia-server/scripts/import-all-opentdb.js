// scripts/import-all-opentdb.js
// One-time script to download ALL questions from OpenTDB and store locally
const axios = require('axios');
const knex = require('../db/connection');
const logger = require('../utils/logger');

class OpenTDBImporter {
  constructor() {
    this.baseUrl = 'https://opentdb.com/api.php';
    this.tokenUrl = 'https://opentdb.com/api_token.php';
    this.categoryUrl = 'https://opentdb.com/api_category.php';
    
    this.stats = {
      total: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      byCategory: {},
      byDifficulty: { easy: 0, medium: 0, hard: 0 },
      byWordCount: {}
    };
  }

  async getSessionToken() {
    try {
      const response = await axios.get(this.tokenUrl, {
        params: { command: 'request' }
      });
      return response.data.token;
    } catch (error) {
      logger.error('Failed to get session token:', error);
      return null;
    }
  }

  async resetToken(token) {
    try {
      await axios.get(this.tokenUrl, {
        params: { command: 'reset', token: token }
      });
    } catch (error) {
      logger.error('Failed to reset token:', error);
    }
  }

  async getAllCategories() {
    try {
      const response = await axios.get(this.categoryUrl);
      return response.data.trivia_categories;
    } catch (error) {
      logger.error('Failed to get categories:', error);
      return [];
    }
  }

  calculateQualityScore(question, wordCount) {
    let score = 50; // Base score

    // Word count scoring (12-15 words is ideal)
    if (wordCount >= 12 && wordCount <= 15) score += 50;
    else if (wordCount >= 10 && wordCount <= 17) score += 30;
    else if (wordCount >= 8 && wordCount <= 20) score += 10;
    else if (wordCount < 8) score -= 20;
    else if (wordCount > 25) score -= 30;

    // Bonus for questions that don't start with "What" or "Which"
    if (!question.match(/^(What|Which)/i)) score += 10;

    // Penalty for questions with special characters (often formatting issues)
    if (question.includes('&') || question.includes('&#')) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  async importQuestions() {
    console.log('🚀 Starting OpenTDB bulk import...\n');
    
    const categories = await this.getAllCategories();
    console.log(`📁 Found ${categories.length} categories\n`);

    const difficulties = ['easy', 'medium', 'hard'];
    let token = await this.getSessionToken();

    for (const category of categories) {
      console.log(`\n📂 Processing: ${category.name}`);
      this.stats.byCategory[category.name] = 0;

      for (const difficulty of difficulties) {
        console.log(`  📊 Difficulty: ${difficulty}`);
        let hasMore = true;
        let attempts = 0;
        let questionsSinceReset = 0;

        while (hasMore && attempts < 10) {
          try {
            const params = {
              amount: 50, // Maximum per request
              category: category.id,
              difficulty: difficulty,
              encode: 'url3986'
            };

            if (token) {
              params.token = token;
            }

            const response = await axios.get(this.baseUrl, { params });
            
            if (response.data.response_code === 0) {
              // Success - process questions
              const questions = response.data.results;
              await this.processQuestions(questions, category.name);
              questionsSinceReset += questions.length;
              
              console.log(`    ✅ Fetched ${questions.length} questions`);
              
              // If we got less than 50, we've exhausted this category/difficulty
              if (questions.length < 50) {
                hasMore = false;
              }
              
              // Rate limiting
              await this.sleep(1000);
            } else if (response.data.response_code === 4) {
              // Token exhausted - reset it
              console.log('    🔄 Token exhausted, resetting...');
              await this.resetToken(token);
              token = await this.getSessionToken();
              questionsSinceReset = 0;
              await this.sleep(2000);
            } else if (response.data.response_code === 1) {
              // No results - this category/difficulty is exhausted
              console.log('    ✓ No more questions available');
              hasMore = false;
            } else {
              console.log(`    ⚠️  API error code: ${response.data.response_code}`);
              hasMore = false;
            }
          } catch (error) {
            console.error(`    ❌ Error: ${error.message}`);
            attempts++;
            await this.sleep(5000); // Wait longer on error
          }
        }
      }
    }

    // Import our fallback questions too
    await this.importFallbackQuestions();

    console.log('\n' + '='.repeat(50));
    this.printStats();
  }

  async processQuestions(questions, categoryName) {
    for (const q of questions) {
      try {
        const questionText = decodeURIComponent(q.question);
        const correctAnswer = decodeURIComponent(q.correct_answer);
        const incorrectAnswers = q.incorrect_answers.map(a => decodeURIComponent(a));
        
        // Calculate word count
        const wordCount = questionText.split(' ').length;
        
        // Update stats
        this.stats.total++;
        this.stats.byDifficulty[q.difficulty]++;
        if (!this.stats.byWordCount[wordCount]) {
          this.stats.byWordCount[wordCount] = 0;
        }
        this.stats.byWordCount[wordCount]++;

        // Check if question already exists
        const existing = await knex('question_cache')
          .where('question_text', questionText)
          .where('correct_answer', correctAnswer)
          .first();

        if (!existing) {
          await knex('question_cache').insert({
            api_question_id: `opentdb_${q.category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            question_text: questionText,
            correct_answer: correctAnswer,
            incorrect_answers: JSON.stringify(incorrectAnswers),
            category: decodeURIComponent(q.category),
            difficulty: q.difficulty,
            tags: JSON.stringify([]),
            regions: JSON.stringify(['US']),
            quality_score: this.calculateQualityScore(questionText, wordCount),
            word_count: wordCount,
            is_active: wordCount <= 20, // Auto-activate questions with 20 words or less
            usage_count: 0,
            last_used: null
          });
          
          this.stats.imported++;
          this.stats.byCategory[categoryName]++;
        } else {
          this.stats.skipped++;
        }
      } catch (error) {
        console.error(`Failed to process question: ${error.message}`);
        this.stats.errors++;
      }
    }
  }

  async importFallbackQuestions() {
    console.log('\n📦 Importing fallback questions...');
    
    const fallbacks = [
      {
        text: "What is the capital of France?",
        category: "Geography",
        difficulty: "easy",
        correct_answer: "Paris",
        incorrect_answers: ["London", "Berlin", "Madrid"]
      },
      {
        text: "Which planet is known as the Red Planet?",
        category: "Science & Nature",
        difficulty: "easy",
        correct_answer: "Mars",
        incorrect_answers: ["Venus", "Jupiter", "Saturn"]
      },
      {
        text: "Who created Mickey Mouse?",
        category: "Entertainment: Cartoon & Animations",
        difficulty: "easy",
        correct_answer: "Walt Disney",
        incorrect_answers: ["Stan Lee", "Jim Henson", "Charles Schulz"]
      },
      {
        text: "In which sport would you perform a slam dunk?",
        category: "Sports",
        difficulty: "easy",
        correct_answer: "Basketball",
        incorrect_answers: ["Tennis", "Golf", "Baseball"]
      },
      {
        text: "What is the largest ocean on Earth?",
        category: "Geography",
        difficulty: "easy",
        correct_answer: "Pacific Ocean",
        incorrect_answers: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]
      },
      {
        text: "Which animal is known as the 'King of the Jungle'?",
        category: "Animals",
        difficulty: "easy",
        correct_answer: "Lion",
        incorrect_answers: ["Tiger", "Elephant", "Gorilla"]
      },
      {
        text: "Who painted the Mona Lisa?",
        category: "Art",
        difficulty: "medium",
        correct_answer: "Leonardo da Vinci",
        incorrect_answers: ["Pablo Picasso", "Vincent van Gogh", "Michelangelo"]
      },
      {
        text: "In which year did World War II end?",
        category: "History",
        difficulty: "medium",
        correct_answer: "1945",
        incorrect_answers: ["1944", "1946", "1943"]
      },
      {
        text: "What is the name of the first computer virus?",
        category: "Science: Computers",
        difficulty: "hard",
        correct_answer: "Creeper",
        incorrect_answers: ["ILOVEYOU", "Morris", "Brain"]
      },
      {
        text: "Who was the Greek god of dreams?",
        category: "Mythology",
        difficulty: "hard",
        correct_answer: "Morpheus",
        incorrect_answers: ["Hypnos", "Thanatos", "Oneiros"]
      }
    ];

    for (const q of fallbacks) {
      try {
        const wordCount = q.text.split(' ').length;
        
        const existing = await knex('question_cache')
          .where('question_text', q.text)
          .where('correct_answer', q.correct_answer)
          .first();

        if (!existing) {
          await knex('question_cache').insert({
            api_question_id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            question_text: q.text,
            correct_answer: q.correct_answer,
            incorrect_answers: JSON.stringify(q.incorrect_answers),
            category: q.category,
            difficulty: q.difficulty,
            tags: JSON.stringify(['fallback']),
            regions: JSON.stringify(['US']),
            quality_score: 90, // High quality fallbacks
            word_count: wordCount,
            is_active: true,
            usage_count: 0,
            last_used: null
          });
          
          this.stats.imported++;
        }
      } catch (error) {
        console.error(`Failed to import fallback: ${error.message}`);
      }
    }
  }

  printStats() {
    console.log('\n📊 IMPORT COMPLETE - STATISTICS:\n');
    console.log(`Total questions processed: ${this.stats.total}`);
    console.log(`✅ Imported: ${this.stats.imported}`);
    console.log(`⏭️  Skipped (duplicates): ${this.stats.skipped}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    
    console.log('\n📈 By Difficulty:');
    Object.entries(this.stats.byDifficulty).forEach(([diff, count]) => {
      console.log(`  ${diff}: ${count}`);
    });
    
    console.log('\n📏 Word Count Distribution:');
    const sortedWordCounts = Object.entries(this.stats.byWordCount)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
    
    let under15 = 0;
    let between15and20 = 0;
    let over20 = 0;
    
    sortedWordCounts.forEach(([words, count]) => {
      const w = parseInt(words);
      if (w <= 15) under15 += count;
      else if (w <= 20) between15and20 += count;
      else over20 += count;
      
      if (w <= 25) { // Only show up to 25 words
        console.log(`  ${words} words: ${count} questions`);
      }
    });
    
    console.log('\n📊 Summary:');
    console.log(`  ≤15 words: ${under15} questions (${(under15/this.stats.total*100).toFixed(1)}%)`);
    console.log(`  16-20 words: ${between15and20} questions (${(between15and20/this.stats.total*100).toFixed(1)}%)`);
    console.log(`  >20 words: ${over20} questions (${(over20/this.stats.total*100).toFixed(1)}%)`);
    
    console.log('\n💡 Recommendation:');
    console.log(`  You have ${under15} questions with 15 words or less.`);
    console.log(`  This should provide good variety for your trivia games!`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the import
async function main() {
  const importer = new OpenTDBImporter();
  
  try {
    await importer.importQuestions();
    console.log('\n✨ Import completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  main();
}

module.exports = OpenTDBImporter;
