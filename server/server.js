const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;

// Ücretsiz kullanıcılar için günlük mesaj kotası (Model B)
const FREE_DAILY_MESSAGE_LIMIT = 15;
// Bir odada tutulacak maksimum geçmiş mesaj sayısı (F5 koruması)
const MAX_ROOM_HISTORY = 25;
// Bir odada tutulacak maksimum özel konuşma (fısıltı) mesajı sayısı
const MAX_ROOM_WHISPERS = 100;
// Otomatik ban/susturma için gereken farklı şikayetçi sayısı
const REPORT_BAN_THRESHOLD = 3;
// Tanışma dönemi: Tüm kullanıcılar varsayılan olarak Plus başlar (ücretliye geçince false yapılır)
const DEFAULT_PLUS_ENABLED = true;

/**
 * Aktif bağlı soketler
 * socket.id -> {
 *   id: string (socket.id),
 *   clientId: string (kalıcı cihaz kimliği),
 *   username: string,
 *   color: string,
 *   isPlus: boolean,
 *   plusPlan: string | null,
 *   ghostMode: boolean,
 *   lat: number | null,
 *   lng: number | null,
 *   radius: number (100 | 500 | 1000 | 5000),
 *   roomId: string | null,
 *   lastMsgAt: number
 * }
 */
const users = new Map();

/**
 * Kalıcı kullanıcı profilleri ve günlük mesaj kotaları (F5 veya sekme kapansa bile korunur)
 * clientId -> {
 *   clientId: string,
 *   username: string,
 *   color: string,
 *   isPlus: boolean,
 *   plusPlan: string | null,
 *   ghostMode: boolean,
 *   dailyCount: number,
 *   quotaDay: string (YYYY-MM-DD),
 *   reportedBy: Set<string>,
 *   isBanned: boolean
 * }
 */
const profiles = new Map();

/**
 * Aktif odalar ve son mesaj geçmişleri
 * roomId -> {
 *   id: string,
 *   centerLat: number,
 *   centerLng: number,
 *   radius: number,
 *   messages: Array<Object>,
 *   createdAt: number
 * }
 */
const rooms = new Map();

const USER_COLORS = [
  '#34D399', // Emerald
  '#60A5FA', // Blue
  '#F472B6', // Pink
  '#FBBF24', // Amber
  '#A78BFA', // Purple
  '#FB923C', // Orange
  '#2DD4BF', // Teal
  '#F87171', // Red
];

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateProfile(clientId) {
  const today = getTodayKey();
  if (profiles.has(clientId)) {
    const prof = profiles.get(clientId);
    if (prof.quotaDay !== today) {
      prof.quotaDay = today;
      prof.dailyCount = 0;
    }
    if (DEFAULT_PLUS_ENABLED && !prof.isPlus) {
      prof.isPlus = true;
      prof.plusPlan = prof.plusPlan || 'promo';
    }
    return prof;
  }

  const randomNum = Math.floor(100 + Math.random() * 900);
  const newProfile = {
    clientId,
    username: `User_${randomNum}`,
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
    isPlus: DEFAULT_PLUS_ENABLED,
    plusPlan: DEFAULT_PLUS_ENABLED ? 'promo' : null,
    ghostMode: false,
    dailyCount: 0,
    quotaDay: today,
    reportedBy: new Set(),
    // Bu kullanıcıya özel mesaj (fısıltı) atmış kişiler: Plus olmasa da cevap verebilir
    whisperContacts: new Set(),
    isBanned: false,
  };
  profiles.set(clientId, newProfile);
  return newProfile;
}

/**
 * Haversine Formülü: İki GPS koordinatı arasındaki mesafeyi METRE cinsinden hesaplar
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Odadaki aktif kullanıcı listesini yayınlar
 */
