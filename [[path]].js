const COOKIE = 'ba_admin';
const schema = `
CREATE TABLE IF NOT EXISTS ba_students (id INTEGER PRIMARY KEY AUTOINCREMENT, admission_number TEXT UNIQUE, name TEXT NOT NULL, class_name TEXT NOT NULL, gender TEXT, guardian TEXT, phone TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, class_name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(name, class_name));
CREATE TABLE IF NOT EXISTS ba_marks (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, term TEXT NOT NULL, year INTEGER NOT NULL, score REAL NOT NULL, out_of REAL NOT NULL, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_fees (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, term TEXT NOT NULL, year INTEGER NOT NULL, amount_paid REAL DEFAULT 0, balance REAL DEFAULT 0, reference TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_content (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_admissions (id INTEGER PRIMARY KEY AUTOINCREMENT, child_name TEXT NOT NULL, class_applied TEXT, parent_name TEXT, phone TEXT, email TEXT, message TEXT, status TEXT DEFAULT 'Pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, message TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ba_gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    file_id TEXT NOT NULL,
    caption TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ba_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
`;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
const str=(v,max=4000)=>String(v??'').trim().slice(0,max);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const hash=async value=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
const sign=async(value,secret)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const b=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
function cookieValue(req){const c=req.headers.get('Cookie')||'';const p=c.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));if(!p)return '';try{return decodeURIComponent(p.slice(COOKIE.length+1))}catch{return ''}}
async function authorized(req,env){if(!env.DB||!env.SESSION_SECRET)return false;const p=cookieValue(req).split('.');if(p.length!==2)return false;const [token,sig]=p;if(sig!==await sign(token,env.SESSION_SECRET))return false;const row=await env.DB.prepare('SELECT expires FROM ba_sessions WHERE token_hash = ?').bind(await hash(token)).first();return !!row&&row.expires>Math.floor(Date.now()/1000)}
async function readBody(req){try{return await req.json()}catch{throw new Error('Please submit valid form data.')}}
async function all(db,sql,...p){const r=await db.prepare(sql).bind(...p).all();return r.results||[]}
async function has(db,table,id){const allowed=['ba_students','ba_subjects','ba_marks','ba_fees','ba_announcements','ba_admissions','ba_messages'];if(!allowed.includes(table))return false;return !!await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first()}
const setCookie=(value,age)=>`${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
export async function onRequest({request,env}){
 if(!env.DB)return fail('Cloudflare D1 binding DB is missing.',500);
 try{
  for(const q of schema.split(';').map(x=>x.trim()).filter(Boolean))await env.DB.prepare(q).run();
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,''),method=request.method;
  const m=path.match(/^([a-z-]+)\/(\d+)$/),resource=m?m[1]:path,id=m?Number(m[2]):0;
  if(path==='health'&&method==='GET')return json({ok:true});
  if(path==='login'&&method==='POST'){
   if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return fail('Admin password or session secret is not configured.',503);
   const b=await readBody(request);
   if(str(b.email,250).toLowerCase()!==String(env.ADMIN_EMAIL||'brightangels26@gmail.com').toLowerCase()||str(b.password,500)!==env.ADMIN_PASSWORD)return fail('Email or password is incorrect.',401);
   const t=crypto.randomUUID()+crypto.randomUUID(),expires=Math.floor(Date.now()/1000)+28800;
   await env.DB.prepare('INSERT INTO ba_sessions(token_hash,expires) VALUES(?,?)').bind(await hash(t),expires).run();
   return json({ok:true},200,{'set-cookie':setCookie(encodeURIComponent(t+'.'+await sign(t,env.SESSION_SECRET)),28800)});
  }
  if(path==='logout'&&method==='POST'){const t=cookieValue(request).split('.')[0];if(t)await env.DB.prepare('DELETE FROM ba_sessions WHERE token_hash = ?').bind(await hash(t)).run();return json({ok:true},200,{'set-cookie':setCookie('',0)})}
  if(path==='admissions'&&method==='POST'){const b=await readBody(request);if(!str(b.child_name))return fail('Child name is required.');const r=await env.DB.prepare('INSERT INTO ba_admissions(child_name,class_applied,parent_name,phone,email,message) VALUES(?,?,?,?,?,?)').bind(str(b.child_name,200),str(b.class_applied,80),str(b.parent_name,200),str(b.phone,80),str(b.email,250),str(b.message)).run();return json({ok:true,id:r.meta.last_row_id},201)}
  if(path==='messages'&&method==='POST'){const b=await readBody(request);if(!str(b.message))return fail('Message is required.');const r=await env.DB.prepare('INSERT INTO ba_messages(name,email,phone,message) VALUES(?,?,?,?)').bind(str(b.name,200),str(b.email,250),str(b.phone,80),str(b.message)).run();return json({ok:true,id:r.meta.last_row_id},201)}
 if(path==='gallery'&&method==='GET')return json({data:await all(env.DB,'SELECT * FROM ba_gallery ORDER BY id DESC')});
 if(path==='announcements'&&method==='GET')return json({data:await all(env.DB,'SELECT * FROM ba_announcements ORDER BY id DESC')});
  if(path==='content'&&method==='GET')return json({data:await all(env.DB,'SELECT * FROM ba_content ORDER BY key')});
  if(path==='data'&&method==='GET')return await authorized(request,env)?json({ok:true}):fail('Please sign in.',401);
  if(resource==='gallery'&&method==='POST'){
    if(!env.IMAGEKIT_PRIVATE_KEY){
        return fail('ImageKit private key is not configured.',503);
    }

    const form=await request.formData();
    const file=form.get('file');
    const caption=str(form.get('caption'),300);

    if(!file||typeof file==='string'||!file.size){
        return fail('Please select a photo.');
    }

    if(!file.type.startsWith('image/')){
        return fail('Only image files are allowed.');
    }

    if(file.size>10*1024*1024){
        return fail('Photo must not exceed 10 MB.');
    }

    const uploadForm=new FormData();
    uploadForm.append('file',file);
    uploadForm.append('fileName',file.name);
    uploadForm.append('folder','/bright-angels-school');

    const upload=await fetch(
        'https://upload.imagekit.io/api/v1/files/upload',
        {
            method:'POST',
            headers:{
                Authorization:'Basic '+btoa(env.IMAGEKIT_PRIVATE_KEY+':')
            },
            body:uploadForm
        }
    );

    const uploaded=await upload.json();

    if(!upload.ok){
        console.error('ImageKit upload error:',uploaded);
        return fail('Photo upload failed. Please try again.',502);
    }

    const saved=await env.DB.prepare(
        'INSERT INTO ba_gallery(image_url,file_id,caption) VALUES(?,?,?)'
    ).bind(uploaded.url,uploaded.fileId,caption).run();

    return json({ok:true,id:saved.meta.last_row_id,url:uploaded.url},201);
  }
   if(resource==='gallery'&&method==='DELETE'){
    const b=await readBody(request);
    const photoId=num(b.id);

    if(!photoId)return fail('Photo ID is required.');

    const photo=await env.DB.prepare(
        'SELECT * FROM ba_gallery WHERE id=?'
    ).bind(photoId).first();

    if(!photo)return fail('Photo not found.',404);

    const removed=await fetch(
        `https://api.imagekit.io/v1/files/${encodeURIComponent(photo.file_id)}`,
        {
            method:'DELETE',
            headers:{
                Authorization:'Basic '+btoa(env.IMAGEKIT_PRIVATE_KEY+':')
            }
        }
    );

    if(!removed.ok){
        return fail('Could not delete the photo from ImageKit.',502);
    }

    await env.DB.prepare(
        'DELETE FROM ba_gallery WHERE id=?'
    ).bind(photoId).run();

    return json({ok:true});
        }
     if(!await authorized(request,env))return fail('Please sign in to use the admin dashboard.',401);
