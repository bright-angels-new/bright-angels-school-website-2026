const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin"};
const json = (data,status=200,extra={}) => new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const clean = (value,max=500) => String(value??"").trim().slice(0,max);
const safeGalleryUrl = value => { try { const u=new URL(String(value||"")); return u.protocol==="https:" && u.hostname==="ik.imagekit.io" && !u.username && !u.password && !u.port ? u.href : null; } catch { return null; } };
function parseSchoolVideo(value){try{const u=new URL(String(value||"").trim());if(u.protocol!=="https:"||u.username||u.password||u.port)return null;let id="",provider="";if(["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname)){provider="YouTube";if(u.hostname==="youtu.be")id=u.pathname.split("/").filter(Boolean)[0]||"";else if(u.pathname==="/watch")id=u.searchParams.get("v")||"";else id=u.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/)?.[1]||"";if(!/^[A-Za-z0-9_-]{11}$/.test(id))return null;return {provider,video_id:id,watch_url:"https://www.youtube.com/watch?v="+id,embed_url:"https://www.youtube-nocookie.com/embed/"+id,thumbnail_url:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"};}if(["vimeo.com","www.vimeo.com"].includes(u.hostname)){provider="Vimeo";id=u.pathname.split("/").filter(Boolean)[0]||"";if(!/^\d{5,12}$/.test(id))return null;return {provider,video_id:id,watch_url:"https://vimeo.com/"+id,embed_url:"https://player.vimeo.com/video/"+id,thumbnail_url:""};}return null;}catch{return null;}}
const allowedClasses = ["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];
function newApplicationReference() {
  const alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  return "BA-APP-"+new Date().getFullYear()+"-"+[...bytes].map(value=>alphabet[value%36]).join("");
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ba2_admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, child_name TEXT NOT NULL, class_applying TEXT NOT NULL,
      guardian_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, previous_school TEXT, message TEXT, source TEXT NOT NULL DEFAULT 'PUBLIC',
      date_of_birth TEXT, gender TEXT, home_address TEXT, emergency_contact TEXT, medical_information TEXT, learning_needs TEXT, study_mode TEXT,
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
      date_of_birth TEXT, age INTEGER, gender TEXT, home_address TEXT, emergency_contact TEXT,
      medical_information TEXT, learning_needs TEXT, previous_school TEXT,
      student_status TEXT NOT NULL DEFAULT 'Active',
      admitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_student_class_history (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,from_class TEXT NOT NULL,to_class TEXT NOT NULL,action TEXT NOT NULL,academic_year INTEGER NOT NULL,remarks TEXT,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_subjects (id INTEGER PRIMARY KEY AUTOINCREMENT,class_name TEXT NOT NULL,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,UNIQUE(class_name,name))"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_marks (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,academic_year INTEGER NOT NULL,term INTEGER NOT NULL,score REAL NOT NULL,max_score REAL NOT NULL DEFAULT 100,remarks TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,subject_id,academic_year,term))"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_fees (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,description TEXT NOT NULL,amount REAL NOT NULL,due_date TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_fee_payments (id INTEGER PRIMARY KEY AUTOINCREMENT,fee_id INTEGER NOT NULL,amount REAL NOT NULL,reference TEXT,paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_parent_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,parent_name TEXT NOT NULL,phone TEXT NOT NULL,student_name TEXT,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'New',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_content (content_key TEXT PRIMARY KEY,content_value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_gallery (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,image_url TEXT NOT NULL,description TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_videos (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,video_url TEXT NOT NULL,provider TEXT NOT NULL,video_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ba2_rate_limits (key_hash TEXT PRIMARY KEY, window_started TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)")
  ]);
  const admissionCols=await db.prepare("PRAGMA table_info(ba2_admissions)").all();
  const admissionExisting=new Set((admissionCols.results||[]).map(x=>x.name));
  if(!admissionExisting.has("application_number")) await db.prepare("ALTER TABLE ba2_admissions ADD COLUMN application_number TEXT").run();
  await db.prepare("UPDATE ba2_admissions SET application_number='BA-APP-' || strftime('%Y',created_at) || '-' || printf('%05d',id) WHERE application_number IS NULL OR application_number=''").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_ba2_admissions_application_number ON ba2_admissions(application_number)").run();
  const markCols=await db.prepare("PRAGMA table_info(ba2_marks)").all();
  const markExisting=new Set((markCols.results||[]).map(x=>x.name));
  if(!markExisting.has("assessment_type")) {
    await db.batch([
      db.prepare("CREATE TABLE ba2_marks_new (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,academic_year INTEGER NOT NULL,term INTEGER NOT NULL,assessment_type TEXT NOT NULL DEFAULT 'BOT',score REAL NOT NULL,max_score REAL NOT NULL DEFAULT 100,remarks TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,subject_id,academic_year,term,assessment_type))"),
      db.prepare("INSERT INTO ba2_marks_new (id,student_id,subject_id,academic_year,term,assessment_type,score,max_score,remarks,created_at) SELECT id,student_id,subject_id,academic_year,term,'BOT',score,max_score,remarks,created_at FROM ba2_marks"),
      db.prepare("DROP TABLE ba2_marks"),
      db.prepare("ALTER TABLE ba2_marks_new RENAME TO ba2_marks")
    ]);
  }
  const studentCols=await db.prepare("PRAGMA table_info(ba2_students)").all();
  const studentExisting=new Set((studentCols.results||[]).map(x=>x.name));
  for(const [name,type] of [["date_of_birth","TEXT"],["age","INTEGER"],["gender","TEXT"],["home_address","TEXT"],["emergency_contact","TEXT"],["medical_information","TEXT"],["learning_needs","TEXT"],["previous_school","TEXT"],["student_status","TEXT NOT NULL DEFAULT 'Active'"]]) if(!studentExisting.has(name)) await db.prepare("ALTER TABLE ba2_students ADD COLUMN "+name+" "+type).run();
  const cols=await db.prepare("PRAGMA table_info(ba2_admissions)").all();
  const existing=new Set((cols.results||[]).map(x=>x.name));
  for(const [name,type] of [["date_of_birth","TEXT"],["age","INTEGER"],["gender","TEXT"],["home_address","TEXT"],["emergency_contact","TEXT"],["medical_information","TEXT"],["learning_needs","TEXT"],["study_mode","TEXT"],["source","TEXT NOT NULL DEFAULT 'PUBLIC'"]]) if(!existing.has(name)) await db.prepare("ALTER TABLE ba2_admissions ADD COLUMN "+name+" "+type).run();
  await db.prepare("UPDATE ba2_students SET date_of_birth=COALESCE(date_of_birth,(SELECT date_of_birth FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),age=COALESCE(age,(SELECT age FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),gender=COALESCE(gender,(SELECT gender FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),home_address=COALESCE(home_address,(SELECT home_address FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),emergency_contact=COALESCE(emergency_contact,(SELECT emergency_contact FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),medical_information=COALESCE(medical_information,(SELECT medical_information FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),learning_needs=COALESCE(learning_needs,(SELECT learning_needs FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)),previous_school=COALESCE(previous_school,(SELECT previous_school FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)) WHERE EXISTS (SELECT 1 FROM ba2_admissions WHERE ba2_admissions.id=ba2_students.application_id)").run();
  await db.prepare("UPDATE ba2_parent_messages SET status='New' WHERE status='0' OR status='0.0'").run();
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
async function rateLimit(db,request,key,limit,windowSeconds) {
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const keyHash=await sha256(ip+"|"+key);
  const windowModifier="-"+windowSeconds+" seconds";
  const row=await db.prepare("INSERT INTO ba2_rate_limits (key_hash,window_started,attempts) VALUES (?,CURRENT_TIMESTAMP,1) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN window_started<=datetime('now',?) THEN 1 ELSE attempts+1 END,window_started=CASE WHEN window_started<=datetime('now',?) THEN CURRENT_TIMESTAMP ELSE window_started END RETURNING attempts").bind(keyHash,windowModifier,windowModifier).first();
  return Number(row?.attempts||0)<=limit;
}
function sessionCookie(token,maxAge) {
  return `ba2_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
export async function onRequest({request,env}) {
  if(!env.DB) return json({error:"The school database is not connected yet."},503);
  try {
    await ensureSchema(env.DB);
    const url=new URL(request.url);
    if(request.method==="POST") { const origin=request.headers.get("Origin"); if(origin && origin!==url.origin) return json({error:"This request was not accepted."},403); }
    const route=url.pathname.replace(/^\/api\/?/,"").replace(/\/$/,"");
    if(request.method==="POST" && route==="login" && !await rateLimit(env.DB,request,"login",8,900)) return json({error:"Too many sign-in attempts. Please wait 15 minutes before trying again."},429,{"Retry-After":"900"});
    if(request.method==="POST" && route==="admissions" && !await rateLimit(env.DB,request,"admissions",5,3600)) return json({error:"Too many admission enquiries from this connection. Please try again later or contact the school by phone."},429,{"Retry-After":"3600"});
    if(request.method==="POST" && route==="parent-messages" && !await rateLimit(env.DB,request,"parent-messages",5,3600)) return json({error:"Too many messages from this connection. Please try again later or contact the school by phone."},429,{"Retry-After":"3600"});
    if(request.method==="POST" && route==="admission-status" && !await rateLimit(env.DB,request,"admission-status",10,900)) return json({error:"Too many status checks. Please wait 15 minutes and try again."},429,{"Retry-After":"900"});
    const managementApi="https://bright-angels-junior-school-management-system.pages.dev/api/public/";
    if(request.method==="GET" && route==="public-classes") {
      const upstream=await fetch(managementApi+"classes",{headers:{"Accept":"application/json"}});
      const data=await upstream.json().catch(()=>({error:"The management system returned an invalid response."}));
      return json(data,upstream.status);
    }
    if(request.method==="POST" && route==="public-admissions") {
      let payload;try{payload=await request.json();}catch{return json({error:"Please check the application details."},400);}
      const upstream=await fetch(managementApi+"admissions",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      const data=await upstream.json().catch(()=>({error:"The management system returned an invalid response."}));
      return json(data,upstream.status);
    }
    if(request.method==="POST" && route==="public-admission-status") {
      let payload;try{payload=await request.json();}catch{return json({error:"Enter the application reference and child's full name."},400);}
      const upstream=await fetch(managementApi+"admission-status",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      const data=await upstream.json().catch(()=>({error:"The management system returned an invalid response."}));
      return json(data,upstream.status);
    }
    if(request.method==="POST" && route==="parent-messages") {
      let payload;try{payload=await request.json();}catch{return json({error:"Please check your message and try again."},400);}
      try {
        const upstream=await fetch(managementApi+"parent-messages",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
        const data=await upstream.json().catch(()=>({error:"The management system returned an invalid response."}));
        return json(data,upstream.status);
      } catch(error) {
        console.error("Parent message forwarding failed:",error?.name==="TimeoutError"?"Management system timed out.":(error?.message||"Network error"));
        return json({error:"The school message service is temporarily unavailable. Please try again shortly or contact the school by phone."},502);
      }
    }
    if(request.method==="GET" && route==="health") return json({ok:true,service:"Bright Angels School API"});
    if(request.method==="GET" && route==="content") { const r=await env.DB.prepare("SELECT content_key,content_value FROM ba2_content").all();return json({content:Object.fromEntries((r.results||[]).map(x=>[x.content_key,x.content_value]))}); }
    if(request.method==="GET" && route==="gallery") { const [r,featured]=await Promise.all([env.DB.prepare("SELECT id,title,image_url,description FROM ba2_gallery ORDER BY created_at DESC LIMIT 60").all(),env.DB.prepare("SELECT content_value FROM ba2_content WHERE content_key='hero_image_url'").first()]);const gallery=(r.results||[]).flatMap(item=>{const image_url=safeGalleryUrl(item.image_url);if(!image_url){console.warn("Skipped gallery item with an unapproved image URL. Item ID:",item.id);return [];}return [{...item,image_url}];});const featured_image_url=safeGalleryUrl(featured?.content_value)||"";return json({gallery,featured_image_url}); }
    if(request.method==="GET" && route==="videos") {const r=await env.DB.prepare("SELECT id,title,video_url,provider,video_id FROM ba2_videos ORDER BY created_at DESC LIMIT 40").all();const videos=(r.results||[]).flatMap(item=>{const safe=parseSchoolVideo(item.video_url);return safe&&safe.provider===item.provider&&safe.video_id===item.video_id?[{id:item.id,title:item.title,provider:safe.provider,video_id:safe.video_id,embed_url:safe.embed_url,thumbnail_url:safe.thumbnail_url}]:[];});return json({videos});}
    if(request.method==="GET" && route==="announcements") {
      const result=await env.DB.prepare("SELECT id,title,body,created_at FROM ba2_announcements WHERE is_published=1 ORDER BY created_at DESC LIMIT 20").all();
      return json({announcements:result.results||[]});
    }
    if(request.method==="POST" && route==="admissions") {
      let data; try{data=await request.json();}catch{return json({error:"Please check the information and try again."},400);}
      const child=clean(data.child_name,120),klass=clean(data.class_applying,40),guardian=clean(data.guardian_name,120),phone=clean(data.phone,30);
      const email=clean(data.email,160),previous=clean(data.previous_school,160),message=clean(data.message,1500),dob=clean(data.date_of_birth,20),gender=clean(data.gender,30),address=clean(data.home_address,300),emergency=clean(data.emergency_contact,120),medical=clean(data.medical_information,500),needs=clean(data.learning_needs,500),study=clean(data.study_mode,60);
      const birthDate=new Date(dob+"T00:00:00"),today=new Date();let age=today.getFullYear()-birthDate.getFullYear();if(today.getMonth()<birthDate.getMonth()||(today.getMonth()===birthDate.getMonth()&&today.getDate()<birthDate.getDate()))age--;
      if(!child||!allowedClasses.includes(klass)||!guardian||!phone||!dob||Number.isNaN(birthDate.getTime())||birthDate>today||age<0||age>100||!["Female","Male"].includes(gender)||!address||!emergency) return json({error:"Please complete all required fields and enter a valid date of birth."},400);
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Please enter a valid email address."},400);
      const applicationNumber=newApplicationReference();
      let result;
      try {
        result=await env.DB.prepare("INSERT INTO ba2_admissions (application_number,child_name,class_applying,guardian_name,phone,email,previous_school,message,date_of_birth,age,gender,home_address,emergency_contact,medical_information,learning_needs,study_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(applicationNumber,child,klass,guardian,phone,email,previous,message,dob,age,gender,address,emergency,medical,needs,study).run();
      } catch(error) {
        if(String(error?.message||"").toLowerCase().includes("unique")) return json({error:"Please submit again. The application reference could not be reserved."},409);
        throw error;
      }
      const applicationId=Number(result.meta?.last_row_id||0);
      return json({ok:true,application_id:applicationId,application_number:applicationNumber},201);
    }

    if(request.method==="POST" && route==="admission-status") {
      let data;try{data=await request.json();}catch{return json({error:"Enter your application reference and the child’s full name."},400);}
      const ref=clean(data.application_number,30).toUpperCase(),childName=clean(data.child_name,120);
      if(!/^BA-APP-\d{4}-(?:[A-Z0-9]{8}|\d{5})$/.test(ref)||!childName)return json({error:"Enter a valid application reference number and the child’s full name."},400);
      const application=await env.DB.prepare("SELECT a.child_name,a.class_applying,a.status,s.admission_number FROM ba2_admissions a LEFT JOIN ba2_students s ON s.application_id=a.id WHERE a.application_number=?").bind(ref).first();
      const normalizeName=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase();
      if(!application||normalizeName(application.child_name)!==normalizeName(childName))return json({error:"No application matches those details. Check the reference number and child’s full name."},404);
      return json({ok:true,status:application.status,admission_number:application.admission_number||null});
    }
    if(request.method==="POST" && route==="parent-messages") { let d;try{d=await request.json();}catch{return json({error:"Please check your message."},400);} const p=clean(d.parent_name,120),phone=clean(d.phone,30),student=clean(d.student_name,120),subject=clean(d.subject,160),message=clean(d.message,2000);if(!p||!phone||!subject||!message)return json({error:"Complete your name, phone, subject and message."},400);await env.DB.prepare("INSERT INTO ba2_parent_messages (parent_name,phone,student_name,subject,message) VALUES (?,?,?,?,?)").bind(p,phone,student,subject,message).run();return json({ok:true},201); }
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
    if(request.method==="POST" && route==="integration/student-created") {
      const websiteSyncSecret=String(env.WEBSITE_SYNC_SECRET||"").trim();
      const suppliedAuthorization=String(request.headers.get("Authorization")||"").trim();
      if(!websiteSyncSecret || suppliedAuthorization!=="Bearer "+websiteSyncSecret) return json({error:"Integration authentication failed."},401);
      let data;try{data=await request.json();}catch{return json({error:"Invalid student sync payload."},400);}
      const number=clean(data.admission_number,40),full=clean(data.full_name,160),klass=clean(data.class_name,40),guardian=clean(data.guardian_name,160),phone=clean(data.guardian_phone,40);
      const dob=clean(data.date_of_birth,10),gender=clean(data.gender,20),address=clean(data.home_address,300),email=clean(data.email,160),emergency=clean(data.emergency_contact_name||data.emergency_contact_phone,120),medical=clean(data.medical_information,1000),studyMode=data.study_mode==="Boarding"?"Boarding":"Day";
      if(!/^BA\/\d{4}\/\d{3,}$/.test(number)||!full||!allowedClasses.includes(klass)||!guardian||!phone) return json({error:"Student details are incomplete or invalid."},400);
      if(dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({error:"Invalid date of birth."},400);
      const existing=await env.DB.prepare("SELECT id,full_name FROM ba2_students WHERE admission_number=?").bind(number).first();
      if(existing) {
        if(existing.full_name.toLowerCase()!==full.toLowerCase()) return json({error:"This admission number already belongs to another student."},409);
        return json({ok:true,already_synced:true,admission_number:number,student_id:existing.id});
      }
      const appRef=newApplicationReference();
      const app=await env.DB.prepare("INSERT INTO ba2_admissions (application_number,child_name,class_applying,guardian_name,phone,email,date_of_birth,gender,home_address,emergency_contact,medical_information,study_mode,status,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Approved','MANUAL_SYNC')").bind(appRef,full,klass,guardian,phone,email||null,dob||null,gender||null,address||null,emergency||null,medical||null,studyMode).run();
      const applicationId=Number(app.meta?.last_row_id);
      if(!applicationId) return json({error:"Could not create the linked student record."},500);
      const birth=dob?new Date(dob+"T00:00:00Z"):null;
      let age=null;
      if(birth&&!Number.isNaN(birth.getTime())) { const today=new Date(); age=today.getUTCFullYear()-birth.getUTCFullYear(); if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate())) age--; }
      const created=await env.DB.prepare("INSERT INTO ba2_students (application_id,admission_number,full_name,class_name,guardian_name,phone,email,date_of_birth,age,gender,home_address,emergency_contact,medical_information) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(applicationId,number,full,klass,guardian,phone,email||"",dob||null,age,gender||null,address||null,emergency||null,medical||null).run();
      return json({ok:true,already_synced:false,admission_number:number,student_id:Number(created.meta?.last_row_id)},201);
    }
    if(request.method==="POST" && route==="integration/admission-approved") {
      if(!env.WEBSITE_SYNC_SECRET || request.headers.get("Authorization")!=="Bearer "+env.WEBSITE_SYNC_SECRET) return json({error:"Integration authentication failed."},401);
      let data;try{data=await request.json();}catch{return json({error:"Invalid approval update."},400);}
      const ref=clean(data.application_number,40).toUpperCase();
      const number=clean(data.admission_number,40);
      if(!/^BA-APP-\d{4}-(?:[A-Z0-9]{8}|\d{5})$/.test(ref)||!/^BA\/\d{4}\/\d{3,}$/.test(number)) return json({error:"Invalid application or admission number."},400);
      const app=await env.DB.prepare("SELECT id,status FROM ba2_admissions WHERE application_number=?").bind(ref).first();
      if(!app) return json({error:"Website application not found."},404);
      const existing=await env.DB.prepare("SELECT id,admission_number FROM ba2_students WHERE application_id=?").bind(app.id).first();
      if(existing && existing.admission_number!==number) return json({error:"A different admission number is already recorded for this student."},409);
      if(!existing) {
        const a=await env.DB.prepare("SELECT * FROM ba2_admissions WHERE id=?").bind(app.id).first();
        await env.DB.prepare("INSERT INTO ba2_students (application_id,admission_number,full_name,class_name,guardian_name,phone,email,date_of_birth,age,gender,home_address,emergency_contact,medical_information,learning_needs,previous_school) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(app.id,number,a.child_name,a.class_applying,a.guardian_name,a.phone,a.email||"",a.date_of_birth||null,a.age??null,a.gender||null,a.home_address||null,a.emergency_contact||null,a.medical_information||null,a.learning_needs||null,a.previous_school||null).run();
      }
      await env.DB.prepare("UPDATE ba2_admissions SET status='Approved' WHERE id=?").bind(app.id).run();
      return json({ok:true,application_number:ref,admission_number:number});
    }
    if(route.startsWith("admin/")) {
      if(!await isAdmin(request,env)) return json({error:"Your session has expired. Please sign in again."},401);
      if(request.method==="GET" && route==="admin/admissions") {
        const result=await env.DB.prepare("SELECT a.id,a.application_number,a.child_name,a.class_applying,a.guardian_name,a.phone,a.email,a.previous_school,a.message,a.date_of_birth,a.age,a.gender,a.home_address,a.emergency_contact,a.medical_information,a.learning_needs,a.study_mode,a.status,a.created_at,s.admission_number FROM ba2_admissions a LEFT JOIN ba2_students s ON s.application_id=a.id WHERE a.source!='MANUAL_SYNC' ORDER BY a.created_at DESC LIMIT 500").all();
        return json({applications:result.results||[]});
      }
      if(request.method==="POST" && route==="admin/admissions/status") {
        let data;try{data=await request.json();}catch{return json({error:"Invalid application update."},400);}
        const id=Number(data.id),status=clean(data.status,30);
        if(!Number.isInteger(id)||id<1||!["Pending","Under Review","Approved","Rejected"].includes(status)) return json({error:"Choose a valid application and status."},400);
        const application=await env.DB.prepare("SELECT * FROM ba2_admissions WHERE id=?").bind(id).first();
        if(!application) return json({error:"Application not found."},404);
        if(status==="Approved") {
          if(!env.MANAGEMENT_API_URL||!env.MANAGEMENT_SYNC_SECRET) return json({error:"Secure management connection is not configured. No approval was saved."},503);
          const endpoint=new URL("/api/integration/approve-website-application",env.MANAGEMENT_API_URL);
          let centralResponse;
          try {
            centralResponse=await fetch(endpoint.toString(),{
              method:"POST",
              headers:{"Content-Type":"application/json","Authorization":"Bearer "+env.MANAGEMENT_SYNC_SECRET},
              body:JSON.stringify({
                application_number:application.application_number,
                applicant_full_name:application.child_name,
                class_name:application.class_applying,
                guardian_name:application.guardian_name,
                guardian_phone:application.phone,
                date_of_birth:application.date_of_birth,
                gender:application.gender,
                home_address:application.home_address,
                emergency_contact:application.emergency_contact,
                medical_information:application.medical_information,
                study_mode:application.study_mode
              })
            });
          } catch(error) {
            console.error("Management approval request failed:",error?.message||error);
            return json({error:"The management system could not be reached. No approval was saved."},502);
          }
          let central={};
          try { central=await centralResponse.json(); } catch {}
          if(!centralResponse.ok||!central.admission_number) return json({error:central.error||"The management system did not issue an admission number. No approval was saved."},502);
          await env.DB.prepare("INSERT OR IGNORE INTO ba2_students (application_id,admission_number,full_name,class_name,guardian_name,phone,email,date_of_birth,age,gender,home_address,emergency_contact,medical_information,learning_needs,previous_school) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id,central.admission_number,application.child_name,application.class_applying,application.guardian_name,application.phone,application.email||"",application.date_of_birth||null,application.age??null,application.gender||null,application.home_address||null,application.emergency_contact||null,application.medical_information||null,application.learning_needs||null,application.previous_school||null).run();
          const saved=await env.DB.prepare("SELECT admission_number FROM ba2_students WHERE application_id=?").bind(id).first();
          if(!saved||saved.admission_number!==central.admission_number) return json({error:"Admission number verification failed. Contact the administrator before retrying."},409);
        }
        await env.DB.prepare("UPDATE ba2_admissions SET status=? WHERE id=?").bind(status,id).run();
        const student=await env.DB.prepare("SELECT admission_number FROM ba2_students WHERE application_id=?").bind(id).first();
        return json({ok:true,status,admission_number:student?.admission_number||null});
      }
      if(request.method==="POST" && route==="admin/students") {
        let d;try{d=await request.json();}catch{return json({error:"Enter the student details."},400);}
        const full=clean(d.full_name,160),klass=clean(d.class_name,40),guardian=clean(d.guardian_name,160),phone=clean(d.phone,40);
        const dob=clean(d.date_of_birth,10),enteredAge=clean(d.age,3),gender=clean(d.gender,20),email=clean(d.email,160),address=clean(d.home_address,300),emergency=clean(d.emergency_contact,100),previous=clean(d.previous_school,160),medical=clean(d.medical_information,1000),needs=clean(d.learning_needs,1000);
        if(!full||!allowedClasses.includes(klass)||!guardian||!phone)return json({error:"Student name, class, parent/guardian and phone are required."},400);
        if(dob){
          if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))return json({error:"Enter a valid date of birth."},400);
          const birth=new Date(dob+"T00:00:00.000Z");
          if(Number.isNaN(birth.getTime())||birth.toISOString().slice(0,10)!==dob||birth>new Date())return json({error:"Enter a real date of birth that is not in the future."},400);
        }
        if(enteredAge!==""&&(!/^\d{1,3}$/.test(enteredAge)||Number(enteredAge)>100))return json({error:"Enter a valid age between 0 and 100."},400);
        let age=enteredAge===""?null:Number(enteredAge);
        if(dob){const birth=new Date(dob+"T00:00:00Z"),today=new Date();age=today.getUTCFullYear()-birth.getUTCFullYear();if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))age--;if(age<0||age>100)return json({error:"Enter a valid date of birth."},400);}
        const year=new Date().getFullYear();
        const sequence=await env.DB.prepare("INSERT INTO ba2_admission_sequences (year,last_number) VALUES (?,1) ON CONFLICT(year) DO UPDATE SET last_number=last_number+1 RETURNING last_number").bind(year).first();
        const number="BA/"+year+"/"+String(sequence.last_number).padStart(3,"0");
        const app=await env.DB.prepare("INSERT INTO ba2_admissions (child_name,class_applying,guardian_name,phone,email,previous_school,date_of_birth,gender,home_address,emergency_contact,medical_information,learning_needs,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(full,klass,guardian,phone,email||null,previous||null,dob||null,gender||null,address||null,emergency||null,medical||null,needs||null,"Approved").run();
        const applicationId=Number(app.meta?.last_row_id);
        if(!applicationId)return json({error:"Could not create the student record. Please try again."},500);
        await env.DB.prepare("INSERT INTO ba2_students (application_id,admission_number,full_name,class_name,guardian_name,phone,email,date_of_birth,age,gender,home_address,emergency_contact,medical_information,learning_needs,previous_school) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(applicationId,number,full,klass,guardian,phone,email||"",dob||null,age,gender||null,address||null,emergency||null,medical||null,needs||null,previous||null).run();
        return json({ok:true,admission_number:number,student_id:Number((await env.DB.prepare("SELECT id FROM ba2_students WHERE admission_number=?").bind(number).first())?.id)},201);
      }
      if(request.method==="GET" && route==="admin/students") {
        const result=await env.DB.prepare("SELECT id,admission_number,full_name,class_name,guardian_name,phone,email,date_of_birth,age,gender,home_address,emergency_contact,medical_information,learning_needs,previous_school,student_status,admitted_at FROM ba2_students ORDER BY class_name,full_name").all();
        return json({students:result.results||[]});
      }
      if(request.method==="POST" && route==="admin/students/class-change") {
        let d;try{d=await request.json();}catch{return json({error:"Invalid class update."},400);}
        const id=Number(d.student_id),year=Number(d.academic_year),action=clean(d.action,20),expected=clean(d.current_class,40),remarks=clean(d.remarks,300);
        if(!Number.isInteger(id)||id<1||!Number.isInteger(year)||year<2020||year>2100||!["Promote","Repeat"].includes(action)||!allowedClasses.includes(expected)) return json({error:"Check the learner, academic year and class action."},400);
        const student=await env.DB.prepare("SELECT id,full_name,class_name,student_status FROM ba2_students WHERE id=?").bind(id).first();
        if(!student||student.student_status!=="Active")return json({error:"This learner is not an active student."},404);
        if(student.class_name!==expected)return json({error:"The learner's class has changed. Refresh the student list and try again."},409);
        const order=allowedClasses.indexOf(student.class_name);
        if(action==="Promote"&&order===allowedClasses.length-1)return json({error:"P7 is the final class. This learner cannot be promoted to another class."},400);
        const nextClass=action==="Promote"?allowedClasses[order+1]:student.class_name;
        await env.DB.batch([
          env.DB.prepare("UPDATE ba2_students SET class_name=? WHERE id=? AND class_name=? AND student_status='Active'").bind(nextClass,id,student.class_name),
          env.DB.prepare("INSERT INTO ba2_student_class_history (student_id,from_class,to_class,action,academic_year,remarks) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ba2_students WHERE id=? AND class_name=?)").bind(id,student.class_name,nextClass,action,year,remarks,id,nextClass)
        ]);
        const updated=await env.DB.prepare("SELECT class_name FROM ba2_students WHERE id=?").bind(id).first();
        if(!updated||updated.class_name!==nextClass)return json({error:"The class update could not be completed. Refresh and try again."},409);
        return json({ok:true,student_id:id,full_name:student.full_name,from_class:student.class_name,to_class:nextClass,action,academic_year:year});
      }
      if(request.method==="GET" && route==="admin/student-history") {
        const id=Number(url.searchParams.get("student_id"));
        if(!Number.isInteger(id)||id<1)return json({error:"Choose a valid learner."},400);
        const result=await env.DB.prepare("SELECT from_class,to_class,action,academic_year,remarks,changed_at FROM ba2_student_class_history WHERE student_id=? ORDER BY changed_at DESC,id DESC").bind(id).all();
        return json({history:result.results||[]});
      }
      if(request.method==="GET" && route==="admin/subjects") { const r=await env.DB.prepare("SELECT id,class_name,name FROM ba2_subjects ORDER BY class_name,name").all(); return json({subjects:r.results||[]}); }
      if(request.method==="POST" && route==="admin/subjects") { let d;try{d=await request.json();}catch{return json({error:"Enter class and subject."},400);} const k=clean(d.class_name,40),n=clean(d.name,100); if(!allowedClasses.includes(k)||!n)return json({error:"Choose a valid class and subject name."},400); try{await env.DB.prepare("INSERT INTO ba2_subjects (class_name,name) VALUES (?,?)").bind(k,n).run();}catch{return json({error:"That subject already exists for this class."},409);} return json({ok:true},201); }
      if(request.method==="GET" && route==="admin/marks") { const r=await env.DB.prepare("SELECT m.id,s.full_name,s.class_name,u.name subject_name,m.academic_year,m.term,m.assessment_type,m.score,m.max_score,m.remarks FROM ba2_marks m JOIN ba2_students s ON s.id=m.student_id JOIN ba2_subjects u ON u.id=m.subject_id ORDER BY m.academic_year DESC,m.term,m.assessment_type,s.full_name").all();return json({marks:r.results||[]}); }
      if(request.method==="POST" && route==="admin/marks") { let d;try{d=await request.json();}catch{return json({error:"Invalid mark."},400);} const sid=Number(d.student_id),uid=Number(d.subject_id),yr=Number(d.academic_year),term=Number(d.term),assessment=clean(d.assessment_type,3).toUpperCase(),score=Number(d.score),max=Number(d.max_score||100); if(!Number.isInteger(sid)||!Number.isInteger(uid)||!Number.isInteger(yr)||![1,2,3].includes(term)||!["BOT","MOT","EOT"].includes(assessment)||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)return json({error:"Check student, subject, year, term, assessment and score."},400); const valid=await env.DB.prepare("SELECT u.id FROM ba2_subjects u JOIN ba2_students s ON s.class_name=u.class_name WHERE u.id=? AND s.id=?").bind(uid,sid).first();if(!valid)return json({error:"Subject and student class do not match."},400); await env.DB.prepare("INSERT INTO ba2_marks (student_id,subject_id,academic_year,term,assessment_type,score,max_score,remarks) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,academic_year,term,assessment_type) DO UPDATE SET score=excluded.score,max_score=excluded.max_score,remarks=excluded.remarks").bind(sid,uid,yr,term,assessment,score,max,clean(d.remarks,500)).run();return json({ok:true}); }
      if(request.method==="GET" && route==="admin/report-card") { const sid=Number(url.searchParams.get("student_id")),year=Number(url.searchParams.get("academic_year")),term=Number(url.searchParams.get("term")),assessment=clean(url.searchParams.get("assessment_type"),3).toUpperCase();if(!Number.isInteger(sid)||!Number.isInteger(year)||![1,2,3].includes(term)||!["BOT","MOT","EOT"].includes(assessment))return json({error:"Choose a student, year, term and assessment."},400);const student=await env.DB.prepare("SELECT admission_number,full_name,class_name FROM ba2_students WHERE id=?").bind(sid).first();if(!student)return json({error:"Student not found."},404);const r=await env.DB.prepare("SELECT u.id subject_id,u.name subject_name,m.score,m.max_score,m.remarks FROM ba2_subjects u LEFT JOIN ba2_marks m ON m.subject_id=u.id AND m.student_id=? AND m.academic_year=? AND m.term=? AND m.assessment_type=? WHERE u.class_name=? ORDER BY u.name").bind(sid,year,term,assessment,student.class_name).all();const rows=r.results||[],marked=rows.filter(x=>x.score!==null&&x.score!==undefined),total=marked.reduce((s,x)=>s+Number(x.score),0),maximum=marked.reduce((s,x)=>s+Number(x.max_score),0);return json({student,academic_year:year,term,assessment_type:assessment,subjects:rows,total,maximum,marked_subjects:marked.length,percentage:maximum?Math.round(total/maximum*10000)/100:0}); }
      if(request.method==="GET" && route==="admin/fees") { const r=await env.DB.prepare("SELECT f.id,s.full_name,s.class_name,f.description,f.amount,COALESCE((SELECT SUM(p.amount) FROM ba2_fee_payments p WHERE p.fee_id=f.id),0) paid,f.amount-COALESCE((SELECT SUM(p.amount) FROM ba2_fee_payments p WHERE p.fee_id=f.id),0) balance FROM ba2_fees f JOIN ba2_students s ON s.id=f.student_id ORDER BY f.created_at DESC").all();return json({fees:r.results||[]}); }
      if(request.method==="POST" && route==="admin/fees") { let d;try{d=await request.json();}catch{return json({error:"Invalid fee."},400);} const sid=Number(d.student_id),amount=Number(d.amount),desc=clean(d.description,160);if(!Number.isInteger(sid)||!desc||!Number.isFinite(amount)||amount<=0)return json({error:"Select student and enter fee details."},400);await env.DB.prepare("INSERT INTO ba2_fees (student_id,description,amount) VALUES (?,?,?)").bind(sid,desc,amount).run();return json({ok:true},201); }
      if(request.method==="POST" && route==="admin/fees/payment") { let d;try{d=await request.json();}catch{return json({error:"Invalid payment."},400);}const fid=Number(d.fee_id),amount=Number(d.amount);if(!Number.isInteger(fid)||!Number.isFinite(amount)||amount<=0)return json({error:"Enter a valid payment."},400);const f=await env.DB.prepare("SELECT amount-COALESCE((SELECT SUM(amount) FROM ba2_fee_payments WHERE fee_id=?),0) balance FROM ba2_fees WHERE id=?").bind(fid,fid).first();if(!f||amount>Number(f.balance))return json({error:"Payment exceeds the balance or fee was not found."},400);await env.DB.prepare("INSERT INTO ba2_fee_payments (fee_id,amount,reference) VALUES (?,?,?)").bind(fid,amount,clean(d.reference,100)).run();return json({ok:true}); }
      if(request.method==="POST" && route==="admin/messages/status") { let d;try{d=await request.json();}catch{return json({error:"Invalid message update."},400);}const id=Number(d.id),status=clean(d.status,20);if(!Number.isInteger(id)||id<1||!["New","In Progress","Resolved"].includes(status))return json({error:"Choose a valid status."},400);await env.DB.prepare("UPDATE ba2_parent_messages SET status=? WHERE id=?").bind(status,id).run();return json({ok:true}); }
      if(request.method==="GET" && route==="admin/messages") { const r=await env.DB.prepare("SELECT * FROM ba2_parent_messages ORDER BY created_at DESC").all();return json({messages:r.results||[]}); }
      if(request.method==="GET" && route==="admin/content") { const r=await env.DB.prepare("SELECT content_key,content_value FROM ba2_content").all();return json({content:Object.fromEntries((r.results||[]).map(x=>[x.content_key,x.content_value]))}); }
      if(request.method==="POST" && route==="admin/content") { let d;try{d=await request.json();}catch{return json({error:"Invalid content."},400);} const allowed=["hero_title","hero_text","about_text","learning_text"];for(const k of allowed)if(typeof d[k]==="string")await env.DB.prepare("INSERT INTO ba2_content (content_key,content_value) VALUES (?,?) ON CONFLICT(content_key) DO UPDATE SET content_value=excluded.content_value,updated_at=CURRENT_TIMESTAMP").bind(k,clean(d[k],1200)).run();return json({ok:true}); }
      if(request.method==="GET" && route==="admin/gallery") { const r=await env.DB.prepare("SELECT id,title,image_url,description FROM ba2_gallery ORDER BY created_at DESC").all();const gallery=(r.results||[]).flatMap(item=>{const image_url=safeGalleryUrl(item.image_url);if(!image_url){console.warn("Skipped gallery item with an unapproved image URL. Item ID:",item.id);return [];}return [{...item,image_url}];});return json({gallery}); }
      if(request.method==="GET" && route==="admin/videos") {const r=await env.DB.prepare("SELECT id,title,video_url,provider,video_id FROM ba2_videos ORDER BY created_at DESC").all();return json({videos:r.results||[]});}
      if(request.method==="POST" && route==="admin/videos") {let d;try{d=await request.json();}catch{return json({error:"Enter a video title and YouTube or Vimeo link."},400);}const title=clean(d.title,120),video=parseSchoolVideo(d.video_url);if(!title||!video)return json({error:"Enter a title and a valid public YouTube or Vimeo video link."},400);const exists=await env.DB.prepare("SELECT id FROM ba2_videos WHERE video_url=?").bind(video.watch_url).first();if(exists)return json({error:"That video has already been added."},409);await env.DB.prepare("INSERT INTO ba2_videos (title,video_url,provider,video_id) VALUES (?,?,?,?)").bind(title,video.watch_url,video.provider,video.video_id).run();return json({ok:true},201);}
      if(request.method==="POST" && route==="admin/videos/delete") {let d;try{d=await request.json();}catch{return json({error:"Choose a video to remove."},400);}const id=Number(d.id);if(!Number.isInteger(id)||id<1)return json({error:"Choose a valid video."},400);await env.DB.prepare("DELETE FROM ba2_videos WHERE id=?").bind(id).run();return json({ok:true});}
      if(request.method==="POST" && route==="admin/gallery") {
        if(!env.IMAGEKIT_PRIVATE_KEY) return json({error:"Photo storage is not configured. Please contact the website administrator."},503);
        let form;
        try { form=await request.formData(); } catch { return json({error:"Choose a photo and try again."},400); }
        const title=clean(form.get("title"),120),description=clean(form.get("description"),500),photo=form.get("photo");
        if(!title||!photo||typeof photo.arrayBuffer!=="function") return json({error:"Enter a photo title and choose an image from your phone."},400);
        if(!["image/jpeg","image/png","image/webp","image/gif"].includes(String(photo.type||"").toLowerCase())) return json({error:"Please choose a JPEG, PNG, WEBP or GIF image."},400);
        if(photo.size<1||photo.size>10*1024*1024) return json({error:"The photo must be 10 MB or smaller."},400);
        const imageBytes=new Uint8Array(await photo.slice(0,12).arrayBuffer());
        const isJpeg=imageBytes[0]===0xff&&imageBytes[1]===0xd8&&imageBytes[2]===0xff;
        const isPng=imageBytes.length>=8&&imageBytes[0]===0x89&&imageBytes[1]===0x50&&imageBytes[2]===0x4e&&imageBytes[3]===0x47&&imageBytes[4]===0x0d&&imageBytes[5]===0x0a&&imageBytes[6]===0x1a&&imageBytes[7]===0x0a;
        const isGif=imageBytes[0]===0x47&&imageBytes[1]===0x49&&imageBytes[2]===0x46&&imageBytes[3]===0x38;
        const isWebp=imageBytes.length>=12&&String.fromCharCode(...imageBytes.slice(0,4))==="RIFF"&&String.fromCharCode(...imageBytes.slice(8,12))==="WEBP";
        if(!isJpeg&&!isPng&&!isGif&&!isWebp) return json({error:"The selected file does not appear to be a supported image."},400);
        const uploadForm=new FormData();
        uploadForm.append("file",photo,photo.name||"school-gallery-photo");
        uploadForm.append("fileName",(photo.name||"bright-angels-photo").replace(/[^a-zA-Z0-9._-]/g,"_"));
        uploadForm.append("useUniqueFileName","true");
        let uploadResponse,uploaded;
        try {
          uploadResponse=await fetch("https://upload.imagekit.io/api/v1/files/upload",{
            method:"POST",
            headers:{Authorization:"Basic "+btoa(String(env.IMAGEKIT_PRIVATE_KEY)+":")},
            body:uploadForm
          });
          uploaded=await uploadResponse.json();
        } catch { return json({error:"The photo upload service could not be reached. Please try again."},502); }
        if(!uploadResponse.ok||!uploaded?.url||!safeGalleryUrl(uploaded.url)) {
          console.error("ImageKit upload failed:",uploaded);
          return json({error:"The photo could not be uploaded. Please check the image and try again."},502);
        }
        await env.DB.prepare("INSERT INTO ba2_gallery (title,image_url,description) VALUES (?,?,?)").bind(title,uploaded.url,description).run();
        return json({ok:true,image_url:uploaded.url},201);
      }
      if(request.method==="POST" && route==="admin/gallery/featured") { let d;try{d=await request.json();}catch{return json({error:"Choose a valid homepage photo."},400);}const id=Number(d.id);if(!Number.isInteger(id)||id<1)return json({error:"Choose a valid photo."},400);const item=await env.DB.prepare("SELECT image_url FROM ba2_gallery WHERE id=?").bind(id).first();const image=safeGalleryUrl(item?.image_url);if(!image)return json({error:"That photo is unavailable. Refresh the gallery and try again."},404);await env.DB.prepare("INSERT INTO ba2_content (content_key,content_value) VALUES ('hero_image_url',?) ON CONFLICT(content_key) DO UPDATE SET content_value=excluded.content_value,updated_at=CURRENT_TIMESTAMP").bind(image).run();return json({ok:true,featured_image_url:image}); }
      if(request.method==="POST" && route==="admin/gallery/delete") { let d;try{d=await request.json();}catch{return json({error:"Invalid gallery item."},400);}const id=Number(d.id);if(!Number.isInteger(id)||id<1)return json({error:"Choose a valid image."},400);const item=await env.DB.prepare("SELECT image_url FROM ba2_gallery WHERE id=?").bind(id).first();const featured=await env.DB.prepare("SELECT content_value FROM ba2_content WHERE content_key='hero_image_url'").first();if(item?.image_url&&item.image_url===featured?.content_value)await env.DB.prepare("DELETE FROM ba2_content WHERE content_key='hero_image_url'").run();await env.DB.prepare("DELETE FROM ba2_gallery WHERE id=?").bind(id).run();return json({ok:true}); }
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