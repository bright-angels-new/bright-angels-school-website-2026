const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers});
const clean = (value, max=500) => String(value ?? "").trim().slice(0,max);

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_name TEXT NOT NULL,
      class_applying TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      previous_school TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
}

export async function onRequest(context) {
  const {request,env} = context;
  if (!env.DB) return json({error:"The school database is not connected yet."},503);
  try {
    await ensureSchema(env.DB);
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/?/,"").replace(/\/$/,"");
    if (request.method === "GET" && route === "health") {
      return json({ok:true,service:"Bright Angels School API"});
    }
    if (request.method === "GET" && route === "announcements") {
      const result = await env.DB.prepare(
        "SELECT id,title,body,created_at FROM ba2_announcements WHERE is_published=1 ORDER BY created_at DESC LIMIT 20"
      ).all();
      return json({announcements:result.results || []});
    }
    if (request.method === "POST" && route === "admissions") {
      let data;
      try { data = await request.json(); } catch { return json({error:"Please check the information and try again."},400); }
      const child = clean(data.child_name,120);
      const klass = clean(data.class_applying,40);
      const guardian = clean(data.guardian_name,120);
      const phone = clean(data.phone,30);
      const email = clean(data.email,160);
      const previous = clean(data.previous_school,160);
      const message = clean(data.message,1500);
      const classes = ["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];
      if (!child || !classes.includes(klass) || !guardian || !phone) {
        return json({error:"Please complete the required fields and select a valid class."},400);
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({error:"Please enter a valid email address."},400);
      }
      const result = await env.DB.prepare(
        "INSERT INTO ba2_admissions (child_name,class_applying,guardian_name,phone,email,previous_school,message) VALUES (?,?,?,?,?,?,?)"
      ).bind(child,klass,guardian,phone,email,previous,message).run();
      return json({ok:true,application_id:result.meta?.last_row_id || null},201);
    }
    return json({error:"This API route was not found."},404);
  } catch (error) {
    console.error("Bright Angels API error:",error);
    return json({error:"A server error occurred. Please try again later."},500);
  }
}