if(resource==='students'&&method==='GET'&&!id){
const students=await all(env.DB,
"SELECT * FROM students WHERE status='Active' ORDER BY class_name,full_name"
);
return json({ok:true,students});
}

if(resource==='students'&&method==='POST'&&!id){
const b=await readBody(request);
const name=str(b.full_name,200);
const cls=str(b.class_name,80);
const adm=str(b.admission_number,80);

if(!name||!cls||!adm)
  return fail('Full name, admission number and class are required.');

const r=await env.DB.prepare(`
  INSERT INTO students
  (admission_number,full_name,date_of_birth,gender,class_name,parent_name,parent_phone,enrollment_date,status)
  VALUES(?,?,?,?,?,?,?,date('now'),'Active')
`).bind(
  adm,
  name,
  str(b.date_of_birth,20)||null,
  str(b.gender,30),
  cls,
  str(b.parent_name,200),
  str(b.parent_phone,80)
).run();

return json({ok:true,id:r.meta.last_row_id},201);

}

if(resource==='students'&&method==='DELETE'&&id){
const result=await env.DB.prepare(
"UPDATE students SET status='Archived' WHERE id=? AND status='Active'"
).bind(id).run();

if(!result.meta.changes)
  return fail('Active student not found.',404);

return json({ok:true});

}
     if(resource==='subjects'&&method==='GET'&&!id){
    const subjects=await all(env.DB,`
        SELECT
            s.id,
            s.subject_name,
            s.subject_name AS name,
            a.class_name,
            a.academic_year
        FROM subjects s
        LEFT JOIN subject_class_allocations a
            ON a.subject_id=s.id
        ORDER BY s.subject_name, a.class_name
    `);

    return json({ok:true,subjects});
}

