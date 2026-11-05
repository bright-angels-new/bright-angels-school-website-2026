const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = $("#menuToggle");
  const nav = $("#mainNav");
  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const opened = nav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(opened));
      menuToggle.setAttribute("aria-label", opened ? "Close navigation" : "Open navigation");
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }));
  }
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  loadAnnouncements();
  loadPublicContent();
  loadPublicGallery();
  loadApplicationClasses();
  const parentForm=$("#parentMessageForm");
  if(parentForm) parentForm.addEventListener("submit", async event=>{
    event.preventDefault();
    const status=$("#parentMessageStatus"),button=parentForm.querySelector('button[type="submit"]');
    button.disabled=true;status.textContent="Sending…";
    try {
      const payload=Object.fromEntries(new FormData(parentForm).entries());
      const response=await fetch("/api/parent-messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Message could not be sent.");
      parentForm.reset();status.textContent="Your message has been sent to the school.";
    } catch(error) { status.textContent=error.message; }
    finally { button.disabled=false; }
  });
  const form=$("#admissionForm");
  const dob=$("#publicApplicationDob"),ageOutput=$("#publicApplicationAge");
  function updatePublicAge(){if(!dob||!ageOutput)return;const value=dob.value;if(!value){ageOutput.textContent="Enter date of birth";return;}const birth=new Date(value+"T00:00:00"),today=new Date();let age=today.getFullYear()-birth.getFullYear();if(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate()))age--;ageOutput.textContent=age>=0?age+" years":"Enter a valid date";}
  if(dob){dob.addEventListener("change",updatePublicAge);dob.addEventListener("input",updatePublicAge);}
  if(form) form.addEventListener("submit",submitAdmission);
  const statusForm=$("#applicationStatusForm");
  if(statusForm) statusForm.addEventListener("submit",checkApplicationStatus);
});

async function loadAnnouncements() {
  const container = $("#publicAnnouncements");
  if (!container) return;
  try {
    const response = await fetch("/api/announcements");
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data.announcements) ? data.announcements : [];
    if (!items.length) return;
    container.replaceChildren(...items.map(item => {
      const article = document.createElement("article");
      article.className = "announcement-item";
      const title = document.createElement("h3");
      title.textContent = item.title || "School announcement";
      const body = document.createElement("p");
      body.textContent = item.body || item.message || "";
      article.append(title, body);
      return article;
    }));
  } catch (error) { console.warn("Announcements are temporarily unavailable.", error); }
}

async function loadApplicationClasses() {
  const select=$("#classSelect");
  if(!select)return;
  try {
    const response=await fetch("/api/public-classes");
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Classes unavailable.");
    select.replaceChildren(new Option("Select class",""));
    (data.items||[]).forEach(item=>select.add(new Option(item.name,String(item.id))));
    if(!(data.items||[]).length)throw new Error("No active classes are available.");
  } catch(error) {
    select.replaceChildren(new Option("Classes unavailable",""));
    console.error("Could not load management-system classes:",error);
  }
}

async function submitAdmission(event) {
  event.preventDefault();
  const form=event.currentTarget,status=$("#admissionStatus"),button=form.querySelector('button[type="submit"]');
  button.disabled=true;status.textContent="Submitting application…";
  try {
    const payload=Object.fromEntries(new FormData(form).entries());
    const response=await fetch("/api/public-admissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Application could not be submitted. Please try again.");
    form.reset();
    status.textContent="Application received. Your application reference number is "+result.application_number+". Keep this number safe to check the application status.";
  } catch(error) { status.textContent=error.message||"Application submission failed."; }
  finally { button.disabled=false; }
}

async function checkApplicationStatus(event) {
  event.preventDefault();
  const form=event.currentTarget,output=$("#applicationStatusResult"),button=form.querySelector('button[type="submit"]');
  button.disabled=true;output.textContent="Checking application…";
  try {
    const payload=Object.fromEntries(new FormData(form).entries());
    const response=await fetch("/api/public-admission-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"No matching application was found. Check the details and try again.");
    output.textContent="Application status: "+result.status+(result.admission_number?". Student admission number: "+result.admission_number:"")+". For further information, contact the school.";
  } catch(error) { output.textContent=error.message||"Status check failed."; }
  finally { button.disabled=false; }
}

async function loadPublicContent(){try{const r=await fetch("/api/content");if(!r.ok)return;const d=await r.json(),v=d.content||{};if(v.hero_title)document.querySelector(".hero h1").textContent=v.hero_title;if(v.hero_text)document.querySelector(".hero-copy").textContent=v.hero_text;if(v.about_text){const p=document.querySelector(".about-grid > div:first-child p");if(p)p.textContent=v.about_text;}if(v.learning_text){const p=document.querySelector(".learning-section .section-heading > p:last-child");if(p)p.textContent=v.learning_text;}}catch(e){console.warn("Website text could not be loaded.",e);}}
function isApprovedGalleryImage(value){try{const u=new URL(String(value||""),window.location.origin);return u.protocol==="https:"&&u.hostname==="ik.imagekit.io"&&!u.username&&!u.password&&!u.port;}catch{return false;}}

async function loadPublicGallery(){const box=$("#publicGallery");if(!box)return;try{const r=await fetch("/api/gallery");if(!r.ok)return;const d=await r.json();box.replaceChildren();(d.gallery||[]).forEach(item=>{const card=document.createElement("article");card.className="feature-card";const img=document.createElement("img");if(!isApprovedGalleryImage(item.image_url)){console.warn("Skipped gallery item with an unapproved image URL.");return;}img.src=item.image_url;img.alt=item.title||"Bright Angels school photo";img.loading="lazy";img.style.width="100%";img.style.height="190px";img.style.objectFit="cover";const h=document.createElement("h3");h.textContent=item.title;const p=document.createElement("p");p.textContent=item.description||"";card.append(img,h,p);box.append(card);});if(!box.children.length)box.innerHTML="<p class=\"muted\">School gallery photos will appear here.</p>";}catch(e){console.warn("Gallery unavailable.",e);}}

