const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json = (data,status=200,extra={}) => new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const clean = (value,max=500) => String(value??"").trim().slice(0,max);
const allowedClasses = ["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, child_name TEXT NOT NULL, class_applying TEXT NOT NULL,
      guardian_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, previous_school TEXT, message TEXT,
      status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admin_sessions (
      token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function cookieToken(request) {
  const raw=request.headers.get("Cookie")||"";
  const match=raw.match(/(?:^|;\s*)ba2_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}
async function isAdmin(request,env) {
  const token=cookieToken(request);
  if(!token) return false;
  const hash=await sha256(token);
  const row=await env.DB.prepare("SELECT token_hash FROM ba2_admin_sessions WHERE token_hash=? AND expires_at > datetime('now')").bind(hash).first();
  return !!row;
}
function sessionCookie(token,maxAge) {
  return `ba2_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
export async function onRequest({request,env}) {
  if(!env.DB) return json({error:"The school database is not connected yet."},503);
  try {
    await ensureSchema(env.DB);
    const url=new URL(request.url);
    const route=url.pathname.replace(/^\/api\/?/,"").replace(/\/$/,"");
    if(request.method==="GET" && route==="health") return json({ok:true,service:"Bright Angels School API"});
    if(request.method==="GET" && route==="announcements") {
      const result=await env.DB.prepare("SELECT id,title,body,created_at FROM ba2_announcements WHERE is_published=1 ORDER BY created_at DESC LIMIT 20").all();
      return json({announcements:result.results||[]});
    }
    if(request.method==="POST" && route==="admissions") {
      let data; try{data=await request.json();}catch{return json({error:"Please check the information and try again."},400);}
      const child=clean(data.child_name,120),klass=clean(data.class_applying,40),guardian=clean(data.guardian_name,120),phone=clean(data.phone,30);
      const email=clean(data.email,160),previous=clean(data.previous_school,160),message=clean(data.message,1500);
      if(!child||!allowedClasses.includes(klass)||!guardian||!phone) return json({error:"Please complete the required fields and select a valid class."},400);
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Please enter a valid email address."},400);
      const result=await env.DB.prepare("INSERT INTO ba2_admissions (child_name,class_applying,guardian_name,phone,email,previous_school,message) VALUES (?,?,?,?,?,?,?)").bind(child,klass,guardian,phone,email,previous,message).run();
      return json({ok:true,application_id:result.meta?.last_row_id||null},201);
    }
    if(request.method==="POST" && route==="login") {
      if(!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD) return json({error:"Administrator login has not been configured in the hosting settings."},503);
      let data;try{data=await request.json();}catch{return json({error:"Enter your school email and password."},400);}
      const email=clean(data.email,160).toLowerCase(),password=String(data.password||"");
      if(email!==String(env.ADMIN_EMAIL).toLowerCase()||password!==String(env.ADMIN_PASSWORD)) return json({error:"The email or password is incorrect."},401);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
      const hash=await sha256(token);
      const expires=new Date(Date.now()+8*60*60*1000).toISOString();
      await env.DB.prepare("INSERT INTO ba2_admin_sessions (token_hash,expires_at) VALUES (?,?)").bind(hash,expires).run();
      return json({ok:true},200,{"Set-Cookie":sessionCookie(token,8*60*60)});
    }
    if(request.method==="GET" && route==="session") {
      if(!await isAdmin(request,env)) return json({error:"Please sign in."},401);
      return json({ok:true,email:env.ADMIN_EMAIL});
    }
    if(request.method==="POST" && route==="logout") {
      const token=cookieToken(request);
      if(token) await env.DB.prepare("DELETE FROM ba2_admin_sessions WHERE token_hash=?").bind(await sha256(token)).run();
      return json({ok:true},200,{"Set-Cookie":sessionCookie("",0)});
    }
    if(route.startsWith("admin/")) {
      if(!await isAdmin(request,env)) return json({error:"Your session has expired. Please sign in again."},401);
      if(request.method==="GET" && route==="admin/admissions") {
        const result=await env.DB.prepare("SELECT id,child_name,class_applying,guardian_name,phone,email,status,created_at FROM ba2_admissions ORDER BY created_at DESC LIMIT 500").all();
        return json({applications:result.results||[]});
      }
      if(request.method==="GET" && route==="admin/announcements") {
        const result=await env.DB.prepare("SELECT id,title,body,is_published,created_at FROM ba2_announcements ORDER BY created_at DESC LIMIT 100").all();
        return json({announcements:result.results||[]});
      }
      if(request.method==="POST" && route==="admin/announcements") {
        let data;try{data=await request.json();}catch{return json({error:"Enter an announcement title and message."},400);}
        const title=clean(data.title,160),body=clean(data.body,3000),published=data.is_published?1:0;
        if(!title||!body)return json({error:"Both the title and announcement are required."},400);
        await env.DB.prepare("INSERT INTO ba2_announcements (title,body,is_published) VALUES (?,?,?)").bind(title,body,published).run();
        return json({ok:true},201);
      }
    }
    return json({error:"This API route was not found."},404);
  }catch(error){console.error("Bright Angels API error:",error);return json({error:"A server error occurred. Please try again later."},500);}
}