if(resource==='subjects'&&method==='POST'&&!id){
    const b=await readBody(request);
    const name=str(b.name??b.subject_name,120).trim();
    const className=str(b.class_name,50).trim();
    const year=num(b.academic_year)||new Date().getFullYear();

    if(!name)return fail('Subject name is required.');
    if(!className)return fail('Please select a class.');

    await env.DB.prepare(`
        INSERT INTO subjects(subject_name)
        SELECT ?
        WHERE NOT EXISTS (
            SELECT 1 FROM subjects
            WHERE LOWER(subject_name)=LOWER(?)
        )
    `).bind(name,name).run();

    const subject=await env.DB.prepare(`
        SELECT id FROM subjects
        WHERE LOWER(subject_name)=LOWER(?)
    `).bind(name).first();

    await env.DB.prepare(`
        INSERT OR IGNORE INTO subject_class_allocations
        (subject_id,class_name,academic_year)
        VALUES(?,?,?)
    `).bind(subject.id,className,year).run();

    return json({ok:true,id:subject.id},201);
}

if(resource==='subjects'&&method==='DELETE'&&id){
    return fail('Subject deletion is disabled to protect historical marks.');
}
if(resource==='marks'&&method==='GET'){
    const sid=num(url.searchParams.get('student_id'));
    const term=str(url.searchParams.get('term'),30);
    const year=num(url.searchParams.get('year'));

    let sql=`
        SELECT
            m.*,
            st.full_name AS student_name,
            st.admission_number,
            st.class_name,
            su.subject_name AS subject_name,
            m.academic_year AS year,
            m.marks_obtained AS score,
            m.maximum_marks AS out_of,
            m.remarks AS comment
        FROM marks m
        JOIN students st ON st.id=m.student_id
        JOIN subjects su ON su.id=m.subject_id
        WHERE 1=1
    `;

    const p=[];

    if(sid){
        sql+=' AND m.student_id=?';
        p.push(sid);
    }

    if(term){
        sql+=' AND m.term=?';
        p.push(term);
    }

    if(year){
        sql+=' AND m.academic_year=?';
        p.push(year);
    }

    sql+=' ORDER BY st.class_name,st.full_name,su.subject_name';

    return json({
        ok:true,
        marks:await all(env.DB,sql,...p)
    });
}

if(resource==='marks'&&method==='POST'&&!id){
    const b=await readBody(request);
    const sid=num(b.student_id);
    const sub=num(b.subject_id);
    const term=str(b.term,30);
    const year=num(b.year);
    const score=num(b.score);
    const out=num(b.out_of);
    const assessment=str(b.assessment_type,10);
    const allowed=['BOT','MOT','EOT'];

    if(!sid||!sub||!term||!year)
        return fail('Student, subject, term and year are required.');

    if(!allowed.includes(assessment))
        return fail('Select BOT, MOT or EOT.');

    if(score<0||out<=0||score>out)
        return fail('Score must be between zero and the maximum mark.');

    const student=await env.DB.prepare(
        'SELECT id FROM students WHERE id=?'
    ).bind(sid).first();

    const subject=await env.DB.prepare(
        'SELECT id FROM subjects WHERE id=?'
    ).bind(sub).first();

    if(!student||!subject)
        return fail('Student or subject not found.',404);

    const r=await env.DB.prepare(`
        INSERT INTO marks
        (student_id,subject_id,academic_year,term,assessment_type,
         marks_obtained,maximum_marks,remarks)
        VALUES(?,?,?,?,?,?,?,?)
    `).bind(
        sid,sub,year,term,assessment,score,out,
        str(b.comment,500)
    ).run();

    return json({ok:true,id:r.meta.last_row_id},201);
}

