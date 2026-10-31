const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
require("dotenv").config();

const connectDB = require("./config/db");
const { setupChatSockets } = require("./services/chatSocketService");
const { setIo } = require("./services/socketHub");
const { startBillingSweep } = require("./services/consultationBilling");

const app = express();
const httpServer = http.createServer(app);

// Behind Render's proxy this is required so rate limiting sees the real
// client IP instead of the proxy's (which would throttle every user as one).
app.set("trust proxy", 1);

// Database
connectDB();

// Allowed browser origins in production: CLIENT_URL plus optional comma
// separated CORS_ORIGINS (e.g. the admin panel's URL). With none configured
// the server keeps the permissive behaviour so a missing var can't break
// production.
const configuredOrigins = [
  ...(process.env.CLIENT_URL || "").split(","),
  ...(process.env.CORS_ORIGINS || "").split(","),
]
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin =
  process.env.NODE_ENV === "production" && configuredOrigins.length
    ? configuredOrigins
    : true;

// Middleware
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Security headers. CSP is off because this is a JSON API (the admin SPA
// serves its own HTML) and uploads must stay loadable cross-origin.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Global throttle; auth endpoints get a much tighter bucket below.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later" },
  })
);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later" },
});

app.use(express.json({
  verify: (req, res, buf) => {
    // Keep raw bytes for Razorpay webhook HMAC verification
    if (req.originalUrl && req.originalUrl.includes("/api/wallet/webhook")) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Matchmaking API is running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running"
  });
});


app.use("/api/auth", authLimiter, require("./routes/authRoute"));
app.use("/api/admin", authLimiter, require("./routes/adminRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/questionnaire", require("./routes/questionnaireRoutes"));
app.use("/api/horoscope", require("./routes/horoscopeRoutes"));
app.use("/api/matchmaking", require("./routes/matchMakingRoute"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));
app.use("/api/astrologers", require("./routes/astrologerRoutes"));
app.use("/api/consultations", require("./routes/consultationRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/astrologer", require("./routes/astrologerDashboardRoutes"));
app.use("/api/astro-qa", require("./routes/astroQARoutes"));
app.use("/api/numerology", require("./routes/numerologyRoutes"));
app.use("/api/kundli", require("./routes/kundliRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/health", require("./routes/healthRoutes"));


const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});
setupChatSockets(io);
setIo(io);

// Consultation billing runs on a timer, not only when someone types: this is
// what debits each started paid minute and stops a chat/call the moment the
// client's paid minutes are over — even during a silent voice call.
startBillingSweep();

app.use((error, req, res, next) => {
  if (error instanceof require("multer").MulterError || error.message?.includes("are allowed")) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error.name === "ValidationError") return res.status(422).json({ success: false, message: "Validation failed" });
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A record with that value already exists" });
  if (error.name === "CastError") return res.status(400).json({ success: false, message: "Invalid identifier" });
  if (error.expose && error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: "Something went wrong" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, httpServer };

