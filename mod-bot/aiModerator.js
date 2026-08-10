/**
 * AI-based message classifier (Google Gemini API via Google AI Studio)
 * -------------------------------------------------------------------------
 * Directly asks Gemini whether a message contains cursing or a slur, in
 * ANY language. Genuinely free, no credit card needed — this goes through
 * Google AI Studio (aistudio.google.com), NOT Google Cloud Console, so it
 * skips the billing-account requirement entirely.
 *
 * Free tier limits (subject to change by Google): roughly 1,500
 * requests/day on Flash-Lite. Falls back to the local keyword lists in
 * autoMod.js if the API call fails or you hit the daily limit.
 *
 * Requires GEMINI_API_KEY to be set (in your .env file).
 * Get a key at: https://aistudio.google.com/apikey (sign in with a Google
 * account, click "Create API key" — no billing setup involved).
 */
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

// Words/abbreviations that should NEVER be flagged, regardless of what the
// model says — these are ambiguous (initials, gaming terms, names, etc.)
// and shouldn't get someone actioned on a false positive.
// Match is case-insensitive and whole-word only (won't match inside other words).
const ALLOWLIST = ['bj'];

function isAllowlisted(content) {
  const lower = content.toLowerCase();
  return ALLOWLIST.some((word) => {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    return re.test(lower);
  });
}

const SYSTEM_PROMPT = `You are a Discord moderation classifier. You will be given a single chat message, which may be in ANY language. Decide whether it contains:
- "curse": general profanity/swearing, in any language (not just English)
- "slur": a slur or targeted hateful/dehumanizing term directed at a person or group, in any language
Interpret the message regardless of what language it's in. A message can be neither, one, or both.

The following terms are explicitly NOT to be treated as profanity or slurs under any circumstances, even in combination with other words: ${ALLOWLIST.join(', ')}. If the message consists only of allowlisted terms plus otherwise-clean text, respond false/false.

Respond with ONLY a JSON object, no other text, no markdown formatting, in this exact form:
{"curse": true or false, "slur": true or false}`;

/**
 * @param {string} content - the raw message text to classify
 * @returns {Promise<{curse: boolean, slur: boolean} | null>} null on failure
 *   (caller should fall back to keyword-based detection)
 */
async function classifyWithAI(content) {
  if (!content || !content.trim()) {
    return { curse: false, slur: false };
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set — skipping AI classification.');
    return null;
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: content.slice(0, 2000) }] }],
        generationConfig: {
          maxOutputTokens: 50,
        },
      }),
    });

    if (!response.ok) {
      console.error('Gemini API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    let result = {
      curse: Boolean(parsed.curse),
      slur: Boolean(parsed.slur),
    };

    // Hard override: if the message is on the allowlist, force clean —
    // this runs regardless of what the model returned, so a model mistake
    // can't cause a false positive on these terms.
    if (isAllowlisted(content)) {
      result = { curse: false, slur: false };
    }

    return result;
  } catch (err) {
    console.error('AI classification failed:', err);
    return null; // caller should fall back to keyword-based detection
  }
}

module.exports = { classifyWithAI };