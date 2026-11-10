const $ = (selector) => document.querySelector(selector);

async function loadPublicStories(){
  const box=$("#publicStories");
  if(!box)return;
  try{
    const response=await fetch("/api/stories",{credentials:"same-origin"});
    if(!response.ok)throw new Error("Stories unavailable");
    const data=await response.json();
    const stories=Array.isArray(data.stories)?data.stories:[];
    box.replaceChildren();
    if(!stories.length){
      const empty=document.createElement("p");
      empty.className="muted";
      empty.textContent="Learner stories and school highlights will appear here soon.";
      box.append(empty);
      return;
    }
    stories.forEach(story=>{
      const card=document.createElement("article");
      card.className="school-story-card";
      if(story.image_url){
        try{
          const imageUrl=new URL(story.image_url);
          if(imageUrl.protocol==="https:"&&imageUrl.hostname==="ik.imagekit.io"&&!imageUrl.username&&!imageUrl.password&&!imageUrl.port){
            const img=document.createElement("img");
            img.src=imageUrl.href;
            img.alt=story.title||"Bright Angels learner story";
            img.loading="lazy";
            img.decoding="async";
            card.append(img);
          }
        }catch{}
      }
      const copy=document.createElement("div");
      copy.className="school-story-copy";
      const label=document.createElement("p");
      label.className="eyebrow";
      label.textContent="LIFE AT BRIGHT ANGELS";
      const title=document.createElement("h3");
      title.textContent=story.title||"School story";
      const body=document.createElement("p");
      body.textContent=story.body||"";
      copy.append(label,title,body);
      card.append(copy);
      box.append(card);
    });
  }catch(error){
    console.warn("Learner stories unavailable.",error);
    box.textContent="Learner stories are temporarily unavailable.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = $("#menuToggle");
  const nav = $("#mainNav");
  if (menuToggle && nav) {
    menuToggle.setAttribute("aria-controls", "mainNav");
    const closeMenu = () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    };
    menuToggle.addEventListener("click", () => {
      const opened = nav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(opened));
      menuToggle.setAttribute("aria-label", opened ? "Close navigation" : "Open navigation");
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMenu();
        menuToggle.focus();
      }
    });
    document.addEventListener("click", event => {
      if (nav.classList.contains("open") && !nav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1020) closeMenu();
    }, { passive: true });
  }
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  loadAnnouncements();
  loadPublicStories();
  loadPublicContent();
  animateWelcomeWords();
  startHeroTextRotation();
  initGalleryLightbox();
  loadPublicGallery();
  loadPublicVideos();
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

async function loadPublicContent(){try{const r=await fetch("/api/content");if(!r.ok)return;const d=await r.json(),v=d.content||{};if(v.hero_title)document.querySelector(".hero h1").textContent=v.hero_title;if(v.hero_text)document.querySelector(".hero-copy").textContent=v.hero_text;if(v.about_text){const p=document.querySelector(".about-grid > div:first-child p");if(p)p.textContent=v.about_text;}if(v.learning_text){const p=document.querySelector(".learning-section .section-heading > p:last-child");if(p)p.textContent=v.learning_text;}animateWelcomeWords();}catch(e){console.warn("Website text could not be loaded.",e);}}
function isApprovedGalleryImage(value){try{const u=new URL(String(value||""),window.location.origin);return u.protocol==="https:"&&u.hostname==="ik.imagekit.io"&&!u.username&&!u.password&&!u.port;}catch{return false;}}

