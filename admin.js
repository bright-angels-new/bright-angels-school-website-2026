const $ = s => document.querySelector(s);
let currentPanel = "overviewPanel";
let cachedApplications = [];

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutButton").addEventListener("click", logout);
  $("#announcementForm").addEventListener("submit", saveAnnouncement);
  $("#subjectForm")?.addEventListener("submit", saveSubject);
  $("#markForm")?.addEventListener("submit", saveMark);
  $("#feeForm")?.addEventListener("submit", saveFee);
  $("#paymentForm")?.addEventListener("submit", savePayment);
  $("#printReportCard")?.addEventListener("click", printSelectedReport);
  $("#contentForm")?.addEventListener("submit", saveContent);
  $("#galleryForm")?.addEventListener("submit", saveGallery);
  document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => showPanel(button.dataset.panel)));
  $("#admissionSearch")?.addEventListener("input", renderAdmissions);
  $("#classFilter")?.addEventListener("change", renderAdmissions);
  await checkSession();
});

async function api(path, options={}) {
  const response=await fetch("/api/"+path,{credentials:"same-origin",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"The request could not be completed.");
  return data;
}
function showPanel(id) {
  currentPanel=id;
  ["overviewPanel","admissionsPanel","studentsPanel","announcementsPanel","subjectsPanel","marksPanel","feesPanel","messagesPanel","contentPanel","galleryPanel"].forEach(panel=>$("#"+panel)?.classList.toggle("admin-hidden",panel!==id));
  document.querySelectorAll("[data-panel]").forEach(button=>button.classList.toggle("active",button.dataset.panel===id));
  if(id==="studentsPanel") loadStudents();
  if(["subjectsPanel","marksPanel","feesPanel"].includes(id)) loadSchoolRecords();
  if(id==="messagesPanel") loadParentMessages();
  if(id==="contentPanel") loadContent();
  if(id==="galleryPanel") loadAdminGallery();
}
async function login(event) {
  event.preventDefault(); const status=$("#loginStatus"),button=event.currentTarget.querySelector("button");
  button.disabled=true;status.textContent="Signing in…";
  try { await api("login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#adminEmail").value,password:$("#adminPassword").value})});$("#adminPassword").value="";await showDashboard(); }
  catch(error){status.textContent=error.message;} finally{button.disabled=false;}
}
async function checkSession(){try{await api("session");await showDashboard();}catch{$("#loginPanel").classList.remove("admin-hidden");$("#dashboard").classList.add("admin-hidden");}}
async function showDashboard(){ $("#loginPanel").classList.add("admin-hidden");$("#dashboard").classList.remove("admin-hidden");showPanel(currentPanel);await Promise.all([loadAdmissions(),loadAnnouncements()]);}
async function logout(){try{await api("logout",{method:"POST"});}catch{}$("#dashboard").classList.add("admin-hidden");$("#loginPanel").classList.remove("admin-hidden");$("#loginStatus").textContent="You have signed out.";}

