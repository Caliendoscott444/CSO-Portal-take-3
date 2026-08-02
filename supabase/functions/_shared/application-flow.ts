// Shared helpers for the DM-based CSO application flow.
//
// Used by:
//   - discord-interactions   -> /apply command, template picker, the
//                                multiple-choice dropdown answers, and the
//                                Cancel Application button (all delivered to
//                                Discord's Interactions webhook, even in DMs)
//   - process-dm-application -> called by the always-on bot process (see
//                                /bot) whenever a user sends a plain-text
//                                DM reply, since Discord only delivers those
//                                over the Gateway, not the Interactions
//                                webhook.
//
// Both functions read/write the same `pending_applications` row for a given
// application-in-progress:
//   template_id, discord_user_id, discord_username,
//   answers (jsonb, keyed by question id), current_step (0-based index of
//   the question currently awaiting an answer)

const CSO_LOGO_URL = "https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png";

export function discordApiFactory(botToken: string) {
  return async function discordApi(path: string, init: RequestInit = {}) {
    return fetch(`https://discord.com/api/v10${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  };
}

// Opens (or reuses) a DM channel with the user and sends a message payload
// (embeds/components/content) into it. Returns null if the DM couldn't be
// sent (most commonly: the user has DMs from server members turned off).
export async function sendDMPayload(botToken: string, discordUserId: string, payload: any) {
  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmRes.ok) return null;
  const dmChannel = await dmRes.json();

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return msgRes.ok ? await msgRes.json() : null;
}

export async function loadOrderedQuestions(supabase: any, templateId: string) {
  const { data } = await supabase
    .from("application_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

// Builds the DM message for a given question. On the first question, an
// extra "Application Started" embed is prepended (matches the reference
// screenshot). Multiple-choice questions get a dropdown; every question
// gets a Cancel Application button.
export function buildQuestionMessage(pendingId: string, question: any, index: number, total: number) {
  const embeds: any[] = [];

  if (index === 0) {
    embeds.push({
      title: "Application Started",
      description:
        "Please answer the questions below, either by clicking on the dropdown menus or sending a message to the bot.",
      color: 0x57f287,
    });
  }

  embeds.push({
    title: "CSO Application",
    description: `${index + 1}/${total}. ${question.question_text}`,
    color: 0x5865f2,
    footer: {
      text:
        question.question_type === "multiple_choice"
          ? "To answer this question, please select an option from the dropdown menu."
          : "To answer this question, please send a message to the bot with your response.",
    },
  });

  const components: any[] = [];

  if (question.question_type === "multiple_choice") {
    const choices: string[] = Array.isArray(question.choices) ? question.choices : [];
    components.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `apply_answer_select:${pendingId}`,
          placeholder: "Choose an answer...",
          options: choices.slice(0, 25).map((c: string) => ({
            label: c.slice(0, 100),
            value: c.slice(0, 100),
          })),
        },
      ],
    });
  }

  components.push({
    type: 1,
    components: [{ type: 2, style: 4, label: "Cancel Application", custom_id: `apply_cancel:${pendingId}` }],
  });

  return { embeds, components };
}

// Saves the submission + answers, deletes the pending row, and posts the
// review embed to the applications channel. Shared by both edge functions
// so a submission always looks the same regardless of which one finished it.
export async function finalizeApplication(
  supabase: any,
  discordApi: (path: string, init?: RequestInit) => Promise<Response>,
  applicationsChannelId: string,
  pending: any,
  answers: Record<string, string>,
) {
  const { data: template } = await supabase
    .from("application_templates")
    .select("*")
    .eq("id", pending.template_id)
    .single();

  const questions = await loadOrderedQuestions(supabase, pending.template_id);

  const { data: submission, error: subErr } = await supabase
    .from("application_submissions")
    .insert({
      template_id: pending.template_id,
      discord_user_id: pending.discord_user_id,
      discord_username: pending.discord_username,
    })
    .select()
    .single();

  await supabase.from("pending_applications").delete().eq("id", pending.id);

  if (subErr || !submission) {
    return { error: true as const };
  }

  const answerRows = questions.map((q: any) => ({
    submission_id: submission.id,
    question_id: q.id,
    question_text: q.question_text,
    answer_text: answers[q.id] ?? "",
  }));
  if (answerRows.length > 0) {
    await supabase.from("application_answers").insert(answerRows);
  }

  if (applicationsChannelId) {
    const embedFields = questions.map((q: any, i: number) => ({
      name: `${i + 1}. ${q.question_text}`.slice(0, 256),
      value: (answers[q.id] || "\u2014").slice(0, 1024),
    }));

    await discordApi(`/channels/${applicationsChannelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        embeds: [
          {
            title: `${pending.discord_username}'s '${template?.name ?? "Application"}' Application Submitted`,
            color: 0xf5b942,
            thumbnail: { url: CSO_LOGO_URL },
            fields: embedFields,
            footer: { text: `Submission ID: ${submission.id}` },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Accept", custom_id: `app_accept:${submission.id}` },
              { type: 2, style: 4, label: "Deny", custom_id: `app_deny:${submission.id}` },
              { type: 2, style: 2, label: "Check AI", custom_id: `app_checkai:${submission.id}` },
            ],
          },
        ],
      }),
    });
  }

  return { error: false as const, submissionId: submission.id };
}
