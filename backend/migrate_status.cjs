const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('./.env','utf8').split('\n')) { const [k,...v]=l.split('='); if(k&&!k.startsWith('#')) env[k.trim()]=v.join('='); }
const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    const res = await mongoose.connection.collection('matches').updateMany(
      { status: { $exists: false } },
      { $set: { status: "pending" } }
    );
    console.log('Backfilled status on matches:', res.modifiedCount);
    const bad = await mongoose.connection.collection('matches').findOne({ status: { $exists: false } });
    console.log('Any still missing status?', !!bad);
  } catch (e) { console.error('ERR', e.message); }
  process.exit(0);
})();
