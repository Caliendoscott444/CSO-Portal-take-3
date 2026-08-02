import { useEffect, useState } from 'react';
import { Trash2, Plus, Loader2, ChevronUp, ChevronDown, Check, X, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type Template = {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
};

type QuestionType = 'text' | 'paragraph' | 'multiple_choice';

type Question = {
  id: string;
  template_id: string;
  question_text: string;
  question_type: QuestionType;
  choices: string[] | null;
  sort_order: number;
};

type Submission = {
  id: string;
  template_id: string;
  discord_user_id: string;
  discord_username: string | null;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by_name: string | null;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type Answer = {
  id: string;
  question_text: string;
  answer_text: string | null;
};

export default function ApplicationsManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  async function loadTemplates() {
    const { data } = await supabase.from('application_templates').select('*').order('display_order');
    setTemplates(data ?? []);
    if (!selectedTemplateId && data && data.length > 0) setSelectedTemplateId(data[0].id);
  }

  async function loadQuestions(templateId: string) {
    const { data } = await supabase
      .from('application_questions')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order');
    setQuestions(data ?? []);
  }

  async function loadSubmissions() {
    let query = supabase.from('application_submissions').select('*').order('submitted_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;
    setSubmissions(data ?? []);
  }

  async function loadAll() {
    setLoading(true);
    await loadTemplates();
    await loadSubmissions();
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) loadQuestions(selectedTemplateId);
  }, [selectedTemplateId]);

  useEffect(() => {
    loadSubmissions();
  }, [statusFilter]);

  async function addTemplate() {
    if (!newTemplateName.trim()) return;
    const { error } = await supabase.from('application_templates').insert({
      name: newTemplateName.trim(),
      display_order: templates.length,
    });
    if (!error) {
      setNewTemplateName('');
      loadTemplates();
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this application and all its questions? Existing submissions are kept.')) return;
    await supabase.from('application_templates').delete().eq('id', id);
    if (selectedTemplateId === id) setSelectedTemplateId(null);
    loadTemplates();
  }

  async function toggleTemplateActive(t: Template) {
    await supabase.from('application_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    loadTemplates();
  }

  async function addQuestion() {
    if (!selectedTemplateId) return;
    await supabase.from('application_questions').insert({
      template_id: selectedTemplateId,
      question_text: 'New question',
      question_type: 'text',
      sort_order: questions.length,
    });
    loadQuestions(selectedTemplateId);
  }

  async function updateQuestion(q: Question, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, ...patch } : x)));
    await supabase.from('application_questions').update(patch).eq('id', q.id);
  }

  async function deleteQuestion(id: string) {
    await supabase.from('application_questions').delete().eq('id', id);
    if (selectedTemplateId) loadQuestions(selectedTemplateId);
  }

  async function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const a = questions[index];
    const b = questions[target];
    const reordered = [...questions];
    reordered[index] = b;
    reordered[target] = a;
    setQuestions(reordered);
    await Promise.all([
      supabase.from('application_questions').update({ sort_order: target }).eq('id', a.id),
      supabase.from('application_questions').update({ sort_order: index }).eq('id', b.id),
    ]);
    if (selectedTemplateId) loadQuestions(selectedTemplateId);
  }

  async function openSubmission(s: Submission) {
    setViewingSubmission(s);
    setReviewNote(s.review_note ?? '');
    const { data } = await supabase
      .from('application_answers')
      .select('id, question_text, answer_text')
      .eq('submission_id', s.id);
    setAnswers(data ?? []);
  }

  async function review(action: 'approve' | 'deny') {
    if (!viewingSubmission) return;
    setReviewing(true);

    const { data: authData } = await supabase.auth.getUser();
    const reviewerName = authData?.user?.user_metadata?.discord_username ?? authData?.user?.email ?? 'Admin';
    const reviewerDiscordId = authData?.user?.user_metadata?.provider_id ?? null;

    const { error } = await supabase.functions.invoke('review-application', {
      body: {
        submissionId: viewingSubmission.id,
        action,
        note: reviewNote.trim() || null,
        reviewerDiscordId,
        reviewerName,
      },
    });

    setReviewing(false);
    if (error) {
      alert('Failed to submit review: ' + error.message);
      return;
    }

    setViewingSubmission(null);
    setAnswers([]);
    loadSubmissions();
  }

  const questionTypeLabel: Record<QuestionType, string> = {
    text: 'Short text',
    paragraph: 'Paragraph',
    multiple_choice: 'Multiple choice',
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-black text-white">Applications Manager</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Build application question sets and review member submissions from /apply.
      </p>

      {/* Templates */}
      <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Application types</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplateId(t.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                selectedTemplateId === t.id
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {t.name}
              {!t.is_active && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">off</span>}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="New application name, e.g. K9 Application"
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
          <button
            onClick={addTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {selectedTemplateId && (
          <div className="mt-4 flex items-center gap-3 border-t border-zinc-800 pt-4">
            {(() => {
              const t = templates.find((x) => x.id === selectedTemplateId);
              if (!t) return null;
              return (
                <>
                  <button
                    onClick={() => toggleTemplateActive(t)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                  >
                    {t.is_active ? 'Disable in /apply' : 'Enable in /apply'}
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete application
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Question builder */}
      {selectedTemplateId && (
        <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
              Questions ({questions.length})
            </h2>
            <button
              onClick={addQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Discord shows 5 questions per modal step — with {questions.length} questions this application takes{' '}
            {Math.max(1, Math.ceil(questions.length / 5))} step{Math.max(1, Math.ceil(questions.length / 5)) === 1 ? '' : 's'} to fill out.
          </p>

          <div className="mt-4 space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      onClick={() => moveQuestion(i, -1)}
                      disabled={i === 0}
                      className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveQuestion(i, 1)}
                      disabled={i === questions.length - 1}
                      className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-2">
                    <textarea
                      value={q.question_text}
                      onChange={(e) => updateQuestion(q, { question_text: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500/50 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={q.question_type}
                        onChange={(e) => updateQuestion(q, { question_type: e.target.value as QuestionType })}
                        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-amber-500/50 focus:outline-none"
                      >
                        {(Object.keys(questionTypeLabel) as QuestionType[]).map((t) => (
                          <option key={t} value={t}>{questionTypeLabel[t]}</option>
                        ))}
                      </select>
                      {q.question_type === 'multiple_choice' && (
                        <input
                          type="text"
                          value={(q.choices ?? []).join(', ')}
                          onChange={(e) =>
                            updateQuestion(q, {
                              choices: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Choices, comma-separated (e.g. Yes, No)"
                          className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => deleteQuestion(q.id)}
                    className="text-zinc-500 hover:text-red-400"
                    aria-label="Delete question"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {questions.length === 0 && (
              <p className="text-sm text-zinc-500">No questions yet — add one above.</p>
            )}
          </div>
        </div>
      )}

      {/* Submissions */}
      <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Submissions</h2>
          <div className="flex gap-1.5">
            {(['pending', 'approved', 'denied', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                  statusFilter === s
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : submissions.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No submissions here.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {submissions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{s.discord_username ?? s.discord_user_id}</p>
                  <p className="text-xs text-zinc-500">
                    {s.status === 'pending'
                      ? `Submitted ${new Date(s.submitted_at).toLocaleString()}`
                      : `${s.status === 'approved' ? 'Approved' : 'Denied'} by ${s.reviewed_by_name ?? 'reviewer'}`}
                  </p>
                </div>
                <button
                  onClick={() => openSubmission(s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review modal */}
      {viewingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-white">
                  {viewingSubmission.discord_username ?? viewingSubmission.discord_user_id}
                </p>
                <p className="text-xs text-zinc-500">Submitted {new Date(viewingSubmission.submitted_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setViewingSubmission(null)} className="text-zinc-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {answers.map((a) => (
                <div key={a.id}>
                  <p className="text-xs font-semibold text-zinc-500">{a.question_text}</p>
                  <p className="mt-0.5 text-sm text-zinc-200">{a.answer_text || '—'}</p>
                </div>
              ))}
            </div>

            {viewingSubmission.status === 'pending' ? (
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Note (sent with the accept/deny message)
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder="Overall you seem like a promising candidate..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => review('approve')}
                    disabled={reviewing}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60"
                  >
                    {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
                  </button>
                  <button
                    onClick={() => review('deny')}
                    disabled={reviewing}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-60"
                  >
                    {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Deny
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {viewingSubmission.status === 'approved' ? 'Approved' : 'Denied'} by {viewingSubmission.reviewed_by_name}
                </p>
                {viewingSubmission.review_note && (
                  <p className="mt-1 text-sm text-zinc-300">{viewingSubmission.review_note}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