function broadcastRoomUsers(roomId) {
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  const roomMembers = [];
  for (const [, u] of users.entries()) {
    if (u.roomId === roomId && u.lat !== null && u.lng !== null) {
      roomMembers.push({
        id: u.id,
        clientId: u.clientId,
        username: u.username,
        color: u.color,
        isPlus: u.isPlus,
        ghostMode: u.ghostMode,
        lat: u.lat,
        lng: u.lng,
        radius: u.radius,
      });
    }
  }

  if (roomMembers.length === 0) {
    rooms.delete(roomId);
    return;
  }

  const avgLat =
    roomMembers.reduce((sum, m) => sum + m.lat, 0) / roomMembers.length;
  const avgLng =
    roomMembers.reduce((sum, m) => sum + m.lng, 0) / roomMembers.length;
  room.centerLat = avgLat;
  room.centerLng = avgLng;

  io.to(roomId).emit('room_users', {
    roomId,
    radius: room.radius,
    users: roomMembers,
  });
}

function isClientOnlineInRoom(roomId, clientId) {
  if (!roomId || !clientId) return false;
  for (const [, u] of users.entries()) {
    if (u.roomId === roomId && u.clientId === clientId) {
      return true;
    }
  }
  return false;
}

function emitToClientsInRoom(roomId, clientIds, event, payload) {
  if (!roomId) return;
  const set = new Set(clientIds);
  for (const [, u] of users.entries()) {
    if (u.roomId === roomId && set.has(u.clientId)) {
      io.to(u.id).emit(event, payload);
    }
  }
}

function getUserDmSession(roomObj, clientId) {
  if (!roomObj || !clientId) return null;
  if (!roomObj.dmSessions) roomObj.dmSessions = [];
  roomObj.dmSessions = roomObj.dmSessions.filter(
    (s) =>
      isClientOnlineInRoom(roomObj.id, s.initiatorClientId) &&
      isClientOnlineInRoom(roomObj.id, s.recipientClientId)
  );
  return (
    roomObj.dmSessions.find(
      (s) =>
        s.initiatorClientId === clientId || s.recipientClientId === clientId
    ) || null
  );
}

function cleanupClientDmInRoom(roomId, clientId, leavingUsername) {
  if (!roomId || !clientId) return;
  if (isClientOnlineInRoom(roomId, clientId)) return;
  const roomObj = rooms.get(roomId);
  if (!roomObj || !roomObj.dmSessions) return;

  const idx = roomObj.dmSessions.findIndex(
    (s) =>
      s.initiatorClientId === clientId || s.recipientClientId === clientId
  );
  if (idx === -1) return;

  const session = roomObj.dmSessions[idx];
  roomObj.dmSessions.splice(idx, 1);
  const peerClientId =
    session.initiatorClientId === clientId
      ? session.recipientClientId
      : session.initiatorClientId;

  if (roomObj.whispers) {
    roomObj.whispers = roomObj.whispers.filter(
      (w) =>
        !(
          (w.senderClientId === clientId &&
            w.whisperToClientId === peerClientId) ||
          (w.senderClientId === peerClientId &&
            w.whisperToClientId === clientId)
        )
    );
  }

  emitToClientsInRoom(roomId, [peerClientId], 'dm_state', {
    session: null,
    notice: {
      type: 'peer_left',
      byClientId: clientId,
      byName: leavingUsername,
    },
  });
}

function sendQuotaAndIdentity(socket, user) {
  const prof = getOrCreateProfile(user.clientId);
  socket.emit('identity', {
    id: user.id,
    clientId: user.clientId,
    username: user.username,
    color: user.color,
    isPlus: user.isPlus,
    plusPlan: user.plusPlan,
    ghostMode: user.ghostMode,
    dailyCount: prof.dailyCount,
    dailyLimit: FREE_DAILY_MESSAGE_LIMIT,
    remainingQuota: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - prof.dailyCount),
    isBanned: prof.isBanned,
    reportCount: prof.reportedBy.size,
  });
}

/**
 * Kullanıcının konumuna ve seçtiği menzile göre odaya atanması
 */
