// test-db.js - Test database connection
const db = require('./db/connection');

async function testDatabase() {
  console.log('Testing database connection...');
  
  try {
    // Test basic connection
    await db.raw('SELECT 1');
    console.log('✅ Database connection established successfully');
    
    // Test a simple query
    const result = await db.raw('SELECT current_timestamp as time, version() as version');
    console.log('Database info:', {
      time: result.rows[0].time,
      version: result.rows[0].version
    });
    
    // Check if migrations have been run
    const hasSessionsTable = await db.schema.hasTable('sessions');
    const hasPlayersTable = await db.schema.hasTable('players');
    const hasPlayerProfilesTable = await db.schema.hasTable('player_profiles');
    
    console.log('\nDatabase tables status:');
    console.log(`- sessions table: ${hasSessionsTable ? '✅ exists' : '❌ missing'}`);
    console.log(`- players table: ${hasPlayersTable ? '✅ exists' : '❌ missing'}`);
    console.log(`- player_profiles table: ${hasPlayerProfilesTable ? '✅ exists' : '❌ missing'}`);
    
    if (!hasSessionsTable || !hasPlayersTable || !hasPlayerProfilesTable) {
      console.log('\n⚠️  Some tables are missing. Run migrations with: npm run migrate:latest');
    }
    
    // List all tables in the database
    const tables = await db.raw(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    console.log('\nAll tables in database:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    
    console.log('\n✅ Database connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Make sure your database credentials in .env are correct');
    console.error('\nFull error:', error);
  } finally {
    // Close the connection
    await db.destroy();
  }
}

// Run the test
testDatabase();
