// Creates (or promotes) an admin user from the terminal.
//
// Run with: node scripts/createAdmin.js --email admin@example.com --password secret123 --name "Admin"
// Or use the npm script: npm run create-admin -- --email admin@example.com --password secret123

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const connectDB = require("../config/db");
const User = require("../models/user");

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    args[argv[i].slice(2)] = argv[i + 1] || "true";
    i++;
  }
}

(async () => {
  const email = (args.email || "").trim().toLowerCase();
  const password = args.password || "";
  const name = (args.name || "Admin").trim();
  const gender = (args.gender || "other").trim();

  if (!email || !password) {
    console.error("Usage: node scripts/createAdmin.js --email <email> --password <password> [--name <name>] [--gender <male|female|other>]");
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  if (user) {
    user.role = "admin";
    user.isActive = true;
    if (name) user.name = name;
    await user.save();
    console.log(`Existing user ${email} promoted to admin.`);
  } else {
    user = await User.create({ name, email, password, gender, role: "admin" });
    console.log(`Admin account created for ${email}.`);
  }

  process.exit(0);
})();