function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateNickname(nickname) {
  // Check length
  if (!nickname || nickname.length < 2 || nickname.length > 20) {
    return false;
  }

  // Check for profanity (basic filter - expand as needed)
  const profanityList = [
    // Add inappropriate words here
  ];

  const lowerNickname = nickname.toLowerCase();
  for (const word of profanityList) {
    if (lowerNickname.includes(word)) {
      return false;
    }
  }

  return true;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 255); // Limit length
}

module.exports = {
  validateEmail,
  validateNickname,
  sanitizeInput
};
