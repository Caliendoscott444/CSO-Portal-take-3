import { useEffect, useState } from 'react';
import { Trash2, ImagePlus, Loader2, Star } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { photoCategories, type Photo, type PhotoCategory } from '../../data';

type Row = Photo & { created_at?: string };

const emptyForm = {
  title: '',
  description: '',
  imageUrl: '',
  category: 'Community' as PhotoCategory,
  location: '',
  date: '',
  photographer: '',
  featured: false,
};

export default function MediaManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function loadPhotos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setRows(
        data.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          imageUrl: row.image_url,
          category: row.category,
          location: row.location ?? undefined,
          date: row.date ?? undefined,
          photographer: row.photographer ?? undefined,
          featured: row.featured ?? false,
          created_at: row.created_at,
        }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadPhotos();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.description.trim() || !form.imageUrl.trim()) {
      setError('Title, caption, and image link are required.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('photos').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.imageUrl.trim(),
      category: form.category,
      location: form.location.trim() || null,
      date: form.date.trim() || null,
      photographer: form.photographer.trim() || null,
      featured: form.featured,
    });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(emptyForm);
    loadPhotos();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this photo from the gallery?')) return;
    await supabase.from('photos').delete().eq('id', id);
    loadPhotos();
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-black text-white">Media Manager</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Add photos to the public Pictures gallery. Paste a direct image link (Imgur, Discord
        attachment link, etc.) — it'll show up on the site right away.
      </p>

      {/* Add photo form */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 grid grid-cols-1 gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Image link
          </label>
          <input
            type="text"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Title
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Trooper Group Photo"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Caption
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Troopers gather for an official department media photo in uniform."
            rows={2}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Category
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as PhotoCategory })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 focus:border-amber-500/50 focus:outline-none"
          >
            {photoCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            id="featured"
            checked={form.featured}
            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/50"
          />
          <label htmlFor="featured" className="text-sm text-zinc-300">
            Feature this photo at the top of the gallery
          </label>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Location <span className="normal-case text-zinc-600">(optional)</span>
          </label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="CSO Facility"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Date <span className="normal-case text-zinc-600">(optional)</span>
          </label>
          <input
            type="text"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            placeholder="July 14, 2026"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Photographer <span className="normal-case text-zinc-600">(optional)</span>
          </label>
          <input
            type="text"
            value={form.photographer}
            onChange={(e) => setForm({ ...form, photographer: e.target.value })}
            placeholder="Unknown"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Add Photo
          </button>
        </div>
      </form>

      {/* Existing photos */}
      <div className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
          Current Gallery ({rows.length})
        </h2>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No photos added yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40"
              >
                <img src={p.imageUrl} alt={p.title} className="h-36 w-full object-cover" />
                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    {p.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{p.category}</p>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/80 text-zinc-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