async function loadPublicGallery(){
  const box=$("#publicGallery");
  if(!box)return;
  try{
    const response=await fetch("/api/gallery");
    if(!response.ok)throw new Error("Gallery request failed");
    const data=await response.json();
    const items=(Array.isArray(data.gallery)?data.gallery:[]).filter(item=>isApprovedGalleryImage(item.image_url));
    const heroPhoto=$("#heroSchoolPhoto");
    const selected=data.featured_image_url;
    const featured=items.find(item=>item.image_url===selected)||items[0];
    if(heroPhoto&&featured){
      heroPhoto.src=featured.image_url;
      heroPhoto.alt=featured.title||"A moment at Bright Angels Junior School";
      const hero=document.querySelector(".hero");
      if(hero)hero.style.setProperty("--hero-photo",`url("${featured.image_url}")`);
    }
    box.replaceChildren();
    if(!items.length){
      const empty=document.createElement("p");
      empty.className="muted";
      empty.textContent="School gallery photos will appear here.";
      box.append(empty);
      return;
    }
    const photos=items.slice(0,30);
    addSchoolPhotos(photos);
    photos.forEach((item,index)=>{
      const card=document.createElement("button");
      card.type="button";
      card.className="gallery-photo";
      card.setAttribute("aria-label",`View photo ${index+1}: ${item.title||"Bright Angels school life"}`);
      const img=document.createElement("img");
      img.src=item.image_url;
      img.alt=item.title||"Bright Angels Junior School";
      img.loading=index<4?"eager":"lazy";
      img.decoding="async";
      const caption=document.createElement("span");
      caption.className="gallery-photo-caption";
      caption.textContent=item.title||"Life at Bright Angels";
      card.append(img,caption);
      card.addEventListener("click",()=>openGalleryLightbox(photos,index));
      box.append(card);
    });
  }catch(error){
    console.warn("Gallery unavailable.",error);
    box.innerHTML="<p class=\"muted\">School gallery is temporarily unavailable.</p>";
  }
}


function addSchoolPhotos(photos){
  const targets=[
    ...document.querySelectorAll(".pathway-card"),
    ...document.querySelectorAll(".learning-section .feature-card")
  ];
  targets.forEach((card,index)=>{
    if(card.querySelector(".section-photo"))return;
    const item=photos[index];
    if(!item)return;
    const image=document.createElement("img");
    image.className="section-photo";
    image.src=item.image_url;
    image.alt=item.title||"A school-life moment at Bright Angels Junior School";
    image.loading="lazy";
    image.decoding="async";
    card.prepend(image);
    card.classList.add("photo-enhanced-card");
  });
}


