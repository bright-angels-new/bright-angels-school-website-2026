const $ = s => document.querySelector(s);
let currentPanel = "overviewPanel";
let cachedApplications = [];

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutButton").addEventListener("click", logout);
  $("#announcementForm").addEventListener("submit", saveAnnouncement);
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
  ["overviewPanel","admissionsPanel","studentsPanel","announcementsPanel"].forEach(panel=>$("#"+panel)?.classList.toggle("admin-hidden",panel!==id));
  document.querySelectorAll("[data-panel]").forEach(button=>button.classList.toggle("active",button.dataset.panel===id));
  if(id==="studentsPanel") loadStudents();
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
      const summary=document.createElement("summary");summary.style.cursor="pointer";summary.style.fontWeight="700";summary.textContent=a.child_name+" · "+(a.status||"Pending")+(a.admission_number?" · "+a.admission_number:"");
      const body=document.createElement("div");body.style.padding="12px 0";
      const p=document.createElement("p");p.textContent="Parent/Guardian: "+a.guardian_name+" | Phone: "+a.phone+" | Email: "+(a.email||"Not provided");
      const extra=document.createElement("p");extra.textContent="Previous school: "+(a.previous_school||"Not provided")+" | Submitted: "+new Date(a.created_at+"Z").toLocaleString();
      const message=document.createElement("p");message.textContent="Additional information: "+(a.message||"None");
      const controls=document.createElement("div");controls.className="admin-row-actions";
      const select=document.createElement("select");["Pending","Under Review","Approved","Rejected"].forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;o.selected=(a.status||"Pending")===s;select.append(o);});
      const save=document.createElement("button");save.textContent="Update status";save.addEventListener("click",()=>updateApplication(a.id,select.value,save));
      controls.append(select,save);
      if(a.admission_number){const letter=document.createElement("button");letter.textContent="Print admission letter";letter.addEventListener("click",()=>printAdmissionLetter(a));controls.append(letter);}
      body.append(p,extra,message,controls);details.append(summary,body);section.append(details);
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