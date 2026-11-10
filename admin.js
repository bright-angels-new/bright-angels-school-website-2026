const $ = s => document.querySelector(s);
let currentPanel = "overviewPanel";
let cachedApplications = [];
let cachedSubjects = [];
let cachedStudents = [];
let selectedSubjectClass = "";

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutButton").addEventListener("click", logout);
  $("#announcementForm").addEventListener("submit", saveAnnouncement);
  $("#storyForm")?.addEventListener("submit", saveStory);
  $("#subjectForm")?.addEventListener("submit", saveSubject);
  $("#subjectClassTabs")?.addEventListener("click", event => { const button=event.target.closest("[data-subject-class]"); if(!button)return; selectedSubjectClass=button.dataset.subjectClass; const select=$("#subjectClassSelect"); if(select)select.value=selectedSubjectClass; renderClassSubjects(); });
  $("#subjectClassSelect")?.addEventListener("change", event => { selectedSubjectClass=event.target.value; renderClassSubjects(); });
  $("#markForm")?.addEventListener("submit", saveMark);
  $("#feeForm")?.addEventListener("submit", saveFee);
  $("#paymentForm")?.addEventListener("submit", savePayment);
  $("#printReportCard")?.addEventListener("click", printSelectedReport);
  $("#printClassReports")?.addEventListener("click", printWholeClassReports);
  $("#reportClass")?.addEventListener("change", renderReportStudentOptions);
  $("#contentForm")?.addEventListener("submit", saveContent);
  $("#galleryForm")?.addEventListener("submit", saveGallery);
  $("#videoForm")?.addEventListener("submit", saveVideo);
  const menuToggle = $("#dashboardMenuToggle");
  const dashboardMenu = $("#dashboardMenu");
  const syncDashboardMenu = () => {
    if (!dashboardMenu || !menuToggle) return;
    const desktop = window.matchMedia("(min-width: 851px)").matches;
    dashboardMenu.classList.toggle("admin-hidden", !desktop);
    menuToggle.setAttribute("aria-expanded", String(desktop));
    menuToggle.querySelector("span").textContent = desktop ? "Choose a section" : "Open dashboard sections";
  };
  menuToggle?.addEventListener("click", () => {
    const isOpen = !dashboardMenu.classList.contains("admin-hidden");
    dashboardMenu.classList.toggle("admin-hidden", isOpen);
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.querySelector("span").textContent = isOpen ? "Open dashboard sections" : "Choose a section";
  });
  window.addEventListener("resize", syncDashboardMenu, { passive: true });
  syncDashboardMenu();
  document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => {
    showPanel(button.dataset.panel);
    dashboardMenu?.classList.add("admin-hidden");
    menuToggle?.setAttribute("aria-expanded", "false");
    if (menuToggle?.querySelector("span")) menuToggle.querySelector("span").textContent = "Open dashboard sections";
  }));
  $("#admissionSearch")?.addEventListener("input", renderAdmissions);
  $("#directStudentForm")?.addEventListener("submit", saveDirectStudent);
  $("#directStudentForm [name=\"date_of_birth\"]")?.addEventListener("change", updateDirectStudentAge);
  $("#studentSearch")?.addEventListener("input", loadStudents);
  $("#studentClassFilter")?.addEventListener("change", loadStudents);
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
  ["overviewPanel","announcementsPanel","storiesPanel","contentPanel","galleryPanel"].forEach(panel=>$("#"+panel)?.classList.toggle("admin-hidden",panel!==id));
  document.querySelectorAll("[data-panel]").forEach(button=>button.classList.toggle("active",button.dataset.panel===id));
  if(id==="contentPanel") loadContent();
  if(id==="galleryPanel"){loadAdminGallery();loadAdminVideos();}
  if(id==="storiesPanel") loadStories();
}
async function login(event) {
  event.preventDefault(); const status=$("#loginStatus"),button=event.currentTarget.querySelector("button");
  button.disabled=true;status.textContent="Signing in…";
  try { await api("login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#adminEmail").value,password:$("#adminPassword").value})});$("#adminPassword").value="";await showDashboard(); }
  catch(error){status.textContent=error.message;} finally{button.disabled=false;}
}
async function checkSession(){try{await api("session");await showDashboard();}catch{$("#loginPanel").classList.remove("admin-hidden");$("#dashboard").classList.add("admin-hidden");}}
async function showDashboard(){ $("#loginPanel").classList.add("admin-hidden");$("#dashboard").classList.remove("admin-hidden");showPanel(currentPanel);await loadAnnouncements();}
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
      const detail=document.createElement("p");detail.textContent="Date of birth: "+(a.date_of_birth||"Not provided")+" | Age: "+(a.age??"Not provided")+" | Gender: "+(a.gender||"Not provided")+" | Home: "+(a.home_address||"Not provided")+" | Emergency contact: "+(a.emergency_contact||"Not provided")+" | Study mode: "+(a.study_mode||"Not provided");
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
function renderStudentSummary(allStudents){
  const box=$("#studentSummary");if(!box)return;
  const classOrder=["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];
  const active=(allStudents||[]).filter(s=>!s.student_status||String(s.student_status).toLowerCase()==="active");
  const stats=()=>({boys:0,girls:0,unrecorded:0,total:0});
  const overall=stats(),byClass=new Map(classOrder.map(name=>[name,stats()]));
  active.forEach(student=>{
    const row=byClass.get(student.class_name);
    const gender=String(student.gender||"").trim().toLowerCase();
    const target=gender==="male"?"boys":gender==="female"?"girls":"unrecorded";
    overall[target]++;overall.total++;
    if(row){row[target]++;row.total++;}
  });
  box.replaceChildren();
  const cards=document.createElement("div");cards.className="student-total-cards";
  [["Total students",overall.total],["Boys",overall.boys],["Girls",overall.girls],["Gender not recorded",overall.unrecorded]].forEach(([label,value])=>{
    const card=document.createElement("div");card.className="student-stat";
    const name=document.createElement("span");name.textContent=label;
    const number=document.createElement("strong");number.textContent=Number(value).toLocaleString();
    card.append(name,number);cards.append(card);
  });
  const heading=document.createElement("h3");heading.textContent="Student numbers by class";
  const wrap=document.createElement("div");wrap.className="summary-table-wrap";
  const table=document.createElement("table");table.className="student-class-summary";
  const thead=document.createElement("thead"),headRow=document.createElement("tr");
  ["Class","Boys","Girls","Gender not recorded","Total"].forEach(label=>{const th=document.createElement("th");th.textContent=label;headRow.append(th);});
  thead.append(headRow);table.append(thead);
  const tbody=document.createElement("tbody");
  classOrder.forEach(name=>{
    const row=byClass.get(name),tr=document.createElement("tr");
    [name,row.boys,row.girls,row.unrecorded,row.total].forEach(value=>{const td=document.createElement("td");td.textContent=typeof value==="number"?value.toLocaleString():value;tr.append(td);});
    tbody.append(tr);
  });
  const totalRow=document.createElement("tr");totalRow.style.fontWeight="800";
  ["SCHOOL TOTAL",overall.boys,overall.girls,overall.unrecorded,overall.total].forEach(value=>{const td=document.createElement("td");td.textContent=typeof value==="number"?value.toLocaleString():value;totalRow.append(td);});
  tbody.append(totalRow);table.append(tbody);wrap.append(table);
  const note=document.createElement("p");note.className="admin-note";note.textContent="Counts include active students. Learners with a blank or unrecognised gender are included in the total and listed under “Gender not recorded”.";
  box.append(cards,heading,wrap,note);
}
function updateDirectStudentAge(){
  const form=$("#directStudentForm");
  const dob=form?.elements.namedItem("date_of_birth")?.value;
  const ageInput=form?.elements.namedItem("age");
  if(!ageInput)return;
  ageInput.value="";
  if(!dob)return;
  const birth=new Date(dob+"T00:00:00");
  if(Number.isNaN(birth.getTime()))return;
  const today=new Date();
  let age=today.getFullYear()-birth.getFullYear();
  if(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate()))age--;
  if(age>=0&&age<=100)ageInput.value=String(age);
}

