# Bright Angels Junior School Website

A clean rebuild for Cloudflare Pages and Cloudflare D1.

## School details
- Location: Lukwanga–Kataluko Sentema Road, Wakiso District, Uganda
- Motto: If others can, we can
- Email: brightangels26@gmail.com
- Telephone: +256 755 660 550 / +256 525 136 626

## Current rebuild status
- Responsive public homepage and school information sections
- Admission enquiry form for Baby Class, Middle Class, Top Class and P1–P7
- Administrator sign-in and session-protected dashboard
- Class-grouped admissions, search, review statuses and student registration with admission numbers
- Printable admission confirmation letters
- Public announcements and administrator publishing
- Class subject register
- Marks entry and term report-card data endpoint
- Student fee records, payment entries and outstanding balance calculations
- Parent message submission, administrator inbox and message status tracking
- Editable homepage text and public photo gallery (image URLs, no paid R2 storage)
- Expanded admission information: date of birth, gender, address, emergency contact, optional medical/learning support notes and study mode
- Printable term report cards
- New additive D1 tables use the ba2_ prefix to avoid altering legacy tables

The development branch has not yet been deployed to Cloudflare or tested against the live D1 database. The code includes the listed modules, but production readiness requires a successful automated syntax check, preview deployment, and full workflow testing. Automatic email delivery is not configured; parent messages are stored in the administrator inbox. Gallery photos use HTTPS image addresses rather than paid R2 storage.
 
## Hosting configuration
Cloudflare Pages project: bright-angels-school-website-2026

D1 binding:
- Binding name: DB
- Database: bright-angels-junior-school-db
- Keep the existing database. Do not delete or recreate it.

Set these secrets in the Cloudflare Pages production environment before enabling administrator login:
- ADMIN_EMAIL: brightangels26@gmail.com
- ADMIN_PASSWORD: a strong unique password chosen by the school administrator

Do not put administrator passwords in source files, GitHub commits, or public configuration.

## Deployment caution
This rebuild is on the bright-angels-rebuild branch. Keep the current production site online until the new branch has been deployed to a preview environment and all workflows have been tested. Confirm the Pages project has the D1 binding DB before testing API requests.

## API endpoints
- GET /api/health
- GET /api/announcements
- GET /api/content
- GET /api/gallery
- POST /api/admissions
- POST /api/login
- GET /api/session
- POST /api/logout
- GET /api/admin/admissions
- GET /api/admin/announcements
- GET/POST /api/admin/content
- GET/POST /api/admin/gallery
- POST /api/admin/gallery/delete
- POST /api/admin/messages/status
- POST /api/admin/announcements
- GET/POST /api/admin/subjects
- GET/POST /api/admin/marks
- GET /api/admin/report-card
- GET/POST /api/admin/fees
- POST /api/admin/fees/payment
- POST /api/parent-messages
- GET /api/admin/messages

## Next development stages
1. Verify Cloudflare Pages preview deployment and database binding.
2. Test admissions, administrator authentication, sessions and announcements.
3. Complete subject, marks, fee, parent-message and report-card workflow testing.
4. Configure a trusted email delivery provider if automatic notifications are required.
5. Complete end-to-end testing before production cutover.

The D1 setup only creates new ba2_ tables. It does not intentionally delete, rename, or alter existing school database tables.
