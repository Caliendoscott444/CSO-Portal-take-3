# Discord Auto-Moderation Bot

Automatically moderates cursing, slurs, and NSFW links, logs every action, and DMs the offending user with proof.

## What it does

| Trigger | Action |
|---|---|
| Cursing (general profanity) | Timeout for 5 minutes |
| Slur | Ban |
| NSFW link | Ban |

Every action:
1. Deletes the offending message
2. Posts a "Case #N" embed (matching your existing format) to the **log channel**
3. Posts the same embed to **general chat**
4. DMs the same embed to the **user**
5. Includes "proof" — the original message text, a jump link to it, and the channel it was sent in

Case numbers are saved to `cases.json` so they keep incrementing across bot restarts.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Set your bot token as an environment variable:
   ```
   export DISCORD_TOKEN=your_token_here
   ```
3. Open `autoMod.js` and fill in `CONFIG.GENERAL_CHANNEL_ID` with your general chat channel's ID (the log channel ID is already set to `1462468083905204330`).
4. In the Discord Developer Portal, enable the **Message Content Intent** and **Server Members Intent** for your bot.
5. Make sure your bot's role is positioned **above** the roles of anyone it needs to time out or ban, and has the **Timeout Members** and **Ban Members** permissions.
6. Run it:
   ```
   npm start
   ```

## Customizing detection

- **AI-based detection (free, no credit card)**: Set `CONFIG.USE_AI_MODERATION = true` in `autoMod.js` (on by default) and add a `GEMINI_API_KEY` to your `.env` file:
  ```
  DISCORD_TOKEN=your_discord_token
  GEMINI_API_KEY=your_gemini_api_key
  ```
  To get a key: go to https://aistudio.google.com/apikey, sign in with a Google account, and click "Create API key." No credit card, no Google Cloud billing setup — this goes through Google AI Studio, which is a separate, simpler signup path than Google Cloud Console.

  Each message is sent to Gemini (a small, fast model) and directly asked whether it contains cursing or a slur, in any language — this understands context and catches multilingual profanity, misspellings, and variations that the local word lists below would miss. The free tier allows roughly 1,500 requests/day (subject to change by Google). If the API call ever fails (rate limit, network issue, missing key), the bot automatically falls back to the local word lists below, so moderation never goes fully silent.
- **Multilingual curse detection (local fallback, always on)**: Handled via the `naughty-words` word lists, covering ~28 languages. Configure which languages to check in `CONFIG.MULTILINGUAL_CURSE_LANGUAGES` in `autoMod.js`. No API key needed for this part — it runs alongside the AI check above and takes over automatically if the AI call ever fails.
- **Curses (keyword fallback)**: handled by the `obscenity` library's built-in English dataset.
- **Slurs (keyword fallback)**: matched against `CONFIG.CUSTOM_SLUR_WORDS` in `autoMod.js` — obscenity's default dataset doesn't separate slurs from general profanity, so this list (or the AI check above) is what actually drives the ban tier.
- **NSFW links**: matched against `CONFIG.NSFW_DOMAINS` in `autoMod.js` — add more domains as you run into them. (The AI check doesn't cover links since it can't visit them.)
- **Timeout duration**: change `CONFIG.TIMEOUT_DURATION_MS`.

## Notes

- If a user has DMs closed, the DM step will silently fail but the log channel and general chat will still have the record — the bot won't crash.
- The bot only acts on members it's actually able to moderate (`member.moderatable`), so it won't error out trying to time out/ban someone with a higher role (e.g., another mod or the server owner).
