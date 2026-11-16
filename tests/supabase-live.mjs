// Opt-in smoke test against the configured Supabase project. Uses and removes
// one test record; never prints keys, passwords or photo bytes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SupabaseDatabase } from '../supabase-db.mjs';
const db = new SupabaseDatabase(process.env);
assert.ok(await db.prepare('SELECT 1').get());
const id=randomUUID(), requestId=randomUUID();
const photo=readFileSync(new URL('../public/assets/gbo.jpg',import.meta.url));
try {
  await db.prepare('INSERT INTO entries(id,request_id,name,message,photo,created_at) VALUES (?,?,?,?,?,?)').run(id,requestId,'Deployment test','Temporary storage verification',photo,new Date().toISOString());
  assert.equal((await db.prepare('SELECT id FROM entries WHERE request_id=?').get(requestId)).id,id);
  assert.equal(await db.prepare("SELECT photo FROM entries WHERE id=? AND status='approved'").get(id),undefined);
  await db.prepare('UPDATE entries SET status=? WHERE id=?').run('approved',id);
  const recovered=await new SupabaseDatabase(process.env).prepare("SELECT photo FROM entries WHERE id=? AND status='approved'").get(id);
  assert.ok(photo.equals(recovered.photo));
  const totals=await db.prepare("SELECT count(*) AS wishes,coalesce(sum(photo IS NOT NULL),0) AS photos FROM entries WHERE status='approved'").get();
  assert.ok(totals.photos>=1);
  const key=`test:${id}`;
  await db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,1);
  await db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,1);
  assert.equal((await db.prepare('SELECT count FROM limits WHERE key=?').get(key)).count,2);
  await db.prepare('DELETE FROM limits WHERE expires < ?').run(Date.now());
  console.log('PASS: live Supabase persistence, photo privacy, binary round-trip, totals, rate limits.');
} finally {
  await db.prepare('DELETE FROM entries WHERE id=?').run(id);
}
