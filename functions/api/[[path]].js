// ============================================================
// BRIGHT ANGELS JUNIOR SCHOOL
// CLOUDFARE PAGES API
// PART 1 OF 6: FOUNDATION AND DATABASE
// ============================================================

const COOKIE_NAME = "ba_admin";
const SESSION_DURATION = 60 * 60 * 24 * 7;

const DEFAULT_CLASSES = [
  "Baby Class",
  "Middle Class",
  "Top Class",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7"
];

// ============================================================
// RESPONSE HELPERS
// ============================================================

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function fail(message, status = 400) {
  return json(
    {
      ok: false,
      error: message
    },
    status
  );
}

// ============================================================
// REQUEST HELPERS
// ============================================================

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanText(value, maxLength = 5000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function normaliseEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const item of header.split(";")) {
    const separator = item.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return "";
}

function setAdminCookie(token) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_DURATION}`
  ].join("; ");
}

function clearAdminCookie() {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
}

// ============================================================
// DATABASE INITIALISATION
// ============================================================

async function initialiseDatabase(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_name TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      class_applying TEXT NOT NULL DEFAULT '',
      parent_name TEXT NOT NULL DEFAULT '',
      parent_phone TEXT NOT NULL DEFAULT '',
      parent_email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      passport_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      class_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      parent_name TEXT NOT NULL DEFAULT '',
      parent_phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      term TEXT NOT NULL DEFAULT '',
      academic_year TEXT NOT NULL DEFAULT '',
      score REAL NOT NULL DEFAULT 0,
      remarks TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (
        student_id,
        subject_id,
        term,
        academic_year
      )
    )`,

        `CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      academic_year TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      amount_due REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS ba_gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      file_id TEXT NOT NULL,
      caption TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
  const admissionColumns = [
    ["father_name", "TEXT NOT NULL DEFAULT ''"],
    ["father_phone", "TEXT NOT NULL DEFAULT ''"],
    ["father_email", "TEXT NOT NULL DEFAULT ''"],
    ["mother_name", "TEXT NOT NULL DEFAULT ''"],
    ["mother_phone", "TEXT NOT NULL DEFAULT ''"],
    ["mother_email", "TEXT NOT NULL DEFAULT ''"],
    ["previous_school", "TEXT NOT NULL DEFAULT ''"],
    ["emergency_contact_name", "TEXT NOT NULL DEFAULT ''"],
    ["emergency_contact_phone", "TEXT NOT NULL DEFAULT ''"],
    ["emergency_contact_relationship", "TEXT NOT NULL DEFAULT ''"],
    ["medical_information", "TEXT NOT NULL DEFAULT ''"],
    ["special_learning_needs", "TEXT NOT NULL DEFAULT ''"]
  ];

  const existingColumns = await db.prepare(
    "PRAGMA table_info(applications)"
  ).all();

  const existingColumnNames = new Set(
    (existingColumns.results || []).map(column => column.name)
  );

  for (const [column, definition] of admissionColumns) {
    if (!existingColumnNames.has(column)) {
      await db.prepare(
        `ALTER TABLE applications ADD COLUMN ${column} ${definition}`
      ).run();
    }
  }
  await db.prepare(
    `INSERT OR IGNORE INTO settings (key, value)
     VALUES (?, ?)`
  ).bind(
    "school_classes",
    JSON.stringify(DEFAULT_CLASSES)
  ).run();
}

// ============================================================
// EMAIL NOTIFICATIONS
// Uses existing Cloudflare environment variables.
// ============================================================

async function sendSchoolEmail(env, subject, message) {
  if (
    !env.RESEND_API_KEY ||
    !env.EMAIL_FROM ||
    !env.EMAIL_TO
  ) {
    console.error(
      "Email settings are incomplete; notification not sent."
    );

    return false;
  }

  try {
    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [env.EMAIL_TO],
          subject,
          text: message
        })
      }
    );

    if (!response.ok) {
      console.error(
        "Email delivery failed:",
        response.status,
        await response.text()
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error("Email request failed:", error);
    return false;
  }
}

// ============================================================
// ADMIN SESSION SECURITY
// ============================================================

async function createSessionToken(env) {
  if (!env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is not configured."
    );
  }

  const message =
    `${Date.now()}:${crypto.randomUUID()}`;

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  const bytes = new Uint8Array(signature);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `${message}:${btoa(binary)}`;
}

async function isAdminAuthenticated(request, env) {
  const token = cookieValue(request, COOKIE_NAME);

  if (!token || !env.SESSION_SECRET) {
    return false;
  }

  const parts = token.split(":");

  if (parts.length !== 3) {
    return false;
  }

  const timestamp = Number(parts[0]);

  if (
    !Number.isFinite(timestamp) ||
    timestamp > Date.now() ||
    Date.now() - timestamp > SESSION_DURATION * 1000
  ) {
    return false;
  }

  const message = `${parts[0]}:${parts[1]}`;

  try {
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SESSION_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message)
    );

    const bytes = new Uint8Array(signature);

    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    const expected = btoa(binary);
    const supplied = parts[2];

    if (expected.length !== supplied.length) {
      return false;
    }

    let difference = 0;

    for (let i = 0; i < expected.length; i++) {
      difference |= expected.charCodeAt(i) ^
        supplied.charCodeAt(i);
    }

    return difference === 0;
  } catch (error) {
    console.error(
      "Session verification failed:",
      error
    );

    return false;
  }
}

// ============================================================
// END OF PART 1
// PART 2 WILL CONTINUE FROM HERE.
// DO NOT DEPLOY UNTIL ALL SIX PARTS ARE COMPLETE.
// ============================================================
// ============================================================
// PART 2 OF 6: MAIN REQUEST HANDLER AND ADMIN LOGIN
// ============================================================

export async function onRequest({ request, env }) {
  try {
    if (!env.DB) {
      console.error("Cloudflare D1 binding DB is missing.");
      return fail("Database is not configured.", 500);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    const method = request.method.toUpperCase();

    await initialiseDatabase(env.DB);

    // --------------------------------------------------------
    // HEALTH CHECK
    // GET /api/health
    // --------------------------------------------------------

    if (path === "api/health" && method === "GET") {
      return json({
        ok: true,
        service: "Bright Angels Junior School API"
      });
    }

    // --------------------------------------------------------
    // ADMIN LOGIN
    // POST /api/admin/login
    // --------------------------------------------------------

    if (
      (path === "api/admin/login" ||
        path === "api/login") &&
      method === "POST"
    ) {
      const body = await readBody(request);

      if (!body) {
        return fail("Please provide valid login details.");
      }

      const email = normaliseEmail(body.email);
      const password = String(body.password || "");

      if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
        console.error("Admin login variables are missing.");
        return fail("Admin login is not configured.", 500);
      }

      if (
        email !== normaliseEmail(env.ADMIN_EMAIL) ||
        password !== env.ADMIN_PASSWORD
      ) {
        return fail("Incorrect email or password.", 401);
      }

      let token;

      try {
        token = await createSessionToken(env);
      } catch (error) {
        console.error("Session creation failed:", error);
        return fail("Admin session is not configured.", 500);
      }

      return json(
        {
          ok: true,
          message: "Login successful."
        },
        200,
        {
          "Set-Cookie": setAdminCookie(token)
        }
      );
    }

    // --------------------------------------------------------
    // ADMIN LOGOUT
    // POST /api/admin/logout
    // --------------------------------------------------------

    if (
      (path === "api/admin/logout" ||
        path === "api/logout") &&
      method === "POST"
    ) {
      return json(
        {
          ok: true,
          message: "Logged out successfully."
        },
        200,
        {
          "Set-Cookie": clearAdminCookie()
        }
      );
    }

    // --------------------------------------------------------
    // CHECK ADMIN SESSION
    // GET /api/admin/session
    // --------------------------------------------------------

    if (
      (path === "api/admin/session" ||
        path === "api/session") &&
      method === "GET"
    ) {
      const authenticated =
        await isAdminAuthenticated(request, env);

      return json({
        ok: true,
        authenticated
      });
    }

        // PUBLIC ROUTES AND ACCESS CONTROL

    const publicPaths = new Set([
      "api/health",
      "api/admin/login",
      "api/admin/logout",
      "api/admin/session",
      "api/login",
      "api/logout",
      "api/session"
    ]);

    const publicReadPaths = new Set([
  "api/announcements",
  "api/settings",
  "api/gallery"
]);

    const publicSubmissionPaths = new Set([
      "api/admissions",
      "api/messages"
    ]);

    const isApiPath = path.startsWith("api/");

    const isPublicRequest =
      publicPaths.has(path) ||
      (publicReadPaths.has(path) && method === "GET") ||
      (publicSubmissionPaths.has(path) && method === "POST");

    if (isApiPath && !isPublicRequest) {
      const authenticated = await isAdminAuthenticated(request, env);

      if (!authenticated) {
        return fail(
          "Please log in as an administrator.",
          401
        );
      }
    }

    // --------------------------------------------------------
    // PART 3 WILL ADD ADMISSIONS AND CONTACT MESSAGES HERE.
    // Keep the handler open until Part 6.
    // --------------------------------------------------------

// ------------------------------------------------------------
// ADMISSION APPLICATIONS
// POST /api/admissions: Public application submission
// GET  /api/admissions: Administrator application list
// ------------------------------------------------------------

    if (path === "api/admissions") {

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please submit a valid application.");
        }

        const childName = cleanText(
          body.child_name || body.childName,
          150
        );

        const classApplying = cleanText(
          body.class_applying || body.classApplying || body.class,
          50
        );

        const parentName = cleanText(
          body.parent_name || body.parentName,
          150
        );

        const parentPhone = cleanText(
          body.parent_phone || body.parentPhone || body.phone,
          50
        );

        const parentEmail = normaliseEmail(
          body.parent_email || body.parentEmail || body.email
        );

        const dateOfBirth = cleanText(
          body.date_of_birth || body.dateOfBirth,
          30
        );

        const gender = cleanText(body.gender, 30);

        const address = cleanText(
          body.address || body.residence,
          500
        );

        if (
          !childName ||
          !classApplying ||
          !parentName ||
          !parentPhone
        ) {
          return fail(
            "Please provide the child's name, class, parent name and phone number."
          );
               // Father's details
        const fatherName = cleanText(body.father_name, 150);
        const fatherPhone = cleanText(body.father_phone, 50);
        const fatherEmail = normaliseEmail(body.father_email);

        // Mother's details
        const motherName = cleanText(body.mother_name, 150);
        const motherPhone = cleanText(body.mother_phone, 50);
        const motherEmail = normaliseEmail(body.mother_email);

        // Previous school
        const previousSchool = cleanText(
          body.previous_school,
          200
        );

        // Emergency contact
        const emergencyContactName = cleanText(
          body.emergency_contact_name,
          150
        );

        const emergencyContactPhone = cleanText(
          body.emergency_contact_phone,
          50
        );

        const emergencyContactRelationship = cleanText(
          body.emergency_contact_relationship,
          100
        );

        // Medical and learning information
        const medicalInformation = cleanText(
          body.medical_information,
          2000
        );

        const specialLearningNeeds = cleanText(
          body.special_learning_needs,
          2000
        );
        }

                if (
          (parentEmail && !isValidEmail(parentEmail)) ||
          (fatherEmail && !isValidEmail(fatherEmail)) ||
          (motherEmail && !isValidEmail(motherEmail))
        ) {
          return fail("Please enter valid email addresses.");
      }

        const savedClasses = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = ?"
        ).bind("school_classes").first();

        let configuredClasses = DEFAULT_CLASSES;

        if (savedClasses && savedClasses.value) {
          try {
            const parsed = JSON.parse(savedClasses.value);

            if (
              Array.isArray(parsed) &&
              parsed.every(item => typeof item === "string")
            ) {
              configuredClasses = parsed;
            }
          } catch {
            console.error("Could not read configured classes.");
          }
        }

        if (!configuredClasses.includes(classApplying)) {
          return fail("Please select a valid class.");
        }
        
        const result = await env.DB.prepare(
          `INSERT INTO applications (
            child_name,
            date_of_birth,
            gender,
            class_applying,
            parent_name,
            parent_phone,
            parent_email,
            address,
            father_name,
            father_phone,
            father_email,
            mother_name,
            mother_phone,
            mother_email,
            previous_school,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            medical_information,
            special_learning_needs
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          childName,
          dateOfBirth,
          gender,
          classApplying,
          parentName,
          parentPhone,
          parentEmail,
          address,
          fatherName,
          fatherPhone,
          fatherEmail,
          motherName,
          motherPhone,
          motherEmail,
          previousSchool,
          emergencyContactName,
          emergencyContactPhone,
          emergencyContactRelationship,
          medicalInformation,
          specialLearningNeeds
        ).run();
        const applicationId = result.meta.last_row_id;

        await sendSchoolEmail(
          env,
          "New Admission Application",
          [
            "A new admission application has been submitted.",
            "",
            `Application ID: ${applicationId}`,
            `Child's name: ${childName}`,
            `Class applying for: ${classApplying}`,
            `Date of birth: ${dateOfBirth}`,
            `Gender: ${gender}`,
            `Parent/guardian: ${parentName}`,
            `Phone: ${parentPhone}`,
            `Email: ${parentEmail}`,
            `Address: ${address}`
          ].join("\n")
        );

        return json(
          {
            ok: true,
            id: applicationId,
            message: "Your application has been received."
          },
          201
        );
      }

      if (method === "GET") {
        const applications = await env.DB.prepare(
          "SELECT * FROM applications ORDER BY id DESC"
        ).all();

        return json({
          ok: true,
          applications: applications.results || []
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// CONTACT MESSAGES
// POST /api/messages: Public message submission
// GET  /api/messages: Administrator message list
// ------------------------------------------------------------

    if (path === "api/messages") {

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please submit a valid message.");
        }

        const name = cleanText(body.name, 150);
        const email = normaliseEmail(body.email);
        const phone = cleanText(body.phone, 50);
        const subject = cleanText(body.subject, 200);
        const message = cleanText(body.message, 5000);

        if (!name || !message) {
          return fail("Please provide your name and message.");
        }

        if (email && !isValidEmail(email)) {
          return fail("Please enter a valid email address.");
        }

        const result = await env.DB.prepare(
          `INSERT INTO messages (
            name,
            email,
            phone,
            subject,
            message
          ) VALUES (?, ?, ?, ?, ?)`
        ).bind(
          name,
          email,
          phone,
          subject,
          message
        ).run();

        const messageId = result.meta.last_row_id;

        await sendSchoolEmail(
          env,
          "New Website Contact Message",
          [
            "A new message was submitted through the school website.",
            "",
            `Message ID: ${messageId}`,
            `Name: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `Subject: ${subject}`,
            "",
            "Message:",
            message
          ].join("\n")
        );

        return json(
          {
            ok: true,
            id: messageId,
            message: "Your message has been received."
          },
          201
        );
      }

      if (method === "GET") {
        const messages = await env.DB.prepare(
          "SELECT * FROM messages ORDER BY id DESC"
        ).all();

        return json({
          ok: true,
          messages: messages.results || []
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// END OF PART 3
// PART 4 WILL ADD ANNOUNCEMENTS AND SETTINGS.
// DO NOT CLOSE onRequest() HERE.
// ------------------------------------------------------------
  // ============================================================
// PART 4 OF 6: ANNOUNCEMENTS AND WEBSITE SETTINGS
// ============================================================
// --------------------------------------------------------
// SCHOOL PHOTO GALLERY
// GET    /api/gallery
// POST   /api/gallery
// DELETE /api/gallery
// --------------------------------------------------------

if (path === "api/gallery") {

  // LOAD PHOTOS
  if (method === "GET") {
    const photos = await env.DB.prepare(
      "SELECT * FROM ba_gallery ORDER BY id DESC"
    ).all();

    return json({
      ok: true,
      data: photos.results || []
    });
  }

  // UPLOAD PHOTO
  if (method === "POST") {

    if (!env.IMAGEKIT_PRIVATE_KEY) {
      return fail("ImageKit is not configured.", 503);
    }

    const form = await request.formData();
    const file = form.get("file");
    const caption = cleanText(form.get("caption"), 300);

    if (!file || typeof file === "string" || !file.size) {
      return fail("Please select a photo.");
    }

    if (!file.type.startsWith("image/")) {
      return fail("Only image files are allowed.");
    }

    if (file.size > 10 * 1024 * 1024) {
      return fail("Photo must not exceed 10 MB.");
    }

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("fileName", file.name);
    uploadForm.append("folder", "/bright-angels-school");

    const response = await fetch(
      "https://upload.imagekit.io/api/v1/files/upload",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + btoa(env.IMAGEKIT_PRIVATE_KEY + ":")
        },
        body: uploadForm
      }
    );

    const uploaded = await response.json();

    if (!response.ok) {
      console.error("ImageKit upload error:", uploaded);
      return fail("Photo upload failed.", 502);
    }

    const saved = await env.DB.prepare(
      `INSERT INTO ba_gallery
       (image_url, file_id, caption)
       VALUES (?, ?, ?)`
    ).bind(
      uploaded.url,
      uploaded.fileId,
      caption
    ).run();

    return json({
      ok: true,
      id: saved.meta.last_row_id,
      url: uploaded.url
    }, 201);
  }

  // DELETE PHOTO
  if (method === "DELETE") {

    if (!env.IMAGEKIT_PRIVATE_KEY) {
      return fail("ImageKit is not configured.", 503);
    }

    const body = await readBody(request);
    const id = Number(body && body.id);

    if (!Number.isInteger(id) || id < 1) {
      return fail("A valid photo ID is required.");
    }

    const photo = await env.DB.prepare(
      "SELECT * FROM ba_gallery WHERE id = ?"
    ).bind(id).first();

    if (!photo) {
      return fail("Photo not found.", 404);
    }

    const response = await fetch(
      `https://api.imagekit.io/v1/files/${encodeURIComponent(photo.file_id)}`,
      {
        method: "DELETE",
        headers: {
          Authorization:
            "Basic " + btoa(env.IMAGEKIT_PRIVATE_KEY + ":")
        }
      }
    );

    if (!response.ok) {
      return fail("Could not delete photo from ImageKit.", 502);
    }

    await env.DB.prepare(
      "DELETE FROM ba_gallery WHERE id = ?"
    ).bind(id).run();

    return json({
      ok: true,
      message: "Photo deleted successfully."
    });
  }

  return fail("Method not allowed.", 405);
}
// ------------------------------------------------------------
// ANNOUNCEMENTS
// GET    /api/announcements: Public announcement list
// POST   /api/announcements: Admin creates announcement
// PUT    /api/announcements: Admin updates announcement
// DELETE /api/announcements: Admin deletes announcement
// ------------------------------------------------------------

    if (path === "api/announcements") {

      if (method === "GET") {
        const announcements = await env.DB.prepare(
          "SELECT * FROM announcements ORDER BY id DESC"
        ).all();

        return json({
          ok: true,
          announcements: announcements.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide announcement details.");
        }

        const title = cleanText(body.title, 200);
        const content = cleanText(
          body.content || body.message,
          5000
        );
        const date = cleanText(body.date, 30);

        if (!title || !content) {
          return fail("Announcement title and content are required.");
        }

        const result = await env.DB.prepare(
  `INSERT INTO announcements (title, body, date)
   VALUES (?, ?, ?)`
)
        bind(
          title,
          content,
          date || new Date().toISOString().slice(0, 10)
        ).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Announcement published successfully."
        }, 201);
      }

      if (method === "PUT") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide the announcement details.");
        }

        const id = Number(body.id);
        const title = cleanText(body.title, 200);
        const content = cleanText(
          body.content || body.message,
          5000
        );
        const date = cleanText(body.date, 30);

        if (!Number.isInteger(id) || id < 1) {
          return fail("A valid announcement ID is required.");
        }

        if (!title || !content) {
          return fail("Announcement title and content are required.");
        }

        const result = await env.DB.prepare(
          `UPDATE announcements
 SET title = ?, body = ?, date = ?
 WHERE id = ?`
        ).bind(
          title,
          content,
          date,
          id
        ).run();

        if (!result.meta.changes) {
          return fail("Announcement not found.", 404);
        }

        return json({
          ok: true,
          message: "Announcement updated successfully."
        });
      }

      if (method === "DELETE") {
        const body = await readBody(request);
        const id = Number(
          (body && body.id) || url.searchParams.get("id")
        );

        if (!Number.isInteger(id) || id < 1) {
          return fail("A valid announcement ID is required.");
        }

        const result = await env.DB.prepare(
          "DELETE FROM announcements WHERE id = ?"
        ).bind(id).run();

        if (!result.meta.changes) {
          return fail("Announcement not found.", 404);
        }

        return json({
          ok: true,
          message: "Announcement deleted successfully."
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// WEBSITE SETTINGS
// GET  /api/settings: Public settings
// PUT  /api/settings: Admin updates settings
//
// The public endpoint returns only the school classes.
// Other settings are kept private.
// ------------------------------------------------------------

    if (path === "api/settings") {

    if (method === "GET") {
        const row = await env.DB.prepare(
            "SELECT value FROM settings WHERE key = ?"
        ).bind("school_classes").first();

        let classes = DEFAULT_CLASSES;

        if (row?.value) {
            try {
                const parsed = JSON.parse(row.value);

                if (
                    Array.isArray(parsed) &&
                    parsed.every(item => typeof item === "string")
                ) {
                    classes = parsed;
                }
            } catch {
                console.error("Could not read school classes.");
            }
        }

        const backgroundRow = await env.DB.prepare(
            "SELECT value FROM settings WHERE key = ?"
        ).bind("background_url").first();

        return json({
            ok: true,
            settings: {
                school_classes: classes,
                background_url: backgroundRow?.value || ""
            }
        });
    }

    if (method === "PUT") {
        const body = await readBody(request);

        if (!body || typeof body !== "object") {
            return fail("Please provide valid settings.");
        }

        const suppliedClasses =
            body.school_classes || body.classes;

        if (suppliedClasses !== undefined) {
            if (!Array.isArray(suppliedClasses)) {
                return fail("School classes must be provided as a list.");
            }

            const classes = suppliedClasses
                .map(item => cleanText(item, 50))
                .filter(Boolean);

            if (
                classes.length < 1 ||
                classes.length > 20 ||
                new Set(classes).size !== classes.length
            ) {
                return fail("Provide between 1 and 20 unique class names.");
            }

            await env.DB.prepare(
                `INSERT INTO settings (key, value)
                 VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            ).bind(
                "school_classes",
                JSON.stringify(classes)
            ).run();
        }

        if (body.background_url !== undefined) {
            const backgroundUrl = cleanText(body.background_url, 1000);

            if (
                backgroundUrl &&
                !backgroundUrl.startsWith("https://ik.imagekit.io/")
            ) {
                return fail("Please select a valid school background photo.");
            }

            await env.DB.prepare(
                `INSERT INTO settings (key, value)
                 VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            ).bind("background_url", backgroundUrl).run();
        }

        return json({
            ok: true,
            message: "Website settings updated successfully."
        });
    }

    return fail("Method not allowed.", 405);
              }
    

// ------------------------------------------------------------
// END OF PART 4
// PART 5 WILL ADD STUDENTS, SUBJECTS AND MARKS.
// DO NOT CLOSE onRequest() HERE.
// ------------------------------------------------------------
  // ============================================================
// PART 5 OF 6: STUDENTS, SUBJECTS AND MARKS
// ============================================================

// ------------------------------------------------------------
// STUDENT RECORDS
// GET  /api/students: List students
// POST /api/students: Register a student
// PUT  /api/students: Update a student
// DELETE /api/students: Delete a student
// ------------------------------------------------------------

    if (path === "api/students") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM students ORDER BY class_name, full_name"
        ).all();

        return json({
          ok: true,
          students: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);
        if (!body) return fail("Please provide student details.");

        const fullName = cleanText(
          body.full_name || body.fullName || body.name, 150
        );
        const admissionNumber = cleanText(
          body.admission_number || body.admissionNumber, 80
        );
        const className = cleanText(
          body.class_name || body.className || body.class, 50
        );
        const gender = cleanText(body.gender, 30);
        const dateOfBirth = cleanText(
          body.date_of_birth || body.dateOfBirth, 30
        );
        const parentName = cleanText(
          body.parent_name || body.parentName, 150
        );
        const parentPhone = cleanText(
          body.parent_phone || body.parentPhone || body.phone, 50
        );

        if (!fullName) {
          return fail("The student's full name is required.");
        }

        if (admissionNumber) {
          const existing = await env.DB.prepare(
            "SELECT id FROM students WHERE admission_number = ?"
          ).bind(admissionNumber).first();

          if (existing) {
            return fail("That admission number is already in use.");
          }
        }

        const result = await env.DB.prepare(
          `INSERT INTO students (
            admission_number, full_name, class_name, gender,
            date_of_birth, parent_name, parent_phone
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          admissionNumber, fullName, className, gender,
          dateOfBirth, parentName, parentPhone
        ).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Student registered successfully."
        }, 201);
      }

      if (method === "PUT") {
        const body = await readBody(request);
        if (!body) return fail("Please provide student details.");

        const id = Number(body.id);
        const fullName = cleanText(
          body.full_name || body.fullName || body.name, 150
        );

        if (!Number.isInteger(id) || id < 1 || !fullName) {
          return fail("A valid student ID and full name are required.");
        }

        const admissionNumber = cleanText(
          body.admission_number || body.admissionNumber, 80
        );
        const className = cleanText(
          body.class_name || body.className || body.class, 50
        );
        const gender = cleanText(body.gender, 30);
        const dateOfBirth = cleanText(
          body.date_of_birth || body.dateOfBirth, 30
        );
        const parentName = cleanText(
          body.parent_name || body.parentName, 150
        );
        const parentPhone = cleanText(
          body.parent_phone || body.parentPhone || body.phone, 50
        );

        if (admissionNumber) {
          const existing = await env.DB.prepare(
            `SELECT id FROM students
             WHERE admission_number = ? AND id != ?`
          ).bind(admissionNumber, id).first();

          if (existing) {
            return fail("That admission number is already in use.");
          }
        }

        const result = await env.DB.prepare(
          `UPDATE students SET
            admission_number = ?, full_name = ?, class_name = ?,
            gender = ?, date_of_birth = ?, parent_name = ?,
            parent_phone = ?
           WHERE id = ?`
        ).bind(
          admissionNumber, fullName, className, gender,
          dateOfBirth, parentName, parentPhone, id
        ).run();

        if (!result.meta.changes) {
          return fail("Student not found or no changes were made.", 404);
        }

        return json({
          ok: true,
          message: "Student record updated successfully."
        });
      }

      if (method === "DELETE") {
        const body = await readBody(request);
        const id = Number(
          (body && body.id) || url.searchParams.get("id")
        );

        if (!Number.isInteger(id) || id < 1) {
          return fail("A valid student ID is required.");
        }

        const result = await env.DB.prepare(
          "DELETE FROM students WHERE id = ?"
        ).bind(id).run();

        if (!result.meta.changes) {
          return fail("Student not found.", 404);
        }

        return json({
          ok: true,
          message: "Student deleted successfully."
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// SUBJECTS
// GET /api/subjects: List subjects
// POST /api/subjects: Add subject
// PUT /api/subjects: Update subject
// DELETE /api/subjects: Delete subject
// ------------------------------------------------------------

    if (path === "api/subjects") {
      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM ba_subjects ORDER BY class_name, name"
        ).all();

        return json({
          ok: true,
          subjects: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);
        if (!body) return fail("Please provide subject details.");

        const name = cleanText(body.name, 100);
        const className = cleanText(
          body.class_name || body.className || body.class, 50
        );

        if (!name || !className) {
          return fail("Subject name and class are required.");
        }

        const result = await env.DB.prepare(
          "INSERT INTO ba_subjects (name, class_name) VALUES (?, ?)"
        ).bind(name, className).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Subject added successfully."
        }, 201);
      }

      if (method === "PUT") {
        const body = await readBody(request);
        if (!body) return fail("Please provide subject details.");

        const id = Number(body.id);
        const name = cleanText(body.name, 100);
        const className = cleanText(
          body.class_name || body.className || body.class, 50
        );

        if (!Number.isInteger(id) || id < 1 || !name || !className) {
          return fail("Valid subject ID, name and class are required.");
        }

        const result = await env.DB.prepare(
          `UPDATE ba_subjects SET name = ?, class_name = ?
           WHERE id = ?`
        ).bind(name, className, id).run();

        if (!result.meta.changes) {
          return fail("Subject not found or no changes were made.", 404);
        }

        return json({
          ok: true,
          message: "Subject updated successfully."
        });
      }

      if (method === "DELETE") {
        const body = await readBody(request);
        const id = Number(
          (body && body.id) || url.searchParams.get("id")
        );

        if (!Number.isInteger(id) || id < 1) {
          return fail("A valid subject ID is required.");
        }

        const result = await env.DB.prepare(
          "DELETE FROM ba_subjects WHERE id = ?"
        ).bind(id).run();

        if (!result.meta.changes) {
          return fail("Subject not found.", 404);
        }

        return json({
          ok: true,
          message: "Subject deleted successfully."
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// MARKS
// GET /api/marks: List marks
// POST /api/marks: Record or update a student's mark
// ------------------------------------------------------------

    if (path === "api/marks") {

      if (method === "GET") {
        const result = await env.DB.prepare(
  `SELECT marks.*,
          students.full_name AS student_name,
          students.admission_number,
          students.class_name,
          ba_subjects.name AS subject_name
   FROM marks
   LEFT JOIN students ON students.id = marks.student_id
   LEFT JOIN ba_subjects ON ba_subjects.id = marks.subject_id
   ORDER BY marks.academic_year DESC, marks.term, students.full_name`
).all();
        return json({
          ok: true,
          marks: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);
        if (!body) return fail("Please provide mark details.");

        const studentId = Number(body.student_id || body.studentId);
        const subjectId = Number(body.subject_id || body.subjectId);
        const term = cleanText(body.term, 50);
        const academicYear = cleanText(
          body.academic_year || body.academicYear || body.year, 20
        );
        const score = Number(body.score);
        const remarks = cleanText(body.remarks, 500);

        if (
          !Number.isInteger(studentId) || studentId < 1 ||
          !Number.isInteger(subjectId) || subjectId < 1 ||
          !term || !academicYear ||
          !Number.isFinite(score) || score < 0 || score > 100
        ) {
          return fail(
            "Provide valid student, subject, term, year and a score from 0 to 100."
          );
        }
const student = await env.DB.prepare(
  "SELECT id FROM students WHERE id = ?"
).bind(studentId).first();
        const subject = await env.DB.prepare(
  "SELECT id FROM ba_subjects WHERE id = ?"
).bind(subjectId).first();

     if (!student || !subject) {
  return fail("The selected student or subject does not exist.");
}

const assessmentType = cleanText(
  body.assessment_type || body.assessmentType || "Exam",
  50
);

const maximumMarks = Number(
  body.maximum_marks || body.maximumMarks || 100
);

if (
  !Number.isFinite(maximumMarks) ||
  maximumMarks <= 0 ||
  score < 0 ||
  score > maximumMarks
) {
  return fail("Enter a valid score and maximum mark.");
}

await env.DB.prepare(
  `INSERT INTO marks (
    student_id, subject_id, term, academic_year,
    assessment_type, marks_obtained, maximum_marks, remarks
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(
    student_id, subject_id, academic_year, term, assessment_type
  )
  DO UPDATE SET
    marks_obtained = excluded.marks_obtained,
    maximum_marks = excluded.maximum_marks,
    remarks = excluded.remarks`
).bind(
  studentId,
  subjectId,
  term,
  academicYear,
  assessmentType,
  score,
  maximumMarks,
  remarks
).run();

return json({
  ok: true,
  message: "Student mark saved successfully."
}, 201);   
      }
    }

// ------------------------------------------------------------
// END OF PART 5
// PART 6 WILL ADD FEES, REPORT CARDS AND CLOSE THE HANDLER.
// DO NOT DEPLOY YET.
// ------------------------------------------------------------
  // ============================================================
// PART 6 OF 6: FEES, REPORT CARDS AND FINAL HANDLER CLOSURE
// ============================================================

// ------------------------------------------------------------
// SCHOOL FEES
// GET    /api/fees: List fee records
// POST   /api/fees: Record or update fee information
// PUT    /api/fees: Update fee information
// DELETE /api/fees: Delete a fee record
// ------------------------------------------------------------

    if (path === "api/fees") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          `SELECT fees.*,
                  students.full_name AS student_name,
                  students.admission_number,
                  students.class_name
           FROM fees
           LEFT JOIN students ON students.id = fees.student_id
           ORDER BY fees.academic_year DESC, fees.term, students.full_name`
        ).all();

        return json({
          ok: true,
          fees: result.results || []
        });
      }

      if (method === "POST" || method === "PUT") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide valid fee details.");
        }

        const id = Number(body.id || 0);
        const studentId = Number(body.student_id || body.studentId);
        const academicYear = cleanText(
          body.academic_year || body.academicYear || body.year,
          20
        );
        const term = cleanText(body.term, 50);
        const amountDue = Number(body.amount_due ?? body.amountDue);
        const amountPaid = Number(body.amount_paid ?? body.amountPaid);
        const notes = cleanText(body.notes, 1000);

        if (
          !Number.isInteger(studentId) || studentId < 1 ||
          !academicYear || !term ||
          !Number.isFinite(amountDue) || amountDue < 0 ||
          !Number.isFinite(amountPaid) || amountPaid < 0
        ) {
          return fail(
            "Provide a valid student, academic year, term, amount due and amount paid."
          );
        }

        const student = await env.DB.prepare(
          "SELECT id FROM students WHERE id = ?"
        ).bind(studentId).first();

        if (!student) {
          return fail("The selected student does not exist.");
        }

        const balance = Math.max(0, amountDue - amountPaid);

        if (method === "PUT") {
          if (!Number.isInteger(id) || id < 1) {
            return fail("A valid fee record ID is required.");
          }

          const result = await env.DB.prepare(
            `UPDATE fees SET
              student_id = ?,
              academic_year = ?,
              term = ?,
              amount_due = ?,
              amount_paid = ?,
              balance = ?,
              notes = ?
             WHERE id = ?`
          ).bind(
            studentId,
            academicYear,
            term,
            amountDue,
            amountPaid,
            balance,
            notes,
            id
          ).run();

          if (!result.meta.changes) {
            return fail("Fee record not found or no changes were made.", 404);
          }

          return json({
            ok: true,
            message: "Fee record updated successfully.",
            balance
          });
        }

        const result = await env.DB.prepare(
          `INSERT INTO fees (
            student_id, academic_year, term,
            amount_due, amount_paid, balance, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          studentId,
          academicYear,
          term,
          amountDue,
          amountPaid,
          balance,
          notes
        ).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          balance,
          message: "Fee record saved successfully."
        }, 201);
      }

      if (method === "DELETE") {
        const body = await readBody(request);
        const id = Number(
          (body && body.id) || url.searchParams.get("id")
        );

        if (!Number.isInteger(id) || id < 1) {
          return fail("A valid fee record ID is required.");
        }

        const result = await env.DB.prepare(
          "DELETE FROM fees WHERE id = ?"
        ).bind(id).run();

        if (!result.meta.changes) {
          return fail("Fee record not found.", 404);
        }

        return json({
          ok: true,
          message: "Fee record deleted successfully."
        });
      }

      return fail("Method not allowed.", 405);
    }

// ------------------------------------------------------------
// STUDENT REPORT CARD
// GET /api/report-card?student_id=1&term=Term%201&year=2026
// ------------------------------------------------------------

    if (path === "api/report-card" && method === "GET") {
      const studentId = Number(
        url.searchParams.get("student_id") ||
        url.searchParams.get("studentId")
      );

      const term = cleanText(url.searchParams.get("term"), 50);
      const academicYear = cleanText(
        url.searchParams.get("year") ||
        url.searchParams.get("academic_year"),
        20
      );

      if (
        !Number.isInteger(studentId) || studentId < 1 ||
        !term || !academicYear
      ) {
        return fail(
          "Provide a valid student ID, term and academic year."
        );
      }

      const student = await env.DB.prepare(
        `SELECT id, admission_number, full_name, class_name,
                gender, parent_name, parent_phone
         FROM students
         WHERE id = ?`
      ).bind(studentId).first();

      if (!student) {
        return fail("Student not found.", 404);
      }

      const marksResult = await env.DB.prepare(
        `SELECT subjects.name AS subject_name,
                marks.score,
                marks.remarks
         FROM marks
         INNER JOIN subjects ON subjects.id = marks.subject_id
         WHERE marks.student_id = ?
           AND marks.term = ?
           AND marks.academic_year = ?
         ORDER BY subjects.name`
      ).bind(studentId, term, academicYear).all();

      const marks = marksResult.results || [];
      const total = marks.reduce(
        (sum, item) => sum + Number(item.score || 0),
        0
      );

      const average = marks.length ? total / marks.length : 0;

      let overallGrade = "N/A";

      if (marks.length) {
        if (average >= 80) overallGrade = "A";
        else if (average >= 70) overallGrade = "B";
        else if (average >= 60) overallGrade = "C";
        else if (average >= 50) overallGrade = "D";
        else overallGrade = "E";
      }

      const feeResult = await env.DB.prepare(
        `SELECT COALESCE(SUM(amount_due), 0) AS total_due,
                COALESCE(SUM(amount_paid), 0) AS total_paid,
                COALESCE(SUM(balance), 0) AS total_balance
         FROM fees
         WHERE student_id = ?
           AND term = ?
           AND academic_year = ?`
      ).bind(studentId, term, academicYear).first();

      return json({
        ok: true,
        report_card: {
          student,
          term,
          academic_year: academicYear,
          subjects: marks,
          total_marks: total,
          average: Number(average.toFixed(2)),
          overall_grade: overallGrade,
          fee_summary: feeResult || {
            total_due: 0,
            total_paid: 0,
            total_balance: 0
          }
        }
      });
    }

// ------------------------------------------------------------
// UNKNOWN ROUTE
// ------------------------------------------------------------

    if (path.startsWith("api/")) {
      return fail("API endpoint not found.", 404);
    }

    return fail("Not found.", 404);
  } catch (error) {
    console.error("Bright Angels API error:", error);
    return json({
      ok: false,
      error: error.message || String(error)
    }, 500);
  }
}