function assignUserToLocationRoom(socket, lat, lng, requestedRadius) {
  const user = users.get(socket.id);
  if (!user) return;

  const allowedRadii = [100, 500, 1000, 5000];
  let targetRadius = allowedRadii.includes(Number(requestedRadius))
    ? Number(requestedRadius)
    : 100;

  // Model A Kuralı: 500m, 1km, 5km sadece Plus üyelere açıktır
  if (targetRadius > 100 && !user.isPlus) {
    targetRadius = 100;
    socket.emit('paywall_trigger', {
      reason: 'radius_locked',
      message: `${requestedRadius >= 1000 ? requestedRadius / 1000 + ' km' : requestedRadius + ' m'} menzil odasına erişmek için MiniTemas Plus gereklidir.`,
    });
  }

  user.lat = lat;
  user.lng = lng;
  user.radius = targetRadius;

  // Mevcut odada kalmaya devam ediyor mu?
  if (user.roomId && rooms.has(user.roomId)) {
    const currentRoom = rooms.get(user.roomId);
    const distToCurrentRoom = calculateDistanceMeters(
      lat,
      lng,
      currentRoom.centerLat,
      currentRoom.centerLng
    );

    if (
      currentRoom.radius === targetRadius &&
      distToCurrentRoom <= targetRadius
    ) {
      broadcastRoomUsers(user.roomId);
      return;
    } else {
      const oldRoomId = user.roomId;
      socket.leave(oldRoomId);
      user.roomId = null;

      cleanupClientDmInRoom(oldRoomId, user.clientId, user.username);

      // Hayalet modda değilse ayrılma mesajı bas
      if (!user.ghostMode) {
        io.to(oldRoomId).emit('system_message', {
          id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'leave',
          text: `${user.username} uzaklaştı`,
          timestamp: new Date().toISOString(),
        });
      }
      broadcastRoomUsers(oldRoomId);
    }
  }

  // Uygun yakın oda ara
  let matchedRoomId = null;
  let minDistance = Infinity;

  for (const [, otherUser] of users.entries()) {
    if (
      otherUser.id !== socket.id &&
      otherUser.lat !== null &&
      otherUser.lng !== null &&
      otherUser.roomId &&
      otherUser.radius === targetRadius
    ) {
      const distance = calculateDistanceMeters(
        lat,
        lng,
        otherUser.lat,
        otherUser.lng
      );

      if (distance <= targetRadius && distance < minDistance) {
        minDistance = distance;
        matchedRoomId = otherUser.roomId;
      }
    }
  }

  if (!matchedRoomId) {
    matchedRoomId = `room_${targetRadius}m_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;
    rooms.set(matchedRoomId, {
      id: matchedRoomId,
      centerLat: lat,
      centerLng: lng,
      radius: targetRadius,
      messages: [],
      whispers: [],
      dmSessions: [],
      createdAt: Date.now(),
    });
  }

  user.roomId = matchedRoomId;
  socket.join(matchedRoomId);

  const roomObj = rooms.get(matchedRoomId);
  const activeDmSession = getUserDmSession(roomObj, user.clientId);

  socket.emit('joined_room', {
    roomId: matchedRoomId,
    radius: targetRadius,
    username: user.username,
    userId: user.id,
    history: roomObj ? roomObj.messages : [],
    dmSession: activeDmSession,
    // Sadece bu kullanıcının aktif özel konuşmasındaki mesajlar
    whispers: activeDmSession ? activeDmSession.messages : [],
  });

  if (!user.ghostMode) {
    const distText =
      minDistance !== Infinity ? ` (${Math.round(minDistance)}m)` : '';
    socket.to(matchedRoomId).emit('system_message', {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'join',
      text: `${user.username} menzile girdi${distText}`,
      timestamp: new Date().toISOString(),
    });
  }

  socket.emit('system_message', {
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'info',
    text: `${targetRadius >= 1000 ? targetRadius / 1000 + ' km' : targetRadius + ' m'} menzil odasına bağlandınız (${user.username}${user.ghostMode ? ' • 👻 Hayalet Mod' : ''})`,
    timestamp: new Date().toISOString(),
  });

  broadcastRoomUsers(matchedRoomId);
}

io.on('connection', (socket) => {
  const handshakeClientId =
    socket.handshake.auth?.clientId ||
    socket.handshake.query?.clientId ||
    `anon_${socket.id}`;

  const profile = getOrCreateProfile(String(handshakeClientId));

  const userObj = {
    id: socket.id,
    clientId: profile.clientId,
    username: profile.username,
    color: profile.color,
    isPlus: profile.isPlus,
    plusPlan: profile.plusPlan,
    ghostMode: profile.ghostMode,
    lat: null,
    lng: null,
    radius: 100,
    roomId: null,
    lastMsgAt: 0,
  };

  users.set(socket.id, userObj);
  sendQuotaAndIdentity(socket, userObj);

  console.log(`[BAĞLANDI] ${userObj.username} (${socket.id})`);

  // Konum güncelleme
  socket.on('update_location', (data) => {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      return;
    }
    assignUserToLocationRoom(socket, data.lat, data.lng, data.radius || 100);
  });

  // Plus Üyelik Aktivasyonu (Günlük / Haftalık / Aylık)
  socket.on('activate_plus', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    const plan = data?.plan || 'daily';
    const prof = getOrCreateProfile(user.clientId);

    prof.isPlus = true;
    prof.plusPlan = plan;
    user.isPlus = true;
    user.plusPlan = plan;

    sendQuotaAndIdentity(socket, user);
    if (user.roomId) broadcastRoomUsers(user.roomId);
  });

  // Özel Takma Ad (Nickname) Değiştirme (Plus Özelliği)
  socket.on('set_nickname', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (!user.isPlus) {
      socket.emit('paywall_trigger', {
        reason: 'custom_nickname',
        message: 'Özel takma ad belirlemek için MiniTemas Plus gereklidir.',
      });
      return;
    }

    const cleanName = String(data?.nickname || '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 20);
    if (cleanName.length < 2) return;

    const oldName = user.username;
    const prof = getOrCreateProfile(user.clientId);
    prof.username = cleanName;
    user.username = cleanName;

    sendQuotaAndIdentity(socket, user);
    if (user.roomId) {
      const roomObj = rooms.get(user.roomId);
      const dmSession = getUserDmSession(roomObj, user.clientId);
      if (dmSession) {
        if (dmSession.initiatorClientId === user.clientId) {
          dmSession.initiatorName = cleanName;
        }
        if (dmSession.recipientClientId === user.clientId) {
          dmSession.recipientName = cleanName;
        }
        emitToClientsInRoom(
          user.roomId,
          [dmSession.initiatorClientId, dmSession.recipientClientId],
          'dm_state',
          { session: dmSession }
        );
      }
      broadcastRoomUsers(user.roomId);
      io.to(user.roomId).emit('system_message', {
        id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'info',
        text: `✨ ${oldName} adını "${cleanName}" olarak değiştirdi`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Hayalet Modu Aç/Kapat (Plus Özelliği)
  socket.on('set_ghost_mode', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (!user.isPlus) {
      socket.emit('paywall_trigger', {
        reason: 'ghost_mode',
        message: '👻 Hayalet Modu kullanmak için MiniTemas Plus gereklidir.',
      });
      return;
    }

    const enabled = Boolean(data?.enabled);
    const prof = getOrCreateProfile(user.clientId);
    prof.ghostMode = enabled;
    user.ghostMode = enabled;

    sendQuotaAndIdentity(socket, user);
    if (user.roomId) broadcastRoomUsers(user.roomId);
  });

  // 1'e 1 Özel Görüşme İsteğini Kabul Etme
  socket.on('dm_accept', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const roomObj = rooms.get(user.roomId);
    if (!roomObj) return;
    const session = getUserDmSession(roomObj, user.clientId);
    if (!session || session.recipientClientId !== user.clientId) return;

    session.status = 'accepted';
    getOrCreateProfile(session.initiatorClientId).whisperContacts.add(
      user.clientId
    );
    getOrCreateProfile(user.clientId).whisperContacts.add(
      session.initiatorClientId
    );

    emitToClientsInRoom(
      user.roomId,
      [session.initiatorClientId, session.recipientClientId],
      'dm_state',
      {
        session,
        notice: {
          type: 'accepted',
          byClientId: user.clientId,
          byName: user.username,
        },
      }
    );
  });

  // 1'e 1 Özel Görüşmeyi Reddetme veya Sonlandırma
  socket.on('dm_close', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const roomObj = rooms.get(user.roomId);
    if (!roomObj || !roomObj.dmSessions) return;
    const session = getUserDmSession(roomObj, user.clientId);
    if (!session) return;

    const isRejected =
      session.status === 'pending' &&
      session.recipientClientId === user.clientId &&
      data?.reason === 'rejected';

    const peerClientId =
      session.initiatorClientId === user.clientId
        ? session.recipientClientId
        : session.initiatorClientId;

    roomObj.dmSessions = roomObj.dmSessions.filter((s) => s.id !== session.id);
    if (roomObj.whispers) {
      roomObj.whispers = roomObj.whispers.filter(
        (w) =>
          !(
            (w.senderClientId === user.clientId &&
              w.whisperToClientId === peerClientId) ||
            (w.senderClientId === peerClientId &&
              w.whisperToClientId === clientId)
          )
      );
    }

    emitToClientsInRoom(
      user.roomId,
      [user.clientId, peerClientId],
      'dm_state',
      {
        session: null,
        notice: {
          type: isRejected ? 'rejected' : 'closed',
          byClientId: user.clientId,
          byName: user.username,
        },
      }
    );
  });

  // Mesaj Gönderme (Grup Mesajı veya 1'e 1 Özel Fısıltı)
  socket.on('send_message', (payload) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const roomObj = rooms.get(user.roomId);
    if (!roomObj) return;

    const prof = getOrCreateProfile(user.clientId);

    // 1. Ban / Susturma Kontrolü
    if (prof.isBanned) {
      socket.emit('system_message', {
        id: `sys_${Date.now()}`,
        type: 'leave',
        text: '⛔ Topluluk kurallarını ihlal ettiğiniz için mesaj gönderiminiz kısıtlanmıştır.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 2. Hız Sınırı (Anti-Spam: 600ms)
    const now = Date.now();
    if (now - user.lastMsgAt < 600) {
      return;
    }
    user.lastMsgAt = now;

    const text = String(payload?.text || '').trim();
    if (!text) return;

    // 3. 1'e 1 Özel Fısıltı (DM): alıcı kalıcı clientId ile belirlenir
    const isWhisperIntent = Boolean(
      payload?.isWhisper || payload?.whisperToClientId || payload?.whisperToId
    );
    let whisperToId = null;
    let whisperToName = null;
    let whisperToClientId = null;
    const whisperTargets = [];
    let dmSession = null;

    if (isWhisperIntent) {
      const reqToClientId = payload?.whisperToClientId
        ? String(payload.whisperToClientId)
        : null;
      const reqToSocketId = payload?.whisperToId || null;

      whisperToClientId =
        reqToClientId ||
        (users.get(reqToSocketId) ? users.get(reqToSocketId).clientId : null);
      if (!whisperToClientId || whisperToClientId === user.clientId) return;

      // Alıcı aynı odada ve çevrimiçi olmalı (sunucu tarafı doğrulama)
      for (const [, u] of users.entries()) {
        if (u.clientId === whisperToClientId && u.roomId === user.roomId) {
          whisperTargets.push(u);
        }
      }
      if (whisperTargets.length === 0) {
        socket.emit('whisper_failed', {
          reason: 'user_left',
          targetClientId: whisperToClientId,
          targetName: payload?.whisperToName || null,
        });
        return;
      }
      whisperToId = whisperTargets[0].id;
      whisperToName = whisperTargets[0].username;

      // Tek-eşli (1'e 1) özel görüşme ve Kabul/Red kontrolü
      dmSession = getUserDmSession(roomObj, user.clientId);
      if (dmSession) {
        const myPeerId =
          dmSession.initiatorClientId === user.clientId
            ? dmSession.recipientClientId
            : dmSession.initiatorClientId;
        const myPeerName =
          dmSession.initiatorClientId === user.clientId
            ? dmSession.recipientName
            : dmSession.initiatorName;

        if (myPeerId !== whisperToClientId) {
          socket.emit('dm_error', {
            reason: 'self_busy',
            peerClientId: myPeerId,
            peerName: myPeerName,
          });
          return;
        }

        if (dmSession.status === 'pending') {
          if (dmSession.initiatorClientId === user.clientId) {
            socket.emit('dm_error', {
              reason: 'waiting_accept',
              peerClientId: myPeerId,
              peerName: myPeerName,
            });
            return;
          } else {
            dmSession.status = 'accepted';
          }
        }
      } else {
        const targetSession = getUserDmSession(roomObj, whisperToClientId);
        if (targetSession) {
          socket.emit('dm_error', {
            reason: 'target_busy',
            peerClientId: whisperToClientId,
            peerName: whisperToName,
          });
          return;
        }

        // Konuşmayı başlatmak Plus ister; kendisine yazılmış birine cevap vermek ücretsizdir
        if (!user.isPlus && !prof.whisperContacts.has(whisperToClientId)) {
          socket.emit('paywall_trigger', {
            reason: 'whisper_locked',
            message:
              'Odadaki bir kişiye 1-e-1 özel fısıltı (DM) göndermek için MiniTemas Plus gereklidir.',
          });
          return;
        }

        dmSession = {
          id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          roomId: user.roomId,
          initiatorClientId: user.clientId,
          initiatorName: user.username,
          recipientClientId: whisperToClientId,
          recipientName: whisperToName,
          status: 'pending',
          messages: [],
          createdAt: Date.now(),
        };
        if (!roomObj.dmSessions) roomObj.dmSessions = [];
        roomObj.dmSessions.push(dmSession);
      }
    }

    // 4. Günlük Mesaj Kotası Kontrolü (Model B -> Ücretsiz kullanıcılar günde 15 mesaj)
    if (!user.isPlus) {
      if (prof.dailyCount >= FREE_DAILY_MESSAGE_LIMIT) {
        socket.emit('paywall_trigger', {
          reason: 'quota_exceeded',
          message: `Günlük ${FREE_DAILY_MESSAGE_LIMIT} ücretsiz mesaj hakkınız doldu! Sohbete sınırsız devam etmek için MiniTemas Plus'a geçin.`,
        });
        return;
      }
      prof.dailyCount += 1;
      sendQuotaAndIdentity(socket, user);
    }

    const messageData = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId: user.id,
      senderClientId: user.clientId,
      senderName: user.username,
      senderColor: user.color,
      senderIsPlus: user.isPlus,
      senderLat: user.lat,
      senderLng: user.lng,
      text: text.slice(0, 1000),
      replyTo: payload?.replyTo || null, // { id, senderName, text }
      whisperToId,
      whisperToName,
      whisperToClientId,
      reactions: {},
      timestamp: new Date().toISOString(),
    };

    // Özel Fısıltıysa sadece iki tarafın tüm açık sekmelerine ilet
    if (isWhisperIntent && whisperToClientId && dmSession) {
      // Alıcı artık bu kullanıcıya ücretsiz cevap verebilir
      getOrCreateProfile(whisperToClientId).whisperContacts.add(user.clientId);

      dmSession.messages.push(messageData);
      if (dmSession.messages.length > MAX_ROOM_WHISPERS) {
        dmSession.messages.shift();
      }

      if (!roomObj.whispers) roomObj.whispers = [];
      roomObj.whispers.push(messageData);
      if (roomObj.whispers.length > MAX_ROOM_WHISPERS) roomObj.whispers.shift();

      emitToClientsInRoom(
        user.roomId,
        [user.clientId, whisperToClientId],
        'chat_message',
        messageData
      );
      emitToClientsInRoom(
        user.roomId,
        [user.clientId, whisperToClientId],
        'dm_state',
        { session: dmSession }
      );
      return;
    }

    // Ortak grup mesajıysa oda geçmişine kaydet (son 25 mesaj) ve odaya yayınla
    roomObj.messages.push(messageData);
    if (roomObj.messages.length > MAX_ROOM_HISTORY) {
      roomObj.messages.shift();
    }

    io.to(user.roomId).emit('chat_message', messageData);
  });

  // Mesaja Emoji Tepkisi Bırakma (❤️ 😂 👍 🔥)
  socket.on('react_message', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId || !data?.messageId || !data?.emoji) return;

    const allowedEmojis = ['❤️', '😂', '👍', '🔥'];
    if (!allowedEmojis.includes(data.emoji)) return;

    const roomObj = rooms.get(user.roomId);
    let whisperMsg = null;
    if (roomObj) {
      const targetMsg = roomObj.messages.find((m) => m.id === data.messageId);
      if (!targetMsg) {
        whisperMsg = (roomObj.whispers || []).find(
          (m) => m.id === data.messageId
        );
        // Özel mesaja sadece konuşmanın tarafları tepki verebilir
        if (
          whisperMsg &&
          whisperMsg.senderClientId !== user.clientId &&
          whisperMsg.whisperToClientId !== user.clientId
        ) {
          return;
        }
      }
      const reactTarget = targetMsg || whisperMsg;
      if (reactTarget) {
        if (!reactTarget.reactions) reactTarget.reactions = {};
        if (!reactTarget.reactions[data.emoji]) {
          reactTarget.reactions[data.emoji] = [];
        }
        const list = reactTarget.reactions[data.emoji];
        const idx = list.indexOf(user.username);
        if (idx >= 0) {
          list.splice(idx, 1);
        } else {
          list.push(user.username);
        }
      }
    }

    const reactionPayload = {
      messageId: data.messageId,
      emoji: data.emoji,
      username: user.username,
    };
    if (whisperMsg) {
      for (const [, u] of users.entries()) {
        if (
          u.roomId === user.roomId &&
          (u.clientId === whisperMsg.senderClientId ||
            u.clientId === whisperMsg.whisperToClientId)
        ) {
          io.to(u.id).emit('message_reaction', reactionPayload);
        }
      }
    } else {
      io.to(user.roomId).emit('message_reaction', reactionPayload);
    }
  });

  // Kötü Amaçlı Kullanıcı Şikayet Etme
  socket.on('report_user', (data) => {
    const reporter = users.get(socket.id);
    if (!reporter || !data?.targetClientId) return;
    if (reporter.clientId === data.targetClientId) return;

    const targetProf = profiles.get(String(data.targetClientId));
    if (!targetProf) return;

    targetProf.reportedBy.add(reporter.clientId);

    if (
      targetProf.reportedBy.size >= REPORT_BAN_THRESHOLD &&
      !targetProf.isBanned
    ) {
      targetProf.isBanned = true;
      // Hedef kullanıcının aktif soketlerini bul ve bilgilendir
      for (const [sockId, u] of users.entries()) {
        if (u.clientId === targetProf.clientId) {
          io.to(sockId).emit('identity', {
            ...u,
            isBanned: true,
            reportCount: targetProf.reportedBy.size,
          });
          if (u.roomId) {
            io.to(u.roomId).emit('system_message', {
              id: `sys_${Date.now()}`,
              type: 'leave',
              text: `🛡️ ${u.username} çoklu kullanıcı şikayeti nedeniyle odadan susturuldu.`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }
  });

  // Yazıyor...
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId || user.ghostMode) return;

    socket.to(user.roomId).emit('user_typing', {
      userId: user.id,
      username: user.username,
      isTyping: Boolean(isTyping),
    });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const oldRoomId = user.roomId;
      users.delete(socket.id);

      if (oldRoomId) {
        cleanupClientDmInRoom(oldRoomId, user.clientId, user.username);
        if (!user.ghostMode) {
          io.to(oldRoomId).emit('system_message', {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'leave',
            text: `${user.username} uzaklaştı`,
            timestamp: new Date().toISOString(),
          });
        }
        broadcastRoomUsers(oldRoomId);
      }
      console.log(`[AYRILDI] ${user.username} (${socket.id})`);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeUsers: users.size,
    activeRooms: rooms.size,
  });
});

server.listen(PORT, () => {
  console.log(`🚀 MiniTemas Socket.io Sunucusu çalışıyor: http://localhost:${PORT}`);
});
