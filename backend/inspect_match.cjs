const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('./.env','utf8').split('\n')) { const [k,...v]=l.split('='); if(k&&!k.startsWith('#')) env[k.trim()]=v.join('='); }
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(env.MONGO_URI);
  const Match = mongoose.connection.collection('matches');
  const matches = await Match.find({}).sort({ updatedAt: -1 }).toArray();
  for (const m of matches) {
    console.log(String(m._id), '| status:', m.status, '| updatedAt:', m.updatedAt);
  }
  process.exit(0);
})();
