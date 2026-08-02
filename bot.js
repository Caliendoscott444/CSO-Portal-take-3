// CSO Application DM Bot
//
// Runs as an always-on Gateway bot (Railway, not Supabase — this needs a
// persistent connection, which Edge Functions can't provide).
//
// Flow:
//   1. User DMs the bot the word "apply" (case-insensitive) to start.
//   2. Bot loads the active application template + its questions from
//      Supabase (the same `application_templates` / `application_questions`
//      tables your CSO Portal admin panel manages).
//   3. Bot asks one question at a time in DMs and waits for a plain-text
//      reply — this is the part the existing modal-based /apply flow
//      can't do.
//   4. When all questions are answered, the bot writes a row to
//      `application_submissions` + one row per answer to
//      `application_answers` — the exact same tables your portal's
//      ApplicationsManager.tsx already reads. Submissions from this bot
//      show up there automatically, no changes needed on that end.
//   5. Bot posts a confirmation embed to your applications channel and
//      confirms to the user in DM.
//
// This runs ALONGSIDE your existing /apply modal command — it doesn't
// touch or replace it. Both ways to apply keep working.
//
// --- Required environment variables ---
//   DISCORD_BOT_TOKEN        - Discord Developer Portal -> your app -> Bot -> Token
//   SUPABASE_URL             - same Supabase project as your other functions
//   SUPABASE_SERVICE_ROLE_KEY
//   APPLICATIONS_CHANNEL_ID  - channel to post completed submissions to
//
// --- Known limitation ---
//   Sessions are held in memory only. If the bot restarts mid-application,
//   that user's in-progress answers are lost and they'll need to type
//   "apply" again to restart. Fine for most use cases; let me know if you
//   want sessions persisted to Supabase instead so restarts are safe.

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const {
  DISCORD_BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APPLICATIONS_CHANNEL_ID,
} = process.env;

for (const [name, val] of Object.entries({
  DISCORD_BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APPLICATIONS_CHANNEL_ID,
})) {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// discordUserId -> { templateId, templateName, questions, index, answers: [{questionId, questionText, answerText}] }
const sessions = new Map();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.type !== 1 /* DM */) return; // ignore guild messages

    const userId = message.author.id;
    const content = message.content.trim();
    const existing = sessions.get(userId);

    if (!existing) {
      if (content.toLowerCase() === "apply") {
        await startApplication(userId, message);
      }
      return;
    }

    await handleAnswer(existing, content, message);
  } catch (err) {
    console.error("Error handling message:", err);
    try {
      await message.reply(
        "Something went wrong on my end — please try again, or contact staff if this keeps happening.",
      );
    } catch {
      // best-effort
    }
  }
});

async function startApplication(userId, message) {
  const { data: template, error: templateErr } = await supabase
    .from("application_templates")
    .select("*")
    .eq("is_active", true)
    .order("display_order")
    .limit(1)
    .maybeSingle();

  if (templateErr || !template) {
    await message.reply("There's no active application open right now. Please check back later.");
    return;
  }

  const { data: questions, error: questionsErr } = await supabase
    .from("application_questions")
    .select("*")
    .eq("template_id", template.id)
    .order("sort_order");

  if (questionsErr || !questions || questions.length === 0) {
    await message.reply("The application form isn't set up yet — please contact staff.");
    return;
  }

  sessions.set(userId, {
    templateId: template.id,
    templateName: template.name,
    questions,
    index: 0,
    answers: [],
  });

  await message.reply(
    `**${template.name}**\nI'll ask you ${questions.length} question${questions.length === 1 ? "" : "s"} one at a time — just reply here with your answer to each.`,
  );
  await sendQuestion(sessions.get(userId), message);
}

async function sendQuestion(session, message) {
  const q = session.questions[session.index];
  let prompt = `**${session.index + 1}/${session.questions.length}.** ${q.question_text}`;

  if (q.question_type === "multiple_choice" && Array.isArray(q.choices) && q.choices.length > 0) {
    prompt += `\n*Options: ${q.choices.join(", ")}*`;
  }

  await message.channel.send(prompt);
}

async function handleAnswer(session, content, message) {
  const q = session.questions[session.index];

  if (q.question_type === "multiple_choice" && Array.isArray(q.choices) && q.choices.length > 0) {
    const match = q.choices.find((c) => c.toLowerCase() === content.toLowerCase());
    if (!match) {
      await message.reply(`Please reply with one of: ${q.choices.join(", ")}`);
      return;
    }
    session.answers.push({ question_id: q.id, question_text: q.question_text, answer_text: match });
  } else {
    session.answers.push({ question_id: q.id, question_text: q.question_text, answer_text: content });
  }

  session.index += 1;

  if (session.index < session.questions.length) {
    await sendQuestion(session, message);
    return;
  }

  await finishApplication(session, message);
}

async function finishApplication(session, message) {
  const userId = message.author.id;

  const { data: submission, error: submissionErr } = await supabase
    .from("application_submissions")
    .insert({
      template_id: session.templateId,
      discord_user_id: userId,
      discord_username: message.author.username,
      status: "pending",
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (submissionErr || !submission) {
    console.error("Failed to save submission:", submissionErr);
    await message.reply("I couldn't save your application — please contact staff.");
    sessions.delete(userId);
    return;
  }

  const answerRows = session.answers.map((a) => ({
    submission_id: submission.id,
    question_text: a.question_text,
    answer_text: a.answer_text,
  }));

  const { error: answersErr } = await supabase.from("application_answers").insert(answerRows);
  if (answersErr) {
    console.error("Failed to save answers:", answersErr);
  }

  await message.reply("Thanks — your application has been submitted for review!");

  try {
    const channel = await client.channels.fetch(APPLICATIONS_CHANNEL_ID);
    if (channel?.isTextBased()) {
      await channel.send({
        embeds: [
          {
            title: `New Application: ${session.templateName}`,
            description: `Submitted by <@${userId}> (${message.author.username})`,
            fields: session.answers.slice(0, 25).map((a) => ({
              name: a.question_text.slice(0, 256),
              value: (a.answer_text || "—").slice(0, 1024),
            })),
            timestamp: new Date().toISOString(),
            color: 0xf59e0b,
          },
        ],
      });
    }
  } catch (err) {
    console.error("Failed to post submission embed:", err);
  }

  sessions.delete(userId);
}

client.login(DISCORD_BOT_TOKEN);
