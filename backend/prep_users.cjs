const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('./.env','utf8').split('\n')) { const [k,...v]=l.split('='); if(k&&!k.startsWith('#')) env[k.trim()]=v.join('='); }
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
(async () => {
  await mongoose.connect(env.MONGO_URI);
  const Users = mongoose.connection.collection('users');
  for (const email of ['shubham@gmail.com','kamalpreet@gmail.com']) {
    const u = await Users.findOne({ email });
    if (u) {
      const t = jwt.sign({ userId: String(u._id) }, env.JWT_SECRET, { expiresIn: '7d' });
      console.log(email, '->', String(u._id), '\nTOKEN:', t);
    } else console.log(email, 'NOT FOUND');
  }
  process.exit(0);
})();
