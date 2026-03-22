/**
 * Tracklib API client.
 * All requests go through the Next.js proxy at www.tracklib.com/api/proxy/
 * which forwards to api.tracklib.com. No authentication required for search + previews.
 */

const PROXY_BASE = "https://www.tracklib.com/api/proxy";

export interface TracklibSound {
  id: number;
  name: string;
  kind: "one_shot" | "loop";
  library_path: string;
  length: number; // milliseconds
  tempo: number;
  key: string;
  created_at: string;
  published_at: string;
  sample_pack: {
    id: number;
    name: string;
    path_pack: string;
    path_origin: string;
    slug?: string;
  };
  genres: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  play_url: string;
  popularity: number;
}

export interface TracklibTrack {
  id: number;
  BPM: number;
  length: number;
  name: string;
  popularity: number;
  slug: string;
  song: {
    id: number;
    title: string;
    ascii_title: string;
    release_year: number;
    slug: string;
    artists: { id: number; name: string; slug: string }[];
    genres?: { id: number; name: string; slug: string }[];
    cover_art?: string;
    play_url?: string;
  };
  types: { id: number; name: string }[];
  library_path: string;
}

export interface TracklibSearchResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
  facets?: Record<string, unknown>;
}

export interface TracklibGenre {
  id: number;
  name: string;
  parent: number | null;
  image: string;
  description: string;
  slug: string;
}

/**
 * Search for sounds (one-shots, loops, FX).
 */
export function buildSoundSearchUrl(params: {
  query?: string;
  limit?: number;
  offset?: number;
  kind?: "one_shot" | "loop";
  genres?: number[];
  categories?: number[];
  tags?: number[];
  key?: string;
  min_tempo?: number;
  max_tempo?: number;
  ordering?: string;
}): string {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set("search", params.query);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());
  if (params.kind) searchParams.set("kind", params.kind);
  if (params.key) searchParams.set("key", params.key);
  if (params.min_tempo) searchParams.set("min_tempo", params.min_tempo.toString());
  if (params.max_tempo) searchParams.set("max_tempo", params.max_tempo.toString());
  if (params.ordering) searchParams.set("ordering", params.ordering);

  if (params.genres?.length) {
    params.genres.forEach(g => searchParams.append("genres", g.toString()));
  }
  if (params.categories?.length) {
    params.categories.forEach(c => searchParams.append("categories", c.toString()));
  }
  if (params.tags?.length) {
    params.tags.forEach(t => searchParams.append("tags", t.toString()));
  }

  return `${PROXY_BASE}/search/sound/?${searchParams.toString()}`;
}

/**
 * Search for tracks (full songs for sampling).
 */
export function buildTrackSearchUrl(params: {
  query?: string;
  limit?: number;
  offset?: number;
  genres?: number[];
  min_bpm?: number;
  max_bpm?: number;
  key?: string;
  ordering?: string;
}): string {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set("search", params.query);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());
  if (params.key) searchParams.set("key", params.key);
  if (params.min_bpm) searchParams.set("min_bpm", params.min_bpm.toString());
  if (params.max_bpm) searchParams.set("max_bpm", params.max_bpm.toString());
  if (params.ordering) searchParams.set("ordering", params.ordering);

  if (params.genres?.length) {
    params.genres.forEach(g => searchParams.append("genres", g.toString()));
  }

  return `${PROXY_BASE}/search/track/?${searchParams.toString()}`;
}

/**
 * Get all available genres.
 */
export function getGenresUrl(): string {
  return `${PROXY_BASE}/genres/`;
}

/**
 * Get all available labels.
 */
export function getLabelsUrl(): string {
  return `${PROXY_BASE}/sounds/labels/`;
}

/**
 * Get a collection by ID.
 */
export function getCollectionUrl(id: number): string {
  return `${PROXY_BASE}/collection/${id}`;
}

/**
 * Get sound filter config (available keys, instruments, tempo ranges).
 */
export function getFilterConfigUrl(): string {
  return `${PROXY_BASE}/search/sound-filter-config/`;
}

/**
 * Get sample pack genres.
 */
export function getSamplePackGenresUrl(): string {
  return `${PROXY_BASE}/sounds/sample-pack-genres/`;
}
