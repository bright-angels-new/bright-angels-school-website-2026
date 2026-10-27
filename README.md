# Bright Angels Junior School website

Responsive Cloudflare Pages website for Bright Angels Junior School, using the school badge and a navy/cream/gold design. The public admission form and admin student/subject forms include Baby Class, Middle Class, Top Class, P1, P2, P3, P4, P5, P6 and P7.

## Important setup
This is a fresh project folder. It does not automatically change your GitHub repository or deploy anything.

### 1. Upload the project to GitHub
Upload the contents of this folder to the root of the repository you intend to use. Keep `public`, `functions`, and `wrangler.toml` at the repository root.

### 2. Cloudflare Pages settings
- Framework preset: None
- Build command: leave blank
- Build output directory: `public`
- Root directory: `/` (repository root)

### 3. Configure bindings and secrets
In Cloudflare Pages > Settings > Functions:
- Add D1 database binding named `DB` pointing to `bright-angels-junior-school-db` (database ID `137647d1-a64a-4cc0-b3ba-027a9199f7d3`).
In Pages > Settings > Variables and Secrets, configure:
- `ADMIN_EMAIL` = `brightangels26@gmail.com`
- `ADMIN_PASSWORD` = choose a strong password; set it as a secret
- `SESSION_SECRET` = a long random secret; set it as a secret

The API creates its `ba_*` tables when it receives a request. Existing old tables are not deleted.

## Features
- Responsive public home page with school badge, school information, announcements, admission enquiry and contact forms.
- Admin login and dashboard for student records, subjects, marks, fee records, announcements, admissions and messages.
- Admission/contact submissions are saved to D1.

## Current limitations
- Important unfinished requirements: this version saves admission enquiries and contact messages to D1, but does not yet upload child passport photos, send automatic emails, or provide a full visual editor for all public website text and gallery photos. Do not advertise those functions as available until they are implemented and tested.
- This ZIP has been inspected and the class lists corrected, but it has not been deployed or end-to-end tested in your Cloudflare account. Do not assume a successful live deployment until the public site and admin login are tested.
- Admin currently supports student/subject creation and deletion, recording/listing marks, fee recording/listing, announcements, admission status and messages. More edit/report printing features can be added after confirming this version works.
