const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('./.env','utf8').split('\n')) { const [k,...v]=l.split('='); if(k&&!k.startsWith('#')) env[k.trim()]=v.join('='); }
const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    const Match = mongoose.connection.collection('matches');
    const Users = mongoose.connection.collection('users');
    const matches = await Match.find({}).sort({ updatedAt: -1 }).limit(6).toArray();
    const userMap = new Map();
    for (const m of matches) {
      for (const id of [m.requestedBy, m.requestedTo, m.userA, m.userB]) {
        if (id && !userMap.has(String(id))) {
          const u = await Users.findOne({ _id: id });
          userMap.set(String(id), u ? u.email : 'MISSING');
        }
      }
    }
    for (const m of matches) {
      console.log(JSON.stringify({ id: String(m._id), status: m.status, reqBy: userMap.get(String(m.requestedBy)), reqTo: userMap.get(String(m.requestedTo)) }));
    }
  } catch (e) { console.error('ERR', e.message); }
  process.exit(0);
})();
