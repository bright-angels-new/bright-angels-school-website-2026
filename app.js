/* =========================================================
   BRIGHT ANGELS JUNIOR SCHOOL
   Main website and administration dashboard
   ========================================================= */

'use strict';

/* ---------------------------------------------------------
   1. GENERAL HELPERS
   --------------------------------------------------------- */

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

const currentYear = $('#year');

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}

const menuToggle = $('#menuToggle');
const mainNav = $('#mainNav');

if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
        mainNav.classList.toggle('open');
    });
}

// Close the mobile navigation after a link is selected.
$$('#mainNav a').forEach(link => {
    link.addEventListener('click', () => {
        mainNav?.classList.remove('open');
    });
});

// Explicitly navigate to the administrator login section.
const adminLoginLink = $('.nav-admin');
const adminSection = $('#admin');

if (adminLoginLink && adminSection) {
    adminLoginLink.addEventListener('click', event => {
        event.preventDefault();

        // Close the mobile menu first.
        mainNav?.classList.remove('open');

        // Update the address bar without reloading the website.
        history.replaceState(null, '', '#admin');

        // Scroll directly to the administrator section.
        adminSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
}
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function showStatus(element, message, type = '') {
    if (!element) return;

    element.textContent = message;
    element.className = 'form-status';

    if (type) {
        element.classList.add(type);
    }
}

function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
}

function option(value, label) {
    return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
}

function makeTable(headers, rows) {
    if (!rows.length) {
        return '<div class="empty-state">No records found.</div>';
    }

    return `
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        ${headers.map(header =>
                            `<th>${escapeHTML(header)}</th>`
                        ).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${row.map(cell =>
                                `<td>${cell ?? ''}</td>`
                            ).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function safeCell(value) {
    return escapeHTML(value);
}

function formatDate(value) {
    if (!value) return '';

    const date = new Date(
        String(value).includes('T')
            ? value
            : String(value).replace(' ', 'T')
    );

    return Number.isNaN(date.getTime())
        ? escapeHTML(value)
        : date.toLocaleDateString();
}

function money(value) {
    return Number(value || 0).toLocaleString('en-UG', {
        maximumFractionDigits: 2
    });
}

function currentAcademicYear() {
    return String(new Date().getFullYear());
}

/* ---------------------------------------------------------
   2. API CONNECTION
   --------------------------------------------------------- */

async function api(path, options = {}) {
    const requestOptions = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/json',
            ...(options.headers || {})
        }
    };

    if (options.body !== undefined) {
        requestOptions.body =
            typeof options.body === 'string'
                ? options.body
                : JSON.stringify(options.body);
    }

    const response = await fetch(`/api/${path}`, requestOptions);

    let result = {};

    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok || result.ok === false) {
        throw new Error(
            result.error ||
            result.message ||
            `Request failed (${response.status}).`
        );
    }

    return result;
}

function actionButton(label, action, id, danger = false) {
    return `
        <button
            type="button"
            class="${danger ? 'danger-button' : 'secondary-button'}"
            data-action="${escapeHTML(action)}"
            data-id="${escapeHTML(id)}">
            ${escapeHTML(label)}
        </button>
    `;
}
async function uploadGalleryPhoto(formData) {
    const response = await fetch('/api/gallery', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
    });

    let result = {};

    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok || result.ok === false) {
        throw new Error(result.error || 'Photo upload failed.');
    }

    return result;
}
/* ---------------------------------------------------------
   3. PUBLIC ANNOUNCEMENTS
   --------------------------------------------------------- */

async function loadAnnouncements() {
    const list = $('#announcementList');

    if (!list) return;

    list.innerHTML =
        '<div class="empty-state">Loading announcements...</div>';

    try {
        const result = await api('announcements');

        const announcements = Array.isArray(result.announcements)
            ? result.announcements
            : [];

        list.innerHTML = '';

        if (!announcements.length) {
            list.innerHTML = `
                <div class="empty-state">
                    There are no announcements yet.
                    Please check back soon.
                </div>
            `;
            return;
        }

        announcements.forEach(announcement => {
            const article = document.createElement('article');
            article.className = 'announcement';

            const time = document.createElement('time');

            time.textContent = formatDate(
                announcement.date || announcement.created_at
            );

            const heading = document.createElement('h3');
            heading.textContent = announcement.title || '';

            const paragraph = document.createElement('p');
            paragraph.textContent = announcement.content || '';

            article.append(time, heading, paragraph);
            list.appendChild(article);
        });
    } catch (error) {
        list.innerHTML = `
            <div class="empty-state">
                Announcements could not be loaded.
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}
let galleryPhotos = [];
let currentPhotoIndex = 0;
let slideshowTimer = null;

async function loadGallerySlideshow() {
    const image = $('#slideshowImage');
    const caption = $('#slideshowCaption');

    if (!image || !caption) return;

    try {
        const result = await api('gallery');
        galleryPhotos = Array.isArray(result.data) ? result.data : [];

        if (!galleryPhotos.length) return;

        function showPhoto(index) {
            currentPhotoIndex =
                (index + galleryPhotos.length) % galleryPhotos.length;

            const photo = galleryPhotos[currentPhotoIndex];

            image.src = photo.image_url;
            caption.textContent = photo.caption || 'Bright Angels Junior School';
        }

        showPhoto(0);

        $('#previousPhoto')?.addEventListener('click', () => {
            showPhoto(currentPhotoIndex - 1);
        });

        $('#nextPhoto')?.addEventListener('click', () => {
            showPhoto(currentPhotoIndex + 1);
        });

        clearInterval(slideshowTimer);

        if (galleryPhotos.length > 1) {
            slideshowTimer = setInterval(() => {
                showPhoto(currentPhotoIndex + 1);
            }, 5000);
        }
    } catch (error) {
        console.error('Gallery loading failed:', error);
    }
}

loadAnnouncements();
loadGallerySlideshow();
loadWebsiteBackground();
/* ---------------------------------------------------------
   4. PUBLIC ADMISSION FORM
   --------------------------------------------------------- */

const admissionForm = $('#admissionForm');

if (admissionForm) {
    admissionForm.addEventListener('submit', async event => {
        event.preventDefault();

        const status = $('#admissionStatus');
        const submitButton = admissionForm.querySelector(
            '[type="submit"]'
        );

        showStatus(status, 'Submitting application...');

        if (submitButton) submitButton.disabled = true;

        try {
            const values = formValues(admissionForm);

            /*
             * The existing API accepts JSON.
             * Passport-photo uploads require additional API
             * and storage support.
             */

            delete values.passport_photo;
            delete values.passport;
            delete values.photo;

            const result = await api('admissions', {
                method: 'POST',
                body: values
            });

            showStatus(
                status,
                result.message ||
                    'Application submitted successfully.',
                'success'
            );

            admissionForm.reset();
        } catch (error) {
            showStatus(
                status,
                error.message ||
                    'Application could not be submitted.',
                'error'
            );
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

/* ---------------------------------------------------------
   5. PUBLIC CONTACT FORM
   --------------------------------------------------------- */

const contactForm = $('#contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', async event => {
        event.preventDefault();

        const status = $('#contactStatus');
        const submitButton = contactForm.querySelector(
            '[type="submit"]'
        );

        showStatus(status, 'Sending your message...');

        if (submitButton) submitButton.disabled = true;

        try {
            const result = await api('messages', {
                method: 'POST',
                body: formValues(contactForm)
            });

            showStatus(
                status,
                result.message ||
                    'Your message has been received.',
                'success'
            );

            contactForm.reset();
        } catch (error) {
            showStatus(
                status,
                error.message ||
                    'Message could not be sent.',
                'error'
            );
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

/* ---------------------------------------------------------
   6. ADMIN LOGIN AND LOGOUT
   --------------------------------------------------------- */

const loginForm = $('#loginForm');
const loginCard = $('#loginCard');
const adminPanel = $('#adminPanel');
const loginStatus = $('#loginStatus');
const adminContent = $('#adminContent');
const logoutButton = $('#logoutBtn');

let activeTab = 'students';

function showAdmin(isLoggedIn) {
    if (loginCard) {
        loginCard.hidden = isLoggedIn;
    }

    if (adminPanel) {
        adminPanel.hidden = !isLoggedIn;
    }
}

async function checkAdminSession() {
    try {
        const result = await api('session');

        const authenticated =
            result.authenticated === true ||
            result.logged_in === true ||
            result.loggedIn === true;

        showAdmin(authenticated);

        if (authenticated) {
            await renderTab(activeTab);
        }
    } catch {
        showAdmin(false);
    }
}

if (loginForm) {
    loginForm.addEventListener('submit', async event => {
        event.preventDefault();

        const submitButton = loginForm.querySelector(
            '[type="submit"]'
        );

        showStatus(loginStatus, 'Signing in...');

        if (submitButton) submitButton.disabled = true;

        try {
            const result = await api('login', {
                method: 'POST',
                body: formValues(loginForm)
            });

            showStatus(
                loginStatus,
                result.message || 'Login successful.',
                'success'
            );

            loginForm.reset();
            showAdmin(true);

            await renderTab(activeTab);
        } catch (error) {
            showStatus(
                loginStatus,
                error.message || 'Login failed.',
                'error'
            );
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await api('logout', { method: 'POST' });
        } catch {
            // Lock the dashboard locally even if logout fails.
        }

        showAdmin(false);

        if (loginStatus) {
            showStatus(loginStatus, 'You have been logged out.');
        }
    });
}

/* ---------------------------------------------------------
   7. ADMIN NAVIGATION
   --------------------------------------------------------- */

$$('[data-tab]').forEach(button => {
    button.addEventListener('click', async () => {
        const tab = button.dataset.tab;

        if (!tab) return;

        activeTab = tab;

        $$('[data-tab]').forEach(item => {
            item.classList.toggle('active', item === button);
        });

        await renderTab(tab);
    });
});

/* ---------------------------------------------------------
   8. CLASS OPTIONS
   --------------------------------------------------------- */

const DEFAULT_CLASSES = [
    'Baby Class',
    'Middle Class',
    'Top Class',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7'
];

async function getSchoolClasses() {
    try {
        const result = await api('settings');
        const classes = result.settings?.school_classes;

        if (Array.isArray(classes) && classes.length) {
            return classes;
        }
    } catch {
        // Use the default classes if settings are unavailable.
    }

    return DEFAULT_CLASSES;
}

async function getSchoolClasses() {
    try {
        const result = await api('settings');

        const classes = result.settings?.school_classes;

        if (Array.isArray(classes) && classes.length > 0) {
            return classes;
        }
    } catch (error) {
        console.error('Could not load school classes:', error);
    }

    return [
        'Baby Class',
        'Middle Class',
        'Top Class',
        'P1',
        'P2',
        'P3',
        'P4',
        'P5',
        'P6',
        'P7'
    ];
}

async function studentSelect(name = 'student_id') {
    const result = await api('students');
    const students = result.students || [];

    return `
        <select name="${escapeHTML(name)}" required>
            <option value="">Select pupil</option>

            ${students.map(student => `
                <option value="${escapeHTML(student.id)}">
                    ${escapeHTML(student.full_name)}
                    (${escapeHTML(student.admission_number || '')})
                </option>
            `).join('')}
        </select>
    `;
}

async function subjectSelect(name = 'subject_id') {
    const result = await api('subjects');
    const subjects = result.subjects || [];

    return `
        <select name="${escapeHTML(name)}" required>
            <option value="">Select subject</option>

            ${subjects.map(subject => `
                <option value="${escapeHTML(subject.id)}">
                    ${escapeHTML(subject.name)}
                    ${subject.class_name
                        ? `(${escapeHTML(subject.class_name)})`
                        : ''}
                </option>
            `).join('')}
        </select>
    `;
    }
/* ---------------------------------------------------------
   9. ADMIN DASHBOARD TAB ROUTER
   --------------------------------------------------------- */

async function renderTab(tab) {
    if (!adminContent) return;

    adminContent.innerHTML = `
        <div class="empty-state">
            Loading ${escapeHTML(tab)}...
        </div>
    `;

    try {
        switch (tab) {
            case 'students':
                await renderStudents();
                break;

            case 'subjects':
                await renderSubjects();
                break;

            case 'marks':
                await renderMarks();
                break;
                          case 'report-cards':
                await renderReportCards();
                break;

            case 'fees':
                await renderFees();
                break;

            case 'announcements':
                await renderAdminAnnouncements();
                break;
case 'gallery':
    await renderAdminGallery();
    break;
              case 'design':
    await renderWebsiteDesign();
    break;
            case 'applications':
                await renderApplications();
                break;

            case 'messages':
                await renderMessages();
                break;

            default:
                adminContent.innerHTML = `
                    <div class="empty-state">
                        This dashboard section is not available.
                    </div>
                `;
        }
    } catch (error) {
        adminContent.innerHTML = `
            <div class="form-status error">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}

/* ---------------------------------------------------------
   10. STUDENT RECORDS
   --------------------------------------------------------- */

async function renderStudents() {
    const result = await api('students');
    const students = result.students || [];
    const classes = await classSelect();

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Student Records</h2>
            <p>Add and manage pupil records.</p>

            <form id="studentForm">

                <label>Full name
                    <input name="full_name" required>
                </label>

                <label>Admission number
                    <input name="admission_number" required>
                </label>

                <label>Class
                    ${classes}
                </label>

                <label>Gender
                    <select name="gender">
                        <option value="">Select gender</option>
                        ${option('Male', 'Male')}
                        ${option('Female', 'Female')}
                    </select>
                </label>

                <label>Date of birth
                    <input
                        type="date"
                        name="date_of_birth">
                </label>

                <label>Parent/Guardian name
                    <input name="parent_name">
                </label>

                <label>Parent/Guardian phone
                    <input
                        name="parent_phone"
                        type="tel">
                </label>

                <button type="submit">Save Student</button>

                <p id="studentStatus" class="form-status"></p>
            </form>

            <h3>Registered Pupils (${students.length})</h3>

            ${makeTable(
                [
                    'Admission No.',
                    'Full Name',
                    'Class',
                    'Gender',
                    'Parent/Guardian',
                    'Phone',
                    'Actions'
                ],
                students.map(student => [
                    safeCell(student.admission_number),
                    safeCell(student.full_name),
                    safeCell(student.class_name),
                    safeCell(student.gender),
                    safeCell(student.parent_name),
                    safeCell(student.parent_phone),
                    actionButton(
                        'Delete',
                        'delete-student',
                        student.id,
                        true
                    )
                ])
            )}
        </section>
    `;

    $('#studentForm')?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            const form = event.currentTarget;
            const status = $('#studentStatus');
            const button = form.querySelector(
                '[type="submit"]'
            );

            if (button) button.disabled = true;

            showStatus(status, 'Saving student...');

            try {
                await api('students', {
                    method: 'POST',
                    body: formValues(form)
                });

                await renderStudents();

                const newStatus = $('#studentStatus');

                showStatus(
                    newStatus,
                    'Student saved successfully.',
                    'success'
                );
            } catch (error) {
                showStatus(
                    status,
                    error.message,
                    'error'
                );

                if (button) button.disabled = false;
            }
        }
    );
}
/* ---------------------------------------------------------
   11. SUBJECTS
   --------------------------------------------------------- */

async function renderSubjects() {
    const result = await api('subjects');
    const subjects = result.subjects || [];
    const classes = await classSelect();

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Manage Subjects</h2>
            <p>Add subjects and assign them to classes.</p>

            <form id="subjectForm">

                <label>Subject name
                    <input name="name" required>
                </label>

                <label>Class
                    ${classes}
                </label>

                <button type="submit">Save Subject</button>

                <p id="subjectStatus" class="form-status"></p>
            </form>

            <h3>Registered Subjects (${subjects.length})</h3>

            ${makeTable(
                ['Subject', 'Class', 'Actions'],
                subjects.map(subject => [
                    safeCell(subject.name),
                    safeCell(subject.class_name),
                    actionButton(
                        'Delete',
                        'delete-subject',
                        subject.id,
                        true
                    )
                ])
            )}
        </section>
    `;

    $('#subjectForm')?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            const form = event.currentTarget;
            const status = $('#subjectStatus');
            const button = form.querySelector(
                '[type="submit"]'
            );

            if (button) button.disabled = true;

            showStatus(status, 'Saving subject...');

            try {
                await api('subjects', {
                    method: 'POST',
                    body: formValues(form)
                });

                await renderSubjects();

                showStatus(
                    $('#subjectStatus'),
                    'Subject saved successfully.',
                    'success'
                );
            } catch (error) {
                showStatus(status, error.message, 'error');

                if (button) button.disabled = false;
            }
        }
    );
}
/* ---------------------------------------------------------
   12. ACADEMIC MARKS
   --------------------------------------------------------- */
async function renderMarks() {
    const [marksResult, studentsResult, subjectsResult] =
        await Promise.all([
            api('marks'),
            api('students'),
            api('subjects')
        ]);

    const marks = marksResult.marks || [];
    const students = studentsResult.students || [];
    const subjects = subjectsResult.subjects || [];

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Academic Marks</h2>
            <p>Record and review pupils' academic marks.</p>

            <form id="marksForm">

                <label>Pupil
                    <select name="student_id" required>
                        <option value="">Select pupil</option>
                        ${students.map(student => `
                            <option value="${escapeHTML(student.id)}">
                                ${escapeHTML(student.full_name)}
                                (${escapeHTML(student.admission_number || '')})
                            </option>
                        `).join('')}
                    </select>
                </label>

                <label>Subject
                    <select name="subject_id" required>
                        <option value="">Select pupil first</option>
                    </select>
                </label>

                <label>Academic year
                    <input
                        name="year"
                        type="number"
                        value="${escapeHTML(currentAcademicYear())}"
                        required>
                </label>

                <label>Term
                    <select name="term" required>
                        <option value="">Select term</option>
                        ${option('Term 1', 'Term 1')}
                        ${option('Term 2', 'Term 2')}
                        ${option('Term 3', 'Term 3')}
                    </select>
                </label>

                <label>Assessment
                    <select name="assessment_type" required>
                        <option value="">Select assessment</option>
                        <option value="BOT">BOT</option>
                        <option value="MOT">MOT</option>
                        <option value="EOT">EOT</option>
                    </select>
                </label>

                <label>Marks obtained
                    <input
                        name="score"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        required>
                </label>

                <label>Maximum marks
                    <input
                        name="out_of"
                        type="number"
                        min="1"
                        value="100"
                        required>
                </label>

                <label>Remarks
                    <textarea name="comment"></textarea>
                </label>

                <button type="submit">Save Marks</button>
                <p id="marksStatus" class="form-status"></p>
            </form>

            <h3>Recorded Marks (${marks.length})</h3>

            ${makeTable(
                [
                    'Pupil',
                    'Admission No.',
                    'Class',
                    'Subject',
                    'Assessment',
                    'Term',
                    'Year',
                    'Score',
                    'Maximum',
                    'Remarks'
                ],
               marks.map(mark => [
    safeCell(mark.student_name),
    safeCell(mark.admission_number),
    safeCell(mark.class_name),
    safeCell(mark.subject_name),
    safeCell(mark.assessment_type),
    safeCell(mark.term),
    safeCell(mark.year ?? mark.academic_year),
    safeCell(mark.score ?? mark.marks_obtained),
    safeCell(mark.out_of ?? mark.maximum_marks),
    safeCell(mark.comment ?? mark.remarks)
]) 
            )}
        </section>
    `;

    const form = $('#marksForm');
    const studentSelect = form.querySelector(
        '[name="student_id"]'
    );
    const subjectSelect = form.querySelector(
        '[name="subject_id"]'
    );

    studentSelect.addEventListener('change', () => {
        const selectedStudent = students.find(
            student => String(student.id) === studentSelect.value
        );

        const pupilClass = selectedStudent?.class_name;

        const classSubjects = subjects.filter(subject =>
    String(subject.class_name || '').trim().toUpperCase() ===
    String(pupilClass || '').trim().toUpperCase()
);

        subjectSelect.innerHTML = `
            <option value="">Select subject</option>
            ${classSubjects.map(subject => `
                <option value="${escapeHTML(subject.id)}">
                    ${escapeHTML(subject.name || subject.subject_name || '')}
                </option>
            `).join('')}
        `;

        if (!classSubjects.length) {
            subjectSelect.innerHTML =
                '<option value="">No subjects assigned to this class</option>';
        }
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const status = $('#marksStatus');
        const button = form.querySelector('[type="submit"]');

        if (button) button.disabled = true;

        showStatus(status, 'Saving marks...');

        try {
            await api('marks', {
                method: 'POST',
                body: formValues(form)
            });

            await renderMarks();

            showStatus(
                $('#marksStatus'),
                'Marks saved successfully.',
                'success'
            );
        } catch (error) {
            showStatus(status, error.message, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    });
           }
     /* ---------------------------------------------------------
   REPORT CARDS
   --------------------------------------------------------- */

async function renderReportCards() {
    const [marksResult, studentsResult, subjectsResult] =
        await Promise.all([
            api('marks'),
            api('students'),
            api('subjects')
        ]);

    const marks = marksResult.marks || [];
    const students = studentsResult.students || [];
    const subjects = subjectsResult.subjects || [];

    const classes = [
        'Baby Class', 'Middle Class', 'Top Class',
        'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'
    ];

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Report Cards</h2>
            <p>Generate and print pupil report cards.</p>

            <form id="reportCardForm">

                <label>Academic year
                    <input name="year" type="number"
                        value="${escapeHTML(currentAcademicYear())}"
                        required>
                </label>

                <label>Term
                    <select name="term" required>
                        <option value="">Select term</option>
                        <option>Term 1</option>
                        <option>Term 2</option>
                        <option>Term 3</option>
                    </select>
                </label>

                <label>Assessment
                    <select name="assessment_type" required>
                        <option value="">Select assessment</option>
                        <option value="BOT">BOT</option>
                        <option value="MOT">MOT</option>
                        <option value="EOT">EOT</option>
                    </select>
                </label>

                <label>Class
                    <select name="class_name" required>
                        <option value="">Select class</option>
                        <option value="ALL">All Classes</option>
                        ${classes.map(c => `
                            <option value="${escapeHTML(c)}">
                                ${escapeHTML(c)}
                            </option>
                        `).join('')}
                    </select>
                </label>

                <button type="submit">Generate Report Cards</button>
                <p id="reportCardStatus" class="form-status"></p>
            </form>

            <div id="reportCardPreview"></div>
        </section>
    `;

    $('#reportCardForm').addEventListener('submit', event => {
        event.preventDefault();

        const form = event.currentTarget;
        const values = formValues(form);

        const year = Number(values.year);
        const term = values.term;
        const assessment = values.assessment_type;
        const selectedClass = values.class_name;

        let pupils = students.filter(student =>
            student.status !== 'Archived'
        );

        if (selectedClass !== 'ALL') {
            pupils = pupils.filter(student =>
                String(student.class_name).toUpperCase() ===
                selectedClass.toUpperCase()
            );
        }

        pupils.sort((a, b) =>
            String(a.class_name).localeCompare(String(b.class_name)) ||
            String(a.full_name).localeCompare(String(b.full_name))
        );

        const reports = pupils.map(student => {
            const pupilSubjects = subjects.filter(subject => {
                const sameClass =
                    String(subject.class_name || '').toUpperCase() ===
                    String(student.class_name || '').toUpperCase();

                const sameYear =
                    !subject.academic_year ||
                    Number(subject.academic_year) === year;

                return sameClass && sameYear;
            });

            const pupilMarks = marks.filter(mark =>
                String(mark.student_id) === String(student.id) &&
                Number(mark.academic_year ?? mark.year) === year &&
                String(mark.term).toLowerCase() === term.toLowerCase() &&
                String(mark.assessment_type).toUpperCase() === assessment
            );

            const rows = pupilSubjects.map(subject => {
                const mark = pupilMarks.find(item =>
                    String(item.subject_id) === String(subject.id)
                );

                const score = mark
                    ? Number(mark.marks_obtained ?? mark.score)
                    : null;

                const maximum = mark
                    ? Number(mark.maximum_marks ?? mark.out_of)
                    : null;

                const percentage =
                    score !== null && maximum > 0
                        ? (score / maximum) * 100
                        : null;

                return {
                    subject: subject.name || subject.subject_name || '',
                    score,
                    maximum,
                    percentage,
                    grade: percentage === null
                        ? ''
                        : getReportGrade(student.class_name, percentage)
                };
            });

            const completedRows = rows.filter(row =>
                row.score !== null && row.maximum > 0
            );

            const total = completedRows.reduce(
                (sum, row) => sum + row.score, 0
            );

            const totalMaximum = completedRows.reduce(
                (sum, row) => sum + row.maximum, 0
            );

            const overallPercentage = totalMaximum > 0
                ? (total / totalMaximum) * 100
                : 0;

            return {
                student,
                rows,
                total,
                totalMaximum,
                overallPercentage
            };
        });

        const rankedGroups = {};

        reports.forEach(report => {
            const className = report.student.class_name;
            const group = getReportGroup(className);

            if (group === 'early' || group === 'lower') {
                if (!rankedGroups[className]) {
                    rankedGroups[className] = [];
                }

                rankedGroups[className].push(report);
            }
        });

        Object.values(rankedGroups).forEach(group => {
            group.sort((a, b) => b.total - a.total);

            let position = 0;
            let previousTotal = null;

            group.forEach((report, index) => {
                if (report.total !== previousTotal) {
                    position = index + 1;
                }

                report.position = position;
                previousTotal = report.total;
            });
        });

        const preview = $('#reportCardPreview');

        if (!reports.length) {
            showStatus(
                $('#reportCardStatus'),
                'No pupils found for the selected class.',
                'error'
            );
            return;
        }

        preview.innerHTML = `
            <h3>Generated Report Cards: ${reports.length}</h3>
            <button type="button" id="printReportCards">
                Print Report Cards
            </button>
            <p>Each pupil's report card will be printed on a separate page.</p>
        `;

        $('#printReportCards').addEventListener('click', () => {
            const printWindow = window.open('', '_blank');

            if (!printWindow) {
                showStatus(
                    $('#reportCardStatus'),
                    'Please allow pop-ups to print report cards.',
                    'error'
                );
                return;
            }

            const pages = reports.map(report => {
                const group = getReportGroup(report.student.class_name);

                const subjectRows = report.rows.map(row => {
                    if (group === 'early') {
                        return `
                            <tr>
                                <td>${escapeHTML(row.subject)}</td>
                                <td>${row.score ?? ''}</td>
                                <td>${escapeHTML(row.grade)}</td>
                            </tr>
                        `;
                    }

                    return `
                        <tr>
                            <td>${escapeHTML(row.subject)}</td>
                            <td>${row.score ?? ''}</td>
                            <td>${row.maximum ?? ''}</td>
                            <td>${escapeHTML(row.grade)}</td>
                        </tr>
                    `;
                }).join('');

                const position =
                    report.position
                        ? `<p><strong>Class Position:</strong> ${report.position}</p>`
                        : '';

                return `
                    <article class="report-page">
                        <header>
    <img
        src="${window.location.origin}/school-logo.jpg"
        alt="Bright Angels School Badge"
        class="report-school-logo">

    <h1>BRIGHT ANGELS JUNIOR SCHOOL</h1>
    <p>If others can, we can</p>
    <h2>${escapeHTML(assessment)} REPORT CARD</h2>
</header>

                        <div class="pupil-details">
                            <p><strong>Pupil:</strong>
                                ${escapeHTML(report.student.full_name)}</p>
                            <p><strong>Admission No:</strong>
                                ${escapeHTML(report.student.admission_number || '')}</p>
                            <p><strong>Class:</strong>
                                ${escapeHTML(report.student.class_name)}</p>
                            <p><strong>Academic Year:</strong> ${year}</p>
                            <p><strong>Term:</strong> ${escapeHTML(term)}</p>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    ${group === 'early'
                                        ? '<th>Learning Area</th><th>Marks</th><th>Grade</th>'
                                        : '<th>Subject</th><th>Marks</th><th>Maximum</th><th>Grade</th>'}
                                </tr>
                            </thead>
                            <tbody>${subjectRows}</tbody>
                        </table>

                        <div class="totals">
                            <p><strong>Total Marks:</strong>
                                ${report.total} / ${report.totalMaximum}</p>
                            ${position}
                        </div>

                        <footer>
                            <p>Class Teacher's Comment: __________________________</p>
                            <p>Head Teacher's Comment: __________________________</p>
                            <p>Class Teacher's Signature: ________________________</p>
                            <p>Head Teacher's Signature: ________________________</p>
                        </footer>
                    </article>
                `;
            }).join('');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Bright Angels Report Cards</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            color: #17243b;
                            margin: 0;
                        }

                        .report-page {
                            box-sizing: border-box;
                            padding: 25px;
                            min-height: 270mm;
                            page-break-after: always;
                        }

                        header {
                            text-align: center;
                            border-bottom: 3px solid #c99a35;
                            padding-bottom: 12px;
                        }

                        header h1 {
                            color: #142747;
                            margin-bottom: 5px;
                        }

                        header h2 {
                            color: #b18428;
                        }

                        .pupil-details {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 0 20px;
                            margin: 20px 0;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                        }

                        th, td {
                            border: 1px solid #777;
                            padding: 9px;
                            text-align: left;
                        }

                        th {
                            background: #142747;
                            color: white;
                        }

                        .totals {
                            margin-top: 20px;
                            font-size: 16px;
                        }

                        footer {
                            margin-top: 50px;
                            line-height: 2;
                        }

                        @media print {
                            .report-page {
                                page-break-after: always;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${pages}
                    <script>
                        window.onload = function() {
                            window.print();
                        };
                    <\/script>
                </body>
                </html>
            `);

            printWindow.document.close();
        });

        showStatus(
            $('#reportCardStatus'),
            'Report cards generated successfully.',
            'success'
        );
    });
}

function getReportGroup(className) {
    const c = String(className || '').toUpperCase();

    if (['BABY CLASS', 'MIDDLE CLASS', 'TOP CLASS'].includes(c)) {
        return 'early';
    }

    if (['P1', 'P2', 'P3'].includes(c)) {
        return 'lower';
    }

    return 'upper';
}

function getReportGrade(className, percentage) {
    const group = getReportGroup(className);

    if (group === 'early') {
        if (percentage >= 80) return 'E';
        if (percentage >= 65) return 'VG';
        if (percentage >= 50) return 'G';
        if (percentage >= 35) return 'D';
        return 'NI';
    }

    if (group === 'lower') {
        if (percentage >= 80) return '4';
        if (percentage >= 65) return '3';
        if (percentage >= 40) return '2';
        return '1';
    }

    if (percentage >= 85) return 'D1';
    if (percentage >= 70) return 'D2';
    if (percentage >= 60) return 'C3';
    if (percentage >= 50) return 'C4';
    if (percentage >= 45) return 'C5';
    if (percentage >= 40) return 'C6';
    if (percentage >= 35) return 'P7';
    if (percentage >= 30) return 'P8';
    return 'F9';
}           
/* ---------------------------------------------------------
   13. SCHOOL FEES
   --------------------------------------------------------- */

async function renderFees() {
    const result = await api('fees');
    const fees = result.fees || [];
    const pupils = await studentSelect();

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>School Fees</h2>

            <p>
                Record fees due and payments received.
                The balance is calculated automatically.
            </p>

            <form id="feesForm">

                <label>Pupil
                    ${pupils}
                </label>

                <label>Academic year
                    <input
                        name="academic_year"
                        type="number"
                        value="${escapeHTML(currentAcademicYear())}"
                        required>
                </label>

                <label>Term
                    <select name="term" required>
                        ${option('Term 1', 'Term 1')}
                        ${option('Term 2', 'Term 2')}
                        ${option('Term 3', 'Term 3')}
                    </select>
                </label>

                <label>Amount due
                    <input
                        name="amount_due"
                        type="number"
                        min="0"
                        step="0.01"
                        required>
                </label>

                <label>Amount paid
                    <input
                        name="amount_paid"
                        type="number"
                        min="0"
                        step="0.01"
                        value="0"
                        required>
                </label>

                <label>Notes
                    <textarea name="notes"></textarea>
                </label>

                <button type="submit">Save Fees</button>

                <p id="feesStatus" class="form-status"></p>
            </form>

            <h3>Fees Records</h3>

            ${makeTable(
                [
                    'Pupil',
                    'Admission No.',
                    'Class',
                    'Term',
                    'Year',
                    'Amount Due',
                    'Amount Paid',
                    'Balance'
                ],
                fees.map(fee => [
                    safeCell(fee.student_name),
                    safeCell(fee.admission_number),
                    safeCell(fee.class_name),
                    safeCell(fee.term),
                    safeCell(fee.academic_year),
                    safeCell(money(fee.amount_due)),
                    safeCell(money(fee.amount_paid)),
                    safeCell(money(fee.balance))
                ])
            )}
        </section>
    `;

    $('#feesForm')?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            const form = event.currentTarget;
            const status = $('#feesStatus');
            const button = form.querySelector(
                '[type="submit"]'
            );

            if (button) button.disabled = true;

            showStatus(status, 'Saving fees record...');

            try {
                const values = formValues(form);

                values.student_id = Number(values.student_id);
                values.amount_due = Number(values.amount_due);
                values.amount_paid = Number(values.amount_paid);

                await api('fees', {
                    method: 'POST',
                    body: values
                });

                await renderFees();

                showStatus(
                    $('#feesStatus'),
                    'Fees record saved successfully.',
                    'success'
                );
            } catch (error) {
                showStatus(status, error.message, 'error');

                if (button) button.disabled = false;
            }
        }
    );
}

/* ---------------------------------------------------------
   14. ANNOUNCEMENTS MANAGEMENT
   --------------------------------------------------------- */

async function renderAdminAnnouncements() {
    const result = await api('announcements');

const announcements = Array.isArray(result.announcements)
    ? result.announcements
    : Array.isArray(result.data)
        ? result.data
        : [];
    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Manage Announcements</h2>

            <p>
                Publish school announcements for parents
                and visitors to see on the public website.
            </p>

            <form id="announcementForm">

                <label>Announcement title
                    <input name="title" required>
                </label>

                <label>Announcement message
                    <textarea
                        name="content"
                        rows="5"
                        required></textarea>
                </label>

                <label>Announcement date
                    <input name="date" type="date">
                </label>

                <button type="submit">
                    Publish Announcement
                </button>

                <p
                    id="announcementStatus"
                    class="form-status"></p>
            </form>

            <h3>
                Published Announcements (${announcements.length})
            </h3>

            ${makeTable(
                ['Date', 'Title', 'Message', 'Actions'],
                announcements.map(item => [
                    safeCell(
                        formatDate(item.date || item.created_at)
                    ),
                    safeCell(item.title),
                    safeCell(item.content),
                    actionButton(
                        'Delete',
                        'delete-announcement',
                        item.id,
                        true
                    )
                ])
            )}
        </section>
    `;

    $('#announcementForm')?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            const form = event.currentTarget;
            const status = $('#announcementStatus');
            const button = form.querySelector(
                '[type="submit"]'
            );

            if (button) button.disabled = true;

            showStatus(status, 'Publishing announcement...');

                    try {
            const values = formValues(form);

            console.log('Announcement data:', values);

            const result = await api('announcements', {
                method: 'POST',
                body: values
            });

            console.log('Announcement save result:', result);

            form.reset();

            await loadAnnouncements();
            await renderAdminAnnouncements();

            showStatus(
                $('#announcementStatus'),
                'Announcement published successfully.',
                'success'
            );
        } catch (error) {
            console.error('Announcement save failed:', error);

            showStatus(
                status,
                `Could not save announcement: ${error.message}`,
                'error'
            );
        } finally {
            if (button) button.disabled = false;
        }
    }
);
}
async function renderAdminGallery() {
    const result = await api('gallery');
    const photos = Array.isArray(result.data) ? result.data : [];

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Manage School Photos</h2>

            <p>Upload photos to display in the school website slideshow.</p>

            <form id="galleryForm">
                <label>Select photo
                    <input
                        type="file"
                        name="file"
                        accept="image/*"
                        required
                    >
                </label>

                <label>Photo caption
                    <input
                        type="text"
                        name="caption"
                        maxlength="300"
                        placeholder="Enter a short caption"
                    >
                </label>

                <button type="submit">Upload Photo</button>

                <p id="galleryStatus" class="form-status"></p>
            </form>

            <h3>Uploaded Photos (${photos.length})</h3>

            <div class="gallery-admin-grid">
                ${photos.map(photo => `
                    <div class="gallery-admin-card">
                        <img
                            src="${safeCell(photo.image_url)}"
                            alt="${safeCell(photo.caption || 'School photo')}"
                        >
                        <p>${safeCell(photo.caption || '')}</p>
                        ${actionButton(
                            'Delete',
                            'delete-gallery',
                            photo.id,
                            true
                        )}
                    </div>
                `).join('')}
            </div>
        </section>
    `;

    $('#galleryForm')?.addEventListener('submit', async event => {
        event.preventDefault();

        const form = event.currentTarget;
        const button = form.querySelector('[type="submit"]');
        const status = $('#galleryStatus');

        if (button) button.disabled = true;

        showStatus(status, 'Uploading photo...');

        try {
            const formData = new FormData(form);
            await uploadGalleryPhoto(formData);

            await renderAdminGallery();

            showStatus(
                $('#galleryStatus'),
                'Photo uploaded successfully.',
                'success'
            );
        } catch (error) {
            showStatus(
                status,
                `Photo upload failed: ${error.message}`,
                'error'
            );
        } finally {
            if (button) button.disabled = false;
        }
    });
}
async function renderWebsiteDesign() {
    const [galleryResult, settingsResult] = await Promise.all([
        api('gallery'),
        api('settings')
    ]);

    const photos = Array.isArray(galleryResult.data)
        ? galleryResult.data
        : [];

    const currentBackground =
        settingsResult.settings?.background_url || '';

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Website Design</h2>

            <p>Choose a photo from your uploaded school photos
            to use as the website background.</p>

            <form id="backgroundForm">

                <label>Select website background</label>

                <select id="backgroundChoice">
                    <option value="">No background photo</option>

                    ${photos.map(photo => `
                        <option
                            value="${escapeHTML(photo.image_url)}"
                            ${photo.image_url === currentBackground ? 'selected' : ''}
                        >
                            ${escapeHTML(photo.caption || 'School photo')}
                        </option>
                    `).join('')}
                </select>

                <div id="backgroundPreview" style="margin:15px 0;">
                    ${
                        currentBackground
                            ? `<img src="${escapeHTML(currentBackground)}"
                                alt="Current background"
                                style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;">`
                            : '<p>No background selected.</p>'
                    }
                </div>

                <button type="submit">Save Website Background</button>

                <p id="backgroundStatus" class="form-status"></p>
            </form>
        </section>
    `;

    const choice = $('#backgroundChoice');
    const preview = $('#backgroundPreview');

    choice?.addEventListener('change', () => {
        const url = choice.value;

        preview.innerHTML = url
            ? `<img src="${escapeHTML(url)}"
                alt="Background preview"
                style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;">`
            : '<p>No background selected.</p>';
    });

    $('#backgroundForm')?.addEventListener('submit', async event => {
        event.preventDefault();

        const button = event.currentTarget.querySelector(
            '[type="submit"]'
        );

        const status = $('#backgroundStatus');

        button.disabled = true;
        showStatus(status, 'Saving website background...');

        try {
            await api('settings', {
                method: 'PUT',
                body: {
                    background_url: choice.value
                }
            });

            showStatus(
                status,
                'Website background saved successfully.',
                'success'
            );
        } catch (error) {
            showStatus(
                status,
                `Could not save background: ${error.message}`,
                'error'
            );
        } finally {
            button.disabled = false;
        }
    });
}
async function loadWebsiteBackground() {
    try {
        const result = await api('settings');
        const backgroundUrl =
            result.settings?.background_url || '';

        if (backgroundUrl) {
            document.body.style.backgroundImage =
                `url("${backgroundUrl}")`;

            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.backgroundRepeat = 'no-repeat';
        } else {
            document.body.style.backgroundImage = 'none';
        }
    } catch (error) {
        console.error('Could not load website background:', error);
    }
                                         }
