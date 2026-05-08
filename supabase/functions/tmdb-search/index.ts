import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let genreCache: { expiresAt: number; value: { movie: Record<number, string>; tv: Record<number, string> } } | null = null;
const GENRE_CACHE_MS = 1000 * 60 * 60 * 24;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchGenreMap(apiKey: string) {
  if (genreCache && genreCache.expiresAt > Date.now()) return genreCache.value;

  const [movieResponse, tvResponse] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=ko-KR`),
    fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}&language=ko-KR`),
  ]);
  const [movieData, tvData] = await Promise.all([movieResponse.json(), tvResponse.json()]);
  const movieGenres = Object.fromEntries((movieData.genres || []).map((genre: any) => [genre.id, genre.name]));
  const tvGenres = Object.fromEntries((tvData.genres || []).map((genre: any) => [genre.id, genre.name]));
  genreCache = {
    expiresAt: Date.now() + GENRE_CACHE_MS,
    value: { movie: movieGenres, tv: tvGenres },
  };
  return genreCache.value;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('TMDB_API_KEY');
  if (!apiKey) return json({ error: 'TMDB_API_KEY is not configured.' }, 500);

  const { query } = await req.json().catch(() => ({ query: '' }));
  const q = String(query || '').trim();
  if (!q) return json({ results: [] });

  const params = new URLSearchParams({
    api_key: apiKey,
    query: q,
    language: 'ko-KR',
    include_adult: 'false',
  });

  const [response, genreMap] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/search/multi?${params}`),
    fetchGenreMap(apiKey),
  ]);
  if (!response.ok) return json({ error: 'TMDB request failed.' }, response.status);

  const data = await response.json();
  const results = (data.results || [])
    .filter((item: any) => ['movie', 'tv'].includes(item.media_type))
    .slice(0, 8)
    .map((item: any) => ({
      id: item.id,
      title: item.title || item.name,
      mediaType: item.media_type,
      year: String(item.release_date || item.first_air_date || '').slice(0, 4),
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
      genres: (item.genre_ids || [])
        .map((id: number) => genreMap[item.media_type === 'movie' ? 'movie' : 'tv'][id])
        .filter(Boolean),
      overview: item.overview || '',
    }));

  return json({ results });
});
