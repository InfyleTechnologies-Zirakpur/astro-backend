const astrologerOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (!["astrologer", "admin"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Astrologer access required" });
  }
  next();
};

const clientOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (!["user", "admin"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Client access required" });
  }
  next();
};

module.exports = { astrologerOnly, clientOnly };
