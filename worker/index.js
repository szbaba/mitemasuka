/**
 * Mitemasuka (見てますか?) — Cloudflare Workers + Durable Objects
 * 7/24 Kesintisiz Gerçek Zamanlı WebSocket, Haversine Oda & Tek Yönlü Megafon Kanal Sunucusu (ws.mitemasuka.com)
 */

const FREE_DAILY_MESSAGE_LIMIT = 15;
const MAX_ROOM_HISTORY = 25;
const REPORT_BAN_THRESHOLD = 3;

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
    /**
     * Tek Yönlü Megafon / Anons Kanalları
     * channelId -> {
     *   id: string,
     *   title: string,
     *   ownerClientId: string,
     *   ownerName: string,
     *   lat: number,
     *   lng: number,
     *   radius: number (500 | 1000 | 5000),
     *   plan: string,
     *   messages: Array<{ id, text, isLiveVoice, timestamp }>,
     *   reactions: { '👏': number, '🔥': number, '❤️': number, '👍': number },
     *   createdAt: number
     * }
     */
    this.channels = new Map();
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

    this.broadcastToRoom(roomId, 'room_users', {
      roomId,
      radius: room.radius,
      users: roomMembers,
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

    user.lat = lat;
    user.lng = lng;
    user.radius = targetRadius;

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
        createdAt: Date.now(),
      });
    }

    user.roomId = matchedRoomId;
    const roomObj = this.rooms.get(matchedRoomId);

    this.sendEvent(user.ws, 'joined_room', {
      roomId: matchedRoomId,
      radius: targetRadius,
      username: user.username,
      userId: user.id,
      history: roomObj ? roomObj.messages : [],
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

    if (event === 'send_message') {
      if (!user.roomId) return;
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

      const whisperToId = data?.whisperToId || null;
      const whisperToName = data?.whisperToName || null;

      if (whisperToId && !user.isPlus) {
        this.sendEvent(user.ws, 'paywall_trigger', {
          reason: 'whisper_locked',
          message:
            'Odadaki bir kişiye 1-e-1 özel fısıltı (DM) göndermek için Mitemasuka Plus gereklidir.',
        });
        return;
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
        reactions: {},
        timestamp: new Date().toISOString(),
      };

      if (whisperToId) {
        const target = this.users.get(whisperToId);
        if (target) this.sendEvent(target.ws, 'chat_message', messageData);
        this.sendEvent(user.ws, 'chat_message', messageData);
        return;
      }

      const roomObj = this.rooms.get(user.roomId);
      if (roomObj) {
        roomObj.messages.push(messageData);
        if (roomObj.messages.length > MAX_ROOM_HISTORY) {
          roomObj.messages.shift();
        }
      }

      this.broadcastToRoom(user.roomId, 'chat_message', messageData);
      return;
    }

    if (event === 'react_message') {
      if (!user.roomId || !data?.messageId || !data?.emoji) return;
      const allowedEmojis = ['❤️', '😂', '👍', '🔥'];
      if (!allowedEmojis.includes(data.emoji)) return;

      const roomObj = this.rooms.get(user.roomId);
      if (roomObj) {
        const targetMsg = roomObj.messages.find((m) => m.id === data.messageId);
        if (targetMsg) {
          if (!targetMsg.reactions) targetMsg.reactions = {};
          if (!targetMsg.reactions[data.emoji]) {
            targetMsg.reactions[data.emoji] = [];
          }
          const list = targetMsg.reactions[data.emoji];
          const idx = list.indexOf(user.username);
          if (idx >= 0) list.splice(idx, 1);
          else list.push(user.username);
        }
      }

      this.broadcastToRoom(user.roomId, 'message_reaction', {
        messageId: data.messageId,
        emoji: data.emoji,
        username: user.username,
      });
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
    const id = env.MITEMASUKA_HUB.idFromName('global-hub-v1');
    const stub = env.MITEMASUKA_HUB.get(id);
    return stub.fetch(request);
  },
};