if(resource==='marks'&&method==='DELETE'&&id){
    return fail('Deleting academic marks is disabled to protect historical records.');
}     
     if(resource==='fees'&&method==='GET'){const sid=num(url.searchParams.get('student_id')),term=str(url.searchParams.get('term'),30),year=num(url.searchParams.get('year'));let sql='SELECT f.*,st.name AS student_name,st.admission_number,st.class_name FROM ba_fees f JOIN ba_students st ON st.id=f.student_id WHERE 1=1',p=[];if(sid){sql+=' AND f.student_id=?';p.push(sid)}if(term){sql+=' AND f.term=?';p.push(term)}if(year){sql+=' AND f.year=?';p.push(year)}return json({data:await all(env.DB,sql+' ORDER BY st.class_name,st.name',...p)})}
  if(resource==='fees'&&method==='POST'&&!id){const b=await readBody(request),sid=num(b.student_id),term=str(b.term,30),year=num(b.year),paid=num(b.amount_paid),bal=num(b.balance);if(!sid||!term||!year)return fail('Student, term and year are required.');if(paid<0||bal<0)return fail('Fee amounts cannot be negative.');if(!await has(env.DB,'ba_students',sid))return fail('Student not found.',404);const r=await env.DB.prepare('INSERT INTO ba_fees(student_id,term,year,amount_paid,balance,reference) VALUES(?,?,?,?,?,?)').bind(sid,term,year,paid,bal,str(b.reference,150)).run();return json({ok:true,id:r.meta.last_row_id},201)}
  if(resource==='announcements'&&method==='POST'){const b=await readBody(request),title=str(b.title,200),body=str(b.body??b.message);if(!title||!body)return fail('Announcement title and message are required.');const r=await env.DB.prepare('INSERT INTO ba_announcements(title,body) VALUES(?,?)').bind(title,body).run();return json({ok:true,id:r.meta.last_row_id},201)}
  if(resource==='announcements'&&method==='DELETE'&&id){if(!await has(env.DB,'ba_announcements',id))return fail('Announcement not found.',404);await env.DB.prepare('DELETE FROM ba_announcements WHERE id=?').bind(id).run();return json({ok:true})}
  if(resource==='messages'&&method==='GET')return json({data:await all(env.DB,'SELECT * FROM ba_messages ORDER BY id DESC')});
  if(resource==='messages'&&method==='DELETE'&&id){if(!await has(env.DB,'ba_messages',id))return fail('Message not found.',404);await env.DB.prepare('DELETE FROM ba_messages WHERE id=?').bind(id).run();return json({ok:true})}
  if(resource==='admissions'&&method==='GET')return json({data:await all(env.DB,'SELECT * FROM ba_admissions ORDER BY id DESC')});
  if(resource==='admissions'&&method==='PUT'&&id){const b=await readBody(request),status=str(b.status,40);if(!await has(env.DB,'ba_admissions',id))return fail('Admission application not found.',404);if(!status)return fail('Status is required.');await env.DB.prepare('UPDATE ba_admissions SET status=? WHERE id=?').bind(status,id).run();return json({ok:true})}
  if(resource==='admissions'&&method==='DELETE'&&id){if(!await has(env.DB,'ba_admissions',id))return fail('Admission application not found.',404);await env.DB.prepare('DELETE FROM ba_admissions WHERE id=?').bind(id).run();return json({ok:true})}
  return fail('API route not found.',404);
 }catch(e){console.error('Bright Angels API error',e);if(e?.message?.includes('UNIQUE constraint failed'))return fail('This record already exists. Check duplicate admission numbers or subjects.',409);return fail('Server error. Check Cloudflare deployment logs.',500)}
}
