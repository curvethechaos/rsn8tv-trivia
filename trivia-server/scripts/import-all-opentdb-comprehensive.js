#!/usr/bin/env node

/**
 * Comprehensive OpenTDB Import Script
 * Imports ALL available questions from OpenTDB API
 * 
 * OpenTDB has 24 categories with up to 50 questions per difficulty per category
 * This script will fetch all questions systematically
 */

require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const knex = require('../db/connection');
const { decode } = require('html-entities');

// OpenTDB Categories (as of 2024)
const CATEGORIES = [
  { id: 9, name: 'General Knowledge' },
  { id: 10, name: 'Entertainment: Books' },
  { id: 11, name: 'Entertainment: Film' },
  { id: 12, name: 'Entertainment: Music' },
  { id: 13, name: 'Entertainment: Musicals & Theatres' },
  { id: 14, name: 'Entertainment: Television' },
  { id: 15, name: 'Entertainment: Video Games' },
  { id: 16, name: 'Entertainment: Board Games' },
  { id: 17, name: 'Science & Nature' },
  { id: 18, name: 'Science: Computers' },
  { id: 19, name: 'Science: Mathematics' },
  { id: 20, name: 'Mythology' },
  { id: 21, name: 'Sports' },
  { id: 22, name: 'Geography' },
  { id: 23, name: 'History' },
  { id: 24, name: 'Politics' },
  { id: 25, name: 'Art' },
  { id: 26, name: 'Celebrities' },
  { id: 27, name: 'Animals' },
  { id: 28, name: 'Vehicles' },
  { id: 29, name: 'Entertainment: Comics' },
  { id: 30, name: 'Science: Gadgets' },
  { id: 31, name: 'Entertainment: Japanese Anime & Manga' },
  { id: 32, name: 'Entertainment: Cartoon & Animations' }
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Statistics tracking
const stats = {
  totalFetched: 0,
  totalInserted: 0,
  duplicates: 0,
  errors: 0,
  byCategory: {},
  byDifficulty: { easy: 0, medium: 0, hard: 0 }
};

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 5000; // 5 seconds to respect API limits
const MAX_RETRIES = 3;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchQuestionsFromAPI(categoryId, difficulty, retryCount = 0) {
  try {
    const url = `https://opentdb.com/api.php?amount=50&category=${categoryId}&difficulty=${difficulty}&type=multiple`;
    console.log(`Fetching ${difficulty} questions for category ${categoryId}...`);
    
    const response = await axios.get(url, { timeout: 30000 });
    
    if (response.data.response_code === 0) {
      return response.data.results;
    } else if (response.data.response_code === 1) {
      console.log(`No questions available for category ${categoryId} - ${difficulty}`);
      return [];
    } else {
      throw new Error(`API returned code ${response.data.response_code}`);
    }
  } catch (error) {
    console.error(`Error fetching category ${categoryId} - ${difficulty}:`, error.message);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(DELAY_BETWEEN_REQUESTS * 2);
      return fetchQuestionsFromAPI(categoryId, difficulty, retryCount + 1);
    }
    
    stats.errors++;
    return [];
  }
}

function formatQuestion(rawQuestion, categoryName) {
  const questionText = decode(rawQuestion.question);
  const correctAnswer = decode(rawQuestion.correct_answer);
  const incorrectAnswers = rawQuestion.incorrect_answers.map(ans => decode(ans));
  
  // Calculate word count
  const wordCount = questionText.split(/\s+/).length;
  
  // Generate a unique ID based on question content
  const apiQuestionId = `opentdb_${Buffer.from(questionText).toString('base64').substring(0, 20)}`;
  
  return {
    api_question_id: apiQuestionId,
    question_text: questionText,
    correct_answer: correctAnswer,
    incorrect_answers: JSON.stringify(incorrectAnswers),
    category: categoryName,
    difficulty: rawQuestion.difficulty,
    word_count: wordCount,
    quality_score: calculateQualityScore(wordCount, rawQuestion.difficulty),
    is_active: true,
    times_used: 0,
    tags: JSON.stringify([]),
    regions: JSON.stringify([])
  };
}

