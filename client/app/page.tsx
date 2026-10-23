'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Radar,
  Send,
  Users,
  MapPin,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Menu,
  X,
  Lock,
  Sparkles,
  QrCode,
  Ghost,
  Edit3,
  Volume2,
  VolumeX,
  ShieldAlert,
  Ban,
  ArrowLeft,
  Reply,
  MessageSquareLock,
  Check,
  Copy,
  Mail,
  Info,
  Globe,
  RefreshCw,
  Megaphone,
  Mic,
  MicOff,
  Radio,
  Sun,
  Moon,
  Palette,
} from 'lucide-react';
import {
  LangCode,
  SUPPORTED_LANGS,
  detectBrowserLang,
  translateTextFree,
  localizeSystemMessage,
  UI_TEXT,
} from './i18n';

interface WsClient {
  emit: (event: string, data?: unknown) => void;
  close: () => void;
}

interface RoomUser {
  id: string;
  clientId: string;
  username: string;
  color: string;
  isPlus?: boolean;
  ghostMode?: boolean;
  lat: number;
  lng: number;
  radius: number;
}

interface ReplyInfo {
  id: string;
  senderName: string;
  text: string;
}

interface ChatItem {
  id: string;
  kind: 'chat' | 'system';
  senderId?: string;
  senderClientId?: string;
  senderName?: string;
  senderColor?: string;
  senderIsPlus?: boolean;
  senderLat?: number;
  senderLng?: number;
  text: string;
  replyTo?: ReplyInfo | null;
  whisperToId?: string | null;
  whisperToName?: string | null;
  whisperToClientId?: string | null;
  reactions?: Record<string, string[]>;
  systemType?: 'join' | 'leave' | 'info';
  timestamp: string;
}

interface DmSession {
  id: string;
  roomId: string;
  initiatorClientId: string;
  initiatorName: string;
  recipientClientId: string;
  recipientName: string;
  status: 'pending' | 'accepted';
  messages: ChatItem[];
  createdAt: number;
}

interface BroadcastMessage {
  id: string;
  text: string;
  isLiveVoice?: boolean;
  timestamp: string;
}

interface BroadcastChannel {
  id: string;
  title: string;
  ownerClientId: string;
  ownerName: string;
  lat: number;
  lng: number;
  radius: number;
  plan: string;
  distance?: number;
  listenerCount?: number;
  messages: BroadcastMessage[];
  reactions: Record<string, number>;
  createdAt: number;
}

const RADIUS_OPTIONS = [
  { value: 100, label: '100 m', requiresPlus: false },
  { value: 500, label: '500 m', requiresPlus: true },
  { value: 1000, label: '1 km', requiresPlus: true },
  { value: 5000, label: '5 km', requiresPlus: true },
];

const CHANNEL_PLANS = [
  {
    id: 'class_100m',
    radius: 100,
    title: 'Sınıf / Tur Rehberi',
    rangeLabel: '100 m Çap',
    duration: '2 Saatlik Yayın',
    price: '99 ₺',
  },
  {
    id: 'guide_500m',
    radius: 500,
    title: 'Seminer / Kampüs',
    rangeLabel: '500 m Çap',
    duration: '6 Saatlik Yayın',
    price: '199 ₺',
  },
  {
    id: 'concert_1km',
    radius: 1000,
    title: 'Konser / Konferans',
    rangeLabel: '1 km Çap',
    duration: '24 Saatlik Yayın',
    price: '499 ₺',
  },
  {
    id: 'rally_5km',
    radius: 5000,
    title: 'Miting / Festival',
    rangeLabel: '5 km Çap',
    duration: '24 Saatlik Yayın',
    price: '1.499 ₺',
  },
];

const CHANNEL_REACTIONS = ['👏', '🔥', '❤️', '👍'];

const CHAT_BACKGROUNDS = [
  {
    id: 'ice',
    label: 'Buz Mavisi',
    swatch: '#dde6f0',
    className: 'bg-[#e3eaf2] dark:bg-[#161616]',
  },
  {
    id: 'mist',
    label: 'Mavi Degrade',
    swatch: 'linear-gradient(135deg, #dbeafe 0%, #cbd5e1 100%)',
    className:
      'bg-gradient-to-b from-[#e2e8f0] via-[#dbeafe]/85 to-[#cbd5e1] dark:from-[#1f1f1f] dark:via-[#181818] dark:to-[#121212]',
  },
  {
    id: 'slate',
    label: 'Koyu Gümüş',
    swatch: '#cbd5e1',
    className: 'bg-[#d4dde8] dark:bg-[#121212]',
  },
  {
    id: 'dots',
    label: 'Radar Noktalı',
    swatch: '#d8e2ed',
    className:
      'bg-[#dee6f0] dark:bg-[#161616] bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#333333_1px,transparent_1px)] [background-size:18px_18px]',
  },
  {
    id: 'sand',
    label: 'Sıcak Kum',
    swatch: '#e6e1d6',
    className: 'bg-[#e7e2d8] dark:bg-[#1c1b1a]',
  },
  {
    id: 'mint',
    label: 'Adaçayı',
    swatch: '#d6e6df',
    className: 'bg-[#dcebe4] dark:bg-[#171a18]',
  },
] as const;

type ChatBgId = (typeof CHAT_BACKGROUNDS)[number]['id'];

function getDistanceMeters(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number | null {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return null;
  }
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function playTinSound(type: 'room' | 'whisper' | 'presence' = 'room') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();

    if (type === 'whisper') {
      // Özel Fısıltı için zarif çift "Tin-Tin" kristal çan sesi
      [0, 0.14].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const freq = idx === 0 ? 987.77 : 1318.51; // B5 -> E6
        osc.frequency.setValueAtTime(freq, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.09, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + offset + 0.22
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } else if (type === 'presence') {
      // Odaya Giriş / Çıkış için yumuşak radar tonu
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else {
      // Genel Oda Mesajı için berrak "Tin" (Kristal Ding) sesi
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 kristal çan
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {}
}

function requestNotifPermissionIfNeeded() {
  try {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {});
    }
  } catch {}
}

function triggerBrowserNotification(title: string, body: string) {
  try {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
      });
    }
  } catch {}
}