/* ---------------------------------------------------------
   15. ADMISSION APPLICATIONS
   --------------------------------------------------------- */
async function renderApplications() {
    const result = await api('admissions');
    const applications = result.applications || [];
const classOrder = [
    'Baby Class',
    'Middle Class',
    'Top Class',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7'
];

applications.sort((a, b) => {
    const classA = classOrder.indexOf(a.class_applying);
    const classB = classOrder.indexOf(b.class_applying);

    return (classA === -1 ? 999 : classA) -
           (classB === -1 ? 999 : classB);
});
    const field = (label, value) => `
        <div class="admission-field">
            <strong>${label}</strong>
            <span>${safeCell(value || 'Not provided')}</span>
        </div>
    `;

    const card = (title, content) => `
        <div class="admission-info-card">
            <h4>${title}</h4>
            ${content}
        </div>
    `;

    adminContent.innerHTML = `
        <section class="admin-section mobile-admissions">

            <h2>Admission Applications</h2>

            <p>View complete student admission applications.</p>

            <input
                type="search"
                id="admissionSearch"
                placeholder="Search by child's name..."
                class="admission-search"
            >

            <div class="admission-list">

                ${applications.map(application => `
                    <details class="admission-card">

                        <summary>
                            <span class="admission-child">
                                ${safeCell(application.child_name)}
                            </span>

                            <span>
                                ${safeCell(application.date_of_birth || application.dob)}
                            </span>

                            <span>
                                ${safeCell(application.class_applying)}
                            </span>

                            <span class="admission-arrow">⌄</span>
                        </summary>

                        <div class="admission-details">

                            <h3>Application Details</h3>

                            <div class="admission-grid">

                                ${card('Student Information', `
                                    ${field('Full Name', application.child_name)}
                                    ${field('Date of Birth', application.date_of_birth || application.dob)}
                                    ${field('Gender', application.gender)}
                                    ${field('Class', application.class_applying)}
                                    ${field('Home Address', application.address)}
                                `)}

                                ${card('Parent / Guardian Details', `
                                    ${field('Name', application.guardian_name)}
                                    ${field('Phone', application.phone)}
                                    ${field('Email', application.guardian_email)}
                                `)}

                                ${card("Father's Details", `
                                    ${field('Name', application.father_name)}
                                    ${field('Phone', application.father_phone)}
                                    ${field('Email', application.father_email)}
                                `)}

                                ${card("Mother's Details", `
                                    ${field('Name', application.mother_name)}
                                    ${field('Phone', application.mother_phone)}
                                    ${field('Email', application.mother_email)}
                                `)}

                                ${card('Additional Information', `
                                    ${field('Previous School', application.previous_school)}
                                    ${field('Emergency Contact', application.emergency_contact_name)}
                                    ${field('Emergency Phone', application.emergency_contact_phone)}
                                    ${field('Relationship', application.emergency_contact_relationship)}
                                    ${field('Medical Information', application.medical_information)}
                                    ${field('Special Learning Needs', application.special_learning_needs)}
                                    ${field('Date Received', application.created_at)}
                                `)}

                            </div>

                            <button
                                type="button"
                                class="btn btn-navy"
                                onclick="this.closest('details').open = false"
                            >
                                Close Details
                            </button>

                        </div>
                    </details>
                `).join('')}

            </div>
        </section>
    `;

    const search = document.getElementById('admissionSearch');

    search.addEventListener('input', () => {
        const term = search.value.toLowerCase();

        document.querySelectorAll('.admission-card').forEach(item => {
            item.style.display =
                item.innerText.toLowerCase().includes(term)
                    ? ''
                    : 'none';
        });
    });
}
 

