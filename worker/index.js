/**
 * Mitemasuka (見てますか?) — Cloudflare Workers + Durable Objects
 * 7/24 Kesintisiz Gerçek Zamanlı WebSocket, Haversine Oda & Tek Yönlü Megafon Kanal Sunucusu (ws.mitemasuka.com)
 */

const FREE_DAILY_MESSAGE_LIMIT = 15;
const MAX_ROOM_HISTORY = 25;
// Bir odada tutulacak maksimum özel konuşma (fısıltı) mesajı sayısı
const MAX_ROOM_WHISPERS = 100;
const REPORT_BAN_THRESHOLD = 3;
// Tanışma dönemi: Tüm kullanıcılar varsayılan olarak Plus başlar (ücretliye geçince false yapılır)
const DEFAULT_PLUS_ENABLED = true;
// Çevrimdışı yakın kullanıcılara kilit ekranı uyandırma bildirimi bekleme süresi (60 sn)
const WAKE_PUSH_COOLDOWN_MS = 60 * 1000;
// Çevrede uygulama yüklü sayımı için maksimum son görülme süresi (30 gün)
const KNOWN_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const VAPID_PUBLIC_KEY =
  'BMZfazNz6u-QkK7DBuhuQACka3JeQXUB2yirba0Pk0fgh_UnlqSxi1GqGdsN3HwbEhknQaoaUQG0OJ5lSRHoMMA';
const VAPID_PRIVATE_JWK = {
  kty: 'EC',
  x: 'xl9rM3Pq75CQrsMG6G5AAKRrcl5BdQHbKKttrQ-TR-A',
  y: 'h_UnlqSxi1GqGdsN3HwbEhknQaoaUQG0OJ5lSRHoMMA',
  crv: 'P-256',
  d: 'QAaWoV1GPQa-mINW4c5q_2PsSiSO9gbQGSxH49rPppI',
};

function strToB64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufToB64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return strToB64Url(bin);
}

