const COOKIE = 'ba_admin';
async function sendSchoolEmail(env, subject, message) {
if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.EMAIL_TO) {
console.error('Email configuration is incomplete.');
return false;
}

const response = await fetch('https://api.resend.com/emails', {
method: 'POST',
headers: {
'Authorization': `Bearer ${env.RESEND_API_KEY}`,
'Content-Type': 'application/json'
},
body: JSON.stringify({
from: env.EMAIL_FROM,
to: [env.EMAIL_TO],
subject,
text: message
})
});

if (!response.ok) {
console.error('Resend email failed:', await response.text());
return false;
}

return true;
}

const schema = `
CREATE TABLE IF NOT EXISTS ba_students (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admission_number TEXT UNIQUE,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 gender TEXT,
 guardian TEXT,
 phone TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_subjects (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(name, class_name)
);
CREATE TABLE IF NOT EXISTS ba_marks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL,
 subject_id INTEGER NOT NULL,
 term TEXT NOT NULL,
 year INTEGER NOT NULL,
 score REAL NOT NULL,
 out_of REAL NOT NULL,
 comment TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_fees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL,
 term TEXT NOT NULL,
 year INTEGER NOT NULL,
 amount_paid REAL DEFAULT 0,
 balance REAL DEFAULT 0,
 reference TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_content (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_admissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 child_name TEXT NOT NULL,
 class_applied TEXT,
 parent_name TEXT,
 phone TEXT,
 email TEXT,
 message TEXT,
 status TEXT DEFAULT 'Pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 email TEXT,
 phone TEXT,
 message TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_sessions (
 token_hash TEXT PRIMARY KEY,
 expires INTEGER NOT NULL
);
`;

const json = (data, status = 200, headers = {}) =>
 new Response(JSON.stringify(data), {
  status,
  headers: {
   'content-type': 'application/json; charset=utf-8',
   'cache-control': 'no-store',
   ...headers
  }
 });

const fail = (message, status = 400) =>
 json({ error: message }, status);

const str = (v, max = 4000) =>
 String(v ?? '').trim().slice(0, max);

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const hash = async value => {
 const b = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value)
 );
 return [...new Uint8Array(b)]
  .map(x => x.toString(16).padStart(2, '0')).join('');
};

const sign = async (value, secret) => {
 const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign']
 );
 const b = await crypto.subtle.sign(
  'HMAC', key, new TextEncoder().encode(value)
 );
 return [...new Uint8Array(b)]
  .map(x => x.toString(16).padStart(2, '0')).join('');
};

function cookieValue(req) {
 const c = req.headers.get('Cookie') || '';
 const p = c.split(';')
  .map(x => x.trim())
  .find(x => x.startsWith(COOKIE + '='));

 if (!p) return '';

 try {
  return decodeURIComponent(p.slice(COOKIE.length + 1));
 } catch {
  return '';
 }
}

async function authorized(req, env) {
 if (!env.DB || !env.SESSION_SECRET) return false;

 const p = cookieValue(req).split('.');
 if (p.length !== 2) return false;

 const [token, signature] = p;

 if (signature !== await sign(token, env.SESSION_SECRET))
  return false;

 const row = await env.DB.prepare(
  'SELECT expires FROM ba_sessions WHERE token_hash = ?'
 ).bind(await hash(token)).first();

 return !!row && row.expires > Math.floor(Date.now() / 1000);
}

async function readBody(req) {
 try {
  return await req.json();
 } catch {
  throw new Error('Please submit valid form data.');
 }
}

async function all(db, sql, ...params) {
 const r = await db.prepare(sql).bind(...params).all();
 return r.results || [];
}

async function has(db, table, id) {
 const allowed = [
  'ba_students', 'ba_subjects', 'ba_marks', 'ba_fees',
  'ba_announcements', 'ba_admissions', 'ba_messages'
 ];

 if (!allowed.includes(table)) return false;

 return !!await db.prepare(
  `SELECT id FROM ${table} WHERE id = ?`
 ).bind(id).first();
}