/* ---------------------------------------------------------
   16. CONTACT MESSAGES
   --------------------------------------------------------- */

async function renderMessages() {
    const result = await api('messages');
    const messages = result.messages || [];

    adminContent.innerHTML = `
        <section class="admin-section">
            <h2>Contact Messages</h2>

            <p>
                View messages submitted through
                the public school website.
            </p>

            ${makeTable(
                [
                    'Name',
                    'Email',
                    'Phone',
                    'Subject',
                    'Message',
                    'Date Received'
                ],
                messages.map(message => [
                    safeCell(message.name),
                    safeCell(message.email),
                    safeCell(message.phone),
                    safeCell(message.subject),
                    safeCell(message.message),
                    safeCell(formatDate(message.created_at))
                ])
            )}
        </section>
    `;
}

/* ---------------------------------------------------------
   17. ADMIN DELETE ACTIONS
   --------------------------------------------------------- */

if (adminContent) {
    adminContent.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');

        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;

        if (!id) return;

        const deleteRoutes = {
    'delete-student': 'students',
    'delete-subject': 'subjects',
    'delete-announcement': 'announcements',
    'delete-gallery': 'gallery'
};

        const endpoint = deleteRoutes[action];

        if (!endpoint) return;

        if (!confirm(
            'Are you sure you want to delete this record?'
        )) {
            return;
        }

        button.disabled = true;

        try {
           await api(`${endpoint}/${id}`, {
    method: 'DELETE'
}); 

            if (action === 'delete-announcement') {
                await loadAnnouncements();
            }

            await renderTab(activeTab);

        } catch (error) {
            alert(
                `Could not delete the record: ${error.message}`
            );

            button.disabled = false;
        }
    });
}

/* ---------------------------------------------------------
   18. STARTUP
   --------------------------------------------------------- */

checkAdminSession();

/* =========================================================
   END OF BRIGHT ANGELS JUNIOR SCHOOL APP.JS
   ========================================================= */
async function getSchoolClasses() {
    try {
        const result = await api('settings');
        const classes = result.settings?.school_classes;

        if (Array.isArray(classes) && classes.length > 0) {
            return classes;
        }
    } catch (error) {
        console.error('Could not load school classes:', error);
    }

    return [
        'Baby Class',
        'Middle Class',
        'Top Class',
        'P1',
        'P2',
        'P3',
        'P4',
        'P5',
        'P6',
        'P7'
    ];
}

async function classSelect(name = 'class_name', selected = '') {
    const classes = await getSchoolClasses();

    return `
        <select name="${escapeHTML(name)}" required>
            <option value="">Select class</option>
            ${classes.map(className => `
                <option value="${escapeHTML(className)}"
                    ${className === selected ? 'selected' : ''}>
                    ${escapeHTML(className)}
                </option>
            `).join('')}
        </select>
    `;
}
