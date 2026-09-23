let io = null;

// Tracks which match chat each connected user is currently viewing.
// key:  userId (string)
// value: matchId (string)
const activeChatByUser = new Map();

// Users currently inside an active call.
// key:  userId (string)
// value: { matchId: string, kind: 'voice' | 'video' }
const inCallByUser = new Map();

// Pending unanswered calls targeting a callee.
// key:  calleeId (string)
// value: Map<matchId, { callerId, callerName, kind }>
const pendingCallsByCallee = new Map();

const setIo = (instance) => {
  io = instance;
};

const getIo = () => io;

const setActiveChat = (userId, matchId) => {
  const key = String(userId);
  if (!matchId) {
    activeChatByUser.delete(key);
    return;
  }
  activeChatByUser.set(key, String(matchId));
};

const clearActiveChat = (userId) => {
  activeChatByUser.delete(String(userId));
};

const isUserViewingChat = (userId, matchId) =>
  activeChatByUser.get(String(userId)) === String(matchId);

const setUserInCall = (userId, matchId, kind) => {
  inCallByUser.set(String(userId), { matchId: String(matchId), kind });
};

const clearUserInCall = (userId) => {
  inCallByUser.delete(String(userId));
};

const isUserInCall = (userId) => inCallByUser.has(String(userId));

const getPendingCallsFor = (calleeId) => {
  return pendingCallsByCallee.get(String(calleeId)) || new Map();
};

const addPendingCall = (calleeId, matchId, caller) => {
  const key = String(calleeId);
  let map = pendingCallsByCallee.get(key);
  if (!map) {
    map = new Map();
    pendingCallsByCallee.set(key, map);
  }
  map.set(String(matchId), caller);
};

const removePendingCall = (calleeId, matchId) => {
  const key = String(calleeId);
  const map = pendingCallsByCallee.get(key);
  if (map) {
    map.delete(String(matchId));
    if (map.size === 0) pendingCallsByCallee.delete(key);
  }
};

const clearPendingCalls = (calleeId) => {
  pendingCallsByCallee.delete(String(calleeId));
};

module.exports = {
  setIo,
  getIo,
  setActiveChat,
  clearActiveChat,
  isUserViewingChat,
  setUserInCall,
  clearUserInCall,
  isUserInCall,
  getPendingCallsFor,
  addPendingCall,
  removePendingCall,
  clearPendingCalls,
};