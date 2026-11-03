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
- Public announcements feed
- Administrator sign-in using environment secrets
- Administrator dashboard for viewing enquiries and publishing announcements
- Additive D1 tables use the ba2_ prefix to avoid changing legacy tables

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
- POST /api/admissions
- POST /api/login
- GET /api/session
- POST /api/logout
- GET /api/admin/admissions
- GET /api/admin/announcements
- POST /api/admin/announcements

## Next development stages
1. Verify Cloudflare Pages preview deployment and database binding.
2. Test admissions, administrator authentication, sessions and announcements.
3. Add class-grouped admissions, review statuses, student records and permanent admission numbers.
4. Add subjects, marks, report cards, fees, parent messages and configurable school content.
5. Complete end-to-end testing before production cutover.

The D1 setup only creates new ba2_ tables. It does not intentionally delete, rename, or alter existing school database tables.
