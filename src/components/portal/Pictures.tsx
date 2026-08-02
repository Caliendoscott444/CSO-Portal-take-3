import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Picture = {
  id: string;
  url: string;
  caption: string | null;
  created_at: string;
};

export default function Pictures() {
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('pictures')
      .select('id, url, caption, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPictures(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Media</p>
      <h1 className="mt-1 text-2xl font-black text-white">Pictures</h1>
      <p className="mt-1 text-sm text-zinc-400">Featured photos and official media from CSO.</p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : pictures.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No pictures have been uploaded yet.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {pictures.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              <img src={p.url} alt={p.caption ?? ''} className="w-full object-cover" />
              {p.caption && (
                <p className="px-5 py-4 text-base text-zinc-300">{p.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