const VAPID_PUBLIC_KEY =
  'BMZfazNz6u-QkK7DBuhuQACka3JeQXUB2yirba0Pk0fgh_UnlqSxi1GqGdsN3HwbEhknQaoaUQG0OJ5lSRHoMMA';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : '';
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function MitemasukaPage() {
  const [socket, setSocket] = useState<WsClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Kullanıcının kalıcı kimliği ve Plus / Kota durumu (tanışma döneminde varsayılan Plus)
  const [myId, setMyId] = useState<string>('');
  const [myClientId, setMyClientId] = useState<string>('');
  const [myUsername, setMyUsername] = useState<string>('Bağlanıyor...');
  const [myColor, setMyColor] = useState<string>('#34D399');
  const [isPlus, setIsPlus] = useState<boolean>(true);
  const [ghostMode, setGhostMode] = useState<boolean>(false);
  const [remainingQuota, setRemainingQuota] = useState<number>(15);
  const [dailyLimit, setDailyLimit] = useState<number>(15);
  const [isBanned, setIsBanned] = useState<boolean>(false);

  // Konum ve Oda durumu
  const [baseCoords, setBaseCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isRequestingGeo, setIsRequestingGeo] = useState<boolean>(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(100);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [nearbyInstalledCount, setNearbyInstalledCount] = useState<number>(1);
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [showMembersDrawer, setShowMembersDrawer] = useState<boolean>(false);
  const [showRadiusMenu, setShowRadiusMenu] = useState<boolean>(false);

  // 📢 Tek Yönlü Megafon / Anons Kanalları Durumu
  const [nearbyChannels, setNearbyChannels] = useState<BroadcastChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showCreateChannelModal, setShowCreateChannelModal] =
    useState<boolean>(false);
  const [channelTitleInput, setChannelTitleInput] = useState<string>('');
  const [selectedChannelPlan, setSelectedChannelPlan] = useState<
    (typeof CHANNEL_PLANS)[number]
  >(CHANNEL_PLANS[1]);
  const [channelInputText, setChannelInputText] = useState<string>('');
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const [liveTranscriptPreview, setLiveTranscriptPreview] =
    useState<string>('');

  // Menü ve Modallar
  const [showHamburgerMenu, setShowHamburgerMenu] = useState<boolean>(false);
  const [showPlusModal, setShowPlusModal] = useState<boolean>(false);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);
  const [selectedPlanOption, setSelectedPlanOption] = useState<
    'daily' | 'weekly' | 'monthly'
  >('daily');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [showStoryModal, setShowStoryModal] = useState<boolean>(false);
  const [activeStoryLang, setActiveStoryLang] = useState<'tr' | 'en' | 'jp'>(
    'tr'
  );
  const [showNicknameModal, setShowNicknameModal] = useState<boolean>(false);
  const [nicknameInput, setNicknameInput] = useState<string>('');
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  // Yerel Simülatör & 3'lü Bağımsız Bildirim / Ses Ayarları + Tema (Corsecure Light/Dark) + Çoklu Dil
  const [uiLang, setUiLang] = useState<LangCode>('tr');
  const [autoTranslate, setAutoTranslate] = useState<boolean>(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [hiddenTranslationIds, setHiddenTranslationIds] = useState<
    Record<string, boolean>
  >({});
  const checkedTranslationKeysRef = useRef<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [chatBg, setChatBg] = useState<ChatBgId>('ice');
  const [simOffsetMeters, setSimOffsetMeters] = useState<number>(0);
  const [showSimBar, setShowSimBar] = useState<boolean>(false);
  const [roomNotifEnabled, setRoomNotifEnabled] = useState<boolean>(true);
  const [whisperNotifEnabled, setWhisperNotifEnabled] = useState<boolean>(true);
  const [presenceNotifEnabled, setPresenceNotifEnabled] =
    useState<boolean>(false);

  // Mesajlaşma, Yanıtlama, Özel Fısıltı ve Engelleme
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<ReplyInfo | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  // Özel konuşmalar (fısıltılar) oda akışından ayrı tutulur (aynı anda en fazla 1 kişiyle)
  const [whispers, setWhispers] = useState<ChatItem[]>([]);
  const [dmSession, setDmSession] = useState<DmSession | null>(null);
  const [dmDraftPeer, setDmDraftPeer] = useState<{
    clientId: string;
    username: string;
  } | null>(null);
  const [dmNotice, setDmNotice] = useState<{
    type: 'rejected' | 'closed' | 'peer_left' | 'self_busy' | 'target_busy';
    peerName: string;
  } | null>(null);
  const [activeView, setActiveView] = useState<'room' | 'dm'>('room');
  const [unreadDmCount, setUnreadDmCount] = useState<number>(0);
  const dmViewRef = useRef<{ view: 'room' | 'dm'; peer: string | null }>({
    view: 'room',
    peer: null,
  });
  const dmEndRef = useRef<HTMLDivElement | null>(null);
  const [blockedClientIds, setBlockedClientIds] = useState<
    Record<string, string>
  >({});
  const [reportedClientIds, setReportedClientIds] = useState<
    Record<string, boolean>
  >({});
  const [reportTarget, setReportTarget] = useState<{
    clientId: string;
    username: string;
    done?: boolean;
  } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roomNotifRef = useRef<boolean>(true);
  const whisperNotifRef = useRef<boolean>(true);
  const presenceNotifRef = useRef<boolean>(false);
  const myIdRef = useRef<string>('');
  const watchIdRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    roomNotifRef.current = roomNotifEnabled;
    try {
      localStorage.setItem('mitemasuka_notif_room', String(roomNotifEnabled));
    } catch {}
  }, [roomNotifEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('mitemasuka_chat_bg', chatBg);
    } catch {}
  }, [chatBg]);

  useEffect(() => {
    try {
      localStorage.setItem('mitemasuka_lang', uiLang);
    } catch {}
    if (uiLang === 'tr') setActiveStoryLang('tr');
    else if (uiLang === 'ja') setActiveStoryLang('jp');
    else setActiveStoryLang('en');
  }, [uiLang]);

  useEffect(() => {
    try {
      localStorage.setItem('mitemasuka_auto_translate', String(autoTranslate));
    } catch {}
  }, [autoTranslate]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode);
    }
    try {
      localStorage.setItem('mitemasuka_theme', isDarkMode ? 'dark' : 'light');
    } catch {}
  }, [isDarkMode]);

  useEffect(() => {
    whisperNotifRef.current = whisperNotifEnabled;
    try {
      localStorage.setItem(
        'mitemasuka_notif_whisper',
        String(whisperNotifEnabled)
      );
    } catch {}
  }, [whisperNotifEnabled]);

  useEffect(() => {
    presenceNotifRef.current = presenceNotifEnabled;
    try {
      localStorage.setItem(
        'mitemasuka_notif_presence',
        String(presenceNotifEnabled)
      );
    } catch {}
  }, [presenceNotifEnabled]);

  const effectiveCoords = React.useMemo(() => {
    if (!baseCoords) return null;
    const latOffset = simOffsetMeters / 111320;
    return {
      lat: baseCoords.lat + latOffset,
      lng: baseCoords.lng,
    };
  }, [baseCoords, simOffsetMeters]);

  const regionKey = React.useMemo(() => {
    if (baseCoords) {
      const reg = `reg_${Math.round(baseCoords.lat * 2)}_${Math.round(
        baseCoords.lng * 2
      )}`;
      try {
        localStorage.setItem('mitemasuka_region', reg);
      } catch {}
      return reg;
    }
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('mitemasuka_region') || 'global-hub-v1';
      }
    } catch {}
    return 'global-hub-v1';
  }, [baseCoords]);

  const activeChannel = React.useMemo(
    () => nearbyChannels.find((c) => c.id === activeChannelId) || null,
    [nearbyChannels, activeChannelId]
  );

  // Art arda gelen giriş/çıkış bildirimlerini (3 ve üzeri) tek satırda grupla
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const groupedMessages = React.useMemo(() => {
    type Entry = { item?: ChatItem; group?: ChatItem[] };
    const out: Entry[] = [];
    let run: ChatItem[] = [];
    const flush = () => {
      if (run.length >= 3) out.push({ group: run });
      else run.forEach((r) => out.push({ item: r }));
      run = [];
    };
    for (const m of messages) {
      if (
        m.kind === 'system' &&
        (m.systemType === 'join' || m.systemType === 'leave')
      ) {
        run.push(m);
      } else {
        flush();
        out.push({ item: m });
      }
    }
    flush();
    return out;
  }, [messages]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    try {
      const savedBlocks = localStorage.getItem('mitemasuka_blocked');
      if (savedBlocks) setBlockedClientIds(JSON.parse(savedBlocks));
      const savedRoom = localStorage.getItem('mitemasuka_notif_room');
      if (savedRoom !== null) setRoomNotifEnabled(savedRoom === 'true');
      const savedWhisper = localStorage.getItem('mitemasuka_notif_whisper');
      if (savedWhisper !== null)
        setWhisperNotifEnabled(savedWhisper === 'true');
      const savedPresence = localStorage.getItem('mitemasuka_notif_presence');
      if (savedPresence !== null)
        setPresenceNotifEnabled(savedPresence === 'true');
      const savedTheme = localStorage.getItem('mitemasuka_theme');
      if (savedTheme === 'dark') {
        setIsDarkMode(true);
      }
      const savedBg = localStorage.getItem('mitemasuka_chat_bg');
      if (
        savedBg &&
        CHAT_BACKGROUNDS.some((b) => b.id === savedBg)
      ) {
        setChatBg(savedBg as ChatBgId);
      }
      const detected = detectBrowserLang();
      setUiLang(detected);
      const savedAutoTr = localStorage.getItem('mitemasuka_auto_translate');
      if (savedAutoTr !== null) {
        setAutoTranslate(savedAutoTr === 'true');
      }
    } catch {}
  }, []);

  useEffect(() => {
    let storedClientId = '';
    try {
      storedClientId = localStorage.getItem('mitemasuka_client_id') || '';
      if (!storedClientId) {
        storedClientId =
          'mk_' +
          Date.now().toString(36) +
          '_' +
          Math.random().toString(36).substring(2, 9);
        localStorage.setItem('mitemasuka_client_id', storedClientId);
      }
    } catch {
      storedClientId =
        'mk_fallback_' + Math.random().toString(36).substring(2, 9);
    }
    setMyClientId(storedClientId);

    const wsBaseUrl =
      process.env.NEXT_PUBLIC_WS_URL || 'wss://ws.mitemasuka.com';

    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isUnmounted = false;

    const connectWebSocket = () => {
      if (isUnmounted) return;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      ws = new WebSocket(
        `${wsBaseUrl}?clientId=${encodeURIComponent(
          storedClientId
        )}&region=${encodeURIComponent(regionKey)}`
      );

      const clientWrapper: WsClient = {
        emit: (event: string, data?: unknown) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event, data }));
          }
        },
        close: () => {
          if (ws) ws.close();
        },
      };

      ws.onopen = () => {
        if (isUnmounted) return;
        setSocket(clientWrapper);
        setIsConnected(true);
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setIsConnected(false);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 1500);
      };

      ws.onerror = () => {
        if (ws) ws.close();
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(String(evt.data));
          const { event, data } = payload || {};

          if (event === 'identity') {
            myIdRef.current = data.id;
            setMyId(data.id);
            setMyUsername(data.username);
            setMyColor(data.color);
            setIsPlus(Boolean(data.isPlus));
            setGhostMode(Boolean(data.ghostMode));
            if (typeof data.dailyLimit === 'number')
              setDailyLimit(data.dailyLimit);
            if (typeof data.remainingQuota === 'number')
              setRemainingQuota(data.remainingQuota);
            setIsBanned(Boolean(data.isBanned));
          } else if (event === 'joined_room') {
            setRoomId(data.roomId);
            setSelectedRadius(data.radius);
            const sess: DmSession | null = data.dmSession || null;
            setDmSession(sess);
            setDmDraftPeer(null);
            setDmNotice(null);
            setWhispers(
              sess && Array.isArray(sess.messages)
                ? sess.messages.map((m: ChatItem) => ({ ...m, kind: 'chat' }))
                : Array.isArray(data.whispers)
                ? data.whispers.map((m: ChatItem) => ({ ...m, kind: 'chat' }))
                : []
            );
            setUnreadDmCount(0);
            setActiveView('room');
            if (Array.isArray(data.history) && data.history.length > 0) {
              setMessages(
                data.history.map((m: ChatItem) => ({
                  ...m,
                  kind: 'chat',
                }))
              );
            }
          } else if (event === 'room_users') {
            const list = data.users || [];
            setRoomUsers(list);
            setNearbyInstalledCount(
              Math.max(list.length, Number(data.nearbyInstalledCount) || 1)
            );
          } else if (event === 'nearby_channels') {
            if (Array.isArray(data)) {
              setNearbyChannels(data);
            }
          } else if (event === 'paywall_trigger') {
            setPaywallReason(data.message);
            setShowPlusModal(true);
          } else if (event === 'system_message') {
            setMessages((prev) => [
              ...prev,
              {
                id: data.id,
                kind: 'system',
                systemType: data.type,
                text: data.text,
                timestamp: data.timestamp,
              },
            ]);
            if (
              (data.type === 'join' || data.type === 'leave') &&
              presenceNotifRef.current
            ) {
              playTinSound('presence');
              triggerBrowserNotification(
                'Beni Görüyor Musun?',
                String(data.text || '')
              );
            }
          } else if (event === 'dm_state') {
            const sess: DmSession | null = data?.session || null;
            setDmSession(sess);
            if (sess) {
              setDmDraftPeer(null);
              setDmNotice(null);
              setWhispers(
                Array.isArray(sess.messages)
                  ? sess.messages.map((m: ChatItem) => ({ ...m, kind: 'chat' }))
                  : []
              );
            } else {
              setWhispers([]);
              setUnreadDmCount(0);
            }
            if (data?.notice) {
              const { type, byClientId, byName } = data.notice;
              if (type === 'rejected' && byClientId !== storedClientId) {
                setDmDraftPeer(null);
                setDmNotice({ type: 'rejected', peerName: byName || '' });
              } else if (type === 'closed' && byClientId !== storedClientId) {
                setDmDraftPeer(null);
                setDmNotice({ type: 'closed', peerName: byName || '' });
              } else if (type === 'peer_left') {
                setDmDraftPeer(null);
                setDmNotice({ type: 'peer_left', peerName: byName || '' });
              } else if (type === 'accepted') {
                setDmNotice(null);
              }
            }
          } else if (event === 'dm_error') {
            const { reason, peerName } = data || {};
            if (reason === 'self_busy') {
              setDmNotice({ type: 'self_busy', peerName: peerName || '' });
            } else if (reason === 'target_busy') {
              setDmDraftPeer(null);
              setDmNotice({ type: 'target_busy', peerName: peerName || '' });
            }
          } else if (
            event === 'chat_message' &&
            (data.whisperToClientId || data.whisperToId)
          ) {
            // Özel mesaj: oda akışına değil özel konuşmalara eklenir
            setWhispers((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, { ...data, kind: 'chat' }];
            });
            const fromMe =
              data.senderId === myIdRef.current ||
              data.senderClientId === storedClientId;
            if (!fromMe) {
              const v = dmViewRef.current;
              const viewing =
                v.view === 'dm' && document.visibilityState === 'visible';
              if (!viewing) {
                setUnreadDmCount((prev) => prev + 1);
              }
              if (whisperNotifRef.current) {
                playTinSound('whisper');
                triggerBrowserNotification(
                  `${data.senderName} (${t.tabPrivate})`,
                  String(data.text || '')
                );
              }
            }
          } else if (event === 'whisper_failed') {
            setDmDraftPeer(null);
            setDmNotice({
              type: 'peer_left',
              peerName: String(data?.targetName || ''),
            });
          } else if (event === 'chat_message') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [
                ...prev,
                {
                  ...data,
                  kind: 'chat',
                },
              ];
            });
            if (
              data.senderId !== myIdRef.current &&
              data.senderClientId !== storedClientId
            ) {
              const isWhisper = Boolean(data.whisperToId);
              if (isWhisper && whisperNotifRef.current) {
                playTinSound('whisper');
                triggerBrowserNotification(
                  `${data.senderName} (${t.tabPrivate})`,
                  String(data.text || '')
                );
              } else if (!isWhisper && roomNotifRef.current) {
                playTinSound('room');
                triggerBrowserNotification(
                  String(data.senderName || 'Mitemasuka'),
                  String(data.text || '')
                );
              }
            }
          } else if (event === 'message_reaction') {
            const applyReaction = (m: ChatItem) => {
              if (m.id !== data.messageId) return m;
              const currentReactions = { ...(m.reactions || {}) };
              const list = [...(currentReactions[data.emoji] || [])];
              const idx = list.indexOf(data.username);
              if (idx >= 0) list.splice(idx, 1);
              else list.push(data.username);
              currentReactions[data.emoji] = list;
              return { ...m, reactions: currentReactions };
            };
            setMessages((prev) => prev.map(applyReaction));
            setWhispers((prev) => prev.map(applyReaction));
          } else if (event === 'user_typing') {
            setTypingUsers((prev) => {
              const updated = { ...prev };
              if (data.isTyping) updated[data.userId] = data.username;
              else delete updated[data.userId];
              return updated;
            });
          }
        } catch {}
      };
    };

    connectWebSocket();

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        connectWebSocket();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      isUnmounted = true;
      window.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [regionKey]);

  const startLocationTracking = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Tarayıcınız konum özelliğini desteklemiyor.');
      return;
    }

    setIsRequestingGeo(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsRequestingGeo(false);
        setGeoError(null);
        setBaseCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        setIsRequestingGeo(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError('PERMISSION_DENIED');
        } else {
          setGeoError(
            'Konum sinyali alınamadı. Lütfen telefonunuzda Konum Servislerinin açık olduğundan emin olup tekrar deneyin.'
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setIsRequestingGeo(false);
        setGeoError(null);
        setBaseCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }, []);

  useEffect(() => {
    startLocationTracking();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startLocationTracking]);

  useEffect(() => {
    if (!socket || !isConnected || !effectiveCoords) return;

    socket.emit('update_location', {
      lat: effectiveCoords.lat,
      lng: effectiveCoords.lng,
      radius: selectedRadius,
    });
  }, [socket, isConnected, effectiveCoords, selectedRadius]);

  const subscribeToLockScreenPush = useCallback(
    async (askPermission: boolean) => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        return;
      }

      try {
        let perm = Notification.permission;
        if (perm === 'default' && askPermission) {
          perm = await Notification.requestPermission();
        }
        if (perm !== 'granted') return;

        const reg = await navigator.serviceWorker.ready;
        if (reg.active && myClientId) {
          reg.active.postMessage({
            type: 'SET_CLIENT_META',
            clientId: myClientId,
            region: regionKey,
          });
        }

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey.buffer as ArrayBuffer,
          });
        }

        if (sub && socket && isConnected) {
          socket.emit('register_push', { subscription: sub.toJSON() });
          setPushSubscribed(true);
        }
      } catch {}
    },
    [socket, isConnected, myClientId, regionKey]
  );

  useEffect(() => {
    if (!socket || !isConnected || !myClientId) return;
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      subscribeToLockScreenPush(false);
    }
  }, [socket, isConnected, myClientId, subscribeToLockScreenPush]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Aktif özel konuşmadaki karşı taraf (sunucu oturumu veya yeni seçilmiş taslak kişi)
  const dmPeer = React.useMemo(() => {
    if (dmSession) {
      const isInit = dmSession.initiatorClientId === myClientId;
      return {
        clientId: isInit
          ? dmSession.recipientClientId
          : dmSession.initiatorClientId,
        username: isInit
          ? dmSession.recipientName
          : dmSession.initiatorName,
      };
    }
    return dmDraftPeer;
  }, [dmSession, dmDraftPeer, myClientId]);

  // Özel konuşma görünümü senkronu (ws olay işleyicisi bu ref'i okur)
  useEffect(() => {
    dmViewRef.current = { view: activeView, peer: dmPeer?.clientId || null };
    if (activeView === 'dm') {
      setUnreadDmCount(0);
    }
  }, [activeView, dmPeer, whispers]);

  useEffect(() => {
    if (activeView === 'dm') {
      dmEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [whispers, activeView, dmPeer, dmSession]);

  const dmThreadMessages = React.useMemo(() => {
    if (!dmPeer) return [];
    return whispers.filter((w) =>
      w.kind === 'chat'
        ? (w.senderClientId === myClientId &&
            w.whisperToClientId === dmPeer.clientId) ||
          w.senderClientId === dmPeer.clientId
        : w.whisperToClientId === dmPeer.clientId
    );
  }, [whispers, dmPeer, myClientId]);

  const dmPeerOnline = dmPeer
    ? roomUsers.some((u) => u.clientId === dmPeer.clientId)
    : false;

  const isDmWaitingMyAccept = Boolean(
    dmSession &&
      dmSession.status === 'pending' &&
      dmSession.recipientClientId === myClientId
  );

  const isDmWaitingPeerAccept = Boolean(
    dmSession &&
      dmSession.status === 'pending' &&
      dmSession.initiatorClientId === myClientId
  );

  const handleAcceptDm = () => {
    if (!socket || !dmSession) return;
    socket.emit('dm_accept');
  };

  const handleCloseDm = (reason: 'rejected' | 'closed' = 'closed') => {
    if (dmSession && socket) {
      socket.emit('dm_close', { reason });
    }
    setDmSession(null);
    setDmDraftPeer(null);
    setWhispers([]);
    setUnreadDmCount(0);
  };

  // Özel konuşma başlat / aç. Aynı anda sadece 1 kişiyle özel konuşma yapılabilir.
  const openDm = (peerClientId?: string, peerName?: string) => {
    if (!peerClientId || !peerName || peerClientId === myClientId) return;

    if (dmSession) {
      const currentPeerId =
        dmSession.initiatorClientId === myClientId
          ? dmSession.recipientClientId
          : dmSession.initiatorClientId;
      const currentPeerName =
        dmSession.initiatorClientId === myClientId
          ? dmSession.recipientName
          : dmSession.initiatorName;

      if (currentPeerId !== peerClientId) {
        setDmNotice({ type: 'self_busy', peerName: currentPeerName });
        setActiveView('dm');
        setShowMembersDrawer(false);
        return;
      }

      setDmNotice(null);
      setActiveView('dm');
      setUnreadDmCount(0);
      setShowMembersDrawer(false);
      return;
    }

    if (!isPlus) {
      setPaywallReason(
        `${peerName} adlı kişiye 1'e 1 Özel Fısıltı (DM) göndermek için Mitemasuka Plus gereklidir.`
      );
      setShowPlusModal(true);
      return;
    }

    setDmNotice(null);
    setDmDraftPeer({ clientId: peerClientId, username: peerName });
    setActiveView('dm');
    setUnreadDmCount(0);
    setShowMembersDrawer(false);
  };

  useEffect(() => {
    channelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChannel?.messages]);

  // 🌐 Herkese Ücretsiz Otomatik Mesaj ve Kanal Altyazı Çevirisi
  useEffect(() => {
    if (!autoTranslate) return;

    [...messages, ...whispers].forEach((m) => {
      if (m.kind !== 'chat') return;
      const isMine =
        m.senderId === myId ||
        (m.senderClientId && m.senderClientId === myClientId);
      if (isMine) return;

      const key = `${m.id}_${uiLang}`;
      if (checkedTranslationKeysRef.current.has(key)) return;
      checkedTranslationKeysRef.current.add(key);

      translateTextFree(m.text, uiLang).then((res) => {
        if (res?.translated) {
          setTranslations((prev) => ({ ...prev, [key]: res.translated }));
        }
      });
    });

    if (activeChannel) {
      activeChannel.messages.forEach((bm) => {
        const key = `ch_${bm.id}_${uiLang}`;
        if (checkedTranslationKeysRef.current.has(key)) return;
        checkedTranslationKeysRef.current.add(key);

        translateTextFree(bm.text, uiLang).then((res) => {
          if (res?.translated) {
            setTranslations((prev) => ({ ...prev, [key]: res.translated }));
          }
        });
      });
    }
  }, [messages, whispers, activeChannel, uiLang, autoTranslate, myId, myClientId]);

  const handleToggleOrTranslateMessage = async (msgId: string, text: string) => {
    const key = `${msgId}_${uiLang}`;
    if (translations[key]) {
      setHiddenTranslationIds((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
      return;
    }
    const res = await translateTextFree(text, uiLang);
    if (res?.translated) {
      setTranslations((prev) => ({ ...prev, [key]: res.translated }));
      setHiddenTranslationIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSelectRadius = (opt: {
    value: number;
    label: string;
    requiresPlus: boolean;
  }) => {
    if (opt.requiresPlus && !isPlus) {
      setPaywallReason(
        `${opt.label} menzil odasına geçiş yapmak sadece Mitemasuka Plus üyelerine özeldir.`
      );
      setShowPlusModal(true);
      return;
    }
    setSelectedRadius(opt.value);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !inputText.trim() || !effectiveCoords) return;

    if (!isPlus && remainingQuota <= 0) {
      setPaywallReason(
        `Günlük ${dailyLimit} ücretsiz mesaj hakkınız doldu! Sohbete sınırsız devam etmek için Mitemasuka Plus'a geçin.`
      );
      setShowPlusModal(true);
      return;
    }

    const inDm = activeView === 'dm';
    if (inDm) {
      if (!dmPeer || !dmPeerOnline || isDmWaitingPeerAccept) return;
      const targetUser = roomUsers.find((u) => u.clientId === dmPeer.clientId);
      if (!targetUser && !dmPeer.clientId) return;

      socket.emit('send_message', {
        text: inputText.trim(),
        replyTo: null,
        isWhisper: true,
        whisperToId: targetUser?.id || null,
        whisperToClientId: dmPeer.clientId,
        whisperToName: dmPeer.username,
      });
      socket.emit('typing', false);
      setInputText('');
      setReplyingTo(null);
      return;
    }

    socket.emit('send_message', {
      text: inputText.trim(),
      replyTo: replyingTo,
      isWhisper: false,
      whisperToClientId: null,
      whisperToName: null,
    });
    socket.emit('typing', false);
    setInputText('');
    setReplyingTo(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!socket) return;

    socket.emit('typing', true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', false);
    }, 1500);
  };

  const handleActivatePlus = () => {
    if (!socket) return;
    socket.emit('activate_plus', { plan: selectedPlanOption });
    setShowPlusModal(false);
    setPaywallReason(null);
  };

  // 📢 Tek Yönlü Kanal (Megafon) Başlatma
  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !channelTitleInput.trim() || !effectiveCoords) return;

    socket.emit('create_channel', {
      title: channelTitleInput.trim(),
      radius: selectedChannelPlan.radius,
      plan: selectedChannelPlan.id,
    });
    setChannelTitleInput('');
    setShowCreateChannelModal(false);
  };

  // 📢 Tek Yönlü Kanala Yazılı Anons Gönderme
  const handleSendChannelBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !activeChannel || !channelInputText.trim()) return;

    socket.emit('send_channel_broadcast', {
      channelId: activeChannel.id,
      text: channelInputText.trim(),
      isLiveVoice: false,
    });
    setChannelInputText('');
  };

  // 🎙️ Canlı Sesli Dikte (Speech-to-Text): Konuşmacının sesini yazıya çevirip anında kanala akıtır
  const toggleLiveVoiceDictation = () => {
    if (isDictating) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsDictating(false);
      setLiveTranscriptPreview('');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec =
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      alert(
        'Tarayıcınız canlı ses-metin (SpeechRecognition) özelliğini desteklemiyor. Chrome veya Safari kullanabilirsiniz.'
      );
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang =
      SUPPORTED_LANGS.find((l) => l.code === uiLang)?.speechLang || 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalSentence = String(transcript || '').trim();
          if (finalSentence && socket && activeChannel) {
            socket.emit('send_channel_broadcast', {
              channelId: activeChannel.id,
              text: finalSentence,
              isLiveVoice: true,
            });
          }
          setLiveTranscriptPreview('');
        } else {
          interim += transcript;
          setLiveTranscriptPreview(interim);
        }
      }
    };

    recognition.onerror = () => {
      setIsDictating(false);
      setLiveTranscriptPreview('');
    };

    recognition.onend = () => {
      setIsDictating(false);
      setLiveTranscriptPreview('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  };

  const handleSaveNickname = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !nicknameInput.trim()) return;
    socket.emit('set_nickname', { nickname: nicknameInput.trim() });
    setShowNicknameModal(false);
    setNicknameInput('');
  };

  const toggleBlockUser = (targetClientId: string, targetName: string) => {
    if (!targetClientId || targetClientId === myClientId) return;
    setBlockedClientIds((prev) => {
      const updated = { ...prev };
      if (updated[targetClientId]) {
        delete updated[targetClientId];
      } else {
        updated[targetClientId] = targetName;
      }
      try {
        localStorage.setItem('mitemasuka_blocked', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleReportUser = (targetClientId: string, targetName: string) => {
    if (!targetClientId || targetClientId === myClientId) return;
    setReportTarget({
      clientId: targetClientId,
      username: targetName,
      done: Boolean(reportedClientIds[targetClientId]),
    });
  };

  const confirmReportUser = (alsoBlock: boolean) => {
    if (!reportTarget) return;
    const { clientId, username } = reportTarget;
    if (socket && !reportedClientIds[clientId]) {
      socket.emit('report_user', { targetClientId: clientId });
      setReportedClientIds((prev) => ({ ...prev, [clientId]: true }));
    }
    if (alsoBlock && !blockedClientIds[clientId]) {
      toggleBlockUser(clientId, username);
    }
    setReportTarget({ clientId, username, done: true });
    setTimeout(() => {
      setReportTarget((prev) =>
        prev && prev.clientId === clientId ? null : prev
      );
    }, 1200);
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const currentUrl =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? window.location.origin
      : 'https://mitemasuka.com';
  const activeTypingNames = Object.values(typingUsers);
  const t = UI_TEXT[uiLang];

  return (
    <div className="relative flex flex-col h-[100dvh] max-w-2xl mx-auto bg-slate-50 dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 border-x border-slate-200/80 dark:border-neutral-800 shadow-2xl overflow-hidden transition-colors duration-200">
      {/* ÜST BAR (Corsecure Clean Trust Navbar Stili) */}
      <header className="bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-neutral-800 z-30 shrink-0 transition-colors">
        <div className="px-3.5 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 select-none min-w-0">
            <div className="relative flex items-center justify-center w-[84px] h-[84px] shrink-0 -my-3">
              <img
                src="/logo-karga.png"
                alt="Mitemasuka"
                className="w-[84px] h-[84px] object-contain"
              />
              <span
                className={`absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${
                  isConnected ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </div>

            <h1 className="font-bold text-base sm:text-lg leading-tight truncate tracking-tight uppercase">
              <span className="text-slate-400 dark:text-neutral-500">
                Mitema
              </span>
              <span className="text-[#1A81E5]">suka</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Odadaki Kişiler & Profil Mini Butonu */}
            <button
              type="button"
              onClick={() => {
                setShowMembersDrawer((prev) => !prev);
                setShowRadiusMenu(false);
                setShowHamburgerMenu(false);
              }}
              className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                showMembersDrawer
                  ? 'bg-[#1A81E5] text-white border-[#1A81E5] shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-200/70 dark:hover:bg-neutral-700'
              }`}
              title="Odadaki Kişiler ve Bilgim"
            >
              <Users
                className={`w-4 h-4 shrink-0 ${
                  showMembersDrawer
                    ? 'text-white'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              />
              <span>
                {roomUsers.length}
                <span className="opacity-60 font-normal">
                  /{Math.max(roomUsers.length, nearbyInstalledCount)}
                </span>
              </span>
            </button>

            {/* Menzil Seçici Mini Açılır Butonu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowRadiusMenu((prev) => !prev);
                  setShowMembersDrawer(false);
                  setShowHamburgerMenu(false);
                }}
                className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                  showRadiusMenu
                    ? 'bg-[#1A81E5] text-white border-[#1A81E5] shadow-xs'
                    : 'bg-slate-100 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-200/70 dark:hover:bg-neutral-700'
                }`}
                title="Menzil Seç"
              >
                <span>
                  {RADIUS_OPTIONS.find((r) => r.value === selectedRadius)
                    ?.label || '100 m'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {showRadiusMenu && (
                <div className="absolute right-0 mt-2 w-36 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-slate-200 dark:border-neutral-700 rounded-2xl shadow-xl py-1.5 z-50">
                  {RADIUS_OPTIONS.map((opt) => {
                    const locked = opt.requiresPlus && !isPlus;
                    const isSelected = selectedRadius === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setShowRadiusMenu(false);
                          handleSelectRadius(opt);
                        }}
                        className={`w-full px-3 py-2 text-xs font-medium flex items-center justify-between transition ${
                          isSelected
                            ? 'text-[#1A81E5] font-bold bg-blue-50/70 dark:bg-neutral-700/60'
                            : 'text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-700/50'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {locked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-500" />
                        ) : isSelected ? (
                          <Check className="w-3.5 h-3.5 text-[#1A81E5]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Gece / Gündüz Butonu */}
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-200/70 dark:hover:bg-neutral-700 transition"
              title={isDarkMode ? 'Aydınlık Temaya Geç' : 'Koyu Temaya Geç'}
              aria-label="Tema Değiştir"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Hamburger Menü Butonu */}
            <button
              onClick={() => {
                setShowHamburgerMenu((prev) => !prev);
                setShowRadiusMenu(false);
                setShowMembersDrawer(false);
              }}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-200/70 dark:hover:bg-neutral-700 transition shrink-0"
              aria-label="Menü"
            >
              {showHamburgerMenu ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 🔴 YAKINDAKİ TEK YÖNLÜ CANLI ANONS KANALLARI BANDI (Konser / Miting / Konferans) */}
      {nearbyChannels.length > 0 && (
        <div className="bg-rose-50/95 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800/60 px-3.5 py-2 shrink-0 space-y-1.5">
          {nearbyChannels.map((ch) => {
            const lastMsg =
              ch.messages[ch.messages.length - 1]?.text || 'Canlı yayın aktif';
            return (
              <div
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className="flex items-center justify-between gap-2 cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider shrink-0 animate-pulse">
                    <Radio className="w-3 h-3" /> {t.liveChannelBadge}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-rose-900 dark:text-amber-200 truncate">
                      {ch.title}{' '}
                      <span className="text-[11px] font-normal text-rose-600 dark:text-rose-200/80">
                        ({ch.ownerName} • {ch.listenerCount || 1} {t.listeners})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700 dark:text-white/90 truncate">
                      {lastMsg}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-rose-700 dark:text-amber-300 bg-white dark:bg-neutral-900/70 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-amber-400/30 shrink-0 group-hover:bg-rose-600 group-hover:text-white transition shadow-2xs">
                  {t.listenBtn}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* HAMBURGER MENÜ */}
      {showHamburgerMenu && (
        <div className="absolute top-[60px] right-3 w-72 max-h-[82vh] overflow-y-auto bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-slate-200 dark:border-neutral-700 rounded-2xl shadow-2xl z-40 py-2 text-sm divide-y divide-slate-100 dark:divide-neutral-700/80">
          <div className="px-3 py-2 space-y-2">
            {/* Bireysel Plus */}
            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setPaywallReason(null);
                setShowPlusModal(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100/70 dark:hover:bg-blue-900/50 transition"
            >
              <span className="flex items-center gap-2 text-left">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{isPlus ? t.plusActive : t.upgradeToPlus}</span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                  {isPlus ? 'VIP' : t.upgradeBadge}
                </span>
                {!isPlus && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                    {t.freeForNow}
                  </span>
                )}
              </span>
            </button>

            {/* 📢 KANAL KUR (TEK YÖNLÜ SESLEN - KONSER/MİTİNG/KONFERANS) */}
            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowCreateChannelModal(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-semibold hover:bg-rose-100/70 dark:hover:bg-rose-900/50 transition"
            >
              <span className="flex items-center gap-2 text-left">
                <Megaphone className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{t.createChannelMenu}</span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold">
                  PRO
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  {t.freeForNow}
                </span>
              </span>
            </button>
          </div>

          {/* 🌍 DİL SEÇİCİ (8 Küresel Dil) */}
          <div className="px-3.5 py-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-neutral-300">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#1A81E5]" />
                <span>{t.appLanguage}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {SUPPORTED_LANGS.find((l) => l.code === uiLang)?.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SUPPORTED_LANGS.map((lng) => {
                const active = uiLang === lng.code;
                return (
                  <button
                    key={lng.code}
                    type="button"
                    onClick={() => setUiLang(lng.code)}
                    className={`py-1.5 rounded-xl border text-xs font-semibold transition ${
                      active
                        ? 'border-[#1A81E5] bg-[#1A81E5] text-white shadow-2xs'
                        : 'border-slate-200 dark:border-neutral-700 bg-slate-50/70 dark:bg-neutral-900/60 text-slate-700 dark:text-neutral-300 hover:border-slate-300'
                    }`}
                    title={lng.label}
                  >
                    {lng.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="py-1 text-slate-700 dark:text-neutral-200">
            {/* HERKESE ÜCRETSİZ OTOMATİK MESAJ ÇEVİRİSİ */}
            <button
              onClick={() => setAutoTranslate((prev) => !prev)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium">{t.autoTranslateMenu}</span>
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  autoTranslate
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400'
                }`}
              >
                {autoTranslate ? t.on : t.off}
              </span>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowStoryModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <div className="font-semibold flex items-center gap-1.5 text-slate-900 dark:text-white">
                  <span>{t.whatIsMitemasuka}</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-neutral-400">
                  {t.whatIsSub}
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowQrModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {t.addNearbyQr}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-neutral-400">
                  {t.addNearbyQrSub}
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                if (!isPlus) {
                  setPaywallReason(
                    'Rastgele User_XXX yerine kendi özel takma adınızı belirlemek için Mitemasuka Plus gereklidir.'
                  );
                  setShowPlusModal(true);
                  return;
                }
                setNicknameInput(myUsername);
                setShowNicknameModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{t.changeMyNickname}</span>
              </span>
              {!isPlus && <Lock className="w-3.5 h-3.5 text-amber-500" />}
            </button>

            <button
              onClick={() => {
                if (!isPlus) {
                  setShowHamburgerMenu(false);
                  setPaywallReason(
                    'Hayalet Modu ile odaya girdiğinizde veya çıktığınızda kimseye bildirim gitmez. Sadece Plus üyelere özeldir.'
                  );
                  setShowPlusModal(true);
                  return;
                }
                socket?.emit('set_ghost_mode', { enabled: !ghostMode });
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                <Ghost className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>{t.ghostModeMenu}</span>
              </span>
              {!isPlus ? (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    ghostMode
                      ? 'bg-violet-100 dark:bg-violet-500/30 text-violet-700 dark:text-violet-300'
                      : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400'
                  }`}
                >
                  {ghostMode ? t.on : t.off}
                </span>
              )}
            </button>

            {/* 1. ODA MESAJ BİLDİRİMİ (Varsayılan: Açık) */}
            <button
              onClick={() => {
                setRoomNotifEnabled((prev) => {
                  const next = !prev;
                  if (next) {
                    playTinSound('room');
                    requestNotifPermissionIfNeeded();
                  }
                  return next;
                });
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                {roomNotifEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span>{t.roomNotif}</span>
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  roomNotifEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400'
                }`}
              >
                {roomNotifEnabled ? t.on : t.off}
              </span>
            </button>

            {/* 2. ÖZEL FISILTI (DM) BİLDİRİMİ (Varsayılan: Açık) */}
            <button
              onClick={() => {
                setWhisperNotifEnabled((prev) => {
                  const next = !prev;
                  if (next) {
                    playTinSound('whisper');
                    requestNotifPermissionIfNeeded();
                  }
                  return next;
                });
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                {whisperNotifEnabled ? (
                  <Volume2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span>{t.whisperNotif}</span>
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  whisperNotifEnabled
                    ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300'
                    : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400'
                }`}
              >
                {whisperNotifEnabled ? t.on : t.off}
              </span>
            </button>

            {/* 3. ODAYA GİRİŞ / ÇIKIŞ UYARISI (Varsayılan: Kapalı) */}
            <button
              onClick={() => {
                setPresenceNotifEnabled((prev) => {
                  const next = !prev;
                  if (next) {
                    playTinSound('presence');
                    requestNotifPermissionIfNeeded();
                  }
                  return next;
                });
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                {presenceNotifEnabled ? (
                  <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span>{t.presenceNotif}</span>
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  presenceNotifEnabled
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400'
                }`}
              >
                {presenceNotifEnabled ? t.on : t.off}
              </span>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowRulesModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left"
            >
              <span className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{t.rulesAndBlocked}</span>
              </span>
              {Object.keys(blockedClientIds).length > 0 && (
                <span className="text-xs bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                  {Object.keys(blockedClientIds).length}
                </span>
              )}
            </button>
          </div>

          {/* 🎨 SOHBET ZEMİNİ SEÇİCİ (Kalıcı & Genişletilebilir) */}
          <div className="px-3.5 py-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-neutral-300">
              <span className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{t.chatBgTitle}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {CHAT_BACKGROUNDS.find((b) => b.id === chatBg)?.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {CHAT_BACKGROUNDS.map((bgOpt) => {
                const active = chatBg === bgOpt.id;
                return (
                  <button
                    key={bgOpt.id}
                    type="button"
                    onClick={() => setChatBg(bgOpt.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-medium transition ${
                      active
                        ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-neutral-700 bg-slate-50/70 dark:bg-neutral-900/60 text-slate-600 dark:text-neutral-300 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-slate-300 dark:border-neutral-600 shrink-0"
                      style={{ background: bgOpt.swatch }}
                    />
                    <span className="truncate">{bgOpt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={() => {
                setShowSimBar((prev) => !prev);
                setShowHamburgerMenu(false);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-neutral-700/60 transition text-left text-amber-600 dark:text-amber-300"
            >
              <span className="flex items-center gap-3">
                <FlaskConical className="w-4 h-4" />
                <span>{t.simToggle}</span>
              </span>
              <span className="text-xs">{showSimBar ? t.hide : t.show}</span>
            </button>
          </div>

          {/* İLETİŞİM */}
          <div className="px-4 py-2.5 mt-1 border-t border-slate-200 dark:border-neutral-700/80">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1">
              {t.contact}
            </div>
            <div className="flex items-center justify-between gap-2">
              <a
                href="mailto:suleymanbaba@gmail.com"
                className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-300 hover:text-[#1A81E5] dark:hover:text-blue-300 transition min-w-0"
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">suleymanbaba@gmail.com</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText('suleymanbaba@gmail.com');
                  setCopiedEmail(true);
                  setTimeout(() => setCopiedEmail(false), 2000);
                }}
                className="p-1.5 rounded-lg text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-700/60 shrink-0 flex items-center gap-1 text-[11px]"
                aria-label={t.copy}
              >
                {copiedEmail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> {t.copied}
                  </>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ODADAKİ KİŞİLER ÇEKMECESİ */}
      {showMembersDrawer && (
        <div className="bg-slate-100/95 dark:bg-neutral-800/90 border-b border-slate-200 dark:border-neutral-700/80 px-4 py-3 text-xs space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-neutral-700/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-slate-500 dark:text-neutral-400">
                {t.yourIdentity}
              </span>
              <span
                style={{ color: myColor }}
                className="font-bold truncate flex items-center gap-1.5"
              >
                {myUsername}
                {isPlus && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#1A81E5] dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md">
                    Plus
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowMembersDrawer(false);
                if (!isPlus) {
                  setPaywallReason(
                    'Rastgele User_XXX yerine kendi özel takma adınızı belirlemek için Mitemasuka Plus gereklidir.'
                  );
                  setShowPlusModal(true);
                  return;
                }
                setNicknameInput(myUsername);
                setShowNicknameModal(true);
              }}
              className="text-[11px] font-semibold text-[#1A81E5] hover:underline shrink-0"
            >
              {t.changeName}
            </button>
          </div>

          <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              {t.activeMembersHeader} ({roomUsers.length}) — {t.clickForWhisper}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {roomUsers.map((u) => {
              const dist = getDistanceMeters(
                effectiveCoords?.lat,
                effectiveCoords?.lng,
                u.lat,
                u.lng
              );
              const isMe = u.id === myId;
              const isBlocked = Boolean(blockedClientIds[u.clientId]);

              return (
                <div
                  key={u.id}
                  className="flex items-center gap-1.5 bg-white dark:bg-neutral-900 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-neutral-700 shadow-2xs"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: u.color }}
                  />
                  <button
                    onClick={() => {
                      if (isMe) return;
                      openDm(u.clientId, u.username);
                    }}
                    className="font-semibold hover:underline flex items-center gap-1"
                    style={{ color: u.color }}
                  >
                    {u.username}
                  </button>
                  {isMe ? (
                    <span className="text-[11px] text-slate-400">{t.you}</span>
                  ) : (
                    <>
                      {dist !== null && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          • {dist}m
                        </span>
                      )}
                      <button
                        onClick={() => toggleBlockUser(u.clientId, u.username)}
                        title={isBlocked ? 'Engeli Kaldır' : 'Engelle'}
                        className={`ml-1 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 ${
                          isBlocked ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        <Ban className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* YEREL TEST SİMÜLATÖR ÇUBUĞU */}
      {showSimBar && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-500/30 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>
              <strong>Test Simülatörü:</strong> Bu sekmenin mesafesini kaydırın:
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[
              { offset: 0, label: '0m (Merkez)' },
              { offset: 45, label: '+45m (100m İçi)' },
              { offset: 150, label: '+150m (100m Dışı)' },
              { offset: 600, label: '+600m (500m Dışı)' },
            ].map((item) => (
              <button
                key={item.offset}
                onClick={() => {
                  if (!baseCoords) {
                    setBaseCoords({ lat: 41.0082, lng: 28.9784 });
                    setGeoError(null);
                  }
                  setSimOffsetMeters(item.offset);
                }}
                className={`px-2 py-1 rounded-lg font-medium transition ${
                  simOffsetMeters === item.offset
                    ? 'bg-amber-500 text-white font-bold shadow-2xs'
                    : 'bg-white dark:bg-neutral-800 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-neutral-700 hover:bg-amber-100 dark:hover:bg-neutral-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KONUM BEKLENİYOR (Corsecure Hero Stili) */}
      {!effectiveCoords ? (
        <div className="relative flex-1 overflow-y-auto flex flex-col items-center justify-center p-5 text-center space-y-5 bg-white dark:bg-neutral-900">
          {/* Hızlı Dil Seçici Çubuk */}
          <div className="flex flex-wrap items-center justify-center gap-1 bg-slate-100 dark:bg-neutral-800 p-1 rounded-2xl border border-slate-200 dark:border-neutral-700">
            {SUPPORTED_LANGS.map((lng) => {
              const active = uiLang === lng.code;
              return (
                <button
                  key={lng.code}
                  type="button"
                  onClick={() => setUiLang(lng.code)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition ${
                    active
                      ? 'bg-[#1A81E5] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={lng.label}
                >
                  {lng.short}
                </button>
              );
            })}
          </div>

          <div className="w-28 h-28 flex items-center justify-center shrink-0">
            <img
              src="/logo-karga.png"
              alt="Mitemasuka"
              className="w-28 h-28 object-contain"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight uppercase">
              <span className="text-slate-400 dark:text-neutral-500">Mitema</span>
              <span className="text-blue-700 dark:text-blue-400">suka</span>
            </h2>
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
              {t.doYouSeeMe}
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-neutral-300 max-w-md leading-relaxed">
              {t.heroDesc}
            </p>
          </div>

          <button
            onClick={startLocationTracking}
            disabled={isRequestingGeo}
            className="w-full max-w-xs py-3.5 px-6 bg-[#1A81E5] hover:bg-[#156fc7] active:scale-[0.99] text-white font-bold rounded-2xl text-sm transition shadow-md shadow-[#1A81E5]/20 flex items-center justify-center gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRequestingGeo ? 'animate-spin' : ''}`}
            />
            <span>
              {isRequestingGeo ? t.gettingLocation : t.allowLocationBtn}
            </span>
          </button>

          {geoError === 'PERMISSION_DENIED' && (
            <div className="w-full max-w-md bg-white dark:bg-neutral-800 border border-amber-300 dark:border-amber-500/40 rounded-3xl p-4 text-left space-y-2.5 text-xs shadow-lg">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Telefonunuz Tarayıcının Konum İznini Kapatmış</span>
              </div>
              <p className="text-slate-600 dark:text-neutral-300 leading-relaxed">
                iPhone&apos;da daha önce tarayıcı konum izni{' '}
                <strong>&ldquo;Asla&rdquo;</strong> olarak seçildiyse telefon
                size pencere çıkarmadan otomatik reddeder. Açmak için:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-neutral-200 bg-slate-50 dark:bg-neutral-900 p-3 rounded-2xl border border-slate-200 dark:border-neutral-700">
                <li>
                  iPhone <strong>Ayarlar</strong> uygulamasına girin,
                </li>
                <li>
                  <strong>Gizlilik ve Güvenlik</strong> &rarr;{' '}
                  <strong>Konum Servisleri</strong>&apos;ne dokunun,
                </li>
                <li>
                  Aşağıdan <strong>Safari Web Siteleri</strong> (veya{' '}
                  <strong>Chrome</strong>) satırına girip{' '}
                  <strong className="text-blue-600 dark:text-blue-400">
                    &ldquo;Uygulamayı Kullanırken&rdquo;
                  </strong>{' '}
                  seçin.
                </li>
                <li>
                  Safari&apos;deyseniz adres çubuğunun solundaki{' '}
                  <strong>
                    aA / sol ikon &rarr; Web Sitesi Ayarları &rarr; Konum &rarr;
                    İzin Ver
                  </strong>{' '}
                  yapıp yukarıdaki mavi butona tekrar basın.
                </li>
              </ol>
            </div>
          )}

          {geoError && geoError !== 'PERMISSION_DENIED' && (
            <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3.5 py-2.5 rounded-2xl max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          <button
            onClick={() => setShowStoryModal(true)}
            className="px-4 py-2.5 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700 font-medium rounded-xl text-xs transition shadow-2xs"
          >
            {t.whatIsMitemasuka}
          </button>
        </div>
      ) : (
        <main
          onClick={() => {
            if (showHamburgerMenu) setShowHamburgerMenu(false);
            if (showRadiusMenu) setShowRadiusMenu(false);
          }}
          className={`flex-1 overflow-y-auto px-2.5 sm:px-4 py-3 space-y-2.5 transition-colors duration-200 ${
            CHAT_BACKGROUNDS.find((b) => b.id === chatBg)?.className ||
            CHAT_BACKGROUNDS[0].className
          }`}
        >
          {/* SOLDA BİLGİ KULAKÇIĞI + SAĞDA "ÖZEL" SEKME KULAĞI (Aynı hizada ve sabit) */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 -mx-2.5 sm:-mx-4 -mt-1 pointer-events-none">
            <button
              type="button"
              onClick={() => {
                setShowMembersDrawer((prev) => !prev);
                setShowRadiusMenu(false);
                setShowHamburgerMenu(false);
              }}
              className="pointer-events-auto flex items-center gap-1 pl-3 pr-3.5 py-1.5 rounded-r-full border border-l-0 text-[11px] font-medium shadow-sm bg-white/95 dark:bg-neutral-800/95 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 transition truncate max-w-[76%]"
            >
              <strong className="text-slate-900 dark:text-white font-semibold">
                {selectedRadius >= 1000
                  ? `${selectedRadius / 1000} km`
                  : `${selectedRadius}m`}
              </strong>
              <span>·</span>
              <span className="truncate">
                {t.nearbyInstalledBadge
                  .replace('{active}', String(roomUsers.length))
                  .replace(
                    '{installed}',
                    String(Math.max(roomUsers.length, nearbyInstalledCount))
                  )}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveView((prev) => (prev === 'dm' ? 'room' : 'dm'))
              }
              className={`pointer-events-auto flex items-center gap-1.5 pl-3 pr-3.5 py-1.5 rounded-l-full border border-r-0 text-xs font-semibold shadow-sm shrink-0 transition ${
                activeView === 'dm'
                  ? 'bg-[#1A81E5] text-white border-[#1A81E5]'
                  : unreadDmCount > 0 || isDmWaitingMyAccept
                  ? 'bg-violet-600 text-white border-violet-600 animate-pulse'
                  : 'bg-white/95 dark:bg-neutral-800/95 text-slate-700 dark:text-neutral-200 border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700'
              }`}
            >
              <MessageSquareLock className="w-3.5 h-3.5" />
              <span>{t.tabPrivate}</span>
              {(unreadDmCount > 0 || isDmWaitingMyAccept) && (
                <span
                  className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    activeView === 'dm'
                      ? 'bg-white text-[#1A81E5]'
                      : 'bg-white text-violet-700'
                  }`}
                >
                  {unreadDmCount || 1}
                </span>
              )}
            </button>
          </div>

          {activeView === 'room' ? (
          <>
          {!pushSubscribed && (
            <div className="flex justify-center my-1">
              <button
                type="button"
                onClick={() => subscribeToLockScreenPush(true)}
                className="text-[11px] font-medium px-3 py-1 rounded-full bg-white/90 dark:bg-neutral-800/90 hover:bg-blue-50 dark:hover:bg-neutral-700 text-[#1A81E5] dark:text-blue-300 border border-slate-200 dark:border-neutral-700 transition shadow-2xs"
              >
                {t.enableLockScreenWake}
              </button>
            </div>
          )}

          {groupedMessages.map((entry) => {
            if (entry.group) {
              const grp = entry.group;
              const gid = grp[0].id;
              const open = !!expandedGroups[gid];
              const joins = grp.filter((g) => g.systemType === 'join').length;
              const leaves = grp.length - joins;
              const parts: string[] = [];
              if (joins) parts.push(t.groupJoined.replace('{n}', String(joins)));
              if (leaves) parts.push(t.groupLeft.replace('{n}', String(leaves)));
              return (
                <div key={`grp_${gid}`} className="flex flex-col items-center my-1.5 gap-1.5">
                  <button
                    onClick={() =>
                      setExpandedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }))
                    }
                    className="text-xs px-3 py-1 rounded-full border shadow-2xs font-medium bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 transition"
                  >
                    {parts.join(' · ')} {open ? '▴' : '▾'}
                  </button>
                  {open &&
                    grp.map((g) => (
                      <span
                        key={g.id}
                        className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${
                          g.systemType === 'join'
                            ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40'
                            : 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/40'
                        }`}
                      >
                        {localizeSystemMessage(g.text, uiLang)}
                      </span>
                    ))}
                </div>
              );
            }
            const item = entry.item as ChatItem;
            if (item.kind === 'system') {
              const badgeStyle =
                item.systemType === 'join'
                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40'
                  : item.systemType === 'leave'
                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/40'
                  : 'bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-700';

              return (
                <div key={item.id} className="flex justify-center my-1.5">
                  <span
                    className={`text-xs px-3 py-1 rounded-full border shadow-2xs font-medium ${badgeStyle}`}
                  >
                    {localizeSystemMessage(item.text, uiLang)}
                  </span>
                </div>
              );
            }

            if (
              item.senderClientId &&
              blockedClientIds[item.senderClientId] &&
              item.senderClientId !== myClientId
            ) {
              return null;
            }

            const isMine =
              item.senderId === myId ||
              (item.senderClientId && item.senderClientId === myClientId);
            const isWhisper = Boolean(item.whisperToId);
            const distanceFromMe = !isMine
              ? getDistanceMeters(
                  effectiveCoords.lat,
                  effectiveCoords.lng,
                  item.senderLat,
                  item.senderLng
                )
              : null;

            const isEmojiOnly =
              !new RegExp('[\\p{L}\\p{N}]', 'u').test(item.text) &&
              item.text.trim().length <= 8;
            const hasLetters = new RegExp('\\p{L}', 'u').test(item.text);

            return (
              <div
                key={item.id}
                className={`group flex flex-col ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`relative max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm transition-colors ${
                    isWhisper
                      ? 'bg-violet-50 dark:bg-violet-950/90 border border-violet-200 dark:border-violet-500/50 text-violet-950 dark:text-violet-100'
                      : isMine
                      ? 'bg-[#1A81E5] text-white rounded-tr-xs shadow-[#1A81E5]/20'
                      : 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 rounded-tl-xs border border-slate-200/90 dark:border-neutral-700'
                  }`}
                >
                  {isWhisper && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300 mb-1 pb-1 border-b border-violet-200 dark:border-violet-500/30">
                      <MessageSquareLock className="w-3 h-3" />
                      <span>
                        {t.privateWhisper}{' '}
                        {isMine
                          ? `${t.youTo} ${item.whisperToName}`
                          : `${item.senderName} ${t.toYou}`}
                      </span>
                    </div>
                  )}

                  {!isMine && (
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <button
                        onClick={() => {
                          openDm(item.senderClientId, item.senderName);
                        }}
                        className="text-sm font-bold hover:underline flex items-center gap-1"
                        style={{ color: item.senderColor || '#2563EB' }}
                      >
                        <span>{item.senderName}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        {distanceFromMe !== null && (
                          <span className="text-[11px] text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900/60 px-1.5 py-0.5 rounded font-medium">
                            {distanceFromMe}m
                          </span>
                        )}
                        {item.senderClientId && (
                          <button
                            onClick={() =>
                              handleReportUser(
                                item.senderClientId!,
                                item.senderName || 'Kullanıcı'
                              )
                            }
                            title="Kötü Amaçlı Bildir"
                            className="opacity-60 hover:opacity-100 text-rose-500 dark:text-rose-400"
                          >
                            <ShieldAlert className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {item.replyTo && (
                    <div
                      className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 text-xs ${
                        isMine
                          ? 'bg-black/15 border-white/80 text-white/95'
                          : 'bg-slate-100 dark:bg-neutral-900/60 border-[#1A81E5]'
                      }`}
                    >
                      <div
                        className={`font-semibold ${
                          isMine
                            ? 'text-white'
                            : 'text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {item.replyTo.senderName}
                      </div>
                      <div
                        className={`truncate ${
                          isMine
                            ? 'text-blue-100'
                            : 'text-slate-500 dark:text-neutral-400'
                        }`}
                      >
                        {item.replyTo.text}
                      </div>
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          isEmojiOnly
                            ? 'text-2xl leading-none py-0.5'
                            : 'text-[18px] font-medium whitespace-pre-wrap break-words leading-snug'
                        }
                      >
                        {item.text}
                      </p>
                      {!isMine &&
                        translations[`${item.id}_${uiLang}`] &&
                        !hiddenTranslationIds[`${item.id}_${uiLang}`] && (
                          <p className="mt-1.5 pt-1 border-t border-slate-200/70 dark:border-neutral-700/70 text-[15px] font-medium text-[#1A81E5] dark:text-blue-300 whitespace-pre-wrap break-words flex items-start gap-1">
                            <Globe className="w-3.5 h-3.5 shrink-0 translate-y-1 opacity-80" />
                            <span>{translations[`${item.id}_${uiLang}`]}</span>
                          </p>
                        )}
                    </div>
                    <span
                      className={`text-[11px] shrink-0 select-none translate-y-0.5 ${
                        isMine
                          ? 'text-blue-100/90'
                          : 'text-slate-400 dark:text-neutral-400'
                      }`}
                    >
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  {!isMine && (
                    <div className="mt-1.5 pt-1 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-3 opacity-85 group-hover:opacity-100 transition">
                      {hasLetters && (
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleOrTranslateMessage(item.id, item.text)
                          }
                          className="text-xs flex items-center gap-1 font-medium text-slate-400 hover:text-[#1A81E5] dark:hover:text-white"
                        >
                          <Globe className="w-3 h-3" />
                          <span>
                            {translations[`${item.id}_${uiLang}`] &&
                            !hiddenTranslationIds[`${item.id}_${uiLang}`]
                              ? t.original
                              : t.translate}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo({
                            id: item.id,
                            senderName: item.senderName || 'Kullanıcı',
                            text: item.text,
                          });
                          messageInputRef.current?.focus();
                          setTimeout(() => messageInputRef.current?.focus(), 20);
                        }}
                        className="text-xs flex items-center gap-1 font-medium text-slate-400 hover:text-blue-600 dark:hover:text-white"
                      >
                        <Reply className="w-3 h-3" />
                        <span>{t.reply}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {activeTypingNames.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium italic pl-2">
              <span className="animate-pulse">●</span>
              <span>
                {activeTypingNames.join(', ')} {t.typing}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
          </>
          ) : (
            <div className="space-y-2.5 pt-1">
              {dmNotice && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs px-3.5 py-2.5 rounded-2xl">
                  <span>
                    {dmNotice.type === 'rejected'
                      ? t.dmRejectedNotice.replace('{name}', dmNotice.peerName)
                      : dmNotice.type === 'closed'
                      ? t.dmClosedNotice.replace('{name}', dmNotice.peerName)
                      : dmNotice.type === 'self_busy'
                      ? t.dmSelfBusy.replace('{name}', dmNotice.peerName)
                      : dmNotice.type === 'target_busy'
                      ? t.dmTargetBusy.replace('{name}', dmNotice.peerName)
                      : t.dmPeerLeft.replace('{name}', dmNotice.peerName)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDmNotice(null)}
                    className="p-1 text-amber-700 dark:text-amber-300 hover:opacity-80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!dmPeer ? (
                <div className="flex flex-col items-center text-center gap-2 py-14 text-slate-500 dark:text-neutral-400">
                  <MessageSquareLock className="w-9 h-9 opacity-60" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-neutral-200">
                    {t.dmEmptyTitle}
                  </div>
                  <p className="text-xs max-w-xs">{t.dmEmptyHint}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 bg-white/90 dark:bg-neutral-800/90 border border-slate-200/90 dark:border-neutral-700 rounded-2xl px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveView('room')}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-700 text-slate-600 dark:text-neutral-300"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <span className="font-bold text-sm truncate text-slate-900 dark:text-white">
                        {dmPeer.username}
                      </span>
                      <span
                        className={`text-[11px] font-medium shrink-0 ${
                          dmPeerOnline
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        ● {dmPeerOnline ? t.dmOnline : t.dmOffline}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCloseDm('closed')}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold transition shrink-0"
                    >
                      ✕ {dmSession ? t.dmEndBtn : t.dmCancelBtn}
                    </button>
                  </div>

                  <p className="text-center text-[11px] text-slate-400 dark:text-neutral-500 px-4">
                    {!dmSession
                      ? t.dmFirstMsgHint.replace('{name}', dmPeer.username)
                      : t.dmEphemeral}
                  </p>

                  {dmThreadMessages.map((w) => {
                    if (w.kind === 'system') {
                      return (
                        <div key={w.id} className="flex justify-center">
                          <span className="text-xs px-3 py-1 rounded-full border bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30">
                            {t.dmPeerLeft.replace('{name}', w.text || dmPeer.username)}
                          </span>
                        </div>
                      );
                    }
                    const mine = w.senderClientId === myClientId;
                    const trKey = `${w.id}_${uiLang}`;
                    const isEmojiOnly =
                      !new RegExp('[\\p{L}\\p{N}]', 'u').test(w.text) &&
                      w.text.trim().length <= 8;
                    const hasLetters = new RegExp('\\p{L}', 'u').test(w.text);
                    return (
                      <div
                        key={w.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            mine
                              ? 'bg-[#1A81E5] text-white rounded-tr-xs shadow-[#1A81E5]/20'
                              : 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 rounded-tl-xs border border-slate-200/90 dark:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-end justify-between gap-2.5">
                            <div
                              className={
                                isEmojiOnly
                                  ? 'text-2xl leading-none py-0.5'
                                  : 'text-[18px] font-medium leading-snug whitespace-pre-wrap break-words'
                              }
                            >
                              {w.text}
                            </div>
                            <span
                              className={`text-[11px] shrink-0 select-none translate-y-0.5 ${
                                mine ? 'text-white/75' : 'text-slate-400'
                              }`}
                            >
                              {formatTime(w.timestamp)}
                            </span>
                          </div>
                          {!mine &&
                            translations[trKey] &&
                            !hiddenTranslationIds[trKey] && (
                              <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-neutral-700 text-blue-600 dark:text-blue-300 text-[15px] font-medium whitespace-pre-wrap break-words flex items-start gap-1">
                                <Globe className="w-3.5 h-3.5 shrink-0 translate-y-1 opacity-80" />
                                <span>{translations[trKey]}</span>
                              </div>
                            )}
                          {!mine && hasLetters && (
                            <div className="mt-1.5 pt-1 border-t border-slate-100 dark:border-white/5 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleOrTranslateMessage(w.id, w.text)
                                }
                                className="text-xs flex items-center gap-1 font-medium text-slate-400 hover:text-[#1A81E5] dark:hover:text-white"
                              >
                                <Globe className="w-3 h-3" />
                                <span>
                                  {translations[trKey] &&
                                  !hiddenTranslationIds[trKey]
                                    ? t.original
                                    : t.translate}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* KABUL / RED ONAY KARTI (Alıcı için) */}
                  {isDmWaitingMyAccept && (
                    <div className="bg-white dark:bg-neutral-800 border border-violet-200 dark:border-violet-500/40 rounded-2xl p-4 text-center space-y-3 shadow-sm">
                      <div className="text-xs font-semibold text-slate-800 dark:text-neutral-100">
                        {t.dmRequestFrom.replace('{name}', dmPeer.username)}
                      </div>
                      <div className="flex items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={handleAcceptDm}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                        >
                          {t.dmAcceptBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseDm('rejected')}
                          className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition"
                        >
                          {t.dmRejectBtn}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ONAY BEKLENİYOR BİLGİSİ (Gönderen için) */}
                  {isDmWaitingPeerAccept && (
                    <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-2xl px-4 py-3 text-center text-xs text-amber-800 dark:text-amber-300">
                      {t.dmWaitingAccept.replace('{name}', dmPeer.username)}
                    </div>
                  )}

                  {!dmPeerOnline && (
                    <div className="text-center text-xs text-amber-700 dark:text-amber-300">
                      {t.dmPeerLeft.replace('{name}', dmPeer.username)}
                    </div>
                  )}
                  <div ref={dmEndRef} />
                </>
              )}
            </div>
          )}
        </main>
      )}

      {/* YANITLAMA ÇUBUĞU (özel konuşmalarda yanıtlama yok) */}
      {replyingTo && activeView === 'room' && (
        <div className="bg-slate-100 dark:bg-neutral-800 px-4 py-2 border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-300 truncate">
            <Reply className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">
              <strong className="text-blue-700 dark:text-blue-400">
                {replyingTo.senderName}:
              </strong>{' '}
              {replyingTo.text}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ALT MESAJ YAZMA ALANI (2 SATIRLI CORSECURE TASARIMI) */}
      <footer className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl px-3 pt-2.5 pb-2 border-t border-slate-200/80 dark:border-neutral-800 shrink-0 space-y-2 transition-colors">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            ref={messageInputRef}
            type="text"
            enterKeyHint="send"
            value={inputText}
            onChange={handleInputChange}
            disabled={
              !effectiveCoords ||
              !isConnected ||
              isBanned ||
              (activeView === 'dm' &&
                (!dmPeer ||
                  !dmPeerOnline ||
                  isDmWaitingPeerAccept ||
                  isDmWaitingMyAccept))
            }
            placeholder={
              isBanned
                ? t.inputBanned
                : activeView === 'dm'
                ? dmPeer
                  ? isDmWaitingPeerAccept
                    ? t.dmWaitingAccept.replace('{name}', dmPeer.username)
                    : `${dmPeer.username} — ${t.inputWhisperPlaceholder}`
                  : t.dmPickHint
                : effectiveCoords
                ? `${selectedRadius >= 1000 ? selectedRadius / 1000 + ' km' : selectedRadius + 'm'} — ${t.inputRoomPlaceholder}`
                : t.inputAllowLocFirst
            }
            className="flex-1 min-w-0 bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 placeholder-slate-400 dark:placeholder-neutral-500 border border-slate-200/80 dark:border-neutral-700 text-base rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-neutral-800 transition"
          />

          <button
            type="submit"
            disabled={
              !inputText.trim() ||
              !effectiveCoords ||
              !isConnected ||
              isBanned ||
              (activeView === 'dm' &&
                (!dmPeer ||
                  !dmPeerOnline ||
                  isDmWaitingPeerAccept ||
                  isDmWaitingMyAccept))
            }
            className="w-10 h-10 rounded-xl bg-[#1A81E5] hover:bg-[#156fc7] disabled:opacity-40 text-white flex items-center justify-center transition shrink-0 shadow-sm shadow-[#1A81E5]/20"
          >
            <Send className="w-5 h-5 translate-x-[1px]" />
          </button>
        </form>

        <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => {
              setPaywallReason(null);
              setShowPlusModal(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition shrink-0 ${
              isPlus
                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium'
                : remainingQuota <= 3
                ? 'bg-rose-50 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300'
                : 'bg-slate-100 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isPlus ? (
              <span>Plus • {t.unlimited}</span>
            ) : (
              <span>
                <strong className="text-slate-900 dark:text-white">
                  {remainingQuota}
                </strong>
                /{dailyLimit} {t.messagesUnit} •{' '}
                <span className="text-[#1A81E5] font-semibold">Plus</span>
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowStoryModal(true)}
            className="text-slate-500 dark:text-neutral-400 hover:text-[#1A81E5] transition truncate ml-2"
          >
            {t.doYouSeeMe}
          </button>
        </div>
      </footer>

      {/* MODAL: 📢 TEK YÖNLÜ KANAL (MEGAFON) KURMA EKRANI */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateChannel}
            className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setShowCreateChannelModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Megaphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Tek Yönlü Kanal Kur
                </h3>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Konser, miting, konferans veya gezilerde çevrendekilere yazılı
                  ve sesli altyazı ile tek yönlü seslen
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-neutral-300">
                Kanal / Etkinlik Başlığı
              </label>
              <input
                type="text"
                required
                maxLength={60}
                value={channelTitleInput}
                onChange={(e) => setChannelTitleInput(e.target.value)}
                placeholder="Örn: Ana Sahne Canlı Altyazı / Miting Anons..."
                className="w-full bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-neutral-300">
                  Yayın Menzili & Paketi Seçin
                </label>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Tanıtıma Özel Şimdilik Ücretsiz
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {CHANNEL_PLANS.map((pkg) => (
                  <button
                    type="button"
                    key={pkg.id}
                    onClick={() => setSelectedChannelPlan(pkg)}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-between ${
                      selectedChannelPlan.id === pkg.id
                        ? 'bg-rose-50 dark:bg-rose-500/20 border-rose-500 text-slate-900 dark:text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-300 uppercase">
                      {pkg.rangeLabel}
                    </span>
                    <div className="my-1 flex flex-col items-center">
                      <span className="relative inline-block text-sm font-bold text-slate-400 line-through decoration-rose-500 decoration-2">
                        {pkg.price}
                        <span className="absolute inset-0 flex items-center justify-center text-rose-500 font-black text-base pointer-events-none">
                          ✕
                        </span>
                      </span>
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                        Ücretsiz
                      </span>
                    </div>
                    <span className="text-[11px] font-medium leading-tight">
                      {pkg.title}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-0.5">
                      {pkg.duration}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-neutral-800 p-3 rounded-2xl border border-slate-200 dark:border-neutral-700 text-xs text-slate-600 dark:text-neutral-300 space-y-1">
              <div>
                <strong>Canlı Sesli Altyazı (Speech-to-Text):</strong> Siz
                mikrofona konuştukça cümleleriniz otomatik yazıya çevrilip
                menzildeki herkesin ekranına düşer.
              </div>
              <div>
                <strong>Tek Yönlü Akış:</strong> Dinleyiciler mesaj yazıp
                ekranı kirletemez, sadece alkış/tepki gönderebilir.
              </div>
            </div>

            <button
              type="submit"
              disabled={!channelTitleInput.trim()}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition shadow-md shadow-rose-600/20 disabled:opacity-40"
            >
              Kanalı Ücretsiz Başlat ({selectedChannelPlan.rangeLabel})
            </button>
          </form>
        </div>
      )}

      {/* TAM EKRAN TEK YÖNLÜ CANLI KANAL (MEGAFON) İZLEME & YAYIN PANELİ */}
      {activeChannel && (
        <div className="fixed inset-0 bg-slate-50 dark:bg-neutral-900 z-50 flex flex-col max-w-2xl mx-auto border-x border-slate-200 dark:border-neutral-800">
          {/* Kanal Üst Barı */}
          <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl px-4 py-3 border-b border-rose-200 dark:border-rose-500/30 flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold uppercase animate-pulse">
                  {t.liveChannel}
                </span>
                <span className="text-xs text-rose-600 dark:text-amber-300 font-semibold">
                  {activeChannel.radius >= 1000
                    ? `${activeChannel.radius / 1000} km`
                    : `${activeChannel.radius} m`}{' '}
                  {t.range} • {activeChannel.listenerCount || 1} {t.listeners}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white truncate mt-1">
                {activeChannel.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                {t.speaker}:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {activeChannel.ownerName}
                </strong>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeChannel.ownerClientId === myClientId && (
                <button
                  onClick={() => {
                    socket?.emit('close_channel', {
                      channelId: activeChannel.id,
                    });
                    setActiveChannelId(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-600/20 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-600 hover:text-white transition"
                >
                  {t.endBroadcast}
                </button>
              )}
              <button
                onClick={() => setActiveChannelId(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Kanal Anons ve Canlı Altyazı Akışı (Büyük Puntolu Okunaklı Görünüm) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeChannel.messages.map((bMsg) => {
              const chTrKey = `ch_${bMsg.id}_${uiLang}`;
              const chTranslated = translations[chTrKey];
              return (
                <div
                  key={bMsg.id}
                  className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl p-4 shadow-sm space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-bold text-rose-600 dark:text-amber-300 flex items-center gap-1.5">
                      {bMsg.isLiveVoice ? (
                        <>
                          <Mic className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                          <span>Canlı Sesli Altyazı</span>
                        </>
                      ) : (
                        <>
                          <Megaphone className="w-3.5 h-3.5 text-blue-600 dark:text-amber-400" />
                          <span>Yazılı Duyuru</span>
                        </>
                      )}
                    </span>
                    <span>{formatTime(bMsg.timestamp)}</span>
                  </div>
                  <p className="text-base sm:text-lg font-medium text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                    {bMsg.text}
                  </p>
                  {chTranslated && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-neutral-700 text-sm sm:text-base font-medium text-blue-600 dark:text-blue-300 leading-relaxed whitespace-pre-wrap flex items-start gap-1.5">
                      <Globe className="w-4 h-4 shrink-0 mt-1 opacity-80" />
                      <span>{chTranslated}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Konuşmacı o an konuşurken anlık önizleme */}
            {liveTranscriptPreview && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-4 text-rose-700 dark:text-rose-200 italic animate-pulse">
                {liveTranscriptPreview}...
              </div>
            )}

            <div ref={channelEndRef} />
          </div>

          {/* Kanal Alt Barı: Canlı Tepkiler + (Sadece Yayıncı İçin) Sesli Dikte & Mesaj Gönderme */}
          <div className="bg-white dark:bg-neutral-900 p-3 border-t border-slate-200 dark:border-neutral-800 space-y-2.5 shrink-0">
            {/* Dinleyici Alkış / Tepki Barı */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-neutral-400">
                Canlı Tepki Ver:
              </span>
              <div className="flex items-center gap-2">
                {CHANNEL_REACTIONS.map((em) => (
                  <button
                    key={em}
                    onClick={() =>
                      socket?.emit('react_channel', {
                        channelId: activeChannel.id,
                        emoji: em,
                      })
                    }
                    className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 border border-slate-200 dark:border-neutral-700 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <span>{em}</span>
                    <span className="text-blue-600 dark:text-amber-300">
                      {activeChannel.reactions?.[em] || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {activeChannel.ownerClientId === myClientId ? (
              <form
                onSubmit={handleSendChannelBroadcast}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={toggleLiveVoiceDictation}
                  className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition ${
                    isDictating
                      ? 'bg-rose-600 text-white animate-pulse shadow-md'
                      : 'bg-rose-50 dark:bg-neutral-800 border border-rose-200 dark:border-neutral-700 text-rose-600 dark:text-rose-300'
                  }`}
                  title="Mikrofona konuştuğunuzu otomatik yazıya çevirip herkese gönderir"
                >
                  {isDictating ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      <span>Canlı Ses Açık</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Sesli Dikte</span>
                    </>
                  )}
                </button>

                <input
                  type="text"
                  enterKeyHint="send"
                  value={channelInputText}
                  onChange={(e) => setChannelInputText(e.target.value)}
                  placeholder="Tüm dinleyicilere yazılı duyuru gönder..."
                  className="flex-1 min-w-0 bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 text-sm rounded-xl px-4 py-2.5 border border-slate-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />

                <button
                  type="submit"
                  disabled={!channelInputText.trim()}
                  className="w-10 h-10 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0"
                >
                  <Send className="w-5 h-5 translate-x-[1px]" />
                </button>
              </form>
            ) : (
              <div className="text-center text-xs text-slate-500 dark:text-neutral-400 bg-slate-50 dark:bg-neutral-800 py-2 rounded-xl border border-slate-200 dark:border-neutral-700">
                Bu tek yönlü bir anons kanalıdır. Sadece konuşmacı (
                <strong>{activeChannel.ownerName}</strong>) ileti gönderebilir.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 0: 📖 MITEMASUKA NEDİR? */}
      {showStoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowStoryModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {(['tr', 'en', 'jp'] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setActiveStoryLang(lng)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition ${
                    activeStoryLang === lng
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {lng === 'tr' ? 'TR' : lng === 'en' ? 'EN' : 'JP'}
                </button>
              ))}
            </div>

            {activeStoryLang === 'tr' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  見てますか? • Mitemasuka? • &ldquo;Beni Görüyor Musun?&rdquo;
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Aynı Mekandayız, Ama Birbirimizi Görüyor Muyuz?
                </h3>
                <p className="text-slate-600 dark:text-neutral-300 text-xs sm:text-sm">
                  Her gün kafelerde, üniversite kampüslerinde, konserlerde,
                  kütüphanelerde veya etkinliklerde yan yana oturuyoruz. Binlerce
                  kilometre uzaktaki yabancılarla sosyal medyada konuşurken,
                  <strong> tam 10 metre ötemizdeki </strong> insanlarla tek
                  kelime etmeden yanlarından geçip gidiyoruz.
                </p>
                <div className="bg-slate-50 dark:bg-neutral-800 p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-700 space-y-2 text-xs">
                  <div className="font-bold text-blue-700 dark:text-amber-300">
                    İsmin Doğuş Hikayesi:
                  </div>
                  <p className="text-slate-600 dark:text-neutral-300">
                    Japoncada{' '}
                    <strong>&ldquo;Mitemasu ka?&rdquo; (見てますか?)</strong>,{' '}
                    <em>&ldquo;Beni görüyor musun? / Etrafına bakıyor musun?&rdquo;</em>{' '}
                    anlamına gelir. Uygulamamız geliştirilirken Türkçe{' '}
                    <em>&ldquo;MiniTemas&rdquo;</em> kelimesinin sesli yapay zeka
                    tarafından Japonca <strong>&ldquo;見てますか?&rdquo;</strong>{' '}
                    olarak duyulmasıyla doğdu.
                  </p>
                </div>
                <div className="space-y-1.5 text-xs text-slate-700 dark:text-neutral-200">
                  <div className="font-bold text-blue-700 dark:text-blue-400">
                    Nasıl Çalışır?
                  </div>
                  <p>
                    • <strong>İndirme veya Kayıt Yok:</strong> Sadece{' '}
                    <code>mitemasuka.com</code> adresine gir ve konum izni ver.
                  </p>
                  <p>
                    • <strong>100 Metre Gerçeklik Çemberi:</strong> Sunucu,
                    Haversine algoritmasıyla sadece fiziksel olarak seninle aynı
                    100 metrede bulunan kişileri tek bir canlı sohbet odasında
                    buluşturur.
                  </p>
                  <p>
                    • <strong>Tek Yönlü Megafon Kanalı:</strong> Konser,
                    miting, konferans veya gezilerde konuşmacının sesi anında
                    yazılı altyazı olarak menzildeki herkesin ekranına düşer.
                  </p>
                </div>
              </div>
            )}

            {activeStoryLang === 'en' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  見てますか? • Mitemasuka? • &ldquo;Do You See Me?&rdquo;
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  We Are in the Same Place, But Do We Really See Each Other?
                </h3>
                <p className="text-slate-600 dark:text-neutral-300 text-xs sm:text-sm">
                  Every day in cafes, university campuses, festivals, and
                  lounges, we sit just meters apart—yet remain complete
                  strangers. <strong>Mitemasuka (見てますか?)</strong> means{' '}
                  <em>&ldquo;Are you looking? / Do you see me?&rdquo;</em> in
                  Japanese.
                </p>
                <div className="bg-slate-50 dark:bg-neutral-800 p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-700 space-y-1.5 text-xs text-slate-600 dark:text-neutral-300">
                  <p>
                    • <strong>Zero Friction:</strong> No app store downloads, no
                    sign-up forms. Open <code>mitemasuka.com</code> and join your
                    live <strong>100-meter</strong> radius room instantly.
                  </p>
                  <p>
                    • <strong>Live Broadcast Channels:</strong> One-way live
                    voice-to-text captions for concerts, rallies, lectures, and
                    guided tours.
                  </p>
                </div>
              </div>
            )}

            {activeStoryLang === 'jp' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  見てますか? • Mitemasuka
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  同じ場所にいるのに、お互いが見えていますか？
                </h3>
                <p className="text-slate-600 dark:text-neutral-300 text-xs sm:text-sm">
                  カフェ、キャンパス、イベント会場で、すぐ隣にいる人と今すぐつながる。
                  <strong>Mitemasuka (見てますか?)</strong>{' '}
                  は、半径100メートル以内にいる人たちだけをリアルタイムで同じチャットルームにつなぐハイパーローカルPWAです。
                </p>
              </div>
            )}

            <button
              onClick={() => setShowStoryModal(false)}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-sm transition"
            >
              {t.backToRadar}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: ⚡ MITEMASUKA PLUS PAYWALL */}
      {showPlusModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowPlusModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Mitemasuka Plus
                </h3>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  {t.plusSubtitle}
                </p>
              </div>
            </div>

            {paywallReason && (
              <div className="bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/40 text-amber-800 dark:text-amber-200 text-xs px-3.5 py-2.5 rounded-xl">
                {paywallReason}
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-700 dark:text-neutral-200 bg-slate-50 dark:bg-neutral-800 p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{t.plusFeature1}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{t.plusFeature2}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{t.plusFeature3}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{t.plusFeature4}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                {t.plusPromoFree}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'daily' as const,
                    title: t.dailyPass,
                    price: t.priceDaily,
                    sub: t.todayOnly,
                  },
                  {
                    id: 'weekly' as const,
                    title: t.weeklyPass,
                    price: t.priceWeekly,
                    sub: t.mostPopular,
                  },
                  {
                    id: 'monthly' as const,
                    title: t.monthlyPlus,
                    price: t.priceMonthly,
                    sub: t.bestValue,
                  },
                ].map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPlanOption(pkg.id)}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-between ${
                      selectedPlanOption === pkg.id
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-slate-900 dark:text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
                      {pkg.sub}
                    </span>
                    <div className="my-1 flex flex-col items-center">
                      <span className="relative inline-block text-sm font-bold text-slate-400 line-through decoration-rose-500 decoration-2">
                        {pkg.price}
                        <span className="absolute inset-0 flex items-center justify-center text-rose-500 font-black text-base pointer-events-none">
                          ✕
                        </span>
                      </span>
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                        {t.freeLabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium">{pkg.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleActivatePlus}
              className="w-full py-3 rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm transition shadow-md shadow-blue-700/20"
            >
              {t.activateFreeBtn}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: 📲 YAKININDAKİNİ EKLE (QR KOD) */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t.qrModalTitle} (見てますか?)
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              {t.qrModalDesc}
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block mx-auto border border-slate-200 shadow-xs">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  currentUrl
                )}`}
                alt="Mitemasuka QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-neutral-800 p-2 rounded-xl border border-slate-200 dark:border-neutral-700">
              <span className="text-xs text-slate-600 dark:text-neutral-300 truncate flex-1 font-mono">
                {currentUrl}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(currentUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> {t.copied}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> {t.copy}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ✏️ ÖZEL TAKMA AD DEĞİŞTİRME */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveNickname}
            className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowNicknameModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>{t.nicknameModalTitle}</span>
            </h3>
            <input
              type="text"
              maxLength={20}
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder={t.nicknamePlaceholder}
              className="w-full bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* MODAL 4: 🛡️ KURALLAR & ENGELLENEN KULLANICILAR */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <span>{t.rulesModalTitle}</span>
            </h3>

            <ul className="text-xs text-slate-600 dark:text-neutral-300 space-y-2 bg-slate-50 dark:bg-neutral-800 p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-700">
              <li>
                • Odadaki kişilerle saygılı iletişim kurun. Rahatsız edici
                davranışlarda bulunanları mesaj üzerindeki kalkan ikonuna
                basarak bildirebilirsiniz.
              </li>
              <li>
                • <strong>Otomatik Koruma:</strong> Odadaki 3 farklı kullanıcı
                tarafından kötü amaçlı olarak bildirilen kişiler otomatik olarak
                susturulur.
              </li>
              <li>
                • İstemediğiniz kişileri engelleyerek mesajlarını tamamen
                gizleyebilirsiniz.
              </li>
            </ul>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-neutral-400">
                {t.blockedUsers} ({Object.keys(blockedClientIds).length})
              </h4>
              {Object.keys(blockedClientIds).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  {t.noBlockedUsers}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {Object.entries(blockedClientIds).map(([cid, uname]) => (
                    <div
                      key={cid}
                      className="flex items-center justify-between bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 px-3 py-2 rounded-xl text-xs"
                    >
                      <span className="font-medium text-slate-800 dark:text-neutral-200">
                        {uname}
                      </span>
                      <button
                        onClick={() => toggleBlockUser(cid, uname)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                      >
                        {t.unblock}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5: KALKAN İKONUNA BASINCA AÇILAN BİLDİRİM ONAY BALONU */}
      {reportTarget && (
        <div
          onClick={() => setReportTarget(null)}
          className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setReportTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                {t.reportModalTitle.replace('{name}', reportTarget.username)}
              </h3>
            </div>

            {reportTarget.done ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-semibold px-4 py-3 rounded-2xl text-center">
                {t.reportSuccessText}
              </div>
            ) : (
              <>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-neutral-300 leading-relaxed bg-slate-50 dark:bg-neutral-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-neutral-700">
                  {t.reportModalDesc}
                </p>

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReportTarget(null)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 font-semibold text-xs sm:text-sm transition"
                    >
                      {t.dmCancelBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmReportUser(false)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm transition shadow-sm"
                    >
                      {t.reportConfirmBtn}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => confirmReportUser(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold text-xs transition"
                  >
                    {t.reportAndBlockBtn}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