async function loadAdmissions(){
  const box=$("#admissionGroups");
  try{
    const data=await api("admin/admissions");cachedApplications=data.applications||[];
    $("#admissionCount").textContent=cachedApplications.length+" application(s) received";
    renderAdmissions();
  }catch(error){box.textContent=error.message;}
}
function renderAdmissions(){
  const box=$("#admissionGroups");if(!box)return;
  const term=($("#admissionSearch")?.value||"").trim().toLowerCase();
  const klass=$("#classFilter")?.value||"";
  const items=cachedApplications.filter(a=>(!klass||a.class_applying===klass)&&[a.child_name,a.guardian_name,a.phone,a.email].some(v=>String(v||"").toLowerCase().includes(term)));
  box.replaceChildren();
  const classes=["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];
  classes.forEach(className=>{
    const group=items.filter(a=>a.class_applying===className);
    if(!group.length)return;
    const section=document.createElement("section");section.className="announcement-item";
    const heading=document.createElement("h3");heading.textContent=className+" · "+group.length+" application(s)";
    section.append(heading);
    group.forEach(a=>{
      const details=document.createElement("details");details.style.padding="12px 0";details.style.borderTop="1px solid #e7e8e1";
      const summary=document.createElement("summary");summary.style.cursor="pointer";summary.style.fontWeight="700";const createdYear=String(a.created_at||"").slice(0,4)||String(new Date().getFullYear());const applicationNumber="BA-APP-"+createdYear+"-"+String(a.id).padStart(5,"0");summary.textContent=a.child_name+" · Application "+applicationNumber+" · Review: "+(a.status||"Pending")+(a.admission_number?" · Admission No. "+a.admission_number:"");
      const body=document.createElement("div");body.style.padding="12px 0";
      const p=document.createElement("p");p.textContent="Parent/Guardian: "+a.guardian_name+" | Phone: "+a.phone+" | Email: "+(a.email||"Not provided");
      const extra=document.createElement("p");extra.textContent="Previous school: "+(a.previous_school||"Not provided")+" | Submitted: "+new Date(a.created_at+"Z").toLocaleString();
      const message=document.createElement("p");message.textContent="Additional information: "+(a.message||"None");
      const detail=document.createElement("p");detail.textContent="Date of birth: "+(a.date_of_birth||"Not provided")+" | Gender: "+(a.gender||"Not provided")+" | Home: "+(a.home_address||"Not provided")+" | Emergency contact: "+(a.emergency_contact||"Not provided")+" | Study mode: "+(a.study_mode||"Not provided");
      const needs=document.createElement("p");needs.textContent="Medical information: "+(a.medical_information||"None")+" | Learning needs: "+(a.learning_needs||"None");
      const controls=document.createElement("div");controls.className="admin-row-actions";
      const reviewLabel=document.createElement("label");reviewLabel.textContent="Review status: ";reviewLabel.style.fontWeight="700";
      const select=document.createElement("select");["Pending","Under Review","Approved","Rejected"].forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;o.selected=(a.status||"Pending")===s;select.append(o);});
      const save=document.createElement("button");save.textContent="Update status";save.addEventListener("click",()=>updateApplication(a.id,select.value,save));
      reviewLabel.append(select);controls.append(reviewLabel,save);
      if(a.admission_number){const letter=document.createElement("button");letter.textContent="Print admission letter";letter.addEventListener("click",()=>printAdmissionLetter(a));controls.append(letter);}
      body.append(p,extra,detail,needs,message,controls);details.append(summary,body);section.append(details);
    });
    box.append(section);
  });
  if(!items.length)box.textContent="No applications match this search.";
}
async function updateApplication(id,status,button){
  button.disabled=true;
  try{const result=await api("admin/admissions/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});await loadAdmissions();if(result.admission_number)alert("Application approved. Student admission number: "+result.admission_number);}
  catch(error){alert(error.message);}finally{button.disabled=false;}
}
function printAdmissionLetter(a){
  const w=window.open("","_blank","width=800,height=900");if(!w){alert("Please allow pop-ups to print the letter.");return;}
  const esc=s=>String(s||"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  w.document.write(`<!doctype html><html><head><title>Admission Letter</title><style>body{font:16px Arial;max-width:720px;margin:50px auto;line-height:1.7;color:#24352e}h1{text-align:center;color:#164638}h2{text-align:center}hr{border:1px solid #d5b36d}.sign{margin-top:70px}</style></head><body><h1>BRIGHT ANGELS JUNIOR SCHOOL</h1><h2>ADMISSION LETTER</h2><hr><p>Date: ${new Date().toLocaleDateString()}</p><p>Dear ${esc(a.guardian_name)},</p><p>We are pleased to confirm the admission of <strong>${esc(a.child_name)}</strong> to <strong>${esc(a.class_applying)}</strong>.</p><p>Admission Number: <strong>${esc(a.admission_number)}</strong></p><p>Please contact the school for reporting arrangements and any further requirements.</p><p>Thank you for choosing Bright Angels Junior School.</p><p class="sign">Headteacher<br>Bright Angels Junior School</p><hr><p style="text-align:center">“If others can, we can”<br>Lukwanga–Kataluko Sentema Road, Wakiso District<br>+256 755 660 550 · +256 525 136 626</p><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
async function loadStudents(){
  const tbody=$("#studentsRows");if(!tbody)return;
  try{const data=await api("admin/students");tbody.replaceChildren();(data.students||[]).forEach(s=>{const tr=document.createElement("tr");[s.admission_number,s.full_name,s.class_name,s.guardian_name,s.phone].forEach(v=>{const td=document.createElement("td");td.textContent=v||"";tr.append(td);});tbody.append(tr);});if(!tbody.children.length)tbody.innerHTML='<tr><td colspan="5">No registered students yet.</td></tr>';}
  catch(error){tbody.innerHTML='<tr><td colspan="5"></td></tr>';tbody.querySelector("td").textContent=error.message;}
}
async function loadAnnouncements(){
  const box=$("#adminAnnouncements");
  try{const data=await api("admin/announcements"),items=data.announcements||[];$("#announcementCount").textContent=items.length+" announcement(s)";box.replaceChildren();if(!items.length){box.textContent="No announcements yet.";return;}items.forEach(item=>{const article=document.createElement("article");article.className="announcement-item";const title=document.createElement("h3");title.textContent=item.title;const body=document.createElement("p");body.textContent=item.body;const meta=document.createElement("p");meta.className="admin-note";meta.textContent=item.is_published?"Published":"Draft";article.append(title,body,meta);box.append(article);});}
  catch(error){box.textContent=error.message;}
}
async function saveAnnouncement(event){
  event.preventDefault();const status=$("#announcementStatus"),button=event.currentTarget.querySelector("button");button.disabled=true;status.textContent="Saving…";
  try{const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());data.is_published=form.elements.is_published.checked;await api("admin/announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});form.reset();form.elements.is_published.checked=true;status.textContent="Announcement saved.";await loadAnnouncements();}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
}

async function loadSchoolRecords(){
  try{
    const [students,subjects,marks,fees]=await Promise.all([api("admin/students"),api("admin/subjects"),api("admin/marks"),api("admin/fees")]);
    const fill=(selector,items,label)=>{const el=$(selector);if(!el)return;el.replaceChildren();items.forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=label(x);el.append(o);});if(!items.length){const o=document.createElement("option");o.value="";o.textContent="No records available";el.append(o);}};
    fill("#markStudent",students.students||[],s=>s.admission_number+" · "+s.full_name+" ("+s.class_name+")");
    fill("#feeStudent",students.students||[],s=>s.admission_number+" · "+s.full_name);
    fill("#markSubject",subjects.subjects||[],s=>s.class_name+" · "+s.name);
    const subjectBox=$("#subjectsList");if(subjectBox){subjectBox.replaceChildren();(subjects.subjects||[]).forEach(s=>{const p=document.createElement("p");p.textContent=s.class_name+" · "+s.name;subjectBox.append(p);});if(!subjectBox.children.length)subjectBox.textContent="No subjects added yet.";}
    const markBox=$("#marksList");if(markBox){markBox.replaceChildren();(marks.marks||[]).forEach(m=>{const p=document.createElement("p");p.textContent=m.full_name+" · "+m.subject_name+" · Term "+m.term+" "+m.academic_year+": "+m.score+"/"+m.max_score;markBox.append(p);});if(!markBox.children.length)markBox.textContent="No marks recorded yet.";}
    const feeBox=$("#feesList"),feeSelect=$("#paymentFee");if(feeBox)feeBox.replaceChildren();if(feeSelect)feeSelect.replaceChildren();
    (fees.fees||[]).forEach(f=>{const p=document.createElement("p");p.textContent=f.full_name+" · "+f.description+" · UGX "+Number(f.amount).toLocaleString()+" · Paid "+Number(f.paid).toLocaleString()+" · Balance "+Number(f.balance).toLocaleString();feeBox?.append(p);if(feeSelect){const o=document.createElement("option");o.value=f.id;o.textContent=f.full_name+" · "+f.description+" · Balance UGX "+Number(f.balance).toLocaleString();feeSelect.append(o);}});
    if(feeBox&&!feeBox.children.length)feeBox.textContent="No fee records yet.";
  }catch(e){alert(e.message);}
}
async function submitAdminForm(formId,path,statusId){
  const form=$(formId),status=$(statusId),button=form.querySelector("button[type=submit]");button.disabled=true;status.textContent="Saving…";
  try{const data=Object.fromEntries(new FormData(form).entries());await api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});form.reset();status.textContent="Saved successfully.";await loadSchoolRecords();}
  catch(e){status.textContent=e.message;}finally{button.disabled=false;}
}
function saveSubject(e){e.preventDefault();submitAdminForm("#subjectForm","admin/subjects","#subjectStatus");}
function saveMark(e){e.preventDefault();submitAdminForm("#markForm","admin/marks","#markStatus");}
function saveFee(e){e.preventDefault();submitAdminForm("#feeForm","admin/fees","#feeStatus");}
function savePayment(e){e.preventDefault();submitAdminForm("#paymentForm","admin/fees/payment","#paymentStatus");}
async function loadParentMessages(){
  const box=$("#messagesList");if(!box)return;
  try{const d=await api("admin/messages");box.replaceChildren();(d.messages||[]).forEach(m=>{const article=document.createElement("article");article.className="announcement-item";const h=document.createElement("h3");h.textContent=m.subject+" · "+m.parent_name;const p=document.createElement("p");p.textContent="Phone: "+m.phone+" · Learner: "+(m.student_name||"Not specified");const body=document.createElement("p");body.textContent=m.message;const controls=document.createElement("div");controls.className="admin-row-actions";const select=document.createElement("select");["New","In Progress","Resolved"].forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;o.selected=(m.status||"New")===s;select.append(o);});const save=document.createElement("button");save.textContent="Update status";save.addEventListener("click",async()=>{save.disabled=true;try{await api("admin/messages/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:m.id,status:select.value})});loadParentMessages();}catch(e){alert(e.message);}finally{save.disabled=false;}});controls.append(select,save);article.append(h,p,body,controls);box.append(article);});if(!box.children.length)box.textContent="No parent messages yet.";}
  catch(e){box.textContent=e.message;}
}

async function loadContent(){try{const d=await api("admin/content");const f=$("#contentForm");for(const [k,v] of Object.entries(d.content||{}))if(f.elements[k])f.elements[k].value=v;}catch(e){$("#contentStatus").textContent=e.message;}}
async function saveContent(e){e.preventDefault();const form=e.currentTarget,status=$("#contentStatus"),button=form.querySelector("button");button.disabled=true;status.textContent="Saving…";try{const data=Object.fromEntries(new FormData(form).entries());await api("admin/content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});status.textContent="Website text saved."; }catch(err){status.textContent=err.message;}finally{button.disabled=false;}}
async function loadAdminGallery(){const box=$("#adminGalleryList");try{const d=await api("admin/gallery");box.replaceChildren();(d.gallery||[]).forEach(item=>{const row=document.createElement("article");row.className="announcement-item";const title=document.createElement("h3");title.textContent=item.title;const img=document.createElement("img");img.src=item.image_url;img.alt=item.title;img.loading="lazy";img.style.maxWidth="180px";img.style.display="block";const del=document.createElement("button");del.textContent="Remove photo";del.addEventListener("click",async()=>{if(!confirm("Remove this gallery item?"))return;try{await api("admin/gallery/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id})});loadAdminGallery();}catch(e){alert(e.message);}});row.append(title,img,del);box.append(row);});if(!box.children.length)box.textContent="No gallery photos yet.";}catch(e){box.textContent=e.message;}}
async function saveGallery(e){e.preventDefault();const form=e.currentTarget,status=$("#galleryStatus"),button=form.querySelector("button");button.disabled=true;status.textContent="Saving…";try{await api("admin/gallery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});form.reset();status.textContent="Gallery photo added.";await loadAdminGallery();}catch(err){status.textContent=err.message;}finally{button.disabled=false;}}

async function printSelectedReport(){
  const studentId=$("#markStudent")?.value,form=$("#markForm"),year=form?.elements.academic_year.value,term=form?.elements.term.value,status=$("#reportStatus");
  if(!studentId||!year||!term){status.textContent="Select a student, academic year and term first.";return;}
  status.textContent="Preparing report card…";
  try{
    const report=await api("admin/report-card?student_id="+encodeURIComponent(studentId)+"&academic_year="+encodeURIComponent(year)+"&term="+encodeURIComponent(term));
    const w=window.open("","_blank","width=850,height=900");if(!w)throw new Error("Allow pop-ups to print the report card.");
    const esc=v=>String(v??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
    const rows=report.subjects.map(x=>"<tr><td>"+esc(x.subject_name)+"</td><td>"+esc(x.score)+" / "+esc(x.max_score)+"</td><td>"+esc(x.remarks||"")+"</td></tr>").join("");
    w.document.write("<!doctype html><html><head><title>Bright Angels Report Card</title><style>body{font:15px Arial;max-width:760px;margin:35px auto;color:#20382f}h1,h2{text-align:center;color:#164638}table{width:100%;border-collapse:collapse;margin-top:25px}td,th{padding:10px;border:1px solid #aaa;text-align:left}.foot{margin-top:45px}</style></head><body><h1>BRIGHT ANGELS JUNIOR SCHOOL</h1><h2>LEARNER REPORT CARD</h2><p><b>Learner:</b> "+esc(report.student.full_name)+"<br><b>Admission No:</b> "+esc(report.student.admission_number)+"<br><b>Class:</b> "+esc(report.student.class_name)+"<br><b>Academic year:</b> "+esc(report.academic_year)+"<br><b>Term:</b> "+esc(report.term)+"</p><table><thead><tr><th>Subject</th><th>Score</th><th>Remarks</th></tr></thead><tbody>"+rows+"</tbody></table><h3>Total: "+esc(report.total)+" / "+esc(report.maximum)+" ("+esc(report.percentage)+"%)</h3><p class=foot>Class Teacher: ____________________ &nbsp; Headteacher: ____________________</p><p style=text-align:center>If others can, we can</p><script>window.onload=()=>window.print()<\/script></body></html>");
    w.document.close();status.textContent="Report card opened for printing.";
  }catch(e){status.textContent=e.message;}
}