async function saveDirectStudent(event){
  event.preventDefault();
  const form=event.currentTarget,status=$("#directStudentStatus"),button=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form).entries());
  button.disabled=true;status.textContent="Registering student…";
  try{
    const result=await api("admin/students",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    form.reset();status.textContent="Student registered successfully. Admission number: "+result.admission_number;
    await loadStudents();
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
}
async function loadStudents(){
  const tbody=$("#studentsRows");if(!tbody)return;
  try{
    const data=await api("admin/students");renderStudentSummary(data.students||[]);const term=($("#studentSearch")?.value||"").trim().toLowerCase(),klass=$("#studentClassFilter")?.value||"";
    const students=(data.students||[]).filter(s=>(!klass||s.class_name===klass)&&[s.admission_number,s.full_name,s.class_name,s.guardian_name,s.phone].some(v=>String(v||"").toLowerCase().includes(term)));
    tbody.replaceChildren();
    students.forEach(s=>{
      const tr=document.createElement("tr");
      [s.admission_number,s.full_name,s.class_name,s.guardian_name,s.phone].forEach(v=>{const td=document.createElement("td");td.textContent=v||"";tr.append(td);});
      const actions=document.createElement("td"),profile=document.createElement("button");profile.type="button";profile.textContent="View profile";profile.addEventListener("click",()=>showStudentProfile(s));
      const promote=document.createElement("button");promote.type="button";promote.textContent="Promote";promote.disabled=s.class_name==="P7"||s.student_status!=="Active";promote.addEventListener("click",()=>changeStudentClass(s,"Promote",promote));
      const repeat=document.createElement("button");repeat.type="button";repeat.textContent="Repeat class";repeat.disabled=s.student_status!=="Active";repeat.addEventListener("click",()=>changeStudentClass(s,"Repeat",repeat));
      actions.className="admin-row-actions";actions.append(profile,promote,repeat);tr.append(actions);tbody.append(tr);
    });
    if(!tbody.children.length)tbody.innerHTML='<tr><td colspan="6">No registered students match this search.</td></tr>';
    const count=$("#studentCount");if(count)count.textContent=students.length+" learner(s) shown";
  }catch(error){tbody.innerHTML='<tr><td colspan="6"></td></tr>';tbody.querySelector("td").textContent=error.message;}
}
function showStudentProfile(s){
  const box=$("#studentProfile");if(!box)return;
  box.replaceChildren();box.classList.remove("admin-hidden");
  const title=document.createElement("h3");title.textContent=s.full_name+" · "+s.admission_number;
  const lines=[
    "Current class: "+s.class_name,"Status: "+(s.student_status||"Active"),"Date of birth: "+(s.date_of_birth||"Not recorded")+" · Age at admission: "+(s.age??"Not recorded"),
    "Gender: "+(s.gender||"Not recorded"),"Parent/Guardian: "+s.guardian_name+" · Phone: "+s.phone,"Email: "+(s.email||"Not provided"),
    "Home address: "+(s.home_address||"Not recorded"),"Emergency contact: "+(s.emergency_contact||"Not recorded"),
    "Previous school: "+(s.previous_school||"Not recorded"),"Medical information: "+(s.medical_information||"None recorded"),
    "Learning needs: "+(s.learning_needs||"None recorded"),"Admitted: "+(s.admitted_at||"")
  ];
  box.append(title);lines.forEach(value=>{const p=document.createElement("p");p.textContent=value;box.append(p);});
  const historyTitle=document.createElement("h4");historyTitle.textContent="Class history";box.append(historyTitle);
  api("admin/student-history?student_id="+encodeURIComponent(s.id)).then(data=>{
    if(!(data.history||[]).length){const p=document.createElement("p");p.textContent="No class changes recorded yet.";box.append(p);return;}
    data.history.forEach(item=>{const p=document.createElement("p");p.textContent=item.action+" · "+item.from_class+" → "+item.to_class+" · Academic year "+item.academic_year+(item.remarks?" · "+item.remarks:"");box.append(p);});
  }).catch(e=>{const p=document.createElement("p");p.textContent=e.message;box.append(p);});
}
async function changeStudentClass(student,action,button){
  const classes=["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];
  const nextClass=action==="Promote"?classes[classes.indexOf(student.class_name)+1]:student.class_name;
  const year=Number($("#studentAcademicYear")?.value||new Date().getFullYear());
  const message=action==="Promote"?"Promote "+student.full_name+" from "+student.class_name+" to "+nextClass+"?":"Keep "+student.full_name+" in "+student.class_name+" for another year?";
  if(!confirm(message+" This will be saved in the learner's class history."))return;
  button.disabled=true;
  try{
    const result=await api("admin/students/class-change",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({student_id:student.id,current_class:student.class_name,action,academic_year:year})});
    alert(result.full_name+" has been "+(action==="Promote"?"promoted to "+result.to_class:"recorded as repeating "+result.to_class)+".");
    await loadStudents();
    const profile=$("#studentProfile");if(profile&&!profile.classList.contains("admin-hidden"))showStudentProfile({...student,class_name:result.to_class});
    await loadSchoolRecords();
  }catch(error){alert(error.message);}finally{button.disabled=false;}
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


async function loadStories(){
  const list=$("#adminStoriesList"),select=$("#storyImageSelect");
  if(!list)return;
  try{
    const [data,gallery]=await Promise.all([api("admin/stories"),api("admin/gallery")]);
    if(select){const previous=select.value;select.replaceChildren();const none=document.createElement("option");none.value="";none.textContent="No photo";select.append(none);(gallery.gallery||[]).forEach(photo=>{const option=document.createElement("option");option.value=photo.image_url;option.textContent=photo.title||"School photo";select.append(option);});if([...select.options].some(o=>o.value===previous))select.value=previous;}
    list.replaceChildren();
    const stories=data.stories||[];
    if(!stories.length){list.textContent="No school stories have been published yet.";return;}
    stories.forEach(story=>{
      const card=document.createElement("article");card.className="announcement-item";
      if(story.image_url){const img=document.createElement("img");img.src=story.image_url;img.alt=story.title;img.loading="lazy";img.className="story-admin-image";card.append(img);}
      const title=document.createElement("h3");title.textContent=story.title;
      const body=document.createElement("p");body.textContent=story.body;
      const meta=document.createElement("p");meta.className="admin-note";meta.textContent=story.is_published?"Published":"Draft";
      const remove=document.createElement("button");remove.type="button";remove.textContent="Delete story";remove.addEventListener("click",async()=>{if(!confirm("Delete this school story?"))return;remove.disabled=true;try{await api("admin/stories/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:story.id})});await loadStories();}catch(error){alert(error.message);remove.disabled=false;}});
      card.append(title,body,meta,remove);list.append(card);
    });
  }catch(error){list.textContent=error.message;}
}
async function saveStory(event){
  event.preventDefault();
  const form=event.currentTarget,status=$("#storyStatus"),button=form.querySelector('button[type="submit"]');
  const photo=form.elements.story_photo?.files?.[0]||null;
  let imageUrl=form.elements.image_url?.value||"";
  button.disabled=true;
  try{
    if(photo){
      const mime=String(photo.type||"").toLowerCase();
      if(!["image/jpeg","image/png","image/webp","image/gif"].includes(mime))throw new Error("Choose a JPG, PNG, WebP or GIF photo.");
      if(photo.size>10*1024*1024)throw new Error("The photo must be 10 MB or smaller.");
      status.textContent="Preparing secure photo upload…";
      const auth=await api("admin/videos/auth");
      const payload=new FormData();
      payload.append("file",photo,photo.name);
      payload.append("fileName",photo.name.replace(/[^a-zA-Z0-9._-]/g,"_"));
      payload.append("useUniqueFileName","true");
      payload.append("token",auth.token);
      payload.append("expire",String(auth.expire));
      payload.append("signature",auth.signature);
      payload.append("publicKey",auth.publicKey);
      status.textContent="Uploading photo: 0%";
      const uploaded=await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();
        xhr.open("POST","https://upload.imagekit.io/api/v1/files/upload");
        xhr.upload.addEventListener("progress",event=>{if(event.lengthComputable)status.textContent="Uploading photo: "+Math.round(event.loaded/event.total*100)+"%";});
        xhr.addEventListener("load",()=>{let data={};try{data=JSON.parse(xhr.responseText||"{}");}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.message||data.help||"The photo storage service could not accept this image."));});
        xhr.addEventListener("error",()=>reject(new Error("The photo upload connection was interrupted. Check your internet connection and try again.")));
        xhr.addEventListener("abort",()=>reject(new Error("The photo upload was cancelled.")));
        xhr.send(payload);
      });
      if(!uploaded.url||!isApprovedAdminGalleryImage(uploaded.url))throw new Error("The upload service did not return a valid photo.");
      imageUrl=uploaded.url;
    }
    status.textContent="Publishing story…";
    const data={
      title:form.elements.title.value.trim(),
      body:form.elements.body.value.trim(),
      image_url:imageUrl,
      is_published:form.elements.is_published.checked
    };
    await api("admin/stories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    form.reset();
    form.elements.is_published.checked=true;
    status.textContent="Story saved successfully.";
    await loadStories();
  }catch(error){status.textContent=error.message||"The story could not be saved. Please try again.";}
  finally{button.disabled=false;}
}

async function loadSchoolRecords(){
  try{
    const [students,subjects,marks,fees]=await Promise.all([api("admin/students"),api("admin/subjects"),api("admin/marks"),api("admin/fees")]);
    const fill=(selector,items,label)=>{const el=$(selector);if(!el)return;el.replaceChildren();items.forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=label(x);el.append(o);});if(!items.length){const o=document.createElement("option");o.value="";o.textContent="No records available";el.append(o);}};
    cachedStudents=students.students||[];
    fill("#markStudent",cachedStudents,s=>s.admission_number+" · "+s.full_name+" ("+s.class_name+")");
    renderReportStudentOptions();
    fill("#feeStudent",students.students||[],s=>s.admission_number+" · "+s.full_name);
    fill("#markSubject",subjects.subjects||[],s=>s.class_name+" · "+s.name);
    cachedSubjects=subjects.subjects||[]; if(!selectedSubjectClass && cachedSubjects.length) selectedSubjectClass=cachedSubjects[0].class_name; renderClassSubjects();
    const markBox=$("#marksList");if(markBox){markBox.replaceChildren();const ordered=["Baby Class","Middle Class","Top Class","P1","P2","P3","P4","P5","P6","P7"];ordered.forEach(className=>{const group=(marks.marks||[]).filter(m=>m.class_name===className);if(!group.length)return;const section=document.createElement("section");section.className="announcement-item";const heading=document.createElement("h3");heading.textContent=className+" · "+group.length+" saved mark(s)";section.append(heading);const buckets=new Map();group.forEach(m=>{const key="Academic year "+m.academic_year+" · Term "+m.term+" · "+m.assessment_type;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(m);});buckets.forEach((items,key)=>{const sub=document.createElement("h4");sub.textContent=key;section.append(sub);items.forEach(m=>{const p=document.createElement("p");p.textContent=m.full_name+" · "+m.subject_name+": "+m.score+"/"+m.max_score+(m.remarks?" · "+m.remarks:"");section.append(p);});});markBox.append(section);});if(!markBox.children.length)markBox.textContent="No marks recorded yet.";}
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
function renderClassSubjects(){
  const box=$("#subjectsList"),tabs=$("#subjectClassTabs");
  if(!box||!tabs)return;
  tabs.querySelectorAll("[data-subject-class]").forEach(button=>button.classList.toggle("active",button.dataset.subjectClass===selectedSubjectClass));
  const select=$("#subjectClassSelect");if(select && selectedSubjectClass)select.value=selectedSubjectClass;
  box.replaceChildren();
  if(!selectedSubjectClass){box.textContent="Select a class above to see its subjects.";return;}
  const heading=document.createElement("h3");heading.textContent=selectedSubjectClass+" Subjects";box.append(heading);
  const items=cachedSubjects.filter(subject=>subject.class_name===selectedSubjectClass);
  if(!items.length){const empty=document.createElement("p");empty.className="admin-note";empty.textContent="No subjects have been added to this class yet.";box.append(empty);return;}
  items.forEach(subject=>{const chip=document.createElement("span");chip.className="subject-subject-chip";chip.textContent=subject.name;box.append(chip);});
}
async function saveSubject(e){
  e.preventDefault();
  const form=e.currentTarget,status=$("#subjectStatus"),button=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form).entries());
  if(!data.class_name){status.textContent="Choose the class first.";return;}
  button.disabled=true;status.textContent="Saving subject…";
  try{
    await api("admin/subjects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    selectedSubjectClass=data.class_name;form.elements.class_name.value=selectedSubjectClass;form.elements.name.value="";
    status.textContent="Subject added to "+selectedSubjectClass+".";
    await loadSchoolRecords();
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
}
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
function isApprovedAdminGalleryImage(value){try{const u=new URL(String(value||""),window.location.origin);return u.protocol==="https:"&&u.hostname==="ik.imagekit.io"&&!u.username&&!u.password&&!u.port;}catch{return false;}}

async function loadAdminVideos(){const box=$("#adminVideoList");if(!box)return;try{const data=await api("admin/videos");box.replaceChildren();(data.videos||[]).forEach(video=>{const row=document.createElement("article");row.className="announcement-item";const title=document.createElement("h3");title.textContent=video.title;const player=document.createElement("video");player.src=video.video_url;player.controls=true;player.preload="metadata";player.playsInline=true;player.style.display="block";player.style.width="min(100%,420px)";player.style.maxHeight="240px";const controls=document.createElement("div");controls.className="admin-row-actions";const remove=document.createElement("button");remove.className="danger";remove.type="button";remove.textContent="Remove video";remove.addEventListener("click",async()=>{if(!confirm("Remove this school video from the website?"))return;remove.disabled=true;try{await api("admin/videos/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:video.id})});await loadAdminVideos();}catch(error){remove.disabled=false;alert(error.message);}});controls.append(remove);row.append(title,player,controls);box.append(row);});if(!box.children.length)box.textContent="No school videos have been uploaded yet.";}catch(error){box.textContent=error.message;}}
async function saveVideo(event){
  event.preventDefault();
  const form=event.currentTarget,status=$("#videoStatus"),button=form.querySelector("button"),video=form.elements.video?.files?.[0],title=form.elements.title.value.trim();
  if(!video){status.textContent="Choose a video from your phone first.";return;}
  const mime=String(video.type||"").toLowerCase();
  if(!["video/mp4","video/webm","video/quicktime"].includes(mime)){status.textContent="Choose an MP4, WebM or MOV video.";return;}
  if(video.size>90*1024*1024){status.textContent="The video must be 90 MB or smaller.";return;}
  button.disabled=true;
  try{
    status.textContent="Preparing secure upload…";
    const auth=await api("admin/videos/auth");
    const payload=new FormData();
    payload.append("file",video,video.name);
    payload.append("fileName",video.name.replace(/[^a-zA-Z0-9._-]/g,"_"));
    payload.append("useUniqueFileName","true");
    payload.append("token",auth.token);
    payload.append("expire",String(auth.expire));
    payload.append("signature",auth.signature);
    payload.append("publicKey",auth.publicKey);
    status.textContent="Uploading video: 0%";
    const uploaded=await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open("POST","https://upload.imagekit.io/api/v1/files/upload");
      xhr.upload.addEventListener("progress",event=>{if(event.lengthComputable)status.textContent="Uploading video: "+Math.round(event.loaded/event.total*100)+"%";});
      xhr.addEventListener("load",()=>{let data={};try{data=JSON.parse(xhr.responseText||"{}");}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.message||data.help||"ImageKit could not accept this video. Check its file size and try again."));});
      xhr.addEventListener("error",()=>reject(new Error("The upload connection was interrupted. Check your internet connection and try again.")));
      xhr.addEventListener("abort",()=>reject(new Error("The video upload was cancelled.")));
      xhr.send(payload);
    });
    if(!uploaded.url||!uploaded.fileId)throw new Error("The upload service did not return the video file details.");
    status.textContent="Saving video to the school website…";
    await api("admin/videos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,video_url:uploaded.url,file_id:uploaded.fileId,mime_type:mime,file_size:uploaded.size||video.size})});
    form.reset();
    status.textContent="Video uploaded successfully and added to the school website.";
    await loadAdminVideos();
  }catch(error){status.textContent=error.message||"Video upload failed. Please try again.";}
  finally{button.disabled=false;}
}

async function loadAdminGallery(){const box=$("#adminGalleryList");try{const [d,content]=await Promise.all([api("admin/gallery"),api("admin/content")]);const featured=content.content?.hero_image_url||"";box.replaceChildren();(d.gallery||[]).forEach(item=>{const row=document.createElement("article");row.className="announcement-item";const title=document.createElement("h3");title.textContent=item.title;const img=document.createElement("img");if(!isApprovedAdminGalleryImage(item.image_url)){console.warn("Skipped gallery item with an unapproved image URL.");return;}img.src=item.image_url;img.alt=item.title||"Bright Angels school photo";img.loading="lazy";img.style.maxWidth="min(100%,320px)";img.style.maxHeight="190px";img.style.objectFit="cover";img.style.display="block";const controls=document.createElement("div");controls.className="admin-row-actions";const choose=document.createElement("button");const isFeatured=item.image_url===featured;choose.textContent=isFeatured?"✓ Homepage photo selected":"Set as homepage photo";choose.disabled=isFeatured;choose.addEventListener("click",async()=>{choose.disabled=true;try{await api("admin/gallery/featured",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id})});await loadAdminGallery();const status=$("#galleryStatus");if(status)status.textContent="Homepage photo updated successfully.";}catch(e){choose.disabled=false;alert(e.message);}});const del=document.createElement("button");del.className="danger";del.textContent="Remove photo";del.addEventListener("click",async()=>{if(!confirm("Remove this gallery item?"))return;try{await api("admin/gallery/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id})});loadAdminGallery();}catch(e){alert(e.message);}});controls.append(choose,del);row.append(title,img,controls);box.append(row);});if(!box.children.length)box.textContent="No gallery photos yet. Upload a photo first.";}catch(e){box.textContent=e.message;}}
async function saveGallery(e){e.preventDefault();const form=e.currentTarget,status=$("#galleryStatus"),button=form.querySelector("button"),photo=form.elements.photo?.files?.[0];if(!photo){status.textContent="Choose a photo from your phone first.";return;}button.disabled=true;status.textContent="Uploading photo…";try{const data=new FormData();data.append("title",form.elements.title.value.trim());data.append("photo",photo,photo.name);data.append("description",form.elements.description.value.trim());await api("admin/gallery",{method:"POST",body:data});form.reset();status.textContent="Photo uploaded successfully.";await loadAdminGallery();}catch(err){status.textContent=err.message;}finally{button.disabled=false;}}

function renderReportStudentOptions(){
  const klass=$("#reportClass")?.value,select=$("#reportStudent");if(!select)return;
  select.replaceChildren();const students=cachedStudents.filter(s=>s.class_name===klass&&(!s.student_status||String(s.student_status).toLowerCase()==="active"));
  const first=document.createElement("option");first.value="";first.textContent=students.length?"Choose learner":"No active learners in this class";select.append(first);
  students.forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.admission_number+" · "+s.full_name;select.append(o);});
}
function reportGrade(pct,nursery,lower){
  if(pct===null||pct===undefined)return "Not assessed";
  if(nursery)return pct>=87.5?"EX":pct>=62.5?"ME":pct>=37.5?"DE":"BE";
  if(lower)return pct>=80?"A":pct>=70?"B":pct>=60?"C":pct>=50?"D":"E";
  return pct>=90?"D1":pct>=80?"D2":pct>=75?"C3":pct>=70?"C4":pct>=65?"C5":pct>=50?"C6":pct>=45?"P7":pct>=40?"P8":"F9";
}
function reportMarkup(report){
  const esc=v=>String(v??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const klass=report.student.class_name,nursery=["Baby Class","Middle Class","Top Class"].includes(klass),lower=["P1","P2","P3"].includes(klass);
  const title=nursery?"EARLY YEARS DEVELOPMENT REPORT":lower?"LOWER PRIMARY REPORT CARD":"UPPER PRIMARY REPORT CARD";
  const descriptions={EX:"Exceeding Expectations",ME:"Meeting Expectations",DE:"Developing",BE:"Beginning",A:"Exceptional",B:"Very Good",C:"Good",D:"Developing",E:"Needs Support",D1:"Outstanding",D2:"Excellent",C3:"Very Good",C4:"Very Good",C5:"Good",C6:"Pass Credit",P7:"Fair Pass",P8:"Weak Pass",F9:"Needs Intensive Remediation"};
  const rows=(report.subjects||[]).map(x=>{const has=x.score!==null&&x.score!==undefined,pct=has&&Number(x.max_score)>0?Number(x.score)/Number(x.max_score)*100:null,g=reportGrade(pct,nursery,lower);return "<tr><td>"+esc(x.subject_name)+"</td><td>"+(has?esc(x.score)+" / "+esc(x.max_score):"—")+"</td><td><b>"+esc(g)+"</b><small>"+esc(descriptions[g]||"Not yet assessed")+"</small></td><td>"+esc(x.remarks||"")+"</td></tr>";}).join("");
  const total=Number(report.total||0),maximum=Number(report.maximum||0),pct=maximum?total/maximum*100:0,g=reportGrade(pct,nursery,lower);
  return '<article class="report-page '+(nursery?"nursery":lower?"lower":"upper")+'"><header><img src="/school-logo.jpg"><div><h1>BRIGHT ANGELS JUNIOR SCHOOL</h1><p>Lukwanga–Kataluko Sentema Road, Wakiso District</p><p>+256 755 660 550 · +256 525 136 626</p><b>If others can, we can</b></div></header><h2>'+title+'</h2><p class="assessment">'+esc(report.assessment_type)+' · TERM '+esc(report.term)+' · '+esc(report.academic_year)+'</p><section class="details"><p><b>Learner:</b> '+esc(report.student.full_name)+'</p><p><b>Admission No:</b> '+esc(report.student.admission_number)+'</p><p><b>Class:</b> '+esc(klass)+'</p></section><table><thead><tr><th>Subject / Learning Area</th><th>Score</th><th>Grade / Level</th><th>Teacher Remarks</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="4">No subjects registered for this class.</td></tr>')+'</tbody></table><section class="summary"><b>Marks recorded: '+esc(report.marked_subjects||0)+' / '+esc((report.subjects||[]).length)+'</b>'+(nursery?"":'<b>Total: '+total.toFixed(1)+' / '+maximum.toFixed(1)+'</b><b>Average: '+(maximum?pct.toFixed(1)+"%":"—")+'</b><b>Overall grade: '+(maximum?esc(g):"—")+'</b>')+'</section><section class="comment"><b>'+ (nursery?"Teacher's Development Comment":"Class Teacher's Comment")+'</b></section>'+(nursery?"":'<section class="comment"><b>Headteacher\'s Comment</b></section>')+'<footer>Class Teacher: ____________________ &nbsp;&nbsp; Headteacher: ____________________<p>“If others can, we can”</p></footer></article>';
}
function openReportsWindow(reports){
  const w=window.open("","_blank","width=950,height=950");if(!w)throw new Error("Allow pop-ups to print report cards.");
  const pages=reports.map(reportMarkup).join("");
  w.document.write('<!doctype html><html><head><title>Bright Angels Report Cards</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial;color:#263b4b}.report-page{min-height:270mm;page-break-after:always;border-top:10px solid #d82d36;padding:12px 5px}.report-page:last-child{page-break-after:auto}.report-page header{display:flex;align-items:center;gap:18px;padding:14px;background:#edf6fc}.report-page header img{width:75px;height:75px;object-fit:contain}.report-page h1{font: bold 21px Georgia;margin:0;color:#31536b}.report-page header p{margin:4px 0}.report-page h2{text-align:center;margin:22px 0 8px}.assessment{text-align:center;font-weight:bold}.details{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccdce7;padding:10px}.details p{margin:5px}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{border:1px solid #c5d4df;padding:8px;text-align:left}th{background:#eaf4fb}small{display:block;color:#687989}.summary{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#edf6fc;padding:12px;margin-top:14px}.comment{border:1px solid #ccdce7;min-height:65px;padding:10px;margin-top:18px}.report-page.nursery{border-color:#d77b43}.report-page.nursery header{background:#fff5eb}.report-page.lower{border-color:#69b5e5}.report-page.lower header{background:#eff8ff}.report-page.upper{border-color:#d82d36}.report-page.upper header{background:#edf6fc}footer{margin-top:42px}footer p{text-align:center;color:#b32630;font:italic 15px Georgia}@media print{.report-page{break-after:page}.report-page:last-child{break-after:auto}}</style></head><body>'+pages+'<script>window.onload=()=>window.print()<\/script></body></html>');
  w.document.close();
}
async function getReport(studentId,year,term,assessment){
  return api("admin/report-card?student_id="+encodeURIComponent(studentId)+"&academic_year="+encodeURIComponent(year)+"&term="+encodeURIComponent(term)+"&assessment_type="+encodeURIComponent(assessment));
}
async function printSelectedReport(){
  const status=$("#reportStatus"),studentId=$("#reportStudent")?.value,klass=$("#reportClass")?.value,year=$("#reportYear")?.value,term=$("#reportTerm")?.value,assessment=$("#reportAssessment")?.value;
  if(!klass||!studentId||!year||!term){status.textContent="Choose a class, learner, academic year and term in the Print Report Cards section.";return;}
  status.textContent="Preparing individual report card…";
  try{const report=await getReport(studentId,year,term,assessment);openReportsWindow([report]);status.textContent="Individual report card ready to print.";}catch(e){status.textContent=e.message;}
}
async function printWholeClassReports(){
  const status=$("#reportStatus"),klass=$("#reportClass")?.value,year=$("#reportYear")?.value,term=$("#reportTerm")?.value,assessment=$("#reportAssessment")?.value;
  if(!klass||!year||!term){status.textContent="Choose a class, academic year and term first.";return;}
  const students=cachedStudents.filter(s=>s.class_name===klass&&(!s.student_status||String(s.student_status).toLowerCase()==="active"));
  if(!students.length){status.textContent="There are no active learners in "+klass+".";return;}
  status.textContent="Preparing "+students.length+" report cards for "+klass+"…";
  try{const reports=[];for(const student of students){reports.push(await getReport(student.id,year,term,assessment));}openReportsWindow(reports);status.textContent=students.length+" report cards prepared for "+klass+".";}catch(e){status.textContent=e.message;}
}
