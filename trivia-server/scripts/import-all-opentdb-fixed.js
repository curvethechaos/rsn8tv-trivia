// Fixed version with better rate limiting
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
      console.error('Failed to get session token:', error.message);
      return null;
    }
  }

  async getAllCategories() {
    try {
      const response = await axios.get(this.categoryUrl);
      return response.data.trivia_categories;
    } catch (error) {
      console.error('Failed to get categories:', error.message);
      return [];
    }
  }

  calculateQualityScore(question, wordCount) {
    let score = 50;
    if (wordCount >= 12 && wordCount <= 15) score += 50;
    else if (wordCount >= 10 && wordCount <= 17) score += 30;
    else if (wordCount >= 8 && wordCount <= 20) score += 10;
    else if (wordCount < 8) score -= 20;
    else if (wordCount > 25) score -= 30;
    return Math.max(0, Math.min(100, score));
  }

  async importQuestions() {
    console.log('🚀 Starting OpenTDB bulk import with rate limiting...\n');
    
    const categories = await this.getAllCategories();
    console.log(`📁 Found ${categories.length} categories\n`);

    const difficulties = ['easy', 'medium', 'hard'];
    
    // Process one category at a time with delays
    for (let catIndex = 0; catIndex < categories.length; catIndex++) {
      const category = categories[catIndex];
      console.log(`\n📂 [${catIndex + 1}/${categories.length}] Processing: ${category.name}`);
      this.stats.byCategory[category.name] = 0;

      for (const difficulty of difficulties) {
        console.log(`  📊 Difficulty: ${difficulty}`);
        
        try {
          // IMPORTANT: 5 second delay between API calls
          await this.sleep(5000);
          
          const params = {
            amount: 50,
            category: category.id,
            difficulty: difficulty,
            encode: 'url3986'
          };

          const response = await axios.get(this.baseUrl, { 
            params,
            timeout: 10000 
          });
          
          if (response.data.response_code === 0) {
            const questions = response.data.results;
            await this.processQuestions(questions, category.name);
            console.log(`    ✅ Imported ${questions.length} questions`);
          } else if (response.data.response_code === 1) {
            console.log(`    ℹ️  No questions available for this combination`);
          }
        } catch (error) {
          if (error.response && error.response.status === 429) {
            console.log('    ⏸️  Rate limited - waiting 30 seconds...');
            await this.sleep(30000);
            // Retry once
            try {
              const response = await axios.get(this.baseUrl, { 
                params: {
                  amount: 50,
                  category: category.id,
                  difficulty: difficulty,
                  encode: 'url3986'
                },
                timeout: 10000 
              });
              if (response.data.response_code === 0) {
                await this.processQuestions(response.data.results, category.name);
                console.log(`    ✅ Imported ${response.data.results.length} questions (after retry)`);
              }
            } catch (retryError) {
              console.log(`    ❌ Failed after retry: ${retryError.message}`);
              this.stats.errors++;
            }
          } else {
            console.log(`    ❌ Error: ${error.message}`);
            this.stats.errors++;
          }
        }
      }
      
      // Progress update every 5 categories
      if ((catIndex + 1) % 5 === 0) {
        console.log(`\n📊 Progress: ${this.stats.imported} questions imported so far...`);
      }
    }

    console.log('\n' + '='.repeat(50));
    this.printStats();
  }

  async processQuestions(questions, categoryName) {
    for (const q of questions) {
      try {
        const questionText = decodeURIComponent(q.question);
        const correctAnswer = decodeURIComponent(q.correct_answer);
        const incorrectAnswers = q.incorrect_answers.map(a => decodeURIComponent(a));
        
        const wordCount = questionText.split(' ').length;
        
        this.stats.total++;
        this.stats.byDifficulty[q.difficulty]++;
        if (!this.stats.byWordCount[wordCount]) {
          this.stats.byWordCount[wordCount] = 0;
        }
        this.stats.byWordCount[wordCount]++;

        const existing = await knex('question_cache')
          .where('question_text', questionText)
          .where('correct_answer', correctAnswer)
          .first();

        if (!existing) {
          await knex('question_cache').insert({
            api_question_id: `opentdb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            question_text: questionText,
            correct_answer: correctAnswer,
            incorrect_answers: JSON.stringify(incorrectAnswers),
            category: decodeURIComponent(q.category),
            difficulty: q.difficulty,
            tags: JSON.stringify([]),
            regions: JSON.stringify(['US']),
            quality_score: this.calculateQualityScore(questionText, wordCount),
            word_count: wordCount,
            is_active: wordCount <= 20,
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
    let under15 = 0;
    let between15and20 = 0;
    let over20 = 0;
    
    Object.entries(this.stats.byWordCount).forEach(([words, count]) => {
      const w = parseInt(words);
      if (w <= 15) under15 += count;
      else if (w <= 20) between15and20 += count;
      else over20 += count;
    });
    
    console.log(`  ≤15 words: ${under15} questions (${(under15/this.stats.total*100).toFixed(1)}%)`);
    console.log(`  16-20 words: ${between15and20} questions`);
    console.log(`  >20 words: ${over20} questions`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Add better error handling for database connection
async function main() {
  try {
    // Test database connection first
    await knex.raw('SELECT 1');
    console.log('✅ Database connected successfully');
    
    const importer = new OpenTDBImporter();
    await importer.importQuestions();
    
    console.log('\n✨ Import completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

main();
