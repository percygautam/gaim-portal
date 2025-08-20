
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { google } = require("googleapis");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const SHEET_ID = process.env.SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

const app = express();

app.use(
  session({
    name: "sid",
    secret: "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new GoogleStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      console.log("DEBUG accessToken:", accessToken);
      console.log("DEBUG profile:", profile);
      return done(null, profile);
    }
  )
);

/**
 * Get destination website for given email
 * Spreadsheet layout:
 * Row 1: websites
 * Row 2 onwards: allowed emails in each website's column
 */
async function getUserDestination(email) {
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A:Z", // adjust if more columns
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return null;

  const websites = rows[0];       // row 1 → websites
  const emailRows = rows.slice(1); // row 2+ → emails

  // Loop through columns
  for (let col = 0; col < websites.length; col++) {
    for (let row = 0; row < emailRows.length; row++) {
      const sheetEmail = emailRows[row][col];
      if (sheetEmail && sheetEmail.toLowerCase() === email.toLowerCase()) {
        return websites[col] || null; // matched email → return its website
      }
    }
  }

  return null; // no match
}

// Root route
app.get("/", async (req, res) => {
  if (!req.isAuthenticated()) {
    // Landing page
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>GAIM Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: Times, sans-serif;
      overflow: hidden;
      position: relative;
      background-color: #0d0c1f;
    }
    body::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: linear-gradient(135deg,
        #0a1828,
        #1f2a40,
        #313d5a,
        #4a4e69,
        #382d5a,
        #2a1e40
      );
      background-size: 400% 400%;
      animation: ultraLuxuriousGradientAnimation 30s ease infinite;
      z-index: -1;
      opacity: 0.95;
    }
    @keyframes ultraLuxuriousGradientAnimation {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center hover:scale-105 transition">
    <img src="https://res.cloudinary.com/deubeu16b/image/upload/v1750868607/logo_aqw2pq.png"
         alt="GAIM Logo"
         class="h-16 md:h-20 w-auto mx-auto mb-8 rounded-lg object-contain"
         onerror="this.onerror=null; this.src='https://placehold.co/180x60/0a1828/ffffff?text=GAIM+Logo+Fallback';" />
    <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">GAIM Portal</h1>
    <p class="text-lg md:text-xl text-gray-600 mb-10">Login with your Gmail ID to get started</p>
    <a href="/auth/google"
       class="inline-flex items-center justify-center px-10 py-4 bg-gradient-to-r from-blue-700 to-purple-800 text-white text-xl font-bold rounded-full shadow-lg hover:shadow-xl transition transform hover:-translate-y-1">
      Login
    </a>
    <div class="mt-12 text-sm text-gray-500">© 2025 HM&A Partners LLP. All rights reserved.</div>
  </div>
</body>
</html>`);
  }

  // Authenticated path
  const email = req.user.emails[0].value;
  const name = req.user.displayName || email.split("@")[0];
  const destination = await getUserDestination(email);

  if (!destination) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8"/><title>Not authorized</title></head>
  <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial,sans-serif;">
    <div>
      <h2>Not authorized</h2>
      <p>${email} is not allowed.</p>
      <a href="/logout">Go Back</a>
    </div>
  </body>
</html>`);
  }

  // Authorized → buffer + navbar + iframe + logout animation
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GAIM - Dashboard</title>
  <style>
    body,html { margin:0; padding:0; height:100%; width:100%; font-family:'Times New Roman', Times, serif; }
    /* Buffers */
    #buffer, #logoutBuffer {
      display:flex; justify-content:center; align-items:center; height:100vh;
      background:#f5f5f5; flex-direction:column;
      position:fixed; top:0; left:0; right:0; bottom:0; z-index:2000;
    }
    #buffer { z-index:2000; }
    /* logoutBuffer initially hidden */
    #logoutBuffer { display:none; z-index:2001; }
    #main { display:none; height:100%; width:100%; }
    .spinner {
      border:6px solid #f3f3f3;
      border-top:6px solid #4285F4;
      border-radius:50%;
      width:50px; height:50px;
      animation:spin 1s linear infinite;
      margin-bottom:20px;
    }
    @keyframes spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }

    /* Navbar */
    .navbar {
      position: fixed; top:0; left:0; right:0; height:60px;
      background: linear-gradient(90deg, #4285F4, #6a11cb);
      color: white; display:flex; align-items:center; justify-content:space-between;
      padding:0 20px; font-size:16px; font-weight:bold; z-index:1000;
      box-shadow:0 2px 5px rgba(0,0,0,0.2);
      font-family:'Times New Roman', Times, serif;
    }

    iframe { width:100%; height:calc(100vh - 60px); border:none; margin-top:60px; display:block; }

    .logout-btn {
      background:#ff4b5c; border:none; padding:8px 16px; border-radius:6px;
      color:white; cursor:pointer; font-size:14px; font-weight:bold; font-family:'Times New Roman', Times, serif;
      transition: background 0.3s;
    }
    .logout-btn:hover { background:#e63946; }
  </style>
</head>
<body>
  <!-- Login buffer (shown initially) -->
  <div id="buffer" aria-hidden="true">
    <div class="spinner" role="progressbar" aria-label="Loading"></div>
    <h3>Loading your dashboard...</h3>
  </div>

  <!-- Logout buffer (hidden until logout) -->
  <div id="logoutBuffer" aria-hidden="true" style="display:none;">
    <div class="spinner" role="progressbar" aria-label="Logging out"></div>
    <h3>Logging you out...</h3>
  </div>

  <!-- Main content -->
  <div id="main" aria-hidden="true">
    <div class="navbar">
      <div>👋 Hi, ${escapeHtml(name)}</div>
      <button class="logout-btn" id="logoutBtn">Logout</button>
    </div>

    <iframe id="targetFrame" src="https://${escapeAttr(destination)}" title="Wrapped site"></iframe>
  </div>

  <script>
    // Show main after loading buffer (login animation)
    setTimeout(function() {
      var buf = document.getElementById('buffer');
      var main = document.getElementById('main');
      if (buf) buf.style.display = 'none';
      if (main) main.style.display = 'block';
    }, 2000);

    // Logout with animation
    document.getElementById('logoutBtn').addEventListener('click', function (e) {
      e.preventDefault();
      // hide main
      var main = document.getElementById('main');
      if (main) main.style.display = 'none';
      // show logout buffer
      var lb = document.getElementById('logoutBuffer');
      if (lb) lb.style.display = 'flex';
      // after animation redirect to server logout which destroys session & cookie
      setTimeout(function() {
        window.location.href = '/logout';
      }, 2000);
    });

    // Small helpers to avoid accidental template injection (these are executed server-side before sending)
  </script>
</body>
</html>`);
});

// Safe escaping helpers (server-side)
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(str) {
  if (!str) return "";
  return String(str)
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/&/g, '%26')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
}

// Logout route
app.get("/logout", (req, res, next) => {
  // passport v0.6 provides req.logout with callback
  req.logout(function(err) {
    if (err) return next(err);

    // Destroy session fully
    req.session.destroy(function (err) {
      if (err) {
        // still attempt to clear cookie & redirect
        res.clearCookie("sid", { path: "/" });
        return res.redirect("/");
      }

      // Clear cookie from browser
      res.clearCookie("sid", { path: "/" });
      // Redirect to login
      return res.redirect("/");
    });
  });
});

// Google auth routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/api/auth/callback/google",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
