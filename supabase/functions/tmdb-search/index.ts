import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchGenreMap(apiKey: string) {
  const [movieResponse, tvResponse] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=ko-KR`),
    fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}&language=ko-KR`),
  ]);
  const [movieData, tvData] = await Promise.all([movieResponse.json(), tvResponse.json()]);
  const movieGenres = Object.fromEntries((movieData.genres || []).map((genre: any) => [genre.id, genre.name]));
  const tvGenres = Object.fromEntries((tvData.genres || []).map((genre: any) => [genre.id, genre.name]));
  return { movie: movieGenres, tv: tvGenres };
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

  const response = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`);
  if (!response.ok) return json({ error: 'TMDB request failed.' }, response.status);

  const [data, genreMap] = await Promise.all([response.json(), fetchGenreMap(apiKey)]);
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
