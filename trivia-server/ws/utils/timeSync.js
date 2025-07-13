const syncServerTime = {
  syncWithClient: async (clientTime) => ({
    serverTime: Date.now(),
    clientTime,
    latency: 50,
    offset: 0
  })
};

module.exports = { syncServerTime };