async function createVapidAuthHeader(endpoint) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = strToB64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = strToB64Url(
    JSON.stringify({ aud, exp, sub: 'mailto:suleymanbaba@gmail.com' })
  );
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    VAPID_PRIVATE_JWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    new TextEncoder().encode(unsignedToken)
  );
  const jwt = `${unsignedToken}.${bufToB64Url(sig)}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;
}

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

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export class MitemasukaHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.users = new Map();
    this.profiles = new Map();
    this.rooms = new Map();
    this.channels = new Map();

    // Kalıcı cihaz konumlarını ve Web Push aboneliklerini yükle
    this.state.blockConcurrencyWhile(async () => {
      try {
        const saved = await this.state.storage.get('known_devices_v1');
        if (saved && typeof saved === 'object') {
          const today = getTodayKey();
          for (const [cid, item] of Object.entries(saved)) {
            if (!item || typeof item !== 'object') continue;
            this.profiles.set(cid, {
              clientId: cid,
              username: item.username || `User_${Math.floor(100 + Math.random() * 900)}`,
              color:
                item.color ||
                USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
              isPlus: DEFAULT_PLUS_ENABLED ? true : Boolean(item.isPlus),
              plusPlan: DEFAULT_PLUS_ENABLED ? 'promo' : item.plusPlan || null,
              ghostMode: Boolean(item.ghostMode),
              dailyCount: 0,
              quotaDay: today,
              reportedBy: new Set(),
              whisperContacts: new Set(),
              isBanned: Boolean(item.isBanned),
              lastLat: typeof item.lastLat === 'number' ? item.lastLat : null,
              lastLng: typeof item.lastLng === 'number' ? item.lastLng : null,
              lastRadius: item.lastRadius || 100,
              lastSeenAt: item.lastSeenAt || 0,
              pushSub: item.pushSub || null,
              lastPushSentAt: item.lastPushSentAt || 0,
              lastPushPayload: item.lastPushPayload || null,
            });
          }
        }
      } catch {}
    });
  }

  persistKnownDevices() {
    try {
      const now = Date.now();
      const serializable = {};
      for (const [cid, p] of this.profiles.entries()) {
        if (
          p.lastLat !== null &&
          p.lastLng !== null &&
          now - (p.lastSeenAt || 0) <= KNOWN_DEVICE_TTL_MS
        ) {
          serializable[cid] = {
            username: p.username,
            color: p.color,
            isPlus: p.isPlus,
            plusPlan: p.plusPlan,
            ghostMode: p.ghostMode,
            isBanned: p.isBanned,
            lastLat: p.lastLat,
            lastLng: p.lastLng,
            lastRadius: p.lastRadius || 100,
            lastSeenAt: p.lastSeenAt || now,
            pushSub: p.pushSub || null,
            lastPushSentAt: p.lastPushSentAt || 0,
            lastPushPayload: p.lastPushPayload || null,
          };
        }
      }
      this.state.storage.put('known_devices_v1', serializable).catch(() => {});
    } catch {}
  }

  isClientOnlineAnywhere(clientId) {
    for (const [, u] of this.users.entries()) {
      if (u.clientId === clientId && u.lat !== null && u.lng !== null) {
        return true;
      }
    }
    return false;
  }

  countNearbyInstalledDevices(lat, lng, radius, minCount = 1) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return minCount;
    const now = Date.now();
    const matchedClientIds = new Set();

    for (const [, u] of this.users.entries()) {
      if (
        u.lat !== null &&
        u.lng !== null &&
        calculateDistanceMeters(lat, lng, u.lat, u.lng) <= radius
      ) {
        matchedClientIds.add(u.clientId);
      }
    }

    for (const [cid, p] of this.profiles.entries()) {
      if (
        typeof p.lastLat === 'number' &&
        typeof p.lastLng === 'number' &&
        now - (p.lastSeenAt || 0) <= KNOWN_DEVICE_TTL_MS &&
        calculateDistanceMeters(lat, lng, p.lastLat, p.lastLng) <= radius
      ) {
        matchedClientIds.add(cid);
      }
    }

    return Math.max(minCount, matchedClientIds.size);
  }

  async notifyOfflineNearbyUsers(enteringUser, lat, lng) {
    if (!enteringUser || enteringUser.ghostMode) return;
    const now = Date.now();

    for (const [cid, prof] of this.profiles.entries()) {
      if (cid === enteringUser.clientId) continue;
      if (!prof.pushSub || !prof.pushSub.endpoint) continue;
      if (typeof prof.lastLat !== 'number' || typeof prof.lastLng !== 'number') {
        continue;
      }
      if (this.isClientOnlineAnywhere(cid)) continue;

      const dist = calculateDistanceMeters(
        lat,
        lng,
        prof.lastLat,
        prof.lastLng
      );
      const wakeRadius = Math.max(100, Number(prof.lastRadius) || 100);
      if (dist > wakeRadius) continue;

      if (now - (prof.lastPushSentAt || 0) < WAKE_PUSH_COOLDOWN_MS) continue;

      prof.lastPushSentAt = now;
      prof.lastPushPayload = {
        title: '👋 Mitemasuka — Beni Görüyor Musun?',
        body: `${Math.round(dist)}m yakınında ${enteringUser.username} uygulamayı açtı! Odaya bağlanmak için dokun.`,
        timestamp: now,
      };

      try {
        const authHeader = await createVapidAuthHeader(prof.pushSub.endpoint);
        const res = await fetch(prof.pushSub.endpoint, {
          method: 'POST',
          headers: {
            TTL: '3600',
            Urgency: 'high',
            'Content-Length': '0',
            Authorization: authHeader,
          },
        });
        if (res.status === 404 || res.status === 410) {
          prof.pushSub = null;
        }
      } catch {}
    }
    this.persistKnownDevices();
  }

  sendEvent(ws, event, data) {
    try {
      ws.send(JSON.stringify({ event, data }));
    } catch {}
  }

  broadcastToRoom(roomId, event, data, excludeSocketId = null) {
    for (const [sockId, u] of this.users.entries()) {
      if (u.roomId === roomId && sockId !== excludeSocketId) {
        this.sendEvent(u.ws, event, data);
      }
    }
  }

  isClientOnlineInRoom(roomId, clientId) {
    if (!roomId || !clientId) return false;
    for (const [, u] of this.users.entries()) {
      if (u.roomId === roomId && u.clientId === clientId) {
        return true;
      }
    }
    return false;
  }

  emitToClientsInRoom(roomId, clientIds, event, payload) {
    if (!roomId) return;
    const set = new Set(clientIds);
    for (const [, u] of this.users.entries()) {
      if (u.roomId === roomId && set.has(u.clientId)) {
        this.sendEvent(u.ws, event, payload);
      }
    }
  }

  getUserDmSession(roomObj, clientId) {
    if (!roomObj || !clientId) return null;
    if (!roomObj.dmSessions) roomObj.dmSessions = [];
    // Odadan düşmüş kullanıcıların eski oturumlarını temizle
    roomObj.dmSessions = roomObj.dmSessions.filter(
      (s) =>
        this.isClientOnlineInRoom(roomObj.id, s.initiatorClientId) &&
        this.isClientOnlineInRoom(roomObj.id, s.recipientClientId)
    );
    return (
      roomObj.dmSessions.find(
        (s) =>
          s.initiatorClientId === clientId || s.recipientClientId === clientId
      ) || null
    );
  }

  cleanupClientDmInRoom(roomId, clientId, leavingUsername) {
    if (!roomId || !clientId) return;
    if (this.isClientOnlineInRoom(roomId, clientId)) return;
    const roomObj = this.rooms.get(roomId);
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

    this.emitToClientsInRoom(roomId, [peerClientId], 'dm_state', {
      session: null,
      notice: {
        type: 'peer_left',
        byClientId: clientId,
        byName: leavingUsername,
      },
    });
  }

  /**
   * Belirli bir kullanıcıya menzili içindeki aktif Tek Yönlü Kanalları gönderir
   */
  sendNearbyChannelsToUser(user) {
    if (user.lat === null || user.lng === null) return;
    const nearby = [];
    for (const [, ch] of this.channels.entries()) {
      const dist = calculateDistanceMeters(
        user.lat,
        user.lng,
        ch.lat,
        ch.lng
      );
      if (dist <= ch.radius) {
        // O kanalın menzilindeki toplam dinleyici sayısını hesapla
        let listenerCount = 0;
        for (const [, u] of this.users.entries()) {
          if (
            u.lat !== null &&
            u.lng !== null &&
            calculateDistanceMeters(u.lat, u.lng, ch.lat, ch.lng) <= ch.radius
          ) {
            listenerCount++;
          }
        }
        nearby.push({
          ...ch,
          distance: Math.round(dist),
          listenerCount,
        });
      }
    }
    this.sendEvent(user.ws, 'nearby_channels', nearby);
  }

  /**
   * Tüm bağlı kullanıcılara güncel yakın kanalları bildirir
   */
  broadcastNearbyChannelsToAll() {
    for (const [, u] of this.users.entries()) {
      this.sendNearbyChannelsToUser(u);
    }
  }

  getOrCreateProfile(clientId) {
    const today = getTodayKey();
    if (this.profiles.has(clientId)) {
      const prof = this.profiles.get(clientId);
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
      lastLat: null,
      lastLng: null,
      lastRadius: 100,
      lastSeenAt: Date.now(),
      pushSub: null,
      lastPushSentAt: 0,
      lastPushPayload: null,
    };
    this.profiles.set(clientId, newProfile);
    return newProfile;
  }

  sendQuotaAndIdentity(user) {
    const prof = this.getOrCreateProfile(user.clientId);
    this.sendEvent(user.ws, 'identity', {
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

  broadcastRoomUsers(roomId) {
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const roomMembers = [];
    for (const [, u] of this.users.entries()) {
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
      this.rooms.delete(roomId);
      return;
    }

    const avgLat =
      roomMembers.reduce((sum, m) => sum + m.lat, 0) / roomMembers.length;
    const avgLng =
      roomMembers.reduce((sum, m) => sum + m.lng, 0) / roomMembers.length;
    room.centerLat = avgLat;
    room.centerLng = avgLng;

    const nearbyInstalledCount = this.countNearbyInstalledDevices(
      avgLat,
      avgLng,
      room.radius,
      roomMembers.length
    );

    this.broadcastToRoom(roomId, 'room_users', {
      roomId,
      radius: room.radius,
      users: roomMembers,
      nearbyInstalledCount,
    });
  }

  assignUserToLocationRoom(user, lat, lng, requestedRadius) {
    const allowedRadii = [100, 500, 1000, 5000];
    let targetRadius = allowedRadii.includes(Number(requestedRadius))
      ? Number(requestedRadius)
      : 100;

    if (targetRadius > 100 && !user.isPlus) {
      targetRadius = 100;
      this.sendEvent(user.ws, 'paywall_trigger', {
        reason: 'radius_locked',
        message: `${
          requestedRadius >= 1000
            ? requestedRadius / 1000 + ' km'
            : requestedRadius + ' m'
        } menzil odasına erişmek için Mitemasuka Plus gereklidir.`,
      });
    }

    const wasInRoom = Boolean(user.roomId);
    user.lat = lat;
    user.lng = lng;
    user.radius = targetRadius;

    // Kullanıcının son bilinen konumunu güncelle ve kaydet
    const prof = this.getOrCreateProfile(user.clientId);
    prof.lastLat = lat;
    prof.lastLng = lng;
    prof.lastRadius = targetRadius;
    prof.lastSeenAt = Date.now();
    this.persistKnownDevices();

    // Kullanıcı ilk kez konuma bağlandığında 100m çevredeki kapalı cihazlara Web Push gönder
    if (!wasInRoom && !user.ghostMode) {
      this.notifyOfflineNearbyUsers(user, lat, lng);
    }

    // Kullanıcının yakınındaki Tek Yönlü Kanalları da gönder
    this.sendNearbyChannelsToUser(user);

    if (user.roomId && this.rooms.has(user.roomId)) {
      const currentRoom = this.rooms.get(user.roomId);
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
        this.broadcastRoomUsers(user.roomId);
        return;
      } else {
        const oldRoomId = user.roomId;
        user.roomId = null;

        this.cleanupClientDmInRoom(oldRoomId, user.clientId, user.username);

        if (!user.ghostMode) {
          this.broadcastToRoom(oldRoomId, 'system_message', {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'leave',
            text: `${user.username} uzaklaştı`,
            timestamp: new Date().toISOString(),
          });
        }
        this.broadcastRoomUsers(oldRoomId);
      }
    }

    let matchedRoomId = null;
    let minDistance = Infinity;

    for (const [, otherUser] of this.users.entries()) {
      if (
        otherUser.id !== user.id &&
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
      this.rooms.set(matchedRoomId, {
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
    const roomObj = this.rooms.get(matchedRoomId);
    const activeDmSession = this.getUserDmSession(roomObj, user.clientId);

    this.sendEvent(user.ws, 'joined_room', {
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
      this.broadcastToRoom(
        matchedRoomId,
        'system_message',
        {
          id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'join',
          text: `${user.username} menzile girdi${distText}`,
          timestamp: new Date().toISOString(),
        },
        user.id
      );
    }

    this.sendEvent(user.ws, 'system_message', {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'info',
      text: `${
        targetRadius >= 1000 ? targetRadius / 1000 + ' km' : targetRadius + ' m'
      } menzil odasına bağlandınız (${user.username}${
        user.ghostMode ? ' • 👻 Hayalet Mod' : ''
      })`,
      timestamp: new Date().toISOString(),
    });

    this.broadcastRoomUsers(matchedRoomId);
  }

  handleSocketEvent(user, event, data) {
    if (event === 'update_location') {
      if (
        !data ||
        typeof data.lat !== 'number' ||
        typeof data.lng !== 'number'
      ) {
        return;
      }
      this.assignUserToLocationRoom(user, data.lat, data.lng, data.radius || 100);
      return;
    }

    // 🔔 KİLİT EKRANI WEB PUSH ABONELİĞİ KAYDETME
    if (event === 'register_push') {
      const sub = data?.subscription;
      if (!sub || typeof sub.endpoint !== 'string') return;
      const prof = this.getOrCreateProfile(user.clientId);
      prof.pushSub = {
        endpoint: sub.endpoint,
        keys: sub.keys || null,
      };
      prof.lastSeenAt = Date.now();
      this.persistKnownDevices();
      return;
    }

    // 📢 TEK YÖNLÜ KANAL (MEGAFON) KURMA
    if (event === 'create_channel') {
      if (user.lat === null || user.lng === null) return;
      const title = String(data?.title || '')
        .trim()
        .slice(0, 60);
      if (!title) return;

      const allowedRadii = [100, 500, 1000, 5000];
      const radius = allowedRadii.includes(Number(data?.radius))
        ? Number(data.radius)
        : 100;
      const plan = String(data?.plan || 'class_100m');

      const channelId = `ch_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const newChannel = {
        id: channelId,
        title,
        ownerClientId: user.clientId,
        ownerName: user.username,
        lat: user.lat,
        lng: user.lng,
        radius,
        plan,
        messages: [
          {
            id: `bmsg_${Date.now()}`,
            text: `📢 "${title}" canlı anons kanalı başlatıldı. Konuşmacının yazılı ve sesli duyuruları buradan anlık akacaktır.`,
            isLiveVoice: false,
            timestamp: new Date().toISOString(),
          },
        ],
        reactions: { '👏': 0, '🔥': 0, '❤️': 0, '👍': 0 },
        createdAt: Date.now(),
      };

      this.channels.set(channelId, newChannel);
      this.broadcastNearbyChannelsToAll();

      // Odaya da sistem bildirimi düşür
      if (user.roomId) {
        this.broadcastToRoom(user.roomId, 'system_message', {
          id: `sys_${Date.now()}`,
          type: 'info',
          text: `📢 ${user.username} yeni bir Tek Yönlü Anons Kanalı açtı: "${title}"`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // 📢 TEK YÖNLÜ KANALA ANONS VEYA CANLI SESLİ ALTYAZI GÖNDERME (Sadece Kanal Sahibi)
    if (event === 'send_channel_broadcast') {
      const channelId = String(data?.channelId || '');
      const ch = this.channels.get(channelId);
      if (!ch || ch.ownerClientId !== user.clientId) return;

      const text = String(data?.text || '')
        .trim()
        .slice(0, 1000);
      if (!text) return;

      const bMsg = {
        id: `bmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        isLiveVoice: Boolean(data?.isLiveVoice),
        timestamp: new Date().toISOString(),
      };

      ch.messages.push(bMsg);
      if (ch.messages.length > 50) ch.messages.shift();

      this.broadcastNearbyChannelsToAll();
      return;
    }

    // 📢 TEK YÖNLÜ KANALA ALKIŞ / TEPKİ GÖNDERME (Dinleyiciler)
    if (event === 'react_channel') {
      const channelId = String(data?.channelId || '');
      const emoji = String(data?.emoji || '');
      const ch = this.channels.get(channelId);
      if (!ch) return;
      if (!['👏', '🔥', '❤️', '👍'].includes(emoji)) return;

      ch.reactions[emoji] = (ch.reactions[emoji] || 0) + 1;
      this.broadcastNearbyChannelsToAll();
      return;
    }

    // 📢 TEK YÖNLÜ KANALI KAPATMA (Sadece Kanal Sahibi)
    if (event === 'close_channel') {
      const channelId = String(data?.channelId || '');
      const ch = this.channels.get(channelId);
      if (!ch || ch.ownerClientId !== user.clientId) return;

      this.channels.delete(channelId);
      this.broadcastNearbyChannelsToAll();
      return;
    }

    if (event === 'activate_plus') {
      const plan = data?.plan || 'daily';
      const prof = this.getOrCreateProfile(user.clientId);
      prof.isPlus = true;
      prof.plusPlan = plan;
      user.isPlus = true;
      user.plusPlan = plan;
      this.sendQuotaAndIdentity(user);
      if (user.roomId) this.broadcastRoomUsers(user.roomId);
      return;
    }

    if (event === 'set_nickname') {
      if (!user.isPlus) {
        this.sendEvent(user.ws, 'paywall_trigger', {
          reason: 'custom_nickname',
          message: 'Özel takma ad belirlemek için Mitemasuka Plus gereklidir.',
        });
        return;
      }
      const cleanName = String(data?.nickname || '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 20);
      if (cleanName.length < 2) return;

      const oldName = user.username;
      const prof = this.getOrCreateProfile(user.clientId);
      prof.username = cleanName;
      user.username = cleanName;

      this.sendQuotaAndIdentity(user);
      if (user.roomId) {
        const roomObj = this.rooms.get(user.roomId);
        const dmSession = this.getUserDmSession(roomObj, user.clientId);
        if (dmSession) {
          if (dmSession.initiatorClientId === user.clientId) {
            dmSession.initiatorName = cleanName;
          }
          if (dmSession.recipientClientId === user.clientId) {
            dmSession.recipientName = cleanName;
          }
          this.emitToClientsInRoom(
            user.roomId,
            [dmSession.initiatorClientId, dmSession.recipientClientId],
            'dm_state',
            { session: dmSession }
          );
        }
        this.broadcastRoomUsers(user.roomId);
        this.broadcastToRoom(user.roomId, 'system_message', {
          id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'info',
          text: `✨ ${oldName} adını "${cleanName}" olarak değiştirdi`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    if (event === 'set_ghost_mode') {
      if (!user.isPlus) {
        this.sendEvent(user.ws, 'paywall_trigger', {
          reason: 'ghost_mode',
          message: '👻 Hayalet Modu kullanmak için Mitemasuka Plus gereklidir.',
        });
        return;
      }
      const enabled = Boolean(data?.enabled);
      const prof = this.getOrCreateProfile(user.clientId);
      prof.ghostMode = enabled;
      user.ghostMode = enabled;

      this.sendQuotaAndIdentity(user);
      if (user.roomId) this.broadcastRoomUsers(user.roomId);
      return;
    }

    // 1'e 1 Özel Görüşme İsteğini Kabul Etme
    if (event === 'dm_accept') {
      if (!user.roomId) return;
      const roomObj = this.rooms.get(user.roomId);
      if (!roomObj) return;
      const session = this.getUserDmSession(roomObj, user.clientId);
      if (!session || session.recipientClientId !== user.clientId) return;

      session.status = 'accepted';
      this.getOrCreateProfile(session.initiatorClientId).whisperContacts.add(
        user.clientId
      );
      this.getOrCreateProfile(user.clientId).whisperContacts.add(
        session.initiatorClientId
      );

      this.emitToClientsInRoom(
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
      return;
    }

    // 1'e 1 Özel Görüşmeyi Reddetme veya Sonlandırma
    if (event === 'dm_close') {
      if (!user.roomId) return;
      const roomObj = this.rooms.get(user.roomId);
      if (!roomObj || !roomObj.dmSessions) return;
      const session = this.getUserDmSession(roomObj, user.clientId);
      if (!session) return;

      const isRejected =
        session.status === 'pending' &&
        session.recipientClientId === user.clientId &&
        data?.reason === 'rejected';

      const peerClientId =
        session.initiatorClientId === user.clientId
          ? session.recipientClientId
          : session.initiatorClientId;

      roomObj.dmSessions = roomObj.dmSessions.filter(
        (s) => s.id !== session.id
      );
      if (roomObj.whispers) {
        roomObj.whispers = roomObj.whispers.filter(
          (w) =>
            !(
              (w.senderClientId === user.clientId &&
                w.whisperToClientId === peerClientId) ||
              (w.senderClientId === peerClientId &&
                w.whisperToClientId === user.clientId)
            )
        );
      }

      this.emitToClientsInRoom(
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
      return;
    }

    if (event === 'send_message') {
      if (!user.roomId) return;
      const roomObj = this.rooms.get(user.roomId);
      if (!roomObj) return;
      const prof = this.getOrCreateProfile(user.clientId);

      if (prof.isBanned) {
        this.sendEvent(user.ws, 'system_message', {
          id: `sys_${Date.now()}`,
          type: 'leave',
          text: '⛔ Topluluk kurallarını ihlal ettiğiniz için mesaj gönderiminiz kısıtlanmıştır.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const now = Date.now();
      if (now - user.lastMsgAt < 600) return;
      user.lastMsgAt = now;

      const text = String(data?.text || '').trim();
      if (!text) return;

      // Özel mesaj (fısıltı): alıcı kalıcı clientId ile belirlenir
      const isWhisperIntent = Boolean(
        data?.isWhisper || data?.whisperToClientId || data?.whisperToId
      );
      let whisperToId = null;
      let whisperToName = null;
      let whisperToClientId = null;
      let whisperTargets = [];
      let dmSession = null;

      if (isWhisperIntent) {
        const reqToClientId = data?.whisperToClientId
          ? String(data.whisperToClientId)
          : null;
        const reqToSocketId = data?.whisperToId || null;

        whisperToClientId =
          reqToClientId ||
          (this.users.get(reqToSocketId)
            ? this.users.get(reqToSocketId).clientId
            : null);

        // Özel mesaj niyeti varsa asla genel odaya düşmemeli
        if (!whisperToClientId || whisperToClientId === user.clientId) return;

        // Alıcı aynı odada ve çevrimiçi olmalı (sunucu tarafı doğrulama)
        for (const [, u] of this.users.entries()) {
          if (u.clientId === whisperToClientId && u.roomId === user.roomId) {
            whisperTargets.push(u);
          }
        }
        if (whisperTargets.length === 0) {
          this.sendEvent(user.ws, 'whisper_failed', {
            reason: 'user_left',
            targetClientId: whisperToClientId,
            targetName: data?.whisperToName || null,
          });
          return;
        }
        whisperToId = whisperTargets[0].id;
        whisperToName = whisperTargets[0].username;

        // Tek-eşli (1'e 1) özel görüşme ve Kabul/Red kontrolü
        dmSession = this.getUserDmSession(roomObj, user.clientId);
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
            this.sendEvent(user.ws, 'dm_error', {
              reason: 'self_busy',
              peerClientId: myPeerId,
              peerName: myPeerName,
            });
            return;
          }

          if (dmSession.status === 'pending') {
            if (dmSession.initiatorClientId === user.clientId) {
              this.sendEvent(user.ws, 'dm_error', {
                reason: 'waiting_accept',
                peerClientId: myPeerId,
                peerName: myPeerName,
              });
              return;
            } else {
              // Alıcı doğrudan cevap yazarsa otomatik kabul etmiş sayılır
              dmSession.status = 'accepted';
            }
          }
        } else {
          // Karşı tarafın başka biriyle aktif veya bekleyen özel görüşmesi var mı?
          const targetSession = this.getUserDmSession(
            roomObj,
            whisperToClientId
          );
          if (targetSession) {
            this.sendEvent(user.ws, 'dm_error', {
              reason: 'target_busy',
              peerClientId: whisperToClientId,
              peerName: whisperToName,
            });
            return;
          }

          // Konuşmayı başlatmak Plus ister; kendisine yazılmış birine cevap vermek ücretsizdir
          if (!user.isPlus && !prof.whisperContacts.has(whisperToClientId)) {
            this.sendEvent(user.ws, 'paywall_trigger', {
              reason: 'whisper_locked',
              message:
                'Odadaki bir kişiye 1-e-1 özel fısıltı (DM) göndermek için Mitemasuka Plus gereklidir.',
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

      if (!user.isPlus) {
        if (prof.dailyCount >= FREE_DAILY_MESSAGE_LIMIT) {
          this.sendEvent(user.ws, 'paywall_trigger', {
            reason: 'quota_exceeded',
            message: `Günlük ${FREE_DAILY_MESSAGE_LIMIT} ücretsiz mesaj hakkınız doldu! Sohbete sınırsız devam etmek için Mitemasuka Plus'a geçin.`,
          });
          return;
        }
        prof.dailyCount += 1;
        this.sendQuotaAndIdentity(user);
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
        replyTo: data?.replyTo || null,
        whisperToId,
        whisperToName,
        whisperToClientId,
        reactions: {},
        timestamp: new Date().toISOString(),
      };

      if (isWhisperIntent && whisperToClientId && dmSession) {
        // Alıcı artık bu kullanıcıya ücretsiz cevap verebilir
        this.getOrCreateProfile(whisperToClientId).whisperContacts.add(
          user.clientId
        );

        dmSession.messages.push(messageData);
        if (dmSession.messages.length > MAX_ROOM_WHISPERS) {
          dmSession.messages.shift();
        }

        if (!roomObj.whispers) roomObj.whispers = [];
        roomObj.whispers.push(messageData);
        if (roomObj.whispers.length > MAX_ROOM_WHISPERS) {
          roomObj.whispers.shift();
        }

        this.emitToClientsInRoom(
          user.roomId,
          [user.clientId, whisperToClientId],
          'chat_message',
          messageData
        );
        this.emitToClientsInRoom(
          user.roomId,
          [user.clientId, whisperToClientId],
          'dm_state',
          { session: dmSession }
        );
        return;
      }

      roomObj.messages.push(messageData);
      if (roomObj.messages.length > MAX_ROOM_HISTORY) {
        roomObj.messages.shift();
      }

      this.broadcastToRoom(user.roomId, 'chat_message', messageData);
      return;
    }

    if (event === 'react_message') {
      if (!user.roomId || !data?.messageId || !data?.emoji) return;
      const allowedEmojis = ['❤️', '😂', '👍', '🔥'];
      if (!allowedEmojis.includes(data.emoji)) return;

      const roomObj = this.rooms.get(user.roomId);
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
          if (idx >= 0) list.splice(idx, 1);
          else list.push(user.username);
        }
      }

      const reactionPayload = {
        messageId: data.messageId,
        emoji: data.emoji,
        username: user.username,
      };
      if (whisperMsg) {
        for (const [, u] of this.users.entries()) {
          if (
            u.roomId === user.roomId &&
            (u.clientId === whisperMsg.senderClientId ||
              u.clientId === whisperMsg.whisperToClientId)
          ) {
            this.sendEvent(u.ws, 'message_reaction', reactionPayload);
          }
        }
      } else {
        this.broadcastToRoom(user.roomId, 'message_reaction', reactionPayload);
      }
      return;
    }

    if (event === 'report_user') {
      if (!data?.targetClientId || user.clientId === data.targetClientId) return;
      const targetProf = this.profiles.get(String(data.targetClientId));
      if (!targetProf) return;

      targetProf.reportedBy.add(user.clientId);
      if (
        targetProf.reportedBy.size >= REPORT_BAN_THRESHOLD &&
        !targetProf.isBanned
      ) {
        targetProf.isBanned = true;
        for (const [, u] of this.users.entries()) {
          if (u.clientId === targetProf.clientId) {
            this.sendQuotaAndIdentity(u);
            if (u.roomId) {
              this.broadcastToRoom(u.roomId, 'system_message', {
                id: `sys_${Date.now()}`,
                type: 'leave',
                text: `🛡️ ${u.username} çoklu kullanıcı şikayeti nedeniyle odadan susturuldu.`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      }
      return;
    }

    if (event === 'typing') {
      if (!user.roomId || user.ghostMode) return;
      this.broadcastToRoom(
        user.roomId,
        'user_typing',
        {
          userId: user.id,
          username: user.username,
          isTyping: Boolean(data),
        },
        user.id
      );
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Service Worker kilit ekranı bildirimi uyandığında son bildirim metnini çeker
    if (url.pathname === '/push-info') {
      const cid = url.searchParams.get('clientId') || '';
      const prof = cid ? this.profiles.get(cid) : null;
      const payload = prof?.lastPushPayload || {
        title: '👋 Mitemasuka — Beni Görüyor Musun?',
        body: '100m yakınında biri uygulamayı açtı! Odaya bağlanmak için dokun.',
      };
      return new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response(
        JSON.stringify({
          service: 'Mitemasuka WebSocket Hub (見てますか?)',
          status: 'ok',
          activeUsers: this.users.size,
          activeRooms: this.rooms.size,
          activeChannels: this.channels.size,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const socketId =
      'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const clientId = url.searchParams.get('clientId') || `anon_${socketId}`;
    const profile = this.getOrCreateProfile(String(clientId));

    const userObj = {
      id: socketId,
      ws: server,
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

    this.users.set(socketId, userObj);
    this.sendQuotaAndIdentity(userObj);

    server.addEventListener('message', (msg) => {
      try {
        const parsed = JSON.parse(String(msg.data));
        if (parsed && parsed.event) {
          this.handleSocketEvent(userObj, parsed.event, parsed.data);
        }
      } catch {}
    });

    const handleDisconnect = () => {
      const u = this.users.get(socketId);
      if (u) {
        const oldRoomId = u.roomId;
        this.users.delete(socketId);
        if (oldRoomId) {
          this.cleanupClientDmInRoom(oldRoomId, u.clientId, u.username);
          if (!u.ghostMode) {
            this.broadcastToRoom(oldRoomId, 'system_message', {
              id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: 'leave',
              text: `${u.username} uzaklaştı`,
              timestamp: new Date().toISOString(),
            });
          }
          this.broadcastRoomUsers(oldRoomId);
        }
      }
    };

    server.addEventListener('close', handleDisconnect);
    server.addEventListener('error', handleDisconnect);

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rawRegion = url.searchParams.get('region') || 'global-hub-v1';
    const safeRegion =
      String(rawRegion)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 40) || 'global-hub-v1';
    const id = env.MITEMASUKA_HUB.idFromName(safeRegion);
    const stub = env.MITEMASUKA_HUB.get(id);
    return stub.fetch(request);
  },
};
