class TimeSync {
  constructor() {
    this.serverTimeOffset = 0;
  }

  async syncWithClient(clientTime) {
    const serverTime = Date.now();
    const roundTripTime = serverTime - clientTime;
    const estimatedLatency = roundTripTime / 2;
    
    return {
      serverTime,
      clientTime,
      latency: estimatedLatency,
      offset: serverTime - clientTime - estimatedLatency
    };
  }
}

const syncServerTime = new TimeSync();

module.exports = { syncServerTime };
