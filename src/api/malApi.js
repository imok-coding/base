export async function fetchAnimeList() {
  const url = 'https://imokmalworker.imokissick.workers.dev/';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch MAL list');
  return res.json();
}
