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
  Reply,
  MessageSquareLock,
  Check,
  Copy,
  Info,
  Globe,
  RefreshCw,
} from 'lucide-react';

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
  reactions?: Record<string, string[]>;
  systemType?: 'join' | 'leave' | 'info';
  timestamp: string;
}

const RADIUS_OPTIONS = [
  { value: 100, label: '100 m', requiresPlus: false },
  { value: 500, label: '500 m', requiresPlus: true },
  { value: 1000, label: '1 km', requiresPlus: true },
  { value: 5000, label: '5 km', requiresPlus: true },
];

const EMOJI_LIST = ['❤️', '😂', '👍', '🔥'];

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

function playBeepSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

export default function MitemasukaPage() {
  const [socket, setSocket] = useState<WsClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Kullanıcının kalıcı kimliği ve Plus / Kota durumu
  const [myId, setMyId] = useState<string>('');
  const [myClientId, setMyClientId] = useState<string>('');
  const [myUsername, setMyUsername] = useState<string>('Bağlanıyor...');
  const [myColor, setMyColor] = useState<string>('#34D399');
  const [isPlus, setIsPlus] = useState<boolean>(false);
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
  const [showMembersDrawer, setShowMembersDrawer] = useState<boolean>(false);

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

  // Yerel Simülatör & Ses Ayarı
  const [simOffsetMeters, setSimOffsetMeters] = useState<number>(0);
  const [showSimBar, setShowSimBar] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Mesajlaşma, Yanıtlama, Özel Fısıltı ve Engelleme
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<ReplyInfo | null>(null);
  const [whisperTarget, setWhisperTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [blockedClientIds, setBlockedClientIds] = useState<
    Record<string, string>
  >({});
  const [reportedClientIds, setReportedClientIds] = useState<
    Record<string, boolean>
  >({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const soundEnabledRef = useRef<boolean>(true);
  const myIdRef = useRef<string>('');
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const effectiveCoords = React.useMemo(() => {
    if (!baseCoords) return null;
    const latOffset = simOffsetMeters / 111320;
    return {
      lat: baseCoords.lat + latOffset,
      lng: baseCoords.lng,
    };
  }, [baseCoords, simOffsetMeters]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    try {
      const savedBlocks = localStorage.getItem('mitemasuka_blocked');
      if (savedBlocks) setBlockedClientIds(JSON.parse(savedBlocks));
    } catch {}
  }, []);

  // WebSocket Bağlantısı (Ekran uyandığında veya ağ değiştiğinde anında yeniden bağlanır)
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
        `${wsBaseUrl}?clientId=${encodeURIComponent(storedClientId)}`
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
            if (Array.isArray(data.history) && data.history.length > 0) {
              setMessages(
                data.history.map((m: ChatItem) => ({
                  ...m,
                  kind: 'chat',
                }))
              );
            }
          } else if (event === 'room_users') {
            setRoomUsers(data.users || []);
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
              soundEnabledRef.current &&
              data.senderId !== myIdRef.current &&
              data.senderClientId !== storedClientId
            ) {
              playBeepSound();
            }
          } else if (event === 'message_reaction') {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== data.messageId) return m;
                const currentReactions = { ...(m.reactions || {}) };
                const list = [...(currentReactions[data.emoji] || [])];
                const idx = list.indexOf(data.username);
                if (idx >= 0) list.splice(idx, 1);
                else list.push(data.username);
                currentReactions[data.emoji] = list;
                return { ...m, reactions: currentReactions };
              })
            );
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
  }, []);

  // Konum alma ve izleme fonksiyonu (Hem otomatik hem de kullanıcı butona dokunduğunda çalışır)
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

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

    socket.emit('send_message', {
      text: inputText.trim(),
      replyTo: replyingTo,
      whisperToId: whisperTarget?.id || null,
      whisperToName: whisperTarget?.username || null,
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
    if (!socket || !targetClientId || targetClientId === myClientId) return;
    if (reportedClientIds[targetClientId]) return;

    socket.emit('report_user', { targetClientId });
    setReportedClientIds((prev) => ({ ...prev, [targetClientId]: true }));
    alert(
      `🛡️ ${targetName} bildirildi. Odadaki 3 farklı kişi şikayet ederse otomatik olarak susturulacaktır.`
    );
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

  return (
    <div className="relative flex flex-col h-[100dvh] max-w-2xl mx-auto bg-[#0b141a] text-[#e9edef] border-x border-[#222d34] shadow-2xl overflow-hidden">
      {/* ÜST BAR (Mobil ve Masaüstünde Asla Üst Üste Binmeyen 2 Katmanlı Tasarım) */}
      <header className="bg-[#202c33] border-b border-[#2a3942] z-20 shrink-0">
        {/* 1. Satır: Logo, Oda Bilgisi ve Hamburger Menü */}
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none min-w-0 flex-1"
            onClick={() => setShowMembersDrawer((prev) => !prev)}
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#00a884]/20 text-[#00a884] shrink-0">
              <Radar className="w-6 h-6 animate-pulse" />
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#202c33] ${
                  isConnected ? 'bg-[#00a884]' : 'bg-red-500'
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-base leading-tight truncate tracking-tight">
                  Mitemasuka
                </h1>
                <span className="text-[11px] text-[#00a884] font-medium px-1.5 py-0.5 rounded bg-[#00a884]/10 border border-[#00a884]/30 shrink-0">
                  見てますか?
                </span>
                {showMembersDrawer ? (
                  <ChevronUp className="w-4 h-4 text-[#8696a0] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#8696a0] shrink-0" />
                )}
              </div>
              <p className="text-xs text-[#8696a0] flex items-center gap-1.5 truncate mt-0.5">
                <Users className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                <span className="text-[#e9edef] font-medium">
                  {roomUsers.length} kişi
                </span>
                <span>•</span>
                <span
                  style={{ color: myColor }}
                  className="font-medium truncate flex items-center gap-1"
                >
                  {myUsername}
                  {isPlus && (
                    <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded">
                      ⚡ PLUS
                    </span>
                  )}
                  {ghostMode && <span title="Hayalet Mod Aktif">👻</span>}
                </span>
              </p>
            </div>
          </div>

          {/* Masaüstünde Menzil Seçici Sağda, Mobilde Alt Satırda */}
          <div className="hidden sm:flex bg-[#111b21] p-0.5 rounded-lg border border-[#2a3942] shrink-0">
            {RADIUS_OPTIONS.map((opt) => {
              const locked = opt.requiresPlus && !isPlus;
              const isSelected = selectedRadius === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelectRadius(opt)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    isSelected
                      ? 'bg-[#00a884] text-[#111b21] font-bold shadow'
                      : locked
                      ? 'text-[#8696a0]/80 hover:text-amber-300'
                      : 'text-[#8696a0] hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  {locked && <Lock className="w-2.5 h-2.5 text-amber-400" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowHamburgerMenu((prev) => !prev)}
            className="p-2 rounded-xl bg-[#111b21] border border-[#2a3942] text-[#e9edef] hover:bg-[#2a3942] transition shrink-0"
            aria-label="Menü"
          >
            {showHamburgerMenu ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* 2. Satır (Sadece Mobil Ekranlarda): Tam Genişlikte Ferah Menzil Seçici */}
        <div className="flex sm:hidden px-3 pb-2">
          <div className="grid grid-cols-4 w-full bg-[#111b21] p-1 rounded-xl border border-[#2a3942] gap-1">
            {RADIUS_OPTIONS.map((opt) => {
              const locked = opt.requiresPlus && !isPlus;
              const isSelected = selectedRadius === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelectRadius(opt)}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                    isSelected
                      ? 'bg-[#00a884] text-[#111b21] font-bold shadow'
                      : locked
                      ? 'text-[#8696a0] hover:text-amber-300'
                      : 'text-[#8696a0] hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  {locked && <Lock className="w-3 h-3 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* HAMBURGER MENÜ */}
      {showHamburgerMenu && (
        <div className="absolute top-[60px] right-3 w-72 bg-[#202c33] border border-[#2a3942] rounded-2xl shadow-2xl z-40 py-2 text-sm divide-y divide-[#2a3942]">
          <div className="px-3 py-2">
            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setPaywallReason(null);
                setShowPlusModal(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-400/40 text-amber-300 font-semibold hover:brightness-110 transition"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {isPlus ? 'Mitemasuka Plus Aktif' : "Mitemasuka Plus'a Geç"}
              </span>
              <span className="text-xs bg-amber-400 text-black px-2 py-0.5 rounded-full font-bold">
                {isPlus ? 'VIP' : 'Yükselt'}
              </span>
            </button>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowStoryModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#2a3942] transition text-left"
            >
              <Info className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <span>Mitemasuka Nedir?</span>
                  <span className="text-[10px] text-[#00a884]">見てますか?</span>
                </div>
                <div className="text-[11px] text-[#8696a0]">
                  &ldquo;Beni görüyor musun?&rdquo; hikayesi ve tanıtım
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowQrModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#2a3942] transition text-left"
            >
              <QrCode className="w-4 h-4 text-[#00a884] shrink-0" />
              <div>
                <div className="font-medium">Yakınındakini Ekle (QR Kod)</div>
                <div className="text-[11px] text-[#8696a0]">
                  Çevrendeki kişiler okutup odaya katılsın
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
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#2a3942] transition text-left"
            >
              <span className="flex items-center gap-3">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <span>Takma Adımı Değiştir</span>
              </span>
              {!isPlus && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            </button>

            <button
              onClick={() => {
                if (!isPlus) {
                  setShowHamburgerMenu(false);
                  setPaywallReason(
                    '👻 Hayalet Modu ile odaya girdiğinizde veya çıktığınızda kimseye bildirim gitmez. Sadece Plus üyelere özeldir.'
                  );
                  setShowPlusModal(true);
                  return;
                }
                socket?.emit('set_ghost_mode', { enabled: !ghostMode });
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#2a3942] transition text-left"
            >
              <span className="flex items-center gap-3">
                <Ghost className="w-4 h-4 text-purple-400" />
                <span>Hayalet Modu (Sessiz Giriş)</span>
              </span>
              {!isPlus ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    ghostMode
                      ? 'bg-purple-500/30 text-purple-300'
                      : 'bg-[#111b21] text-[#8696a0]'
                  }`}
                >
                  {ghostMode ? 'Açık' : 'Kapalı'}
                </span>
              )}
            </button>

            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#2a3942] transition text-left"
            >
              <span className="flex items-center gap-3">
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#8696a0]" />
                )}
                <span>Bildirim Sesleri</span>
              </span>
              <span className="text-xs text-[#8696a0]">
                {soundEnabled ? 'Açık' : 'Sessiz'}
              </span>
            </button>

            <button
              onClick={() => {
                setShowHamburgerMenu(false);
                setShowRulesModal(true);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#2a3942] transition text-left"
            >
              <span className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Kurallar & Engellenenler</span>
              </span>
              {Object.keys(blockedClientIds).length > 0 && (
                <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">
                  {Object.keys(blockedClientIds).length}
                </span>
              )}
            </button>
          </div>

          <div className="pt-1">
            <button
              onClick={() => {
                setShowSimBar((prev) => !prev);
                setShowHamburgerMenu(false);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#2a3942] transition text-left text-amber-300"
            >
              <span className="flex items-center gap-3">
                <FlaskConical className="w-4 h-4" />
                <span>Test Mesafe Simülatörü</span>
              </span>
              <span className="text-xs">{showSimBar ? 'Gizle' : 'Göster'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ODADAKİ KİŞİLER ÇEKMECESİ */}
      {showMembersDrawer && (
        <div className="bg-[#182229] border-b border-[#2a3942] px-4 py-3 text-xs space-y-2 shrink-0">
          <div className="flex items-center justify-between text-[#8696a0]">
            <span className="font-medium uppercase tracking-wider">
              Odadaki Aktif Kişiler ({roomUsers.length}) — Özel fısıltı için
              isme tıklayın
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
                  className="flex items-center gap-1.5 bg-[#202c33] px-2.5 py-1.5 rounded-full border border-[#2a3942]"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: u.color }}
                  />
                  <button
                    onClick={() => {
                      if (isMe) return;
                      if (!isPlus) {
                        setPaywallReason(
                          `${u.username} adlı kişiye 1'e 1 Özel Fısıltı (DM) göndermek için Mitemasuka Plus gereklidir.`
                        );
                        setShowPlusModal(true);
                        return;
                      }
                      setWhisperTarget({ id: u.id, username: u.username });
                      setShowMembersDrawer(false);
                    }}
                    className="font-medium hover:underline flex items-center gap-1"
                    style={{ color: u.color }}
                  >
                    {u.username}
                    {u.isPlus && <span className="text-[10px]">⚡</span>}
                  </button>
                  {isMe ? (
                    <span className="text-[11px] text-[#8696a0]">(Sen)</span>
                  ) : (
                    <>
                      {dist !== null && (
                        <span className="text-[11px] text-[#00a884]">
                          • {dist}m
                        </span>
                      )}
                      <button
                        onClick={() => toggleBlockUser(u.clientId, u.username)}
                        title={isBlocked ? 'Engeli Kaldır' : 'Engelle'}
                        className={`ml-1 p-0.5 rounded hover:bg-[#2a3942] ${
                          isBlocked ? 'text-rose-400' : 'text-[#8696a0]'
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
        <div className="bg-amber-950/40 border-b border-amber-500/30 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-amber-300">
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
                className={`px-2 py-1 rounded font-medium transition ${
                  simOffsetMeters === item.offset
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-[#202c33] text-amber-200 hover:bg-[#2a3942]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KONUM BEKLENİYOR (KARŞILAMA & iOS KONUM İZNİ REHBERİ EKRANI) */}
      {!effectiveCoords ? (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-5 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#00a884]/15 border border-[#00a884]/40 flex items-center justify-center text-[#00a884] shadow-xl shrink-0">
            <MapPin className="w-8 h-8 animate-bounce" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#202c33] border border-[#2a3942] text-xs text-[#00a884] font-semibold">
              <span>見てますか?</span>
              <span>•</span>
              <span>Beni Görüyor Musun?</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">
              Mitemasuka
            </h2>
            <p className="text-xs sm:text-sm text-[#8696a0] max-w-md">
              100 metre çevrendeki gerçek insanlarla aynı odaya bağlanmak için
              aşağıdaki butona dokunarak konum izni verin.
            </p>
          </div>

          {/* ANA KONUM İZNİ İSTEME BUTONU (Kullanıcı dokunuşu ile tetikler) */}
          <button
            onClick={startLocationTracking}
            disabled={isRequestingGeo}
            className="w-full max-w-xs py-3.5 px-5 bg-[#00a884] hover:bg-[#06cf9c] active:scale-[0.99] text-[#111b21] font-extrabold rounded-2xl text-sm transition shadow-lg flex items-center justify-center gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRequestingGeo ? 'animate-spin' : ''}`}
            />
            <span>
              {isRequestingGeo
                ? 'Konum Alınıyor...'
                : '📍 Konum İzni Ver ve Odaya Gir'}
            </span>
          </button>

          {/* EĞER iPHONE / TARAYICI KONUM İZNİNİ OTOMATİK REDDEDİYORSA AÇIK ADIMLAR */}
          {geoError === 'PERMISSION_DENIED' && (
            <div className="w-full max-w-md bg-[#182229] border border-amber-500/40 rounded-2xl p-4 text-left space-y-2.5 text-xs shadow-lg">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Telefonunuz Tarayıcının Konum İznini Kapatmış</span>
              </div>
              <p className="text-[#8696a0] leading-relaxed">
                iPhone&apos;da daha önce tarayıcı konum izni{' '}
                <strong>&ldquo;Asla&rdquo;</strong> olarak seçildiyse telefon
                size pencere çıkarmadan otomatik reddeder. Açmak için:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-[#e9edef] bg-[#111b21] p-3 rounded-xl border border-[#2a3942]">
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
                  <strong className="text-[#00a884]">
                    &ldquo;Uygulamayı Kullanırken&rdquo;
                  </strong>{' '}
                  seçin.
                </li>
                <li>
                  Safari&apos;deyseniz adres çubuğunun solundaki{' '}
                  <strong>aA / sol ikon &rarr; Web Sitesi Ayarları &rarr; Konum &rarr; İzin Ver</strong>{' '}
                  yapıp yukarıdaki yeşil butona tekrar basın.
                </li>
              </ol>
            </div>
          )}

          {geoError && geoError !== 'PERMISSION_DENIED' && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 rounded-xl max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          <button
            onClick={() => setShowStoryModal(true)}
            className="px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#2a3942] font-medium rounded-xl text-xs transition"
          >
            📖 Mitemasuka Nedir? (見てますか?)
          </button>
        </div>
      ) : (
        <main
          onClick={() => showHamburgerMenu && setShowHamburgerMenu(false)}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-[#0b141a] bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:20px_20px]"
        >
          <div className="flex justify-center my-2">
            <div className="bg-[#182229] border border-[#2a3942] text-[#8696a0] text-xs px-3.5 py-2 rounded-xl text-center max-w-md shadow">
              <span className="text-[#00a884] font-semibold">
                見てますか? (Beni görüyor musun?)
              </span>{' '}
              — Şu an{' '}
              <strong className="text-white">
                {selectedRadius >= 1000
                  ? `${selectedRadius / 1000} km`
                  : `${selectedRadius} metre`}
              </strong>{' '}
              çapındaki herkes bu odada birbirini görür ve anlık mesajlaşır.
            </div>
          </div>

          {messages.map((item) => {
            if (item.kind === 'system') {
              const badgeStyle =
                item.systemType === 'join'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/40'
                  : item.systemType === 'leave'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-700/40'
                  : 'bg-[#182229] text-[#8696a0] border-[#2a3942]';

              return (
                <div key={item.id} className="flex justify-center my-1.5">
                  <span
                    className={`text-xs px-3 py-1 rounded-full border shadow-sm ${badgeStyle}`}
                  >
                    {item.systemType === 'join' && '🟢 '}
                    {item.systemType === 'leave' && '🔴 '}
                    {item.text}
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

            return (
              <div
                key={item.id}
                className={`group flex flex-col ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`relative max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2 shadow-md ${
                    isWhisper
                      ? 'bg-purple-950/90 border border-purple-500/50 text-purple-100'
                      : isMine
                      ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
                      : 'bg-[#202c33] text-[#e9edef] rounded-tl-none border border-[#2a3942]'
                  }`}
                >
                  {isWhisper && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-300 mb-1 pb-1 border-b border-purple-500/30">
                      <MessageSquareLock className="w-3 h-3" />
                      <span>
                        Özel Fısıltı:{' '}
                        {isMine
                          ? `Sen -> ${item.whisperToName}`
                          : `${item.senderName} -> Sana`}
                      </span>
                    </div>
                  )}

                  {!isMine && (
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <button
                        onClick={() => {
                          if (!isPlus) {
                            setPaywallReason(
                              `${item.senderName} adlı kişiye 1'e 1 Özel Fısıltı (DM) göndermek için Mitemasuka Plus gereklidir.`
                            );
                            setShowPlusModal(true);
                            return;
                          }
                          if (item.senderId && item.senderName) {
                            setWhisperTarget({
                              id: item.senderId,
                              username: item.senderName,
                            });
                          }
                        }}
                        className="text-xs font-bold hover:underline flex items-center gap-1"
                        style={{ color: item.senderColor || '#34D399' }}
                      >
                        <span>{item.senderName}</span>
                        {item.senderIsPlus && (
                          <span className="text-[10px] text-amber-300">⚡</span>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        {distanceFromMe !== null && (
                          <span className="text-[10px] text-[#8696a0] bg-[#111b21]/60 px-1.5 py-0.5 rounded">
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
                            className="opacity-60 hover:opacity-100 text-rose-400"
                          >
                            <ShieldAlert className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {item.replyTo && (
                    <div className="mb-1.5 px-2.5 py-1 rounded bg-black/25 border-l-2 border-[#00a884] text-xs">
                      <div className="font-semibold text-[#00a884]">
                        {item.replyTo.senderName}
                      </div>
                      <div className="text-[#8696a0] truncate">
                        {item.replyTo.text}
                      </div>
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {item.text}
                    </p>
                    <span className="text-[10px] text-[#8696a0] shrink-0 select-none translate-y-0.5">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  <div className="mt-1 pt-1 border-t border-white/5 flex items-center justify-between gap-2 opacity-80 group-hover:opacity-100 transition">
                    <div className="flex items-center gap-1">
                      {EMOJI_LIST.map((em) => {
                        const count = item.reactions?.[em]?.length || 0;
                        return (
                          <button
                            key={em}
                            onClick={() =>
                              socket?.emit('react_message', {
                                messageId: item.id,
                                emoji: em,
                              })
                            }
                            className={`text-[11px] px-1.5 py-0.5 rounded-full transition ${
                              count > 0
                                ? 'bg-[#00a884]/30 text-white font-semibold'
                                : 'hover:bg-white/10 text-[#8696a0]'
                            }`}
                          >
                            {em} {count > 0 && count}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() =>
                        setReplyingTo({
                          id: item.id,
                          senderName: item.senderName || 'Kullanıcı',
                          text: item.text,
                        })
                      }
                      className="text-[11px] text-[#8696a0] hover:text-white flex items-center gap-1"
                    >
                      <Reply className="w-3 h-3" />
                      <span>Yanıtla</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {activeTypingNames.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#00a884] italic pl-2">
              <span className="animate-pulse">●</span>
              <span>{activeTypingNames.join(', ')} yazıyor...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>
      )}

      {/* YANITLAMA VEYA ÖZEL FISILTI ÇUBUĞU */}
      {(replyingTo || whisperTarget) && (
        <div className="bg-[#182229] px-4 py-2 border-t border-[#2a3942] flex items-center justify-between text-xs">
          {whisperTarget ? (
            <div className="flex items-center gap-2 text-purple-300">
              <MessageSquareLock className="w-4 h-4" />
              <span>
                <strong>{whisperTarget.username}</strong> kişisine 1-e-1 Özel
                Fısıltı gönderiyorsunuz (Sadece ikiniz görebilirsiniz)
              </span>
            </div>
          ) : (
            replyingTo && (
              <div className="flex items-center gap-2 text-[#8696a0] truncate">
                <Reply className="w-4 h-4 text-[#00a884] shrink-0" />
                <span className="truncate">
                  <strong className="text-[#00a884]">
                    {replyingTo.senderName}:
                  </strong>{' '}
                  {replyingTo.text}
                </span>
              </div>
            )
          )}
          <button
            onClick={() => {
              setReplyingTo(null);
              setWhisperTarget(null);
            }}
            className="p-1 text-[#8696a0] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ALT MESAJ YAZMA ALANI (2 SATIRLI TASARIM) */}
      <footer className="bg-[#202c33] px-3 pt-2.5 pb-2 border-t border-[#2a3942] shrink-0 space-y-2">
        {/* 1. Satır: Mesaj Yazma Kutusu ve Gönder Butonu */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            enterKeyHint="send"
            value={inputText}
            onChange={handleInputChange}
            disabled={!effectiveCoords || !isConnected || isBanned}
            placeholder={
              isBanned
                ? 'Çoklu şikayet nedeniyle susturuldunuz.'
                : whisperTarget
                ? `${whisperTarget.username} kişisine özel fısıltı...`
                : effectiveCoords
                ? `${selectedRadius >= 1000 ? selectedRadius / 1000 + ' km' : selectedRadius + 'm'} odasına mesaj yazın...`
                : 'Önce konum izni verin...'
            }
            className="flex-1 min-w-0 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          />

          <button
            type="submit"
            disabled={
              !inputText.trim() || !effectiveCoords || !isConnected || isBanned
            }
            className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#06cf9c] disabled:opacity-40 text-[#111b21] flex items-center justify-center transition shrink-0 shadow-md"
          >
            <Send className="w-5 h-5 translate-x-[1px]" />
          </button>
        </form>

        {/* 2. Satır: Günlük Hak Göstergesi ve Uygulama Mesajı */}
        <div className="flex items-center justify-between px-1 text-[11px] text-[#8696a0]">
          <button
            type="button"
            onClick={() => {
              setPaywallReason(null);
              setShowPlusModal(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition ${
              isPlus
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 font-semibold'
                : remainingQuota <= 3
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse'
                : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-white'
            }`}
          >
            {isPlus ? (
              <>
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Mitemasuka Plus • Sınırsız</span>
              </>
            ) : (
              <>
                <span>
                  Hak: <strong className="text-white">{remainingQuota}</strong>/
                  {dailyLimit}
                </span>
                <span className="text-amber-400 font-medium">• Sınırsız ⚡</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowStoryModal(true)}
            className="hover:text-[#00a884] transition truncate ml-2"
          >
            <span className="text-[#00a884] font-medium">見てますか?</span> • Beni
            görüyor musun?
          </button>
        </div>
      </footer>

      {/* MODAL 0: 📖 MITEMASUKA NEDİR? */}
      {showStoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowStoryModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-[#111b21] text-[#8696a0] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#00a884]" />
              {(['tr', 'en', 'jp'] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setActiveStoryLang(lng)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition ${
                    activeStoryLang === lng
                      ? 'bg-[#00a884] text-black'
                      : 'bg-[#111b21] text-[#8696a0] hover:text-white'
                  }`}
                >
                  {lng === 'tr' ? '🇹🇷 TR' : lng === 'en' ? '🇬🇧 EN' : '🇯🇵 JP'}
                </button>
              ))}
            </div>

            {activeStoryLang === 'tr' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-[#00a884]/15 text-[#00a884] text-xs font-bold">
                  見てますか? • Mitemasuka? • &ldquo;Beni Görüyor Musun?&rdquo;
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  Aynı Mekandayız, Ama Birbirimizi Görüyor Muyuz?
                </h3>
                <p className="text-[#e9edef]/90 text-xs sm:text-sm">
                  Her gün kafelerde, üniversite kampüslerinde, konserlerde,
                  kütüphanelerde veya etkinliklerde yan yana oturuyoruz. Binlerce
                  kilometre uzaktaki yabancılarla sosyal medyada konuşurken,
                  <strong> tam 10 metre ötemizdeki </strong> insanlarla tek
                  kelime etmeden yanlarından geçip gidiyoruz.
                </p>
                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-[#2a3942] space-y-2 text-xs">
                  <div className="font-bold text-amber-300">
                    ✨ İsmin Doğuş Hikayesi:
                  </div>
                  <p className="text-[#8696a0]">
                    Japoncada{' '}
                    <strong>&ldquo;Mitemasu ka?&rdquo; (見てますか?)</strong>,{' '}
                    <em>&ldquo;Beni görüyor musun? / Etrafına bakıyor musun?&rdquo;</em>{' '}
                    anlamına gelir. Uygulamamız geliştirilirken Türkçe{' '}
                    <em>&ldquo;MiniTemas&rdquo;</em> kelimesinin sesli yapay zeka
                    tarafından Japonca <strong>&ldquo;見てますか?&rdquo;</strong>{' '}
                    olarak duyulmasıyla doğdu.
                  </p>
                </div>
                <div className="space-y-1.5 text-xs text-[#e9edef]/90">
                  <div className="font-bold text-[#00a884]">
                    🚀 Nasıl Çalışır?
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
                    • <strong>Anı Yaşa:</strong> Mekandan uzaklaştığın anda
                    odadan otomatik düşersin. Sahte profiller yok, sadece şu an
                    etrafında olan gerçek insanlar var.
                  </p>
                </div>
              </div>
            )}

            {activeStoryLang === 'en' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-[#00a884]/15 text-[#00a884] text-xs font-bold">
                  見てますか? • Mitemasuka? • &ldquo;Do You See Me?&rdquo;
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  We Are in the Same Place, But Do We Really See Each Other?
                </h3>
                <p className="text-[#e9edef]/90 text-xs sm:text-sm">
                  Every day in cafes, university campuses, festivals, and
                  lounges, we sit just meters apart—yet remain complete
                  strangers. <strong>Mitemasuka (見てますか?)</strong> means{' '}
                  <em>&ldquo;Are you looking? / Do you see me?&rdquo;</em> in
                  Japanese.
                </p>
                <div className="bg-[#111b21] p-3.5 rounded-2xl border border-[#2a3942] space-y-1.5 text-xs text-[#8696a0]">
                  <p>
                    • <strong>Zero Friction:</strong> No app store downloads, no
                    sign-up forms. Open <code>mitemasuka.com</code> and join your
                    live <strong>100-meter</strong> radius room instantly.
                  </p>
                  <p>
                    • <strong>Hyper-Local Reality:</strong> Only people
                    physically within 100 meters of you right now can see and
                    chat in your room. Walk away, and you leave the room
                    automatically.
                  </p>
                </div>
              </div>
            )}

            {activeStoryLang === 'jp' && (
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="inline-block px-3 py-1 rounded-full bg-[#00a884]/15 text-[#00a884] text-xs font-bold">
                  見てますか? • Mitemasuka
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  同じ場所にいるのに、お互いが見えていますか？
                </h3>
                <p className="text-[#e9edef]/90 text-xs sm:text-sm">
                  カフェ、キャンパス、イベント会場で、すぐ隣にいる人と今すぐつながる。
                  <strong>Mitemasuka (見てますか?)</strong>{' '}
                  は、半径100メートル以内にいる人たちだけをリアルタイムで同じチャットルームにつなぐハイパーローカルPWAです。
                </p>
              </div>
            )}

            <button
              onClick={() => setShowStoryModal(false)}
              className="w-full py-2.5 bg-[#00a884] text-black font-bold rounded-xl text-sm"
            >
              Radara Dön
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: ⚡ MITEMASUKA PLUS PAYWALL */}
      {showPlusModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowPlusModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-[#111b21] text-[#8696a0] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Mitemasuka Plus ⚡
                </h3>
                <p className="text-xs text-[#8696a0]">
                  見てますか? — Tüm menzillerde sınırsız tanış
                </p>
              </div>
            </div>

            {paywallReason && (
              <div className="bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs px-3.5 py-2.5 rounded-xl">
                🔒 {paywallReason}
              </div>
            )}

            <div className="space-y-2 text-xs text-[#e9edef] bg-[#111b21] p-3.5 rounded-2xl border border-[#2a3942]">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00a884] shrink-0" />
                <span>
                  <strong>Sınırsız Mesajlaşma:</strong> Günlük 15 mesaj kotasını
                  kaldır
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00a884] shrink-0" />
                <span>
                  <strong>Tüm Menziller Açık:</strong> 500m, 1 km ve 5 km
                  odalarına eriş
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00a884] shrink-0" />
                <span>
                  <strong>1-e-1 Özel Fısıltı (DM):</strong> Odadaki istediğin
                  kişiyle özel konuş
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00a884] shrink-0" />
                <span>
                  <strong>Özel Rumuz & 👻 Hayalet Modu:</strong> Kendi adını seç
                  veya odaya sessizce gir
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'daily' as const,
                  title: '24 Saatlik Pas',
                  price: '29 ₺',
                  sub: 'Bugünlük',
                },
                {
                  id: 'weekly' as const,
                  title: 'Haftalık Pas',
                  price: '79 ₺',
                  sub: 'En Popüler',
                },
                {
                  id: 'monthly' as const,
                  title: 'Aylık Plus',
                  price: '149 ₺',
                  sub: 'En Avantajlı',
                },
              ].map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPlanOption(pkg.id)}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-between ${
                    selectedPlanOption === pkg.id
                      ? 'bg-amber-400/15 border-amber-400 text-white shadow-lg'
                      : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-white'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                    {pkg.sub}
                  </span>
                  <span className="text-base font-extrabold text-white my-1">
                    {pkg.price}
                  </span>
                  <span className="text-[11px]">{pkg.title}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleActivatePlus}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-emerald-400 text-black font-bold text-sm hover:brightness-110 transition shadow-lg"
            >
              ⚡ Seçili Paketi Hemen Aktif Et
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: 📲 YAKININDAKİNİ EKLE (QR KOD) */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-3xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-[#111b21] text-[#8696a0] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-12 h-12 rounded-2xl bg-[#00a884]/20 flex items-center justify-center text-[#00a884]">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold">
              Yakınındakini Odaya Çağır (見てますか?)
            </h3>
            <p className="text-xs text-[#8696a0]">
              Bulunduğun kafede, kampüste veya mekanda yakınındaki kişilere bu
              QR kodu okut. 100m içindeyseler otomatik olarak bu odaya düşerler!
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  currentUrl
                )}`}
                alt="Mitemasuka QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <div className="flex items-center gap-2 bg-[#111b21] p-2 rounded-xl border border-[#2a3942]">
              <span className="text-xs text-[#8696a0] truncate flex-1 font-mono">
                {currentUrl}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(currentUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-1.5 bg-[#00a884] text-black text-xs font-bold rounded-lg flex items-center gap-1"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Kopyala
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ✏️ ÖZEL TAKMA AD DEĞİŞTİRME */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveNickname}
            className="bg-[#202c33] border border-[#2a3942] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowNicknameModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-[#111b21] text-[#8696a0] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-400" />
              <span>Takma Adını Değiştir (Plus)</span>
            </h3>
            <input
              type="text"
              maxLength={20}
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Yeni takma adınız..."
              className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-[#00a884] text-black font-bold rounded-xl text-sm"
            >
              Kaydet
            </button>
          </form>
        </div>
      )}

      {/* MODAL 4: 🛡️ KURALLAR & ENGELLENEN KULLANICILAR */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-[#111b21] text-[#8696a0] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span>Topluluk Kuralları & Engellenenler</span>
            </h3>

            <ul className="text-xs text-[#8696a0] space-y-2 bg-[#111b21] p-3.5 rounded-2xl border border-[#2a3942]">
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
              <h4 className="text-xs font-semibold uppercase text-[#8696a0]">
                Engellediğiniz Kişiler ({Object.keys(blockedClientIds).length})
              </h4>
              {Object.keys(blockedClientIds).length === 0 ? (
                <p className="text-xs text-[#8696a0]">
                  Henüz kimseyi engellemediniz.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {Object.entries(blockedClientIds).map(([cid, uname]) => (
                    <div
                      key={cid}
                      className="flex items-center justify-between bg-[#111b21] px-3 py-2 rounded-xl text-xs"
                    >
                      <span>{uname}</span>
                      <button
                        onClick={() => toggleBlockUser(cid, uname)}
                        className="text-emerald-400 hover:underline font-medium"
                      >
                        Engeli Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