const setCookie = (value, age) =>
 `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;

export async function onRequest({ request, env }) {
 if (!env.DB)
  return fail('Cloudflare D1 binding DB is missing.', 500);

 try {
  for (const query of schema.split(';').map(x => x.trim()).filter(Boolean)) {
   await env.DB.prepare(query).run();
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method;

  const match = path.match(/^([a-z-]+)\/(\d+)$/);
  const resource = match ? match[1] : path;
  const id = match ? Number(match[2]) : 0;

  if (path === 'health' && method === 'GET')
   return json({ ok: true });

  if (path === 'login' && method === 'POST') {
   if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)
    return fail('Admin password or session secret is not configured.', 503);

   const b = await readBody(request);

   if (
    str(b.email, 250).toLowerCase() !==
     String(env.ADMIN_EMAIL || 'brightangels26@gmail.com').toLowerCase() ||
    str(b.password, 500) !== env.ADMIN_PASSWORD
   ) {
    return fail('Email or password is incorrect.', 401);
   }

   const token = crypto.randomUUID() + crypto.randomUUID();
   const expires = Math.floor(Date.now() / 1000) + 28800;

   await env.DB.prepare(
    'INSERT INTO ba_sessions(token_hash, expires) VALUES(?, ?)'
   ).bind(await hash(token), expires).run();

   const value = encodeURIComponent(
    token + '.' + await sign(token, env.SESSION_SECRET)
   );

   return json({ ok: true }, 200, {
    'set-cookie': setCookie(value, 28800)
   });
  }

  if (path === 'logout' && method === 'POST') {
   const token = cookieValue(request).split('.')[0];

   if (token) {
    await env.DB.prepare(
     'DELETE FROM ba_sessions WHERE token_hash = ?'
    ).bind(await hash(token)).run();
   }

   return json({ ok: true }, 200, {
    'set-cookie': setCookie('', 0)
   });
  }

  if (path === 'admissions' && method === 'POST') {
   const b = await readBody(request);
   const child = str(b.child_name, 200);

   if (!child) return fail('Child name is required.');

   const r = await env.DB.prepare(
    `INSERT INTO ba_admissions
     (child_name, class_applied, parent_name, phone, email, message)
     VALUES (?, ?, ?, ?, ?, ?)`
   ).bind(
    child,
    str(b.class_applied, 80),
    str(b.parent_name, 200),
    str(b.phone, 80),
    str(b.email, 250),
    str(b.message)
   ).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (path === 'messages' && method === 'POST') {
   const b = await readBody(request);

   if (!str(b.message))
    return fail('Message is required.');

   const r = await env.DB.prepare(
    `INSERT INTO ba_messages (name, email, phone, message)
     VALUES (?, ?, ?, ?)`
   ).bind(
    str(b.name, 200),
    str(b.email, 250),
    str(b.phone, 80),
    str(b.message)
   ).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (path === 'announcements' && method === 'GET')
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_announcements ORDER BY id DESC'
    )
   });

  if (path === 'content' && method === 'GET')
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_content ORDER BY key'
    )
   });

  if (path === 'data' && method === 'GET') {
   return await authorized(request, env)
    ? json({ ok: true })
    : fail('Please sign in.', 401);
  }

  if (!await authorized(request, env))
   return fail('Please sign in to use the admin dashboard.', 401);

  if (resource === 'students' && method === 'GET' && !id) {
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_students ORDER BY class_name, name'
    )
   });
  }

  if (resource === 'students' && method === 'POST' && !id) {
   const b = await readBody(request);
   const name = str(b.name, 200);
   const cls = str(b.class_name ?? b.class, 80);
   const admission = str(b.admission_number ?? b.admission_no, 80);

   if (!name || !cls)
    return fail('Student name and class are required.');

   const r = await env.DB.prepare(
    `INSERT INTO ba_students
     (admission_number, name, class_name, gender, guardian, phone)
     VALUES (?, ?, ?, ?, ?, ?)`
   ).bind(
    admission || null,
    name,
    cls,
    str(b.gender, 30),
    str(b.guardian, 200),
    str(b.phone, 80)
   ).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (resource === 'students' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_students', id))
    return fail('Student not found.', 404);

   await env.DB.batch([
    env.DB.prepare('DELETE FROM ba_marks WHERE student_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ba_fees WHERE student_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ba_students WHERE id = ?').bind(id)
   ]);

   return json({ ok: true });
  }

  if (resource === 'subjects' && method === 'GET' && !id) {
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_subjects ORDER BY class_name, name'
    )
   });
  }

  if (resource === 'subjects' && method === 'POST' && !id) {
   const b = await readBody(request);
   const name = str(b.name, 120);
   const cls = str(b.class_name ?? b.class, 80);

   if (!name || !cls)
    return fail('Subject and class are required.');

   const r = await env.DB.prepare(
    'INSERT INTO ba_subjects(name, class_name) VALUES(?, ?)'
   ).bind(name, cls).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (resource === 'subjects' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_subjects', id))
    return fail('Subject not found.', 404);

   await env.DB.batch([
    env.DB.prepare('DELETE FROM ba_marks WHERE subject_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ba_subjects WHERE id = ?').bind(id)
   ]);

   return json({ ok: true });
  }

  if (resource === 'marks' && method === 'GET') {
   const student = num(url.searchParams.get('student_id'));
   const term = str(url.searchParams.get('term'), 30);
   const year = num(url.searchParams.get('year'));

   let sql = `SELECT m.*, st.name AS student_name,
    st.admission_number, st.class_name,
    su.name AS subject_name
    FROM ba_marks m
    JOIN ba_students st ON st.id = m.student_id
    JOIN ba_subjects su ON su.id = m.subject_id WHERE 1=1`;

   const params = [];

   if (student) {
    sql += ' AND m.student_id = ?';
    params.push(student);
   }

   if (term) {
    sql += ' AND m.term = ?';
    params.push(term);
   }

   if (year) {
    sql += ' AND m.year = ?';
    params.push(year);
   }

   sql += ' ORDER BY st.class_name, st.name, su.name';

   return json({ data: await all(env.DB, sql, ...params) });
  }

  if (resource === 'marks' && method === 'POST' && !id) {
   const b = await readBody(request);
   const student = num(b.student_id);
   const subject = num(b.subject_id);
   const term = str(b.term, 30);
   const year = num(b.year);
   const score = num(b.score ?? b.marks);
   const outOf = num(b.out_of ?? 100);

   if (!student || !subject || !term || !year)
    return fail('Student, subject, term and year are required.');

   if (score < 0 || outOf <= 0 || score > outOf)
    return fail('Score must be between zero and the maximum mark.');

   if (
    !await has(env.DB, 'ba_students', student) ||
    !await has(env.DB, 'ba_subjects', subject)
   ) {
    return fail('Student or subject not found.', 404);
   }

   const r = await env.DB.prepare(
    `INSERT INTO ba_marks
     (student_id, subject_id, term, year, score, out_of, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
   ).bind(
    student, subject, term, year, score, outOf, str(b.comment, 500)
   ).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (resource === 'marks' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_marks', id))
    return fail('Mark record not found.', 404);

   await env.DB.prepare(
    'DELETE FROM ba_marks WHERE id = ?'
   ).bind(id).run();

   return json({ ok: true });
  }

  if (resource === 'fees' && method === 'GET') {
   const student = num(url.searchParams.get('student_id'));
   const term = str(url.searchParams.get('term'), 30);
   const year = num(url.searchParams.get('year'));

   let sql = `SELECT f.*, st.name AS student_name,
    st.admission_number, st.class_name
    FROM ba_fees f JOIN ba_students st ON st.id = f.student_id
    WHERE 1=1`;

   const params = [];

   if (student) {
    sql += ' AND f.student_id = ?';
    params.push(student);
   }

   if (term) {
    sql += ' AND f.term = ?';
    params.push(term);
   }

   if (year) {
    sql += ' AND f.year = ?';
    params.push(year);
   }

   return json({
    data: await all(
     env.DB,
     sql + ' ORDER BY st.class_name, st.name',
     ...params
    )
   });
  }

  if (resource === 'fees' && method === 'POST' && !id) {
   const b = await readBody(request);
   const student = num(b.student_id);
   const term = str(b.term, 30);
   const year = num(b.year);
   const paid = num(b.amount_paid);
   const balance = num(b.balance);

   if (!student || !term || !year)
    return fail('Student, term and year are required.');

   if (paid < 0 || balance < 0)
    return fail('Fee amounts cannot be negative.');

   if (!await has(env.DB, 'ba_students', student))
    return fail('Student not found.', 404);

   const r = await env.DB.prepare(
    `INSERT INTO ba_fees
     (student_id, term, year, amount_paid, balance, reference)
     VALUES (?, ?, ?, ?, ?, ?)`
   ).bind(
    student, term, year, paid, balance, str(b.reference, 150)
   ).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (resource === 'announcements' && method === 'POST') {
   const b = await readBody(request);
   const title = str(b.title, 200);
   const body = str(b.body ?? b.message);

   if (!title || !body)
    return fail('Announcement title and message are required.');

   const r = await env.DB.prepare(
    'INSERT INTO ba_announcements(title, body) VALUES(?, ?)'
   ).bind(title, body).run();

   return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (resource === 'announcements' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_announcements', id))
    return fail('Announcement not found.', 404);

   await env.DB.prepare(
    'DELETE FROM ba_announcements WHERE id = ?'
   ).bind(id).run();

   return json({ ok: true });
  }

  if (resource === 'messages' && method === 'GET') {
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_messages ORDER BY id DESC'
    )
   });
  }

  if (resource === 'messages' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_messages', id))
    return fail('Message not found.', 404);

   await env.DB.prepare(
    'DELETE FROM ba_messages WHERE id = ?'
   ).bind(id).run();

   return json({ ok: true });
  }

  if (resource === 'admissions' && method === 'GET') {
   return json({
    data: await all(
     env.DB,
     'SELECT * FROM ba_admissions ORDER BY id DESC'
    )
   });
  }

  if (resource === 'admissions' && method === 'PUT' && id) {
   const b = await readBody(request);
   const status = str(b.status, 40);

   if (!await has(env.DB, 'ba_admissions', id))
    return fail('Admission application not found.', 404);

   if (!status)
    return fail('Status is required.');

   await env.DB.prepare(
    'UPDATE ba_admissions SET status = ? WHERE id = ?'
   ).bind(status, id).run();

   return json({ ok: true });
  }

  if (resource === 'admissions' && method === 'DELETE' && id) {
   if (!await has(env.DB, 'ba_admissions', id))
    return fail('Admission application not found.', 404);

   await env.DB.prepare(
    'DELETE FROM ba_admissions WHERE id = ?'
   ).bind(id).run();

   return json({ ok: true });
  }

  return fail('API route not found.', 404);

 } catch (e) {
  console.error('Bright Angels API error', e);

  if (e?.message?.includes('UNIQUE constraint failed')) {
   return fail(
    'This record already exists. Check duplicate admission numbers or subjects.',
    409
   );
  }

  return fail('Server error. Check Cloudflare deployment logs.', 500);
 }
   }
