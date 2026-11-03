const $ = s => document.querySelector(s);
let currentPanel = "overviewPanel";

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutButton").addEventListener("click", logout);
  $("#announcementForm").addEventListener("submit", saveAnnouncement);
  document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => showPanel(button.dataset.panel)));
  await checkSession();
});

async function api(path, options={}) {
  const response = await fetch("/api/" + path, {credentials:"same-origin",...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}
function showPanel(id) {
  currentPanel = id;
  ["overviewPanel","admissionsPanel","announcementsPanel"].forEach(panel => $("#"+panel).classList.toggle("admin-hidden",panel!==id));
  document.querySelectorAll("[data-panel]").forEach(button => button.classList.toggle("active",button.dataset.panel===id));
}
async function login(event) {
  event.preventDefault();
  const status = $("#loginStatus");
  const button = event.currentTarget.querySelector("button");
  button.disabled = true; status.textContent = "Signing in…";
  try {
    await api("login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#adminEmail").value,password:$("#adminPassword").value})});
    $("#adminPassword").value = "";
    await showDashboard();
  } catch(error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
async function checkSession() {
  try { await api("session"); await showDashboard(); }
  catch { $("#loginPanel").classList.remove("admin-hidden"); $("#dashboard").classList.add("admin-hidden"); }
}
async function showDashboard() {
  $("#loginPanel").classList.add("admin-hidden");
  $("#dashboard").classList.remove("admin-hidden");
  showPanel(currentPanel);
  await Promise.all([loadAdmissions(),loadAnnouncements()]);
}
async function logout() {
  try { await api("logout",{method:"POST"}); } catch {}
  $("#dashboard").classList.add("admin-hidden");
  $("#loginPanel").classList.remove("admin-hidden");
  $("#loginStatus").textContent = "You have signed out.";
}
async function loadAdmissions() {
  const tbody = $("#admissionsRows");
  try {
    const data = await api("admin/admissions");
    const items = data.applications || [];
    $("#admissionCount").textContent = items.length + " application(s) received";
    tbody.replaceChildren();
    if (!items.length) { tbody.innerHTML = '<tr><td colspan="6">No applications have been received yet.</td></tr>'; return; }
    for (const item of items) {
      const tr = document.createElement("tr");
      const values = [item.child_name,item.class_applying,item.guardian_name,item.phone,item.status,new Date(item.created_at+"Z").toLocaleDateString()];
      values.forEach(value => { const td=document.createElement("td"); td.textContent=value||""; tr.append(td); });
      tbody.append(tr);
    }
  } catch(error) { tbody.innerHTML = '<tr><td colspan="6"></td></tr>'; tbody.querySelector("td").textContent=error.message; }
}
async function loadAnnouncements() {
  const box = $("#adminAnnouncements");
  try {
    const data = await api("admin/announcements");
    const items = data.announcements || [];
    $("#announcementCount").textContent = items.length + " announcement(s)";
    box.replaceChildren();
    if (!items.length) { box.textContent = "No announcements yet."; return; }
    items.forEach(item => {
      const article=document.createElement("article"); article.className="announcement-item";
      const title=document.createElement("h3"); title.textContent=item.title;
      const body=document.createElement("p"); body.textContent=item.body;
      const meta=document.createElement("p"); meta.className="admin-note"; meta.textContent=item.is_published ? "Published" : "Draft";
      article.append(title,body,meta); box.append(article);
    });
  } catch(error) { box.textContent=error.message; }
}
async function saveAnnouncement(event) {
  event.preventDefault();
  const status=$("#announcementStatus"); const button=event.currentTarget.querySelector("button");
  button.disabled=true; status.textContent="Saving…";
  try {
    const form=event.currentTarget; const data=Object.fromEntries(new FormData(form).entries());
    data.is_published=form.elements.is_published.checked;
    await api("admin/announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    form.reset(); form.elements.is_published.checked=true;
    status.textContent="Announcement saved.";
    await loadAnnouncements();
  } catch(error) { status.textContent=error.message; }
  finally { button.disabled=false; }
}