// ============================================================
// BRIGHT ANGELS JUNIOR SCHOOL
// Cloudflare Pages API
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

// ------------------------------------------------------------
// RESPONSE HELPERS
// ------------------------------------------------------------

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

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store"
    }
  });
}

// ------------------------------------------------------------
// REQUEST HELPERS
// ------------------------------------------------------------

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
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator < 0) {
      continue;
    }

    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

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

function setAdminCookie(value) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
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

// ------------------------------------------------------------
// EMAIL NOTIFICATIONS
// ------------------------------------------------------------

async function sendSchoolEmail(env, subject, message) {
  if (
    !env.RESEND_API_KEY ||
    !env.EMAIL_FROM ||
    !env.EMAIL_TO
  ) {
    console.error(
      "Email configuration is incomplete."
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
        await response.text()
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Email request failed:",
      error
    );

    return false;
  }
}

// ------------------------------------------------------------
// DATABASE INITIALISATION
// ------------------------------------------------------------

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
      UNIQUE(student_id, subject_id, term, academic_year)
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
    )`

  ];

  for (const statement of statements) {
    await db.prepare(statement).run();
  }

  // Store the school's default class list if it is not
  // already configured.
  await db.prepare(
    `INSERT OR IGNORE INTO settings (key, value)
     VALUES (?, ?)`
  ).bind(
    "school_classes",
    JSON.stringify(DEFAULT_CLASSES)
  ).run();
}

// ------------------------------------------------------------
// ADMIN SESSION HELPERS
// ------------------------------------------------------------

async function createSessionToken(env) {
  const secret = env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured."
    );
  }

  const timestamp = Date.now().toString();
  const message = `${timestamp}:${crypto.randomUUID()}`;

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
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

  const signatureBytes = new Uint8Array(signature);

  let binary = "";

  for (const byte of signatureBytes) {
    binary += String.fromCharCode(byte);
  }

  const encodedSignature = btoa(binary);

  return `${message}:${encodedSignature}`;
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
    Date.now() - timestamp >
      SESSION_DURATION * 1000 ||
    timestamp > Date.now()
  ) {
    return false;
  }

  const message = `${parts[0]}:${parts[1]}`;
  const suppliedSignature = parts[2];

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

    const signatureBytes = new Uint8Array(signature);

    let binary = "";

    for (const byte of signatureBytes) {
      binary += String.fromCharCode(byte);
    }

    const expectedSignature = btoa(binary);

    return suppliedSignature === expectedSignature;
  } catch (error) {
    console.error(
      "Session verification failed:",
      error
    );

    return false;
  }
}

// ============================================================
// PART 2 WILL CONTINUE HERE.
// Do not add another opening onRequest function.
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

    // Initialise the required database tables.
    await initialiseDatabase(env.DB);

    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (path === "api/health" && method === "GET") {
      return json({
        ok: true,
        service: "Bright Angels Junior School API"
      });
    }

    // --------------------------------------------------------
    // ADMIN LOGIN
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
        console.error("Admin login configuration is missing.");
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
        console.error("Could not create admin session:", error);
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

    // --------------------------------------------------------
    // ADMIN ROUTE PROTECTION
    // --------------------------------------------------------

    const publicPaths = new Set([
      "api/health",
      "api/login",
      "api/logout",
      "api/session",
      "api/admin/login",
      "api/admin/logout",
      "api/admin/session",
      "api/admissions",
      "api/messages",
      "api/announcements",
      "api/settings"
    ]);

    const isApiPath = path.startsWith("api/");
    const isPublicPath = publicPaths.has(path);

    if (isApiPath && !isPublicPath) {
      const authenticated =
        await isAdminAuthenticated(request, env);

      if (!authenticated) {
        return fail("Please log in as an administrator.", 401);
      }
    }

    // --------------------------------------------------------
    // PART 3 WILL ADD PUBLIC ADMISSIONS AND MESSAGES.
    // --------------------------------------------------------

    return fail("API route not found.", 404);

  } catch (error) {
    console.error("Bright Angels API error:", error);

    return fail(
      "The server encountered an error. Check Cloudflare logs.",
      500
    );
  }
       }
    // --------------------------------------------------------
    // PUBLIC ADMISSION APPLICATIONS
    // POST /api/admissions
    // GET /api/admissions (admin only)
    // --------------------------------------------------------

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
        }

        if (parentEmail && !isValidEmail(parentEmail)) {
          return fail("Please enter a valid parent email address.");
        }

        const allowedClasses = DEFAULT_CLASSES;

        if (!allowedClasses.includes(classApplying)) {
          const savedClasses = await env.DB.prepare(
            "SELECT value FROM settings WHERE key = ?"
          ).bind("school_classes").first();

          let configuredClasses = allowedClasses;

          if (savedClasses && savedClasses.value) {
            try {
              const parsed = JSON.parse(savedClasses.value);

              if (Array.isArray(parsed)) {
                configuredClasses = parsed;
              }
            } catch (error) {
              console.error("Could not read configured classes.");
            }
          }

          if (!configuredClasses.includes(classApplying)) {
            return fail("Please select a valid class.");
          }
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
            address
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          childName,
          dateOfBirth,
          gender,
          classApplying,
          parentName,
          parentPhone,
          parentEmail,
          address
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

    // --------------------------------------------------------
    // PUBLIC CONTACT MESSAGES
    // POST /api/messages
    // GET /api/messages (admin only)
    // --------------------------------------------------------

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
    // --------------------------------------------------------
    // ANNOUNCEMENTS
    // GET /api/announcements: public
    // POST /api/announcements: admin only
    // DELETE /api/announcements?id=1: admin only
    // --------------------------------------------------------

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
          return fail("Please provide valid announcement details.");
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
          `INSERT INTO announcements (title, content, date)
           VALUES (?, ?, ?)`
        ).bind(
          title,
          content,
          date || new Date().toISOString().slice(0, 10)
        ).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Announcement published."
        }, 201);
      }

      if (method === "DELETE") {
        const id = Number(url.searchParams.get("id"));

        if (!Number.isInteger(id) || id <= 0) {
          return fail("A valid announcement ID is required.");
        }

        await env.DB.prepare(
          "DELETE FROM announcements WHERE id = ?"
        ).bind(id).run();

        return json({
          ok: true,
          message: "Announcement deleted."
        });
      }

      return fail("Method not allowed.", 405);
    }

    // --------------------------------------------------------
    // WEBSITE SETTINGS
    // GET /api/settings: public
    // POST /api/settings: admin only
    // --------------------------------------------------------

    if (path === "api/settings") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT key, value FROM settings"
        ).all();

        const settings = {};

        for (const row of result.results || []) {
          settings[row.key] = row.value;
        }

        return json({
          ok: true,
          settings
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return fail("Please provide valid website settings.");
        }

        const reservedKeys = new Set([
          "admin_password",
          "admin_email",
          "session_secret",
          "resend_api_key"
        ]);

        const entries = Object.entries(body);

        if (entries.length === 0) {
          return fail("No settings were provided.");
        }

        if (entries.length > 100) {
          return fail("Too many settings were submitted.");
        }

        const statements = [];

        for (const [key, value] of entries) {
          const safeKey = cleanText(key, 100);

          if (
            !safeKey ||
            reservedKeys.has(safeKey.toLowerCase())
          ) {
            return fail("One or more setting names are not allowed.");
          }

          let safeValue;

          if (typeof value === "string") {
            safeValue = value.slice(0, 10000);
          } else {
            safeValue = JSON.stringify(value);

            if (safeValue.length > 10000) {
              return fail(`Setting "${safeKey}" is too large.`);
            }
          }

          statements.push(
            env.DB.prepare(
              `INSERT INTO settings (key, value)
               VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            ).bind(safeKey, safeValue)
          );
        }

        await env.DB.batch(statements);

        return json({
          ok: true,
          message: "Website settings saved."
        });
      }

      return fail("Method not allowed.", 405);
    }
    // --------------------------------------------------------
    // STUDENTS
    // GET /api/students
    // POST /api/students
    // DELETE /api/students?id=1
    // --------------------------------------------------------

    if (path === "api/students") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM students ORDER BY full_name ASC"
        ).all();

        return json({
          ok: true,
          students: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide valid student details.");
        }

        const fullName = cleanText(
          body.full_name || body.fullName || body.name,
          200
        );

        const admissionNumber = cleanText(
          body.admission_number || body.admissionNumber,
          100
        );

        const className = cleanText(
          body.class_name || body.className || body.class,
          50
        );

        const gender = cleanText(body.gender, 30);
        const dateOfBirth = cleanText(
          body.date_of_birth || body.dateOfBirth,
          30
        );

        const parentName = cleanText(
          body.parent_name || body.parentName,
          150
        );

        const parentPhone = cleanText(
          body.parent_phone || body.parentPhone,
          50
        );

        if (!fullName || !className) {
          return fail("Student name and class are required.");
        }

        const result = await env.DB.prepare(
          `INSERT INTO students (
            admission_number,
            full_name,
            class_name,
            gender,
            date_of_birth,
            parent_name,
            parent_phone
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          admissionNumber,
          fullName,
          className,
          gender,
          dateOfBirth,
          parentName,
          parentPhone
        ).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Student added successfully."
        }, 201);
      }

      if (method === "DELETE") {
        const id = Number(url.searchParams.get("id"));

        if (!Number.isInteger(id) || id <= 0) {
          return fail("A valid student ID is required.");
        }

        await env.DB.prepare(
          "DELETE FROM students WHERE id = ?"
        ).bind(id).run();

        return json({
          ok: true,
          message: "Student deleted."
        });
      }

      return fail("Method not allowed.", 405);
    }

    // --------------------------------------------------------
    // SUBJECTS
    // GET /api/subjects
    // POST /api/subjects
    // DELETE /api/subjects?id=1
    // --------------------------------------------------------

    if (path === "api/subjects") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM subjects ORDER BY class_name, name"
        ).all();

        return json({
          ok: true,
          subjects: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide valid subject details.");
        }

        const name = cleanText(body.name, 150);
        const className = cleanText(
          body.class_name || body.className || body.class,
          50
        );

        if (!name || !className) {
          return fail("Subject name and class are required.");
        }

        const result = await env.DB.prepare(
          `INSERT INTO subjects (name, class_name)
           VALUES (?, ?)`
        ).bind(name, className).run();

        return json({
          ok: true,
          id: result.meta.last_row_id,
          message: "Subject added successfully."
        }, 201);
      }

      if (method === "DELETE") {
        const id = Number(url.searchParams.get("id"));

        if (!Number.isInteger(id) || id <= 0) {
          return fail("A valid subject ID is required.");
        }

        await env.DB.prepare(
          "DELETE FROM subjects WHERE id = ?"
        ).bind(id).run();

        return json({
          ok: true,
          message: "Subject deleted."
        });
      }

      return fail("Method not allowed.", 405);
    }

    // --------------------------------------------------------
    // MARKS
    // GET /api/marks
    // POST /api/marks
    // --------------------------------------------------------

    if (path === "api/marks") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          `SELECT
             marks.*,
             students.full_name AS student_name,
             students.admission_number,
             students.class_name,
             subjects.name AS subject_name
           FROM marks
           LEFT JOIN students ON students.id = marks.student_id
           LEFT JOIN subjects ON subjects.id = marks.subject_id
           ORDER BY marks.academic_year DESC,
                    marks.term,
                    students.full_name`
        ).all();

        return json({
          ok: true,
          marks: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide valid marks.");
        }

        const studentId = Number(
          body.student_id || body.studentId
        );

        const subjectId = Number(
          body.subject_id || body.subjectId
        );

        const term = cleanText(body.term, 30);
        const academicYear = cleanText(
          body.academic_year || body.academicYear || body.year,
          20
        );

        const score = Number(body.score);
        const remarks = cleanText(body.remarks, 500);

        if (
          !Number.isInteger(studentId) ||
          studentId <= 0 ||
          !Number.isInteger(subjectId) ||
          subjectId <= 0
        ) {
          return fail("Select a valid student and subject.");
        }

        if (
          !term ||
          !academicYear ||
          !Number.isFinite(score) ||
          score < 0 ||
          score > 100
        ) {
          return fail(
            "Enter a valid term, academic year and score from 0 to 100."
          );
        }

        const student = await env.DB.prepare(
          "SELECT id FROM students WHERE id = ?"
        ).bind(studentId).first();

        if (!student) {
          return fail("The selected student was not found.");
        }

        const subject = await env.DB.prepare(
          "SELECT id FROM subjects WHERE id = ?"
        ).bind(subjectId).first();

        if (!subject) {
          return fail("The selected subject was not found.");
        }

        await env.DB.prepare(
          `INSERT INTO marks (
            student_id,
            subject_id,
            term,
            academic_year,
            score,
            remarks
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (
            student_id,
            subject_id,
            term,
            academic_year
          ) DO UPDATE SET
            score = excluded.score,
            remarks = excluded.remarks`
        ).bind(
          studentId,
          subjectId,
          term,
          academicYear,
          score,
          remarks
        ).run();

        return json({
          ok: true,
          message: "Marks saved successfully."
        }, 201);
      }

      return fail("Method not allowed.", 405);
         }
    // --------------------------------------------------------
    // SCHOOL FEES
    // GET /api/fees
    // POST /api/fees
    // --------------------------------------------------------

    if (path === "api/fees") {

      if (method === "GET") {
        const result = await env.DB.prepare(
          `SELECT
             fees.*,
             students.full_name AS student_name,
             students.admission_number,
             students.class_name
           FROM fees
           LEFT JOIN students ON students.id = fees.student_id
           ORDER BY fees.id DESC`
        ).all();

        return json({
          ok: true,
          fees: result.results || []
        });
      }

      if (method === "POST") {
        const body = await readBody(request);

        if (!body) {
          return fail("Please provide valid school-fee details.");
        }

        const studentId = Number(
          body.student_id || body.studentId
        );

        const academicYear = cleanText(
          body.academic_year || body.academicYear || body.year,
          20
        );

        const term = cleanText(body.term, 30);
        const amountDue = Number(
          body.amount_due ?? body.amountDue
        );

        const amountPaid = Number(
          body.amount_paid ?? body.amountPaid ?? 0
        );

        const notes = cleanText(body.notes, 1000);

        if (
          !Number.isInteger(studentId) ||
          studentId <= 0
        ) {
          return fail("Select a valid student.");
        }

        if (!academicYear || !term) {
          return fail("Academic year and term are required.");
        }

        if (
          !Number.isFinite(amountDue) ||
          !Number.isFinite(amountPaid) ||
          amountDue < 0 ||
          amountPaid < 0
        ) {
          return fail("Enter valid fee amounts.");
        }

        const student = await env.DB.prepare(
          "SELECT id FROM students WHERE id = ?"
        ).bind(studentId).first();

        if (!student) {
          return fail("The selected student was not found.");
        }

        const balance = amountDue - amountPaid;

        const result = await env.DB.prepare(
          `INSERT INTO fees (
            student_id,
            academic_year,
            term,
            amount_due,
            amount_paid,
            balance,
            notes
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
          message: "School fees saved successfully."
        }, 201);
      }

      return fail("Method not allowed.", 405);
    }

    // --------------------------------------------------------
    // REPORT CARDS
    // GET /api/report-cards?student_id=1&term=Term%201&year=2026
    // --------------------------------------------------------

    if (path === "api/report-cards" && method === "GET") {
      const studentId = Number(
        url.searchParams.get("student_id")
      );

      const term = cleanText(
        url.searchParams.get("term"),
        30
      );

      const academicYear = cleanText(
        url.searchParams.get("year"),
        20
      );

      if (
        !Number.isInteger(studentId) ||
        studentId <= 0 ||
        !term ||
        !academicYear
      ) {
        return fail(
          "Provide a valid student ID, term and academic year."
        );
      }

      const student = await env.DB.prepare(
        "SELECT * FROM students WHERE id = ?"
      ).bind(studentId).first();

      if (!student) {
        return fail("Student not found.", 404);
      }

      const marksResult = await env.DB.prepare(
        `SELECT
           subjects.name AS subject_name,
           marks.score,
           marks.remarks
         FROM marks
         INNER JOIN subjects ON subjects.id = marks.subject_id
         WHERE marks.student_id = ?
           AND marks.term = ?
           AND marks.academic_year = ?
         ORDER BY subjects.name`
      ).bind(
        studentId,
        term,
        academicYear
      ).all();

      const feeResult = await env.DB.prepare(
        `SELECT
           amount_due,
           amount_paid,
           balance,
           notes
         FROM fees
         WHERE student_id = ?
           AND term = ?
           AND academic_year = ?
         ORDER BY id DESC
         LIMIT 1`
      ).bind(
        studentId,
        term,
        academicYear
      ).first();

      const marks = marksResult.results || [];

      const total = marks.reduce(
        (sum, item) => sum + Number(item.score || 0),
        0
      );

      const average = marks.length
        ? Math.round((total / marks.length) * 100) / 100
        : 0;

      return json({
        ok: true,
        student,
        term,
        academic_year: academicYear,
        subjects: marks,
        total,
        average,
        subject_count: marks.length,
        fees: feeResult || {
          amount_due: 0,
          amount_paid: 0,
          balance: 0,
          notes: ""
        }
      });
    }

    // --------------------------------------------------------
    // UNKNOWN ROUTE
    // --------------------------------------------------------

    return fail("API route not found.", 404);
