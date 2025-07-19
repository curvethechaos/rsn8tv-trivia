// Mock Redis client for development
function getRedisClient() {
  return {
    get: async (key) => {
      console.log(`Redis GET: ${key}`);
      return null;
    },
    set: async (key, value) => {
      console.log(`Redis SET: ${key} = ${value}`);
      return 'OK';
    },
    setex: async (key, ttl, value) => {
      console.log(`Redis SETEX: ${key} for ${ttl}s = ${value}`);
      return 'OK';
    },
    del: async (key) => {
      console.log(`Redis DEL: ${key}`);
      return 1;
    },
    exists: async (key) => {
      console.log(`Redis EXISTS: ${key}`);
      return 0;
    },
    keys: async (pattern) => {
      console.log(`Redis KEYS: ${pattern}`);
      return [];
    }
  };
}

module.exports = { getRedisClient };
