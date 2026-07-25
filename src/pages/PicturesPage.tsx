import { useEffect, useMemo, useState } from 'react';
import { Camera, Search, Loader2 } from 'lucide-react';
import PageHero from '../components/PageHero';
import { supabase } from '../lib/supabaseClient';
import { photoCategories, type Photo, type PhotoCategory } from '../data';

type FilterValue = 'All' | PhotoCategory;

export default function PicturesPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('All');

  useEffect(() => {
    async function loadPhotos() {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPhotos(
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
          }))
        );
      }
      setLoading(false);
    }
    loadPhotos();
  }, []);

  const filters: FilterValue[] = ['All', ...photoCategories];

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      const matchesFilter = filter === 'All' || p.category === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q) ||
        p.photographer?.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [photos, query, filter]);

  const featured = filtered.find((p) => p.featured) ?? filtered[0];
  const rest = filtered.filter((p) => p.id !== featured?.id);

  return (
    <>
      <PageHero
        theme="media"
        eyebrow="Media Gallery"
        title="Pictures"
        subtitle="Browse official CSO media, featured operation images, community photos, recruitment scenes, and division highlights."
        tags={['Official Media', 'Community Photos', 'Featured Ops']}
      />

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 py-24 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading gallery...
          </div>
        ) : photos.length === 0 ? (
          <EmptyGallery />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {featured && (
                <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 lg:col-span-2">
                  <img
                    src={featured.imageUrl}
                    alt={featured.title}
                    className="h-[420px] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {featured.featured && (
                        <span className="rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold text-zinc-950">
                          Featured
                        </span>
                      )}
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                        {featured.category}
                      </span>
                    </div>
                    <h2 className="text-3xl font-black text-white sm:text-4xl">{featured.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-zinc-300">{featured.description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-zinc-400">
                      {featured.location && <span>{featured.location}</span>}
                      {featured.date && <span>{featured.date}</span>}
                      {featured.photographer && <span>Photo by {featured.photographer}</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6">
                {rest.slice(0, 1).map((p) => (
                  <div
                    key={p.id}
                    className="group relative h-[420px] overflow-hidden rounded-2xl border border-zinc-800/80"
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                        {p.category}
                      </span>
                      <h3 className="mt-2 text-lg font-bold text-white">{p.title}</h3>
                      <p className="mt-1 text-xs text-zinc-300">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {rest.length > 1 && (
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.slice(1).map((p) => (
                  <div
                    key={p.id}
                    className="group relative h-64 overflow-hidden rounded-2xl border border-zinc-800/80"
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                        {p.category}
                      </span>
                      <h3 className="mt-1.5 text-sm font-bold text-white">{p.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Search + filter gallery — stays active and ready even with zero photos */}
        <div className="mt-14 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
            Search Gallery
          </span>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category, location, or photographer..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                    filter === f
                      ? 'border-amber-400 bg-amber-400 text-zinc-950'
                      : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-amber-500/40 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function EmptyGallery() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/80">
        <Camera className="h-6 w-6 text-amber-400" />
      </div>
      <h2 className="mt-5 text-xl font-bold text-white">No photos yet</h2>
      <p className="mt-2 max-w-md text-sm text-zinc-400">
        The gallery is ready to go — add photos to the <code className="text-zinc-300">photos</code> array
        in <code className="text-zinc-300">data.ts</code>, or wire this page up to Supabase, and they'll
        show up here automatically.
      </p>
    </div>
  );
}