async function loadPublicVideos(){
  const box=$("#publicVideos");if(!box)return;
  try{
    const response=await fetch("/api/videos");if(!response.ok)throw new Error("Videos unavailable");
    const data=await response.json(),videos=Array.isArray(data.videos)?data.videos:[];
    box.replaceChildren();
    if(!videos.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="School videos will be added here soon.";box.append(empty);return;}
    videos.forEach(video=>{
      let mediaUrl;try{const u=new URL(video.video_url);if(u.protocol!=="https:"||u.hostname!=="ik.imagekit.io"||u.username||u.password||u.port)return;mediaUrl=u.href;}catch{return;}
      const card=document.createElement("article");card.className="school-video-card";
      const stage=document.createElement("div");stage.className="school-video-stage";
      const player=document.createElement("video");player.src=mediaUrl;player.controls=true;player.preload="metadata";player.playsInline=true;player.setAttribute("aria-label",video.title||"Bright Angels school video");
      player.addEventListener("play",()=>{
        box.querySelectorAll("video").forEach(other=>{if(other!==player)other.pause();});
      });
      stage.append(player);
      const title=document.createElement("h3");title.textContent=video.title||"Bright Angels school video";card.append(stage,title);box.append(card);
    });
    if(!box.children.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="School videos will be added here soon.";box.append(empty);}
  }catch(error){console.warn("School videos unavailable.",error);box.textContent="School videos are temporarily unavailable.";}
}
let galleryItems=[];
let galleryIndex=0;
let galleryPreviousFocus=null;
function openGalleryLightbox(items,index){
  const modal=$("#galleryLightbox");
  if(!modal)return;
  galleryItems=items;
  galleryIndex=index;
  galleryPreviousFocus=document.activeElement;
  updateGalleryLightbox();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden","false");
  document.body.classList.add("gallery-view-open");
  $("#galleryClose")?.focus();
}
function updateGalleryLightbox(){
  const item=galleryItems[galleryIndex];
  if(!item)return;
  const image=$("#galleryLightboxImage");
  image.src=item.image_url;
  image.alt=item.title||"Bright Angels Junior School";
  $("#galleryLightboxCaption").textContent=item.title||"Life at Bright Angels";
  $("#galleryLightboxCounter").textContent=`${galleryIndex+1} / ${galleryItems.length}`;
  $("#galleryPrev").disabled=galleryItems.length<2;
  $("#galleryNext").disabled=galleryItems.length<2;
}
function closeGalleryLightbox(){
  const modal=$("#galleryLightbox");
  if(!modal||!modal.classList.contains("is-open"))return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden","true");
  document.body.classList.remove("gallery-view-open");
  $("#galleryLightboxImage").removeAttribute("src");
  if(galleryPreviousFocus?.focus)galleryPreviousFocus.focus();
}
function moveGalleryLightbox(direction){
  if(!galleryItems.length)return;
  galleryIndex=(galleryIndex+direction+galleryItems.length)%galleryItems.length;
  updateGalleryLightbox();
}
function initGalleryLightbox(){
  $("#galleryClose")?.addEventListener("click",closeGalleryLightbox);
  $("#galleryPrev")?.addEventListener("click",()=>moveGalleryLightbox(-1));
  $("#galleryNext")?.addEventListener("click",()=>moveGalleryLightbox(1));
  $("#galleryLightbox")?.addEventListener("click",event=>{
    if(event.target.id==="galleryLightbox")closeGalleryLightbox();
  });

  // Let visitors swipe between photos on touch-screen phones and tablets.
  const photoStage=$("#galleryLightbox")?.querySelector("figure");
  let touchStartX=0,touchStartY=0;
  photoStage?.addEventListener("touchstart",event=>{
    if(event.touches.length!==1)return;
    touchStartX=event.touches[0].clientX;
    touchStartY=event.touches[0].clientY;
  },{passive:true});
  photoStage?.addEventListener("touchend",event=>{
    if(!touchStartX||!event.changedTouches.length)return;
    const deltaX=event.changedTouches[0].clientX-touchStartX;
    const deltaY=event.changedTouches[0].clientY-touchStartY;
    touchStartX=0;touchStartY=0;
    if(Math.abs(deltaX)<45||Math.abs(deltaX)<Math.abs(deltaY)*1.25)return;
    moveGalleryLightbox(deltaX<0?1:-1);
  },{passive:true});

  document.addEventListener("keydown",event=>{
    if(!$("#galleryLightbox")?.classList.contains("is-open"))return;
    if(event.key==="Escape")closeGalleryLightbox();
    if(event.key==="ArrowLeft")moveGalleryLightbox(-1);
    if(event.key==="ArrowRight")moveGalleryLightbox(1);
  });
}

function startHeroTextRotation(){
  const target=$("#heroRotatingText");
  if(!target)return;
  const messages=[
    "Growing minds. Building confidence.",
    "Inspiring curiosity. Celebrating every achievement.",
    "Learning with purpose. Growing with character.",
    "A caring community where every child can shine."
  ];
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  let index=0;
  window.setInterval(()=>{
    target.classList.add("is-changing");
    window.setTimeout(()=>{
      index=(index+1)%messages.length;
      target.textContent=messages[index];
      target.classList.remove("is-changing");
    },420);
  },4200);
}

function animateWelcomeWords(){
  const content=document.querySelector(".hero-content");
  if(!content||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT,{
    acceptNode(node){
      if(!node.nodeValue.trim())return NodeFilter.FILTER_REJECT;
      const parent=node.parentElement;
      if(!parent||parent.closest(".hero-rotator,.ba-word"))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  let wordIndex=0;
  nodes.forEach(node=>{
    const parts=node.nodeValue.split(/(\\s+)/);
    const fragment=document.createDocumentFragment();
    parts.forEach(part=>{
      if(!part)return;
      if(/^\\s+$/.test(part)){fragment.append(document.createTextNode(part));return;}
      const word=document.createElement("span");
      word.className="ba-word";
      word.textContent=part;
      word.style.setProperty("--word-delay",Math.min(wordIndex*55,1100)+"ms");
      wordIndex++;
      fragment.append(word);
    });
    node.parentNode.replaceChild(fragment,node);
  });
}
