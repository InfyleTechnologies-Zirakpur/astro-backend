const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
require("dotenv").config();

const connectDB = require("./config/db");
const { setupChatSockets } = require("./services/chatSocketService");
const { setIo } = require("./services/socketHub");

const app = express();
const httpServer = http.createServer(app);

// Database
connectDB();

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
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

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Matchmaking API is running" });
});

// Routes
app.use("/api/auth", require("./routes/authRoute"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/questionnaire", require("./routes/questionnaireRoutes"));
app.use("/api/horoscope", require("./routes/horoscopeRoutes"));
app.use("/api/matchmaking", require("./routes/matchMakingRoute"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));
app.use("/api/astro-qa", require("./routes/astroQARoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});
setupChatSockets(io);
setIo(io);

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

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

