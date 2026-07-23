/**
 * Mock Gemini message generation.
 * In a real scenario, this would call the Google Gemini API.
 */
export async function generateDynamicMessage(prompt: string): Promise<string> {
  console.log('[GEMINI PROMPT]:', prompt);
  
  // Basic mock responses based on prompt keywords
  if (prompt.includes('celebrate')) {
    return "Outstanding performance! 🚀 Your strategies are hitting the mark. Keep up the momentum! 💰";
  }
  if (prompt.includes('motivational')) {
    return "The market is a tough teacher, but you're a fast learner. 💪 Refine your entry points and stay disciplined. Success is coming! 🛡️";
  }
  
  return "Analyzing your performance data... You're showing consistent growth in your trading patterns. 📈";
}
