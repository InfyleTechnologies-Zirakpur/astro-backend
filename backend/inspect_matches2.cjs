const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('./.env','utf8').split('\n')) { const [k,...v]=l.split('='); if(k&&!k.startsWith('#')) env[k.trim()]=v.join('='); }
process.env = { ...process.env, ...env };
const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    const Match = mongoose.connection.collection('matches');
    const matches = await Match.find({}).sort({ updatedAt: -1 }).limit(3).toArray();
    for (const m of matches) {
      const obj = { ...m, _id: String(m._id), __v: undefined };
      console.log('KEYS:', Object.keys(obj).join(', '));
      console.log('ID:', String(m._id), 'status=', JSON.stringify(m.status), 'sideCheck requestedBy', String(m.requestedBy), 'requestedTo', String(m.requestedTo));
    }
  } catch (e) { console.error('ERR', e.message); }
  process.exit(0);
})();