function calculateQualityScore(wordCount, difficulty) {
  // Base score
  let score = 50;
  
  // Prefer shorter questions
  if (wordCount <= 10) score += 20;
  else if (wordCount <= 15) score += 10;
  else if (wordCount > 20) score -= 10;
  else if (wordCount > 30) score -= 20;
  
  // Adjust by difficulty
  if (difficulty === 'easy') score += 5;
  else if (difficulty === 'hard') score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

async function insertQuestions(questions) {
  let inserted = 0;
  let duplicates = 0;
  
  for (const question of questions) {
    try {
      await knex('question_cache').insert(question);
      inserted++;
      stats.totalInserted++;
      stats.byDifficulty[question.difficulty]++;
      
      if (!stats.byCategory[question.category]) {
        stats.byCategory[question.category] = 0;
      }
      stats.byCategory[question.category]++;
      
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        duplicates++;
        stats.duplicates++;
      } else {
        console.error('Insert error:', error.message);
        stats.errors++;
      }
    }
  }
  
  return { inserted, duplicates };
}

async function importAllQuestions() {
  console.log('=== Comprehensive OpenTDB Import Starting ===');
  console.log(`Categories to process: ${CATEGORIES.length}`);
  console.log(`Difficulties per category: ${DIFFICULTIES.length}`);
  console.log(`Max questions per request: 50`);
  console.log(`Theoretical maximum: ${CATEGORIES.length * DIFFICULTIES.length * 50} questions`);
  console.log('');
  
  const startTime = Date.now();
  
  for (const category of CATEGORIES) {
    console.log(`\n=== Processing ${category.name} ===`);
    
    for (const difficulty of DIFFICULTIES) {
      // Fetch questions
      const rawQuestions = await fetchQuestionsFromAPI(category.id, difficulty);
      stats.totalFetched += rawQuestions.length;
      
      if (rawQuestions.length > 0) {
        // Format questions
        const formattedQuestions = rawQuestions.map(q => formatQuestion(q, category.name));
        
        // Insert into database
        const { inserted, duplicates } = await insertQuestions(formattedQuestions);
        
        console.log(`  ${difficulty}: ${rawQuestions.length} fetched, ${inserted} inserted, ${duplicates} duplicates`);
      } else {
        console.log(`  ${difficulty}: No questions available`);
      }
      
      // Rate limiting
      await sleep(DELAY_BETWEEN_REQUESTS);
    }
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  // Print final statistics
  console.log('\n=== Import Complete ===');
  console.log(`Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`Total questions fetched: ${stats.totalFetched}`);
  console.log(`Total questions inserted: ${stats.totalInserted}`);
  console.log(`Duplicates skipped: ${stats.duplicates}`);
  console.log(`Errors: ${stats.errors}`);
  
  console.log('\nBy Difficulty:');
  Object.entries(stats.byDifficulty).forEach(([diff, count]) => {
    console.log(`  ${diff}: ${count}`);
  });
  
  console.log('\nBy Category:');
  Object.entries(stats.byCategory)
    .sort(([,a], [,b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  
  // Check word count distribution
  const wordCountStats = await knex('question_cache')
    .select(knex.raw('COUNT(*) as count, AVG(word_count) as avg_words, MIN(word_count) as min_words, MAX(word_count) as max_words'))
    .first();
    
  console.log('\nWord Count Statistics:');
  console.log(`  Total questions in DB: ${wordCountStats.count}`);
  console.log(`  Average word count: ${Math.round(wordCountStats.avg_words)}`);
  console.log(`  Min word count: ${wordCountStats.min_words}`);
  console.log(`  Max word count: ${wordCountStats.max_words}`);
  
  const shortQuestions = await knex('question_cache')
    .where('word_count', '<=', 15)
    .count('* as count')
    .first();
    
  console.log(`  Questions with ≤15 words: ${shortQuestions.count} (${Math.round(shortQuestions.count / wordCountStats.count * 100)}%)`);
}

// Main execution
(async () => {
  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('Database connected successfully\n');
    
    // Run import
    await importAllQuestions();
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
