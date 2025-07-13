// profanityMiddleware.js - Middleware for profanity checking
module.exports = function(profanityService) {
  return {
    async checkProfanity(text) {
      if (!text || typeof text !== 'string') {
        return { hasProfanity: false };
      }

      try {
        // Check if profanityService exists and has checkText method
        if (!profanityService || typeof profanityService.checkText !== 'function') {
          console.error('ProfanityService not properly initialized');
          return { hasProfanity: false };
        }

        const isClean = await profanityService.checkText(text);

        if (!isClean) {  // If NOT clean, then it has profanity
          const funnyMessages = [
            "🚨 WOAH THERE! Our trivia bot nearly fainted! That nickname needs a bar of soap. Try something more family-friendly!",
            "🎤 *mic drop* That nickname just got REJECTED! Our game show host is blushing. Pick something cleaner!",
            "🔥 HOT TAKE: That nickname is too spicy for prime time! Let's keep it PG, superstar!",
            "🚫 BUZZ! Wrong answer! That nickname wouldn't make it past the censors. Give us something grandma would approve!",
            "🎪 PLOT TWIST! Your nickname got bounced by security. Even our virtual bouncers have standards!",
            "🌶️ TOO MUCH SAUCE! That nickname is burning our servers. Cool it down with something nicer!",
            "💥 BOOM! That nickname just broke our family-friendly meter. Dial it back to Disney Channel levels!",
            "🎭 DRAMATIC PAUSE... Nope! That nickname didn't pass the audition. Try again with less controversy!",
            "🚀 HOUSTON, WE HAVE A PROBLEM! That nickname won't fly in our space station. Keep it cosmic but clean!",
            "🎨 CREATIVE... but REJECTED! Even our artistic AI has limits. Paint us a cleaner picture with your nickname!"
          ];

          const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];

          return {
            hasProfanity: true,
            message: randomMessage
          };
        }

        return { hasProfanity: false };
      } catch (error) {
        logger.error('Error checking profanity:', error);
        return { hasProfanity: false };
      }
    }
  };
};
