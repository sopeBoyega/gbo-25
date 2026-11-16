import { readFileSync } from 'node:fs';
const queries = new Set(JSON.parse(readFileSync(new URL('./supabase-queries.json', import.meta.url), 'utf8')));

// HTTPS Data API works on Render Free without a direct IPv6 Postgres connection.
// Only this server sees the secret key; the browser keeps using our moderated API.
export class SupabaseDatabase {
  constructor(env) {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Invalid SUPABASE_URL');
    this.url = url.origin;
    this.key = env.SUPABASE_SECRET_KEY;
    if (!this.key || this.key.startsWith('sb_publishable_')) throw new Error('Set the server-only SUPABASE_SECRET_KEY in Render.');
  }
  prepare(query) {
    if (!queries.has(query)) throw new Error('Unsupported database query');
    const execute = async params => {
      const response = await fetch(`${this.url}/rest/v1/rpc/gbo_query`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { apikey: this.key, ...(this.key.startsWith('eyJ') ? { Authorization: `Bearer ${this.key}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, params: params.map(v => Buffer.isBuffer(v) || v instanceof Uint8Array ? '\\x' + Buffer.from(v).toString('hex') : v) })
      });
      if (!response.ok) throw Object.assign(new Error('Database request failed. Check Supabase setup and server key.'), { code: `SUPABASE_${response.status}` });
      const data = await response.json();
      if (Array.isArray(data)) for (const row of data) {
        if (typeof row.photo === 'string' && row.photo.startsWith('\\x')) row.photo = Buffer.from(row.photo.slice(2), 'hex');
      }
      return data;
    };
    return { all: (...args) => execute(args), get: async (...args) => (await execute(args))[0], run: (...args) => execute(args) };
  }
  close() {}
}
