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
  const parentForm=$("#parentMessageForm");
  if(parentForm) parentForm.addEventListener("submit", async event=>{event.preventDefault();const status=$("#parentMessageStatus"),button=parentForm.querySelector('button[type="submit"]');button.disabled=true;status.textContent="Sending…";try{const payload=Object.fromEntries(new FormData(parentForm).entries());const response=await fetch("/api/parent-messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Message could not be sent.");parentForm.reset();status.textContent="Your message has been sent to the school.";}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});

  const form = $("#admissionForm");
  if (form) form.addEventListener("submit", submitAdmission);
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
  } catch (error) {
    console.warn("Announcements are temporarily unavailable.", error);
  }
}

async function submitAdmission(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#admissionStatus");
  const button = form.querySelector('button[type="submit"]');
  status.textContent = "Submitting your enquiry…";
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admissions", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "We could not submit the enquiry. Please try again.");
    form.reset();
    status.textContent = "Thank you. Your admission enquiry has been received.";
  } catch (error) {
    status.textContent = error.message || "Submission failed. Please contact the school by phone.";
  } finally {
    button.disabled = false;
  }
}
async function loadPublicContent(){try{const r=await fetch("/api/content");if(!r.ok)return;const d=await r.json(),v=d.content||{};if(v.hero_title)document.querySelector(".hero h1").textContent=v.hero_title;if(v.hero_text)document.querySelector(".hero-copy").textContent=v.hero_text;if(v.about_text){const p=document.querySelector(".about-grid > div:first-child p");if(p)p.textContent=v.about_text;}if(v.learning_text){const p=document.querySelector(".learning-section .section-heading > p:last-child");if(p)p.textContent=v.learning_text;}}catch(e){console.warn("Website text could not be loaded.",e);}}
async function loadPublicGallery(){const box=$("#publicGallery");if(!box)return;try{const r=await fetch("/api/gallery");if(!r.ok)return;const d=await r.json();box.replaceChildren();(d.gallery||[]).forEach(item=>{const card=document.createElement("article");card.className="feature-card";const img=document.createElement("img");img.src=item.image_url;img.alt=item.title;img.loading="lazy";img.style.width="100%";img.style.height="190px";img.style.objectFit="cover";const h=document.createElement("h3");h.textContent=item.title;const p=document.createElement("p");p.textContent=item.description||"";card.append(img,h,p);box.append(card);});if(!box.children.length)box.innerHTML="<p class=\"muted\">School gallery photos will appear here.</p>";}catch(e){console.warn("Gallery unavailable.",e);}}
