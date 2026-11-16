import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { SupabaseDatabase } from './supabase-db.mjs';
const sharp = createRequire(import.meta.url)('sharp');
sharp.cache(false);
sharp.concurrency(2);
const ROOT = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function createApp(options = {}) {
  const env = { ...process.env, ...options };
  const production = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin, without a trailing slash or path.');
  if ((env.ADMIN_PASSWORD || '').length < 24 || (env.RATE_SECRET || '').length < 32) throw new Error('Run npm run setup, or configure ADMIN_PASSWORD (24+ chars) and RATE_SECRET (32+ chars).');
  if ([env.ADMIN_PASSWORD,env.RATE_SECRET].some(v=>v.startsWith('replace-with-'))) throw new Error('Replace the example secrets or run npm run setup.');
  if (production && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN.');
  const remote = !!env.SUPABASE_URL;
  if (production && !remote) throw new Error('Production requires SUPABASE_URL and SUPABASE_SECRET_KEY to preserve data on Render Free.');
  let db;
  if (remote) db = new SupabaseDatabase(env);
  else {
    const dataDir = resolve(env.DATA_DIR || join(ROOT, 'data'));
    mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(join(dataDir, 'tribute.sqlite'));
    db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
    db.exec('PRAGMA busy_timeout = 5000');
  }
  const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
  const mac = value => createHmac('sha256', env.RATE_SECRET).update(value).digest('hex');
  let activeUploads = 0;
  const staticFiles = new Map([
    ['/', ['index.html','text/html; charset=utf-8']], ['/admin', ['admin.html','text/html; charset=utf-8']],
    ['/style.css',['style.css','text/css; charset=utf-8']], ['/app.js',['app.js','text/javascript; charset=utf-8']],
    ['/admin.js',['admin.js','text/javascript; charset=utf-8']], ['/assets/gbo.jpg',['assets/gbo.jpg','image/jpeg']],
    ['/favicon.svg',['favicon.svg','image/svg+xml']], ['/robots.txt',['robots.txt','text/plain; charset=utf-8']]
  ]);
  const publicRow = row => ({ id: row.id, seq: row.seq, name: row.name, message: row.message, hasPhoto: !!row.has_photo, createdAt: row.created_at, ...(row.status ? {status:row.status} : {}) });
  async function rate(key, max, duration) {
    const now = Date.now();
    (await db.prepare('DELETE FROM limits WHERE expires < ?').run(now));
    const bucket = `${key}:${Math.floor(now / duration)}`;
    (await db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(bucket, now + duration));
    if ((await db.prepare('SELECT count FROM limits WHERE key=?').get(bucket)).count > max) fail(429,'Too many attempts. Please try again later.');
  }
  async function authorized(req) {
    const token = /(?:^|;\s*)gbo_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return token && (await db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(hash(token), Date.now()));
  }
  // 20 MiB files expand to about 28 MiB when base64-encoded in JSON.
  async function body(req, max = 29 * 1024 * 1024) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415,'Please send JSON.');
    if (Number(req.headers['content-length']) > max) fail(413,'This upload is too large. Choose a photo up to 20 MB.');
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) fail(413,'This upload is too large.');
      chunks.push(chunk);
    }
    try { const result = JSON.parse(Buffer.concat(chunks)); if (!result || Array.isArray(result) || typeof result !== 'object') throw 0; return result; }
    catch { fail(400,'The request could not be read.'); }
  }
  async function imageData(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail(400,'Choose a valid JPEG, PNG or WebP photo.');
    const input = Buffer.from(value, 'base64');
    if (!input.length || input.length > 20 * 1024 * 1024) fail(413,'Choose a photo up to 20 MB.');
    try {
      const decoder = sharp(input, { limitInputPixels: 50000000, failOn: 'warning', animated: false });
      const meta = await decoder.metadata();
      if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) > 1) fail(400,'Only still JPEG, PNG and WebP photos are supported.');
      // Decode and re-encode; never retain original bytes, filename, GPS or EXIF.
      return await decoder.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement:true }).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer();
    } catch (e) { if (e.status) throw e; fail(400,'This photo could not be read. Choose a smaller, valid JPEG, PNG or WebP.'); }
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, data, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { 'Content-Type':type, ...extra });
      res.end(req.method === 'HEAD' ? undefined : type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    if (production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const ip = env.TRUST_PROXY === '1' ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
      const visitor = mac(ip || 'unknown');
      if (req.method === 'POST') {
        if (req.headers.origin !== origin) fail(403,'Please submit from the website itself.');
        await rate(`post:${visitor}`, 40, 600000);
      }
      if (path === '/api/config' && req.method === 'GET') return send(200,config);
      if (path === '/health' && req.method === 'GET') { (await db.prepare('SELECT 1').get()); return send(200,{ok:true}); }
      if (path === '/api/challenge' && req.method === 'GET') {
        await rate(`challenge:${visitor}`, 60, 600000);
        const value = `${Date.now()}.${randomBytes(16).toString('hex')}`;
        return send(200,{ token:`${value}.${mac(value)}` });
      }
      if (path === '/api/entries' && req.method === 'GET') {
        const before = Math.min(Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        const filter = url.searchParams.get('filter') === 'photos' ? ' AND photo IS NOT NULL' : '';
        const rows = (await db.prepare(`SELECT seq,id,name,message,created_at,photo IS NOT NULL AS has_photo FROM entries WHERE status='approved' AND seq < ?${filter} ORDER BY seq DESC LIMIT 25`).all(before));
        const totals = (await db.prepare("SELECT count(*) AS wishes,coalesce(sum(photo IS NOT NULL),0) AS photos FROM entries WHERE status='approved'").get());
        return send(200,{entries: rows.map(publicRow),next:rows.length === 25 ? rows.at(-1).seq : null,totals});
      }
      if (path === '/api/entries' && req.method === 'POST') {
        await rate(`submit:${visitor}`, 8, 3600000);
        await rate('submit:global', 300, 86400000);
        // One large decode at a time keeps full-resolution photos within the
        // 512 MB memory budget of Render Free.
        if (activeUploads >= 1) fail(503,'Another photo is uploading. Please try again in a moment.');
        activeUploads++;
        try {
          const input = await body(req);
          if (input.website) fail(400,'Submission could not be accepted.');
          if (!uuid.test(input.requestId || '')) fail(400,'Please refresh and try again.');
          const prior = (await db.prepare('SELECT id FROM entries WHERE request_id=?').get(input.requestId));
          if (prior) return send(202,{id:prior.id,status:'pending'});
          const parts = typeof input.token === 'string' ? input.token.split('.') : [];
          const age = Date.now() - Number(parts[0]);
          if (parts.length !== 3 || !equal(parts[2],mac(`${parts[0]}.${parts[1]}`)) || age < 1000 || age > 7200000) fail(400,'Please refresh the form and try again.');
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          const message = typeof input.message === 'string' ? input.message.trim() : '';
          if (!name || name.length > 60 || message.length < 2 || message.length > 1200) fail(400,'Add your name (up to 60 characters) and a message (2–1,200 characters).');
          if (input.consent !== true) fail(400,'Please confirm you have permission to share.');
          let photo = input.photo ? await imageData(input.photo) : null;
          // The hosted database also enforces capacity inside its insert transaction.
          const capacity = (await db.prepare('SELECT count(*) AS n,coalesce(sum(length(photo)),0) AS bytes FROM entries').get());
          if (capacity.n >= 3000 || capacity.bytes + (photo?.length || 0) > 256 * 1024 * 1024) fail(503,'The archive is full. Please contact the host.');
          const id = randomUUID();
          try { (await db.prepare('INSERT INTO entries(id,request_id,name,message,photo,created_at) VALUES (?,?,?,?,?,?)').run(id,input.requestId,name,message,photo,new Date().toISOString())); }
          catch (e) { const retry = (await db.prepare('SELECT id FROM entries WHERE request_id=?').get(input.requestId)); if (retry) return send(202,{id:retry.id,status:'pending'}); throw e; }
          return send(202,{id,status:'pending'});
        } finally { activeUploads--; }
      }
      if (path === '/api/admin/login' && req.method === 'POST') {
        await rate(`login:${visitor}`, 5, 900000);
        const input = await body(req, 2048);
        if (typeof input.password !== 'string' || !equal(input.password,env.ADMIN_PASSWORD)) fail(401,'Incorrect password.');
        (await db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()));
        const token = randomBytes(32).toString('hex');
        (await db.prepare('INSERT INTO sessions(token,expires) VALUES (?,?)').run(hash(token),Date.now()+8*3600000));
        return send(200,{ok:true},undefined,{'Set-Cookie':`gbo_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${production ? '; Secure' : ''}`});
      }
      if (path.startsWith('/api/admin/')) {
        if (!(await authorized(req))) fail(401,'Please sign in.');
        if (path === '/api/admin/logout' && req.method === 'POST') {
          const token = /gbo_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
          if(token) (await db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token)));
          return send(200,{ok:true},undefined,{'Set-Cookie':`gbo_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`});
        }
        if (path === '/api/admin/entries' && req.method === 'GET') {
          const status = url.searchParams.get('status') === 'approved' ? 'approved' : 'pending';
          const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
          const rows = (await db.prepare('SELECT seq,id,name,message,status,created_at,photo IS NOT NULL AS has_photo FROM entries WHERE status=? AND seq<? ORDER BY seq DESC LIMIT 25').all(status,before));
          return send(200,{entries:rows.map(publicRow),next:rows.length===25?rows.at(-1).seq:null});
        }
        if (path === '/api/admin/moderate' && req.method === 'POST') {
          const input = await body(req,2048);
          if (!uuid.test(input.id || '') || !['approve','hide','delete'].includes(input.action)) fail(400,'Invalid action.');
          const result = input.action === 'delete' ? (await db.prepare('DELETE FROM entries WHERE id=?').run(input.id)) : (await db.prepare('UPDATE entries SET status=? WHERE id=?').run(input.action==='approve'?'approved':'pending',input.id));
          if (!result.changes) fail(404,'Entry not found.');
          return send(200,{ok:true});
        }
      }
      const photoMatch = /^\/api\/(admin\/)?photos\/([a-f0-9-]+)$/.exec(path);
      if (photoMatch && req.method === 'GET') {
        if (!uuid.test(photoMatch[2])) fail(404,'Photo not found.');
        const row = (await db.prepare(`SELECT photo FROM entries WHERE id=?${photoMatch[1] ? '' : " AND status='approved'"}`).get(photoMatch[2]));
        if (!row?.photo) fail(404,'Photo not found.');
        return send(200,Buffer.from(row.photo),'image/jpeg',{'Content-Disposition':'inline; filename="memory.jpg"'});
      }
      if (['GET','HEAD'].includes(req.method) && staticFiles.has(path)) {
        const [file,type] = staticFiles.get(path);
        return send(200,readFileSync(join(ROOT,'public',file)),type);
      }
      fail(404,'Not found.');
    } catch (error) {
      if (!error.status) console.error('Request failed:',error.code || error.name);
      if (!res.headersSent) {
        if(error.status===429) res.setHeader('Retry-After','900');
        if(error.status===413) res.setHeader('Connection','close');
        send(error.status || 500,{error:error.status?error.message:'Something went wrong. Please try again.'});
      } else res.end();
    }
  });
  server.requestTimeout=120000;
  server.headersTimeout=15000;
  server.maxHeadersCount=40;
  server.on('close',()=>db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  const port = Number(process.env.PORT || 3000);
  server.listen(port,process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'),()=>console.log(`Gbo 25 running at http://localhost:${port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
