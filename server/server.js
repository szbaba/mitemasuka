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
// Otomatik ban/susturma için gereken farklı şikayetçi sayısı
const REPORT_BAN_THRESHOLD = 3;

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
    return prof;
  }

  const randomNum = Math.floor(100 + Math.random() * 900);
  const newProfile = {
    clientId,
    username: `User_${randomNum}`,
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
    isPlus: false,
    plusPlan: null,
    ghostMode: false,
    dailyCount: 0,
    quotaDay: today,
    reportedBy: new Set(),
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
      createdAt: Date.now(),
    });
  }

  user.roomId = matchedRoomId;
  socket.join(matchedRoomId);

  const roomObj = rooms.get(matchedRoomId);

  socket.emit('joined_room', {
    roomId: matchedRoomId,
    radius: targetRadius,
    username: user.username,
    userId: user.id,
    history: roomObj ? roomObj.messages : [],
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

  // Mesaj Gönderme (Grup Mesajı veya 1'e 1 Özel Fısıltı)
  socket.on('send_message', (payload) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;

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

    const whisperToId = payload?.whisperToId || null;
    const whisperToName = payload?.whisperToName || null;

    // 3. 1'e 1 Özel Fısıltı (DM) Kontrolü -> Plus Özelliği
    if (whisperToId && !user.isPlus) {
      socket.emit('paywall_trigger', {
        reason: 'whisper_locked',
        message:
          'Odadaki bir kişiye 1-e-1 özel fısıltı (DM) göndermek için MiniTemas Plus gereklidir.',
      });
      return;
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
      reactions: {},
      timestamp: new Date().toISOString(),
    };

    // Özel Fısıltıysa sadece alıcıya ve göndericiye ilet
    if (whisperToId) {
      socket.to(whisperToId).emit('chat_message', messageData);
      socket.emit('chat_message', messageData);
      return;
    }

    // Ortak grup mesajıysa oda geçmişine kaydet (son 25 mesaj) ve odaya yayınla
    const roomObj = rooms.get(user.roomId);
    if (roomObj) {
      roomObj.messages.push(messageData);
      if (roomObj.messages.length > MAX_ROOM_HISTORY) {
        roomObj.messages.shift();
      }
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
    if (roomObj) {
      const targetMsg = roomObj.messages.find((m) => m.id === data.messageId);
      if (targetMsg) {
        if (!targetMsg.reactions) targetMsg.reactions = {};
        if (!targetMsg.reactions[data.emoji]) {
          targetMsg.reactions[data.emoji] = [];
        }
        const list = targetMsg.reactions[data.emoji];
        const idx = list.indexOf(user.username);
        if (idx >= 0) {
          list.splice(idx, 1);
        } else {
          list.push(user.username);
        }
      }
    }

    io.to(user.roomId).emit('message_reaction', {
      messageId: data.messageId,
      emoji: data.emoji,
      username: user.username,
    });
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
