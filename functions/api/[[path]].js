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
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admission_sequences (year INTEGER PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL UNIQUE,
      admission_number TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, class_name TEXT NOT NULL,
      guardian_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
      admitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_subjects (id INTEGER PRIMARY KEY AUTOINCREMENT,class_name TEXT NOT NULL,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,UNIQUE(class_name,name))"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_marks (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,academic_year INTEGER NOT NULL,term INTEGER NOT NULL,score REAL NOT NULL,max_score REAL NOT NULL DEFAULT 100,remarks TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,subject_id,academic_year,term))"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_fees (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,description TEXT NOT NULL,amount REAL NOT NULL,due_date TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_fee_payments (id INTEGER PRIMARY KEY AUTOINCREMENT,fee_id INTEGER NOT NULL,amount REAL NOT NULL,reference TEXT,paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_parent_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,parent_name TEXT NOT NULL,phone TEXT NOT NULL,student_name TEXT,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
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
        const result=await env.DB.prepare("SELECT a.id,a.child_name,a.class_applying,a.guardian_name,a.phone,a.email,a.previous_school,a.message,a.status,a.created_at,s.admission_number FROM ba2_admissions a LEFT JOIN ba2_students s ON s.application_id=a.id ORDER BY a.created_at DESC LIMIT 500").all();
        return json({applications:result.results||[]});
      }
      if(request.method==="POST" && route==="admin/admissions/status") {
        let data;try{data=await request.json();}catch{return json({error:"Invalid application update."},400);}
        const id=Number(data.id),status=clean(data.status,30);
        if(!Number.isInteger(id)||id<1||!["Pending","Under Review","Approved","Rejected"].includes(status)) return json({error:"Choose a valid application and status."},400);
        const application=await env.DB.prepare("SELECT * FROM ba2_admissions WHERE id=?").bind(id).first();
        if(!application) return json({error:"Application not found."},404);
        if(status==="Approved") {
          const existing=await env.DB.prepare("SELECT admission_number FROM ba2_students WHERE application_id=?").bind(id).first();
          if(!existing) {
            const year=new Date().getFullYear();
            const sequence=await env.DB.prepare("INSERT INTO ba2_admission_sequences (year,last_number) VALUES (?,1) ON CONFLICT(year) DO UPDATE SET last_number=last_number+1 RETURNING last_number").bind(year).first();
            const number="BA/"+year+"/"+String(sequence.last_number).padStart(3,"0");
            await env.DB.prepare("INSERT OR IGNORE INTO ba2_students (application_id,admission_number,full_name,class_name,guardian_name,phone,email) VALUES (?,?,?,?,?,?,?)").bind(id,number,application.child_name,application.class_applying,application.guardian_name,application.phone,application.email||"").run();
          }
        }
        await env.DB.prepare("UPDATE ba2_admissions SET status=? WHERE id=?").bind(status,id).run();
        const student=await env.DB.prepare("SELECT admission_number FROM ba2_students WHERE application_id=?").bind(id).first();
        return json({ok:true,status,admission_number:student?.admission_number||null});
      }
      if(request.method==="GET" && route==="admin/students") {
        const result=await env.DB.prepare("SELECT admission_number,full_name,class_name,guardian_name,phone,email,admitted_at FROM ba2_students ORDER BY class_name,full_name").all();
        return json({students:result.results||[]});
      }
      if(request.method==="GET" && route==="admin/subjects") { const r=await env.DB.prepare("SELECT id,class_name,name FROM ba2_subjects ORDER BY class_name,name").all(); return json({subjects:r.results||[]}); }
      if(request.method==="POST" && route==="admin/subjects") { let d;try{d=await request.json();}catch{return json({error:"Enter class and subject."},400);} const k=clean(d.class_name,40),n=clean(d.name,100); if(!allowedClasses.includes(k)||!n)return json({error:"Choose a valid class and subject name."},400); try{await env.DB.prepare("INSERT INTO ba2_subjects (class_name,name) VALUES (?,?)").bind(k,n).run();}catch{return json({error:"That subject already exists for this class."},409);} return json({ok:true},201); }
      if(request.method==="GET" && route==="admin/marks") { const r=await env.DB.prepare("SELECT m.id,s.full_name,s.class_name,u.name subject_name,m.academic_year,m.term,m.score,m.max_score,m.remarks FROM ba2_marks m JOIN ba2_students s ON s.id=m.student_id JOIN ba2_subjects u ON u.id=m.subject_id ORDER BY m.academic_year DESC,m.term,s.full_name").all();return json({marks:r.results||[]}); }
      if(request.method==="POST" && route==="admin/marks") { let d;try{d=await request.json();}catch{return json({error:"Invalid mark."},400);} const sid=Number(d.student_id),uid=Number(d.subject_id),yr=Number(d.academic_year),term=Number(d.term),score=Number(d.score),max=Number(d.max_score||100); if(!Number.isInteger(sid)||!Number.isInteger(uid)||!Number.isInteger(yr)||![1,2,3].includes(term)||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)return json({error:"Check student, subject, year, term and score."},400); const valid=await env.DB.prepare("SELECT u.id FROM ba2_subjects u JOIN ba2_students s ON s.class_name=u.class_name WHERE u.id=? AND s.id=?").bind(uid,sid).first();if(!valid)return json({error:"Subject and student class do not match."},400); await env.DB.prepare("INSERT INTO ba2_marks (student_id,subject_id,academic_year,term,score,max_score,remarks) VALUES (?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,academic_year,term) DO UPDATE SET score=excluded.score,max_score=excluded.max_score,remarks=excluded.remarks").bind(sid,uid,yr,term,score,max,clean(d.remarks,500)).run();return json({ok:true}); }
      if(request.method==="GET" && route==="admin/fees") { const r=await env.DB.prepare("SELECT f.id,s.full_name,s.class_name,f.description,f.amount,COALESCE((SELECT SUM(p.amount) FROM ba2_fee_payments p WHERE p.fee_id=f.id),0) paid,f.amount-COALESCE((SELECT SUM(p.amount) FROM ba2_fee_payments p WHERE p.fee_id=f.id),0) balance FROM ba2_fees f JOIN ba2_students s ON s.id=f.student_id ORDER BY f.created_at DESC").all();return json({fees:r.results||[]}); }
      if(request.method==="POST" && route==="admin/fees") { let d;try{d=await request.json();}catch{return json({error:"Invalid fee."},400);} const sid=Number(d.student_id),amount=Number(d.amount),desc=clean(d.description,160);if(!Number.isInteger(sid)||!desc||!Number.isFinite(amount)||amount<=0)return json({error:"Select student and enter fee details."},400);await env.DB.prepare("INSERT INTO ba2_fees (student_id,description,amount) VALUES (?,?,?)").bind(sid,desc,amount).run();return json({ok:true},201); }
      if(request.method==="POST" && route==="admin/fees/payment") { let d;try{d=await request.json();}catch{return json({error:"Invalid payment."},400);}const fid=Number(d.fee_id),amount=Number(d.amount);if(!Number.isInteger(fid)||!Number.isFinite(amount)||amount<=0)return json({error:"Enter a valid payment."},400);const f=await env.DB.prepare("SELECT amount-COALESCE((SELECT SUM(amount) FROM ba2_fee_payments WHERE fee_id=?),0) balance FROM ba2_fees WHERE id=?").bind(fid,fid).first();if(!f||amount>Number(f.balance))return json({error:"Payment exceeds the balance or fee was not found."},400);await env.DB.prepare("INSERT INTO ba2_fee_payments (fee_id,amount,reference) VALUES (?,?,?)").bind(fid,amount,clean(d.reference,100)).run();return json({ok:true}); }
      if(request.method==="GET" && route==="admin/messages") { const r=await env.DB.prepare("SELECT * FROM ba2_parent_messages ORDER BY created_at DESC").all();return json({messages:r.results||[]}); }
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