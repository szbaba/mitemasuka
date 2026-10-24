import 'dart:async';
import 'dart:convert';
import 'dart:io' show WebSocket;
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MitemasukaApp());
}

const Color kBrandBlue = Color(0xFF1A81E5);
const Color kBrandBlueDarkText = Color(0xFF5CA9F2);
const Color kCrimsonRed = Color(0xFFDC143C);
const Color kCrimsonRedDarkText = Color(0xFFF25C78);

class MitemasukaApp extends StatefulWidget {
  const MitemasukaApp({super.key});

  @override
  State<MitemasukaApp> createState() => _MitemasukaAppState();
}

class _MitemasukaAppState extends State<MitemasukaApp> {
  bool _isDarkMode = false;

  @override
  void initState() {
    super.initState();
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('mitemasuka_theme');
    if (saved != null && mounted) {
      setState(() {
        _isDarkMode = saved == 'dark';
      });
    }
  }

  Future<void> _toggleTheme() async {
    setState(() {
      _isDarkMode = !_isDarkMode;
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mitemasuka_theme', _isDarkMode ? 'dark' : 'light');
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mitemasuka',
      debugShowCheckedModeBanner: false,
      themeMode: _isDarkMode ? ThemeMode.dark : ThemeMode.light,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFEEF2F6),
        colorScheme: ColorScheme.fromSeed(
          seedColor: kBrandBlue,
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF171717),
        colorScheme: ColorScheme.fromSeed(
          seedColor: kBrandBlue,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: MitemasukaHomePage(
        isDarkMode: _isDarkMode,
        onToggleTheme: _toggleTheme,
      ),
    );
  }
}

class ChatMessage {
  final String id;
  final String kind; // 'chat' | 'system'
  final String? systemType; // 'join' | 'leave'
  final String? senderId;
  final String? senderClientId;
  final String? senderName;
  final String? senderColor;
  final double? senderLat;
  final double? senderLng;
  final String text;
  final String timestamp;
  final Map<String, dynamic>? replyTo;
  final String? whisperToClientId;
  final String? whisperToName;
  final Map<String, List<String>> reactions;

  ChatMessage({
    required this.id,
    required this.kind,
    this.systemType,
    this.senderId,
    this.senderClientId,
    this.senderName,
    this.senderColor,
    this.senderLat,
    this.senderLng,
    required this.text,
    required this.timestamp,
    this.replyTo,
    this.whisperToClientId,
    this.whisperToName,
    Map<String, List<String>>? reactions,
  }) : reactions = reactions ?? {};

  factory ChatMessage.fromJson(Map<String, dynamic> json, {String kind = 'chat'}) {
    final Map<String, List<String>> parsedReactions = {};
    if (json['reactions'] is Map) {
      (json['reactions'] as Map).forEach((k, v) {
        if (v is List) {
          parsedReactions[k.toString()] = v.map((e) => e.toString()).toList();
        }
      });
    }
    return ChatMessage(
      id: (json['id'] ?? DateTime.now().millisecondsSinceEpoch.toString()).toString(),
      kind: (json['kind'] ?? kind).toString(),
      systemType: json['systemType']?.toString() ?? json['type']?.toString(),
      senderId: json['senderId']?.toString(),
      senderClientId: json['senderClientId']?.toString(),
      senderName: json['senderName']?.toString(),
      senderColor: json['senderColor']?.toString(),
      senderLat: (json['senderLat'] is num) ? (json['senderLat'] as num).toDouble() : null,
      senderLng: (json['senderLng'] is num) ? (json['senderLng'] as num).toDouble() : null,
      text: (json['text'] ?? '').toString(),
      timestamp: (json['timestamp'] ?? DateTime.now().toIso8601String()).toString(),
      replyTo: json['replyTo'] is Map<String, dynamic>
          ? json['replyTo'] as Map<String, dynamic>
          : null,
      whisperToClientId: json['whisperToClientId']?.toString(),
      whisperToName: json['whisperToName']?.toString(),
      reactions: parsedReactions,
    );
  }
}

class RoomUser {
  final String id;
  final String clientId;
  final String username;
  final String color;
  final double? lat;
  final double? lng;
  final bool isPlus;

  RoomUser({
    required this.id,
    required this.clientId,
    required this.username,
    required this.color,
    this.lat,
    this.lng,
    this.isPlus = false,
  });

  factory RoomUser.fromJson(Map<String, dynamic> json) {
    return RoomUser(
      id: (json['id'] ?? '').toString(),
      clientId: (json['clientId'] ?? json['id'] ?? '').toString(),
      username: (json['username'] ?? 'User').toString(),
      color: (json['color'] ?? '#1A81E5').toString(),
      lat: (json['lat'] is num) ? (json['lat'] as num).toDouble() : null,
      lng: (json['lng'] is num) ? (json['lng'] as num).toDouble() : null,
      isPlus: json['isPlus'] == true,
    );
  }
}

class MitemasukaHomePage extends StatefulWidget {
  final bool isDarkMode;
  final VoidCallback onToggleTheme;

  const MitemasukaHomePage({
    super.key,
    required this.isDarkMode,
    required this.onToggleTheme,
  });

  @override
  State<MitemasukaHomePage> createState() => _MitemasukaHomePageState();
}

class _MitemasukaHomePageState extends State<MitemasukaHomePage> {
  static const String _wsBaseUrl = 'wss://ws.mitemasuka.com';
  static const String _httpBaseUrl = 'https://ws.mitemasuka.com';

  String _myClientId = '';
  String _myId = '';
  String _myUsername = 'Bağlanıyor...';
  bool _isPlus = false;
  bool _ghostMode = false;
  bool _isBanned = false;
  int _dailyLimit = 20;
  int _remainingQuota = 20;

  bool _isConnected = false;
  bool _isConnecting = false;
  WebSocket? _ws;
  StreamSubscription? _wsSub;
  StreamSubscription<Position>? _posSub;
  Timer? _reconnectTimer;
  Timer? _pingTimer;

  double? _baseLat;
  double? _baseLng;
  String? _connectedRegion;

  int _selectedRadius = 100;
  List<RoomUser> _roomUsers = [];
  int _nearbyInstalledCount = 1;

  List<ChatMessage> _messages = [];
  List<ChatMessage> _whispers = [];
  Map<String, dynamic>? _dmSession;
  RoomUser? _dmDraftPeer;
  int _unreadDmCount = 0;
  String _activeView = 'room'; // 'room' | 'dm'

  ChatMessage? _replyingTo;
  final TextEditingController _inputController = TextEditingController();
  final FocusNode _inputFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();

  bool _showHamburgerMenu = false;
  bool _showRadiusMenu = false;
  bool _showMembersDrawer = false;
  ChatMessage? _activeActionMessage;
  String _uiLang = 'tr';
  bool _autoTranslate = false;
  bool _roomNotifEnabled = true;
  bool _whisperNotifEnabled = true;
  bool _presenceNotifEnabled = false;
  String _chatBg = 'ice';
  bool _showSimBar = false;
  int _simOffsetMeters = 0;
  final Map<String, String> _translations = {};
  final Set<String> _translatingIds = {};
  Set<String> _blockedClientIds = {};
  final Set<String> _expandedSystemGroups = {};
  final Map<String, String> _typingUsers = {};
  final Map<String, Timer> _remoteTypingTimers = {};
  Timer? _myTypingDebounce;

  @override
  void initState() {
    super.initState();
    _initializeApp();
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _myTypingDebounce?.cancel();
    for (final t in _remoteTypingTimers.values) {
      t.cancel();
    }
    _remoteTypingTimers.clear();
    _posSub?.cancel();
    _wsSub?.cancel();
    _ws?.close();
    _inputController.dispose();
    _inputFocusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _initializeApp() async {
    final prefs = await SharedPreferences.getInstance();
    String cid = prefs.getString('mitemasuka_client_id') ?? '';
    if (cid.isEmpty) {
      cid =
          'mk_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}_${math.Random().nextInt(999999).toRadixString(36)}';
      await prefs.setString('mitemasuka_client_id', cid);
    }
    final blocked = prefs.getStringList('mitemasuka_blocked') ?? [];
    final eula = prefs.getBool('mitemasuka_eula_v1') ?? false;
    final savedLang = prefs.getString('mitemasuka_lang') ?? 'tr';
    final savedBg = prefs.getString('mitemasuka_chat_bg') ?? 'ice';
    final savedRoomNotif = prefs.getBool('mitemasuka_notif_room') ?? true;
    final savedWhisperNotif = prefs.getBool('mitemasuka_notif_whisper') ?? true;
    final savedPresenceNotif = prefs.getBool('mitemasuka_notif_presence') ?? false;

    setState(() {
      _myClientId = cid;
      _blockedClientIds = blocked.toSet();
      _uiLang = savedLang;
      _chatBg = savedBg;
      _roomNotifEnabled = savedRoomNotif;
      _whisperNotifEnabled = savedWhisperNotif;
      _presenceNotifEnabled = savedPresenceNotif;
    });

    if (!eula && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showEulaModal();
      });
    }

    await _initLocation();
  }

  String get _regionKey {
    if (_baseLat != null && _baseLng != null) {
      return 'reg_${(_baseLat! * 2).round()}_${(_baseLng! * 2).round()}';
    }
    return 'global-hub-v1';
  }

  Future<void> _initLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      _updateCoordinates(pos.latitude, pos.longitude);

      _posSub?.cancel();
      _posSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 5,
        ),
      ).listen((Position p) {
        _updateCoordinates(p.latitude, p.longitude);
      });
    } catch (_) {}
  }

  void _updateCoordinates(double lat, double lng) {
    final prevRegion = _connectedRegion;
    setState(() {
      _baseLat = lat;
      _baseLng = lng;
    });
    final nextRegion = _regionKey;
    debugPrint('[Mitemasuka] GPS Updated: lat=$lat, lng=$lng, region=$nextRegion');
    if ((!_isConnected && !_isConnecting) || (prevRegion != null && prevRegion != nextRegion)) {
      _connectWebSocket();
    } else if (_isConnected) {
      _joinRoomIfReady();
    }
  }

  Future<void> _connectWebSocket() async {
    if (_baseLat == null || _baseLng == null || _isConnecting) return;
    _isConnecting = true;
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    await _wsSub?.cancel();
    try {
      await _ws?.close();
    } catch (_) {}

    final reg = _regionKey;
    _connectedRegion = reg;
    final url =
        '$_wsBaseUrl/?clientId=${Uri.encodeComponent(_myClientId)}&region=${Uri.encodeComponent(reg)}';
    debugPrint('[Mitemasuka] Connecting WebSocket -> $url');

    try {
      final ws = await WebSocket.connect(
        url,
        headers: {
          'Origin': 'https://mitemasuka.com',
          'User-Agent':
              'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
      ).timeout(const Duration(seconds: 12));

      ws.pingInterval = const Duration(seconds: 20);
      _ws = ws;
      _isConnecting = false;
      if (!mounted) {
        ws.close();
        return;
      }

      setState(() {
        _isConnected = true;
      });
      debugPrint('[Mitemasuka] WebSocket Connected! Joining room...');

      _wsSub = ws.listen(
        (raw) {
          _handleWsMessage(raw.toString());
        },
        onDone: () {
          debugPrint('[Mitemasuka] WebSocket Closed (code=${ws.closeCode})');
          for (final t in _remoteTypingTimers.values) {
            t.cancel();
          }
          _remoteTypingTimers.clear();
          if (!mounted) return;
          setState(() {
            _isConnected = false;
            _typingUsers.clear();
          });
          _scheduleReconnect();
        },
        onError: (err) {
          debugPrint('[Mitemasuka] WebSocket Stream Error: $err');
          for (final t in _remoteTypingTimers.values) {
            t.cancel();
          }
          _remoteTypingTimers.clear();
          if (!mounted) return;
          setState(() {
            _isConnected = false;
            _typingUsers.clear();
          });
          _scheduleReconnect();
        },
      );

      _joinRoomIfReady();

      _pingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
        if (_isConnected && _baseLat != null && _baseLng != null) {
          _joinRoomIfReady();
        }
      });
    } catch (e) {
      debugPrint('[Mitemasuka] WebSocket Connect Failed: $e');
      _isConnecting = false;
      if (mounted) {
        setState(() {
          _isConnected = false;
        });
        _scheduleReconnect();
      }
    }
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) _connectWebSocket();
    });
  }

  void _emit(String event, [dynamic data]) {
    if (_ws == null || _ws!.readyState != WebSocket.open) return;
    try {
      _ws!.add(jsonEncode({'event': event, 'data': data ?? {}}));
    } catch (e) {
      debugPrint('[Mitemasuka] Emit Error ($event): $e');
    }
  }

  void _joinRoomIfReady() {
    if (!_isConnected || _baseLat == null || _baseLng == null) return;
    final effectiveLat = _baseLat! + (_simOffsetMeters / 111320.0);
    debugPrint('[Mitemasuka] Emitting update_location: lat=$effectiveLat, lng=$_baseLng, radius=$_selectedRadius');
    _emit('update_location', {
      'lat': effectiveLat,
      'lng': _baseLng!,
      'radius': _selectedRadius,
    });
  }

  void _handleWsMessage(String raw) {
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final event = decoded['event']?.toString() ?? '';
      final data = decoded['data'];
      debugPrint('[Mitemasuka] WS Event <- $event');

      if (event == 'identity' && data is Map<String, dynamic>) {
        setState(() {
          _myId = (data['id'] ?? '').toString();
          _myUsername = (data['username'] ?? 'User').toString();
          _isPlus = data['isPlus'] == true;
          _ghostMode = data['ghostMode'] == true;
          _isBanned = data['isBanned'] == true;
          if (data['dailyLimit'] is num) {
            _dailyLimit = (data['dailyLimit'] as num).toInt();
          }
          if (data['remainingQuota'] is num) {
            _remainingQuota = (data['remainingQuota'] as num).toInt();
          }
        });
        _joinRoomIfReady();
      } else if (event == 'joined_room' && data is Map<String, dynamic>) {
        final history = (data['history'] is List) ? data['history'] as List : [];
        for (final t in _remoteTypingTimers.values) {
          t.cancel();
        }
        _remoteTypingTimers.clear();
        setState(() {
          _typingUsers.clear();
          if (data['radius'] is num) {
            _selectedRadius = (data['radius'] as num).toInt();
          }
          _messages = history
              .whereType<Map<String, dynamic>>()
              .map((m) => ChatMessage.fromJson(m))
              .toList();
          if (data['dmSession'] is Map<String, dynamic>) {
            _dmSession = data['dmSession'] as Map<String, dynamic>;
            final dmMsgs = (_dmSession!['messages'] is List)
                ? _dmSession!['messages'] as List
                : [];
            _whispers = dmMsgs
                .whereType<Map<String, dynamic>>()
                .map((m) => ChatMessage.fromJson(m))
                .toList();
          }
        });
        if (_autoTranslate) {
          for (final m in _messages) {
            if (m.kind == 'chat' &&
                m.senderClientId != _myClientId &&
                RegExp(r'\p{L}', unicode: true).hasMatch(m.text)) {
              _translateMessage(m, forceManual: false);
            }
          }
        }
        _scrollToBottom();
      } else if (event == 'room_users' && data is Map<String, dynamic>) {
        final list = (data['users'] is List) ? data['users'] as List : [];
        final users = list
            .whereType<Map<String, dynamic>>()
            .map((u) => RoomUser.fromJson(u))
            .toList();
        final installed = (data['nearbyInstalledCount'] is num)
            ? (data['nearbyInstalledCount'] as num).toInt()
            : users.length;
        final activeIds = users
            .where((u) => u.clientId != _myClientId && u.id != _myId)
            .map((u) => u.id)
            .toSet();
        setState(() {
          _roomUsers = users;
          _nearbyInstalledCount = math.max(users.length, installed);
          final staleIds =
              _typingUsers.keys.where((uid) => !activeIds.contains(uid)).toList();
          for (final uid in staleIds) {
            _typingUsers.remove(uid);
            _remoteTypingTimers.remove(uid)?.cancel();
          }
        });
      } else if (event == 'system_message' && data is Map<String, dynamic>) {
        setState(() {
          _messages.add(ChatMessage.fromJson(data, kind: 'system'));
        });
        _scrollToBottom();
      } else if (event == 'chat_message' && data is Map<String, dynamic>) {
        final msg = ChatMessage.fromJson(data);
        final isDm = msg.whisperToClientId != null && msg.whisperToClientId!.isNotEmpty;
        setState(() {
          if (msg.senderId != null) {
            _typingUsers.remove(msg.senderId);
            _remoteTypingTimers.remove(msg.senderId)?.cancel();
          }
          if (isDm) {
            if (!_whispers.any((m) => m.id == msg.id)) {
              _whispers.add(msg);
              if (msg.senderClientId != _myClientId && _activeView != 'dm') {
                _unreadDmCount++;
              }
            }
          } else {
            if (!_messages.any((m) => m.id == msg.id)) {
              _messages.add(msg);
            }
          }
        });
        if (_autoTranslate &&
            msg.senderClientId != _myClientId &&
            RegExp(r'\p{L}', unicode: true).hasMatch(msg.text)) {
          _translateMessage(msg, forceManual: false);
        }
        _scrollToBottom();
      } else if (event == 'message_reaction' && data is Map<String, dynamic>) {
        final msgId = (data['messageId'] ?? '').toString();
        final emoji = (data['emoji'] ?? '').toString();
        final uname = (data['username'] ?? '').toString();
        if (msgId.isNotEmpty && emoji.isNotEmpty && uname.isNotEmpty) {
          void toggleInList(List<ChatMessage> list) {
            for (final m in list) {
              if (m.id == msgId) {
                final users = List<String>.from(m.reactions[emoji] ?? []);
                if (users.contains(uname)) {
                  users.remove(uname);
                } else {
                  users.add(uname);
                }
                if (users.isEmpty) {
                  m.reactions.remove(emoji);
                } else {
                  m.reactions[emoji] = users;
                }
              }
            }
          }
          setState(() {
            toggleInList(_messages);
            toggleInList(_whispers);
          });
        }
      } else if (event == 'user_typing' && data is Map<String, dynamic>) {
        final uid = (data['userId'] ?? '').toString();
        final cid = (data['clientId'] ?? '').toString();
        if (uid.isEmpty || uid == _myId || (cid.isNotEmpty && cid == _myClientId)) {
          return;
        }
        final isTyping = data['isTyping'] == true;
        final uname = (data['username'] ?? 'User').toString();
        _remoteTypingTimers.remove(uid)?.cancel();
        if (isTyping) {
          setState(() {
            _typingUsers[uid] = uname;
          });
          _remoteTypingTimers[uid] = Timer(const Duration(seconds: 3), () {
            _remoteTypingTimers.remove(uid);
            if (mounted && _typingUsers.containsKey(uid)) {
              setState(() {
                _typingUsers.remove(uid);
              });
            }
          });
        } else if (_typingUsers.containsKey(uid)) {
          setState(() {
            _typingUsers.remove(uid);
          });
        }
      } else if (event == 'dm_state' && data is Map<String, dynamic>) {
        setState(() {
          _dmSession = data['session'] is Map<String, dynamic>
              ? data['session'] as Map<String, dynamic>
              : null;
          if (_dmSession != null) {
            _dmDraftPeer = null;
            final dmMsgs = (_dmSession!['messages'] is List)
                ? _dmSession!['messages'] as List
                : [];
            _whispers = dmMsgs
                .whereType<Map<String, dynamic>>()
                .map((m) => ChatMessage.fromJson(m))
                .toList();
          } else {
            _whispers = [];
            _unreadDmCount = 0;
          }
        });
      }
    } catch (_) {}
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<Map<String, String>?> _fetchGtxDirect(
    String clean,
    String tl, {
    String sl = 'auto',
  }) async {
    try {
      final cUri = Uri.parse(
        'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${Uri.encodeComponent(sl)}&tl=${Uri.encodeComponent(tl)}&q=${Uri.encodeComponent(clean)}',
      );
      final cResp = await http
          .get(cUri)
          .timeout(const Duration(milliseconds: 2200));
      if (cResp.statusCode == 200) {
        final cDecoded = jsonDecode(cResp.body);
        if (cDecoded is List && cDecoded.isNotEmpty) {
          if (cDecoded[0] is List && (cDecoded[0] as List).isNotEmpty) {
            final tr = ((cDecoded[0] as List)[0] ?? '').toString().trim();
            final det = (cDecoded[0] as List).length > 1
                ? ((cDecoded[0] as List)[1] ?? '').toString().toLowerCase()
                : '';
            if (tr.isNotEmpty) {
              return {'translated': tr, 'detectedLang': det};
            }
          } else if (cDecoded[0] is String) {
            final tr = (cDecoded[0] as String).trim();
            if (tr.isNotEmpty) {
              return {
                'translated': tr,
                'detectedLang': sl == 'auto' ? '' : sl,
              };
            }
          }
        }
      }
    } catch (_) {}

    final gtxUri = Uri.parse(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=${Uri.encodeComponent(sl)}&tl=${Uri.encodeComponent(tl)}&dt=t&q=${Uri.encodeComponent(clean)}',
    );
    final gtxResp = await http
        .get(gtxUri)
        .timeout(const Duration(milliseconds: 2800));
    if (gtxResp.statusCode != 200) return null;
    final decoded = jsonDecode(gtxResp.body);
    if (decoded is! List || decoded.isEmpty || decoded[0] is! List) return null;
    final sb = StringBuffer();
    for (final part in decoded[0] as List) {
      if (part is List && part.isNotEmpty && part[0] != null) {
        sb.write(part[0].toString());
      }
    }
    final tr = sb.toString().trim();
    final detected =
        (decoded.length > 2 && decoded[2] is String)
            ? (decoded[2] as String).toLowerCase()
            : '';
    return {'translated': tr, 'detectedLang': detected};
  }

  Future<void> _translateMessage(
    ChatMessage msg, {
    bool forceManual = true,
  }) async {
    final key = '${msg.id}_$_uiLang';
    if (forceManual && _translations.containsKey(key)) {
      setState(() {
        _translations.remove(key);
      });
      return;
    }
    if (_translations.containsKey(key) || _translatingIds.contains(key)) return;
    final clean = msg.text.trim();
    if (clean.length < 2) return;
    setState(() {
      _translatingIds.add(key);
    });
    try {
      // 1. Önce her zaman kullanıcının arayüz diline (örn: TR) çevir (hello -> Merhaba)
      final first = await _fetchGtxDirect(clean, _uiLang, sl: 'auto');
      if (first != null) {
        final tr = first['translated'] ?? '';
        final det = first['detectedLang'] ?? '';
        if (tr.isNotEmpty &&
            tr.toLowerCase() != clean.toLowerCase() &&
            !(!forceManual && det.isNotEmpty && det.startsWith(_uiLang))) {
          if (mounted) {
            setState(() {
              _translations[key] = tr;
            });
          }
          return;
        }
      }

      // 2. Manuel "Çevir"e basıldıysa ve mesaj zaten Türkçe ise İngilizceye çevir (Deneme -> Trial)
      if (forceManual) {
        final fallbackLang = _uiLang == 'tr' ? 'en' : 'tr';
        final second = await _fetchGtxDirect(clean, fallbackLang, sl: 'auto');
        if (second != null) {
          final tr2 = second['translated'] ?? '';
          if (tr2.isNotEmpty && tr2.toLowerCase() != clean.toLowerCase()) {
            if (mounted) {
              setState(() {
                _translations[key] = tr2;
              });
            }
            return;
          }
        }
        final third = await _fetchGtxDirect(
          clean,
          _uiLang,
          sl: _uiLang == 'tr' ? 'en' : 'tr',
        );
        if (third != null) {
          final tr3 = third['translated'] ?? '';
          if (tr3.isNotEmpty && tr3.toLowerCase() != clean.toLowerCase() && mounted) {
            setState(() {
              _translations[key] = tr3;
            });
          }
        }
      }
    } catch (_) {
    } finally {
      if (mounted) {
        setState(() {
          _translatingIds.remove(key);
        });
      }
    }
  }

  int? _distanceFromMe(double? lat, double? lng) {
    if (lat == null || lng == null || _baseLat == null || _baseLng == null) {
      return null;
    }
    const R = 6371e3;
    final p1 = _baseLat! * math.pi / 180;
    final p2 = lat * math.pi / 180;
    final dp = (lat - _baseLat!) * math.pi / 180;
    final dl = (lng - _baseLng!) * math.pi / 180;
    final a = math.sin(dp / 2) * math.sin(dp / 2) +
        math.cos(p1) * math.cos(p2) * math.sin(dl / 2) * math.sin(dl / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return (R * c).round();
  }

  void _handleInputChanged(String val) {
    if (!_isConnected || _isBanned) return;
    _emit('typing', true);
    _myTypingDebounce?.cancel();
    _myTypingDebounce = Timer(const Duration(milliseconds: 1500), () {
      _emit('typing', false);
    });
  }

  List<String> get _activeTypingNames {
    final activeMap = <String, RoomUser>{};
    for (final u in _roomUsers) {
      if (u.id != _myId &&
          u.clientId != _myClientId &&
          !_blockedClientIds.contains(u.clientId)) {
        activeMap[u.id] = u;
      }
    }
    return _typingUsers.entries
        .where((e) => activeMap.containsKey(e.key))
        .map((e) => activeMap[e.key]?.username ?? e.value)
        .toList();
  }

  void _handleSendMessage() {
    final text = _inputController.text.trim();
    if (text.isEmpty || !_isConnected || _isBanned) return;

    _myTypingDebounce?.cancel();
    _emit('typing', false);

    if (_activeView == 'dm') {
      final peerClientId = _dmPeerClientId;
      if (peerClientId == null) return;
      _emit('send_message', {
        'text': text,
        'whisperToClientId': peerClientId,
      });
    } else {
      _emit('send_message', {
        'text': text,
        'replyTo': _replyingTo != null
            ? {
                'id': _replyingTo!.id,
                'senderName': _replyingTo!.senderName ?? '',
                'text': _replyingTo!.text,
              }
            : null,
      });
    }

    setState(() {
      _inputController.clear();
      _replyingTo = null;
    });
  }

  String? get _dmPeerClientId {
    if (_dmSession != null) {
      final a = (_dmSession!['initiatorClientId'] ?? _dmSession!['aClientId'])?.toString();
      final b = (_dmSession!['recipientClientId'] ?? _dmSession!['bClientId'])?.toString();
      return a == _myClientId ? b : a;
    }
    return _dmDraftPeer?.clientId;
  }

  String? get _dmPeerName {
    if (_dmSession != null) {
      final a = (_dmSession!['initiatorClientId'] ?? _dmSession!['aClientId'])?.toString();
      return a == _myClientId
          ? (_dmSession!['recipientName'] ?? _dmSession!['bName'])?.toString()
          : (_dmSession!['initiatorName'] ?? _dmSession!['aName'])?.toString();
    }
    return _dmDraftPeer?.username;
  }

  Color _parseHexColor(String? hex) {
    if (hex == null || hex.isEmpty) return kBrandBlue;
    final clean = hex.replaceAll('#', '');
    if (clean.length == 6) {
      return Color(int.parse('FF$clean', radix: 16));
    }
    return kBrandBlue;
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  void _showEulaModal() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Mitemasuka Topluluk Kuralları',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Mitemasuka, 100 metre çevrenizdeki gerçek kişilerle anlık iletişim kurmanızı sağlar.\n\n'
                '• Taciz, küfür, nefret söylemi ve spam kesinlikle yasaktır.\n'
                '• Rahatsız edici kullanıcıları mesaj üzerindeki kalkan ikonuyla bildirebilir veya engelleyebilirsiniz.\n'
                '• 3 farklı kişi tarafından bildirilen kullanıcılar o gün boyunca otomatik olarak susturulur.',
                style: TextStyle(fontSize: 14, height: 1.45),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  GestureDetector(
                    onTap: () => _showLegalDialog('privacy'),
                    child: const Text(
                      'Gizlilik Politikası',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: kBrandBlue,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => _showLegalDialog('terms'),
                    child: const Text(
                      'Kullanım Şartları (EULA)',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: kBrandBlue,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kBrandBlue),
            onPressed: () async {
              final nav = Navigator.of(ctx);
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool('mitemasuka_eula_v1', true);
              nav.pop();
            },
            child: const Text('Kabul Ediyorum ve Başla'),
          ),
        ],
      ),
    );
  }

  void _showLegalDialog(String initialTab) {
    String activeTab = initialTab;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final isTr = _uiLang == 'tr';
          final privacyTitle = isTr ? 'Gizlilik Politikası' : 'Privacy Policy';
          final termsTitle = isTr ? 'Kullanım Şartları (EULA)' : 'Terms of Use (EULA)';
          final webUrl = 'https://mitemasuka.com/legal/$activeTab/$_uiLang/';

          final bodyText = activeTab == 'privacy'
              ? (isTr
                  ? 'Yürürlük Tarihi: 24 Ekim 2026 · Sürüm: v1.0\n\n'
                    '1. Genel Bakış\n'
                    'Mitemasuka, yakın çevrenizdeki insanlarla aynı menzil odasında gerçek zamanlı ve geçici (ephemeral) olarak iletişim kurmanızı sağlayan konum tabanlı bir sosyal iletişim platformudur. Uygulamayı kullanmak için telefon numarası, e-posta adresi, ad-soyad veya şifre ile hesap oluşturmanız gerekmez.\n\n'
                    '2. İşlenen Veriler ve Kullanım Amaçları\n'
                    '• Anlık Konum Bilgisi (GPS): Yalnızca açık izninizle cihazınızın anlık koordinatları alınır ve seçtiğiniz menzildeki (100m, 500m, 1 km, 5 km) aktif odaya bağlanmanız için kullanılır. Geçmiş konum hareketleriniz kayıt altına alınmaz.\n'
                    '• Rastgele Cihaz Kimliği ve Rumuz: Cihazınızda yerel ve rastgele bir oturum kimliği (clientId) ile geçici bir rumuz oluşturulur.\n'
                    '• Geçici Mesajlar ve 1-e-1 Özel Fısıltılar: Oda mesajları ve 1-e-1 özel sohbetler kalıcı olarak arşivlenmez; odadan ayrıldığınızda veya oturum kapandığında silinir.\n'
                    '• Mikrofon ve Kamera: Mikrofon yalnızca sesli dikte/canlı altyazı için anlık kullanılır; ses kaydı sunucuya yüklenmez. Kamera yalnızca oda QR kodu okutmak için kullanılır.\n\n'
                    '3. Veri Paylaşımı ve Üçüncü Taraf Hizmetler\n'
                    'Kullanıcı verileri reklam ağlarına satılmaz. Gerçek zamanlı şifreli iletişim için Cloudflare Edge altyapısı kullanılır.\n\n'
                    '4. Veri Silme / Sıfırlama Hakkı\n'
                    'Uygulama verilerini temizleyerek yerel verilerinizi anında sıfırlayabilir veya info@mitemasuka.com adresine yazarak geçici oturum kayıtlarının silinmesini talep edebilirsiniz (48 saat içinde sonuçlandırılır).\n\n'
                    '5. Yaş Sınırı ve İletişim\n'
                    'Mitemasuka 13 yaş ve üzeri kullanıcılar içindir.\n'
                    'İletişim: info@mitemasuka.com'
                  : 'Effective Date: October 24, 2026 · Version: v1.0\n\n'
                    '1. Overview\n'
                    'Mitemasuka is a location-based proximity communication platform for real-time, ephemeral conversations nearby. No account registration with phone number, email, full name, or password is required.\n\n'
                    '2. Data Processed\n'
                    '• Real-Time Location (GPS): Used solely with your permission to connect you to the active proximity room (100m, 500m, 1 km, 5 km). No location history is stored.\n'
                    '• Random Device ID & Nickname: Generated locally on your device.\n'
                    '• Ephemeral Messages & 1-on-1 Whispers: Delivered in real time and never permanently archived.\n'
                    '• Microphone & Camera: Microphone is used only on-device for voice dictation (no audio stored). Camera is used only for QR code scanning.\n\n'
                    '3. Data Deletion & Contact\n'
                    'We do not sell user data. You can reset local data anytime or email info@mitemasuka.com for session data deletion (completed within 48 hours). Intended for users aged 13+.')
              : (isTr
                  ? 'Yürürlük Tarihi: 24 Ekim 2026 · Sürüm: v1.0\n\n'
                    '1. Şartların Kabulü\n'
                    'Mitemasuka uygulamasını kullanarak işbu Kullanım Şartlarını ve Topluluk Kurallarını kabul etmiş sayılırsınız.\n\n'
                    '2. Kullanıcı İçeriği (UGC) ve Sıfır Tolerans Politikası\n'
                    'Aşağıdaki davranışlara karşı Sıfır Tolerans Politikası uygulanır:\n'
                    '• Küfür, hakaret, nefret söylemi veya ayrımcılık,\n'
                    '• Taciz, tehdit, ısrarlı takip veya zorbalık,\n'
                    '• Müstehcen, şiddet içerikli veya yasa dışı paylaşımlar,\n'
                    '• Spam, dolandırıcılık veya başkalarının kişisel bilgilerini ifşa etmek.\n\n'
                    '3. Otomatik Filtreleme, Bildirme, Engelleme ve Karantina\n'
                    'Apple App Store Guideline 1.2 standartları gereği:\n'
                    '• Otomatik Küfür Filtresi uygunsuz kelimeleri anında maskeler.\n'
                    '• Her mesajın yanındaki menüden kullanıcıyı tek dokunuşla Engelleyebilir (Block) veya Bildirebilirsiniz (Report).\n'
                    '• Odada 3 farklı kullanıcı tarafından bildirilen hesaplar sistem tarafından 24 saat boyunca otomatik olarak susturulur (Auto-Mute).\n'
                    '• Tüm bildirimler en geç 24 saat içinde incelenir ve ihlal yapan cihaz kimlikleri kalıcı olarak uzaklaştırılır.\n\n'
                    '4. Sorumluluk Sınırı ve İletişim\n'
                    'Hizmet "olduğu gibi" sunulmaktadır. Destek ve şikâyet: info@mitemasuka.com'
                  : 'Effective Date: October 24, 2026 · Version: v1.0\n\n'
                    '1. Acceptance of Terms\n'
                    'By using Mitemasuka, you agree to these Terms of Use and Community Guidelines.\n\n'
                    '2. User-Generated Content (UGC) & Zero-Tolerance Policy\n'
                    'We enforce a strict Zero-Tolerance Policy against:\n'
                    '• Profanity, hate speech, harassment, threats, or bullying,\n'
                    '• Obscene, violent, or illegal content,\n'
                    '• Spam, scams, or sharing private data without consent.\n\n'
                    '3. Filtering, Reporting, Blocking & Auto-Mute (Guideline 1.2)\n'
                    '• Real-time automated profanity filter.\n'
                    '• Instant 1-tap User Blocking and Content Reporting on every message.\n'
                    '• Any user reported by 3 distinct participants in a room is automatically muted for 24 hours, and all reports are reviewed within 24 hours.\n\n'
                    '4. Contact\n'
                    'Support & abuse reports: info@mitemasuka.com');

          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            titlePadding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
            contentPadding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setModalState(() => activeTab = 'privacy'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: activeTab == 'privacy'
                                ? kBrandBlue
                                : Colors.grey.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            isTr ? 'Gizlilik' : 'Privacy',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: activeTab == 'privacy' ? Colors.white : null,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setModalState(() => activeTab = 'terms'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: activeTab == 'terms'
                                ? kBrandBlue
                                : Colors.grey.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            isTr ? 'Kullanım Şartları' : 'Terms (EULA)',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: activeTab == 'terms' ? Colors.white : null,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  activeTab == 'privacy' ? privacyTitle : termsTitle,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              height: 340,
              child: SingleChildScrollView(
                child: Text(
                  bodyText,
                  style: const TextStyle(fontSize: 13, height: 1.5),
                ),
              ),
            ),
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actions: [
              TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(webUrl)),
                icon: const Icon(CupertinoIcons.arrow_up_right_square, size: 15),
                label: Text(
                  isTr ? 'Web\'de Aç' : 'Open Web',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: kBrandBlue),
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(isTr ? 'Kapat' : 'Close'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showMessageActionModal(ChatMessage item, bool isMine, bool hasLetters) {
    FocusScope.of(context).unfocus();
    setState(() {
      _activeActionMessage = item;
      _showHamburgerMenu = false;
      _showRadiusMenu = false;
      _showMembersDrawer = false;
    });
  }

  Widget _buildActionOverlayCard(ChatMessage item) {
    final isMine = item.senderClientId == _myClientId || item.senderId == _myId;
    final hasLetters = RegExp(r'\p{L}', unicode: true).hasMatch(item.text);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment:
          isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        // Üst: WhatsApp iOS Tarzı Yarı Şeffaf Buzlu Cam (Frosted Glass) Emoji Tepki Barı
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFF1C1C1E).withValues(alpha: 0.74),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.14),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.32),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: ['❤️', '👍', '🔥', '😂', '😮', '👏'].map((emo) {
                  final myReact =
                      (item.reactions[emo] ?? []).contains(_myUsername);
                  return GestureDetector(
                    onTap: () {
                      _emit('react_message', {
                        'messageId': item.id,
                        'emoji': emo,
                      });
                      setState(() => _activeActionMessage = null);
                    },
                    child: Container(
                      width: 42,
                      height: 42,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: myReact
                            ? Colors.white.withValues(alpha: 0.20)
                            : Colors.transparent,
                      ),
                      child: Text(
                        emo,
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        // Alt: WhatsApp iOS & Corsecure Stili Yarı Şeffaf Buzlu Cam + İnce Çizgisel Vektör İkonlu İşlem Menüsü
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Material(
              color: const Color(0xFF1C1C1E).withValues(alpha: 0.74),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: BorderSide(
                  color: Colors.white.withValues(alpha: 0.14),
                ),
              ),
              child: SizedBox(
                width: 236,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildActionMenuItem(
                        icon: CupertinoIcons.arrowshape_turn_up_left,
                        label: 'Cevapla',
                        onTap: () {
                          setState(() {
                            _activeActionMessage = null;
                            _replyingTo = item;
                          });
                          _inputFocusNode.requestFocus();
                        },
                      ),
                      if (!isMine && item.senderClientId != null)
                        _buildActionMenuItem(
                          icon: CupertinoIcons.person_crop_circle_badge_plus,
                          label: 'Özel olarak cevapla',
                          onTap: () {
                            setState(() {
                              _activeActionMessage = null;
                              _dmDraftPeer = RoomUser(
                                id: item.senderId ?? '',
                                clientId: item.senderClientId!,
                                username: item.senderName ?? 'User',
                                color: item.senderColor ?? '#1A81E5',
                              );
                              _activeView = 'dm';
                            });
                          },
                        ),
                      if (hasLetters)
                        _buildActionMenuItem(
                          icon: CupertinoIcons.globe,
                          label: _translations.containsKey('${item.id}_$_uiLang')
                              ? 'Orijinali göster'
                              : 'Çevir',
                          onTap: () {
                            setState(() => _activeActionMessage = null);
                            _translateMessage(item);
                          },
                        ),
                      _buildActionMenuItem(
                        icon: CupertinoIcons.doc_on_doc,
                        label: 'Kopyala',
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: item.text));
                          setState(() => _activeActionMessage = null);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Mesaj panoya kopyalandı.'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                      ),
                      if (!isMine && item.senderClientId != null) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3),
                          child: Divider(
                            height: 1,
                            color: Colors.white.withValues(alpha: 0.12),
                          ),
                        ),
                        _buildActionMenuItem(
                          icon: CupertinoIcons.shield,
                          label: 'Bildir / Engelle',
                          isDanger: true,
                          onTap: () {
                            setState(() => _activeActionMessage = null);
                            _showReportConfirmModal(
                              item.senderClientId!,
                              item.senderName ?? 'Kullanıcı',
                            );
                          },
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionMenuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isDanger = false,
  }) {
    final itemColor =
        isDanger ? const Color(0xFFFF6B6B) : Colors.white.withValues(alpha: 0.96);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        child: Row(
          children: [
            Icon(icon, size: 19, color: itemColor),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w400,
                  letterSpacing: -0.2,
                  color: itemColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showReportConfirmModal(String targetClientId, String targetName) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Row(
          children: [
            const Icon(Icons.shield_outlined, color: kCrimsonRed),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '$targetName — Kullanıcıyı Bildir',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const Text(
          'Bu kişiyi topluluk kurallarını ihlal ettiği için bildiriyorsunuz. Odada 3 farklı kişi bildirirse kullanıcı o gün boyunca otomatik olarak susturulur.',
          style: TextStyle(fontSize: 13.5, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('İptal'),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: kCrimsonRed,
              side: const BorderSide(color: kCrimsonRed),
            ),
            onPressed: () {
              _emit('report_user', {'targetClientId': targetClientId});
              Navigator.of(ctx).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$targetName bildirildi.')),
              );
            },
            child: const Text('Bildir'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kCrimsonRed),
            onPressed: () async {
              final nav = Navigator.of(ctx);
              _emit('report_user', {'targetClientId': targetClientId});
              setState(() {
                _blockedClientIds.add(targetClientId);
              });
              final prefs = await SharedPreferences.getInstance();
              await prefs.setStringList(
                'mitemasuka_blocked',
                _blockedClientIds.toList(),
              );
              nav.pop();
            },
            child: const Text('Bildir ve Engelle'),
          ),
        ],
      ),
    );
  }

  void _showQrDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Yakınındakini Ekle (QR Kod)',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
              ),
              child: QrImageView(
                data: 'https://mitemasuka.com',
                size: 200,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Çevrendeki kişiler kamerasıyla okutup indirmeden anında aynı 100m odasına katılabilir.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Kapat'),
          ),
        ],
      ),
    );
  }

  void _showStoryDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          '見てますか? • Mitemasuka Nedir?',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: const SingleChildScrollView(
          child: Text(
            'Aynı Mekandayız, Ama Birbirimizi Görüyor Muyuz?\n\n'
            'Japoncada "Mitemasu ka?" (見てますか?), "Beni görüyor musun? / Etrafına bakıyor musun?" anlamına gelir.\n\n'
            '• 100 Metre Gerçeklik Çemberi: Sadece fiziksel olarak seninle aynı 100 metrede bulunan kişileri tek bir canlı sohbet odasında buluşturur.\n'
            '• Web ve Mobil Aynı Odada: Uygulamadan veya mitemasuka.com üzerinden giren herkes aynı odada anında yazışır.',
            style: TextStyle(fontSize: 13.5, height: 1.45),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Tamam'),
          ),
        ],
      ),
    );
  }

  void _showPlusDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Mitemasuka Plus (Şimdilik Ücretsiz)',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: const Text(
          'Lansman döneminde tüm Plus özellikleri ücretsizdir:\n\n'
          '• 500 m ve 1 km geniş menzil seçimi\n'
          '• Sınırsız günlük mesaj hakkı\n'
          '• Özel takma ad (Nickname) belirleme\n'
          '• Hayalet Modu (Sessiz giriş/çıkış)',
          style: TextStyle(fontSize: 13.5, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Kapat'),
          ),
          if (!_isPlus)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kBrandBlue),
              onPressed: () {
                _emit('activate_plus');
                Navigator.of(ctx).pop();
              },
              child: const Text('Ücretsiz Plus Aktif Et'),
            ),
        ],
      ),
    );
  }

  void _showNicknameDialog() {
    final ctrl = TextEditingController(text: _myUsername);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Takma Adımı Değiştir',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: TextField(
          controller: ctrl,
          maxLength: 20,
          decoration: const InputDecoration(
            hintText: 'Yeni takma adınız...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('İptal'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kBrandBlue),
            onPressed: () {
              final next = ctrl.text.trim();
              if (next.isNotEmpty) {
                _emit('set_nickname', {'nickname': next});
              }
              Navigator.of(ctx).pop();
            },
            child: const Text('Kaydet'),
          ),
        ],
      ),
    );
  }

  Color _resolveChatBgColor(bool isDark) {
    if (isDark) {
      switch (_chatBg) {
        case 'mist':
          return const Color(0xFF181818);
        case 'slate':
          return const Color(0xFF121212);
        case 'sand':
          return const Color(0xFF1C1B1A);
        case 'mint':
          return const Color(0xFF171A18);
        case 'dots':
        case 'ice':
        default:
          return const Color(0xFF161616);
      }
    }
    switch (_chatBg) {
      case 'mist':
        return const Color(0xFFDBEAFE);
      case 'slate':
        return const Color(0xFFD4DDE8);
      case 'dots':
        return const Color(0xFFDEE6F0);
      case 'sand':
        return const Color(0xFFE7E2D8);
      case 'mint':
        return const Color(0xFFDCEBE4);
      case 'ice':
      default:
        return const Color(0xFFE3EAF2);
    }
  }

  void _showRulesAndBlockedDialog() {
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final blockedList = _blockedClientIds.toList();
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            title: const Row(
              children: [
                Icon(CupertinoIcons.shield, color: kCrimsonRed, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Kurallar & Engellenenler',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16.5),
                  ),
                ),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      '• Küfür, hakaret, taciz, nefret söylemi ve spam kesinlikle yasaktır.\n'
                      '• Her mesajın yanındaki menüden kullanıcıyı bildirebilir veya engelleyebilirsiniz.\n'
                      '• Odada 3 farklı kişi tarafından bildirilen kullanıcı o gün boyunca otomatik olarak susturulur.',
                      style: TextStyle(fontSize: 13, height: 1.45),
                    ),
                    const SizedBox(height: 14),
                    const Divider(),
                    const SizedBox(height: 6),
                    Text(
                      'Engellenen Kullanıcılar (${blockedList.length})',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                    ),
                    const SizedBox(height: 8),
                    if (blockedList.isEmpty)
                      const Text(
                        'Henüz engellediğiniz bir kullanıcı bulunmuyor.',
                        style: TextStyle(fontSize: 12.5, color: Colors.grey),
                      )
                    else
                      ...blockedList.map((cid) {
                        final matchedUser = _roomUsers
                            .where((u) => u.clientId == cid)
                            .toList();
                        final displayName = matchedUser.isNotEmpty
                            ? matchedUser.first.username
                            : cid;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  displayName,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: () async {
                                  setState(() {
                                    _blockedClientIds.remove(cid);
                                  });
                                  setModalState(() {});
                                  final prefs =
                                      await SharedPreferences.getInstance();
                                  await prefs.setStringList(
                                    'mitemasuka_blocked',
                                    _blockedClientIds.toList(),
                                  );
                                },
                                child: const Text(
                                  'Engeli Kaldır',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: kCrimsonRed,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _showLegalDialog('privacy');
                },
                child: const Text('Gizlilik & Şartlar', style: TextStyle(fontSize: 12.5)),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: kBrandBlue),
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Kapat'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showCreateChannelDialog() {
    final titleCtrl = TextEditingController();
    String selectedPlanId = 'class_100m';
    int selectedPlanRadius = 100;
    final plans = [
      {'id': 'class_100m', 'radius': 100, 'range': '100 m Çap', 'title': 'Sınıf / Tur Rehberi', 'price': '99 ₺'},
      {'id': 'guide_500m', 'radius': 500, 'range': '500 m Çap', 'title': 'Seminer / Kampüs', 'price': '199 ₺'},
      {'id': 'concert_1km', 'radius': 1000, 'range': '1 km Çap', 'title': 'Konser / Konferans', 'price': '499 ₺'},
      {'id': 'rally_5km', 'radius': 5000, 'range': '5 km Çap', 'title': 'Miting / Festival', 'price': '1.499 ₺'},
    ];

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          title: const Row(
            children: [
              Icon(CupertinoIcons.speaker_2, color: kCrimsonRed, size: 20),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Canlı Anons Kanalı Kur',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16.5),
                ),
              ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Konser, konferans, derslik veya tur gezisinde çevrenizdeki herkese tek yönlü canlı duyuru gönderin.',
                    style: TextStyle(fontSize: 12.5, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: titleCtrl,
                    maxLength: 50,
                    decoration: const InputDecoration(
                      labelText: 'Kanal Başlığı',
                      hintText: 'Örn: Ana Sahne Canlı Altyazı...',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: plans.map((p) {
                      final active = selectedPlanId == p['id'];
                      return GestureDetector(
                        onTap: () => setModalState(() {
                          selectedPlanId = p['id'] as String;
                          selectedPlanRadius = p['radius'] as int;
                        }),
                        child: Container(
                          width: 122,
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: active
                                ? kCrimsonRed.withValues(alpha: 0.12)
                                : Colors.grey.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: active ? kCrimsonRed : Colors.grey.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Column(
                            children: [
                              Text(
                                p['range'] as String,
                                style: const TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.bold,
                                  color: kCrimsonRed,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                p['title'] as String,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Ücretsiz',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF10B981),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('İptal'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kCrimsonRed),
              onPressed: () {
                final title = titleCtrl.text.trim();
                if (title.isEmpty || _baseLat == null || _baseLng == null) return;
                _emit('create_channel', {
                  'title': title,
                  'lat': _baseLat,
                  'lng': _baseLng,
                  'radius': selectedPlanRadius,
                  'plan': selectedPlanId,
                });
                Navigator.of(ctx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('"$title" canlı kanalı başlatıldı.')),
                );
              },
              child: const Text('Ücretsiz Yayını Başlat'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDarkMode;
    final headerBg = isDark ? const Color(0xFF171717) : Colors.white;
    final borderColor = isDark ? const Color(0xFF262626) : const Color(0xFFE2E8F0);
    final pillBg = isDark ? const Color(0xFF262626) : const Color(0xFFF1F5F9);
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F172A);
    final textSecondary = isDark ? const Color(0xFFA3A3A3) : const Color(0xFF64748B);

    final visibleMessages = (_activeView == 'dm' ? _whispers : _messages)
        .where((m) =>
            m.senderClientId == null ||
            m.senderClientId == _myClientId ||
            !_blockedClientIds.contains(m.senderClientId))
        .toList();

    // Ardışık join/leave sistem mesajlarını web'deki gibi tek bir satırda grupla
    final List<dynamic> displayItems = [];
    int i = 0;
    while (i < visibleMessages.length) {
      final cur = visibleMessages[i];
      if (cur.kind == 'system' &&
          (cur.systemType == 'join' || cur.systemType == 'leave')) {
        final List<ChatMessage> group = [cur];
        int j = i + 1;
        while (j < visibleMessages.length &&
            visibleMessages[j].kind == 'system' &&
            (visibleMessages[j].systemType == 'join' ||
                visibleMessages[j].systemType == 'leave')) {
          group.add(visibleMessages[j]);
          j++;
        }
        if (group.length >= 2) {
          displayItems.add(group);
        } else {
          displayItems.add(cur);
        }
        i = j;
      } else {
        displayItems.add(cur);
        i++;
      }
    }

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                // 1. ÜST BAR (HEADER)
                Container(
                  padding: const EdgeInsets.only(left: 4, right: 8, top: 6, bottom: 6),
                  decoration: BoxDecoration(
                    color: headerBg,
                    border: Border(bottom: BorderSide(color: borderColor)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Sol: Karga Logo (Yuvarlak beyaz zeminli) + MİTEMASUKA Başlık
                      Flexible(
                        child: GestureDetector(
                          onTap: () {
                            setState(() {
                              _activeView = 'room';
                              _showHamburgerMenu = false;
                              _showRadiusMenu = false;
                              _showMembersDrawer = false;
                            });
                          },
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: borderColor),
                                    ),
                                    padding: const EdgeInsets.all(3),
                                    child: ClipOval(
                                      child: Image.asset(
                                        'assets/icon-512.png',
                                        fit: BoxFit.contain,
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    bottom: 1,
                                    right: 1,
                                    child: Container(
                                      width: 10,
                                      height: 10,
                                      decoration: BoxDecoration(
                                        color: _isConnected
                                            ? const Color(0xFF10B981)
                                            : const Color(0xFFF59E0B),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: headerBg, width: 2),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: RichText(
                                  overflow: TextOverflow.ellipsis,
                                  text: TextSpan(
                                    style: const TextStyle(
                                      fontSize: 16.5,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: -0.3,
                                    ),
                                    children: [
                                      TextSpan(
                                        text: 'mitema',
                                        style: TextStyle(
                                          color: isDark
                                              ? const Color(0xFFCBD5E1)
                                              : const Color(0xFF64748B),
                                        ),
                                      ),
                                      const TextSpan(
                                        text: 'suka',
                                        style: TextStyle(color: kBrandBlue),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),

                      // Sağ Kontrol Butonları: Aktif/Yüklü, Menzil, Gece Modu, Menü
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () {
                              setState(() {
                                _showMembersDrawer = !_showMembersDrawer;
                                _showHamburgerMenu = false;
                                _showRadiusMenu = false;
                              });
                            },
                            child: Container(
                              height: 34,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    CupertinoIcons.person_2,
                                    size: 15,
                                    color: Color(0xFF10B981),
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${_roomUsers.length}',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.bold,
                                      color: textPrimary,
                                    ),
                                  ),
                                  Text(
                                    '/$_nearbyInstalledCount',
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      color: textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),

                          InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () {
                              setState(() {
                                _showRadiusMenu = !_showRadiusMenu;
                                _showHamburgerMenu = false;
                                _showMembersDrawer = false;
                              });
                            },
                            child: Container(
                              height: 34,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Row(
                                children: [
                                  Text(
                                    _selectedRadius >= 1000
                                        ? '${_selectedRadius ~/ 1000} km'
                                        : '$_selectedRadius m',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: textPrimary,
                                    ),
                                  ),
                                  const SizedBox(width: 1),
                                  Icon(
                                    CupertinoIcons.chevron_down,
                                    size: 12,
                                    color: textSecondary,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),

                          InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: widget.onToggleTheme,
                            child: Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Icon(
                                isDark ? CupertinoIcons.sun_max : CupertinoIcons.moon,
                                size: 16,
                                color: isDark ? Colors.amber : textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),

                          InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () {
                              setState(() {
                                _showHamburgerMenu = !_showHamburgerMenu;
                                _showRadiusMenu = false;
                                _showMembersDrawer = false;
                              });
                            },
                            child: Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Icon(
                                _showHamburgerMenu ? CupertinoIcons.xmark : CupertinoIcons.line_horizontal_3,
                                size: 17,
                                color: textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // 2. SABİT ÜST KULAKÇIK SATIRI: Sol (100m · aktif · çevrede) & Sağ (Özel)
                Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: GestureDetector(
                          onTap: () => setState(() => _activeView = 'room'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: _activeView == 'room'
                                  ? (isDark ? const Color(0xFF262626) : Colors.white)
                                  : (isDark ? const Color(0xFF1F1F1F) : const Color(0xFFF8FAFC)),
                              borderRadius: const BorderRadius.only(
                                topRight: Radius.circular(999),
                                bottomRight: Radius.circular(999),
                              ),
                              border: Border.all(color: borderColor),
                            ),
                            child: Text(
                              '${_selectedRadius >= 1000 ? '${_selectedRadius ~/ 1000}km' : '${_selectedRadius}m'} · ${_roomUsers.length} aktif · Çevrede $_nearbyInstalledCount kişide yüklü',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                                color: textSecondary,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _activeView = _activeView == 'dm' ? 'room' : 'dm';
                            if (_activeView == 'dm') _unreadDmCount = 0;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: _activeView == 'dm'
                                ? kBrandBlue
                                : (isDark ? const Color(0xFF262626) : Colors.white),
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(999),
                              bottomLeft: Radius.circular(999),
                            ),
                            border: Border.all(
                              color: _activeView == 'dm' ? kBrandBlue : borderColor,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                CupertinoIcons.lock_shield,
                                size: 13,
                                color: _activeView == 'dm' ? Colors.white : textPrimary,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Özel',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.bold,
                                  color: _activeView == 'dm' ? Colors.white : textPrimary,
                                ),
                              ),
                              if (_unreadDmCount > 0) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: kCrimsonRed,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    '$_unreadDmCount',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                if (_showSimBar)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.14),
                      border: Border(bottom: BorderSide(color: borderColor)),
                    ),
                    child: Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(CupertinoIcons.lab_flask, size: 14, color: Color(0xFFD97706)),
                            const SizedBox(width: 4),
                            Text(
                              'Mesafe Simülatörü:',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: textPrimary,
                              ),
                            ),
                          ],
                        ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [0, 45, 150, 600].map((off) {
                            final active = _simOffsetMeters == off;
                            return Padding(
                              padding: const EdgeInsets.only(left: 4),
                              child: GestureDetector(
                                onTap: () {
                                  setState(() => _simOffsetMeters = off);
                                  _joinRoomIfReady();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: active ? const Color(0xFFD97706) : pillBg,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    off == 0 ? '0m' : '+${off}m',
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.bold,
                                      color: active ? Colors.white : textPrimary,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),

                // 3. ANA SOHBET AKIŞI
                Expanded(
                  child: Container(
                    color: _resolveChatBgColor(isDark),
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onTap: () => FocusScope.of(context).unfocus(),
                    child: _baseLat == null || _baseLng == null
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const CircularProgressIndicator(color: kBrandBlue),
                                  const SizedBox(height: 14),
                                  Text(
                                    '100m çevrenizdeki odaya bağlanmak için GPS konumu alınıyor...',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: textSecondary, fontSize: 13.5),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : _activeView == 'dm' && _dmPeerClientId == null
                            ? Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Text(
                                    'Özel mesajlaşmak için odadaki bir kullanıcının ismine dokunun.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: textSecondary, fontSize: 14),
                                  ),
                                ),
                              )
                            : ListView.builder(
                                controller: _scrollController,
                                keyboardDismissBehavior:
                                    ScrollViewKeyboardDismissBehavior.onDrag,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                itemCount: displayItems.length,
                                itemBuilder: (ctx, idx) {
                                final entry = displayItems[idx];

                                // Gruplanmış ardışık giriş/çıkış sistem mesajları
                                if (entry is List<ChatMessage>) {
                                  final groupKey = entry.first.id;
                                  final isExpanded = _expandedSystemGroups.contains(groupKey);
                                  final joins = entry.where((m) => m.systemType == 'join').length;
                                  final leaves = entry.where((m) => m.systemType == 'leave').length;
                                  final parts = <String>[];
                                  if (joins > 0) parts.add('$joins kişi katıldı');
                                  if (leaves > 0) parts.add('$leaves kişi ayrıldı');
                                  final summary =
                                      '${parts.join(' · ')} ${isExpanded ? '▴' : '▾'}';

                                  return Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 4),
                                    child: Column(
                                      children: [
                                        GestureDetector(
                                          onTap: () {
                                            setState(() {
                                              if (isExpanded) {
                                                _expandedSystemGroups.remove(groupKey);
                                              } else {
                                                _expandedSystemGroups.add(groupKey);
                                              }
                                            });
                                          },
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 12,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: isDark
                                                  ? const Color(0xFF262626)
                                                  : Colors.white,
                                              borderRadius: BorderRadius.circular(999),
                                              border: Border.all(color: borderColor),
                                            ),
                                            child: Text(
                                              summary,
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: textSecondary,
                                              ),
                                            ),
                                          ),
                                        ),
                                        if (isExpanded)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4),
                                            child: Column(
                                              children: entry.map((sub) {
                                                final subLeave = sub.systemType == 'leave';
                                                return Padding(
                                                  padding: const EdgeInsets.symmetric(vertical: 2),
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(
                                                      horizontal: 10,
                                                      vertical: 3,
                                                    ),
                                                    decoration: BoxDecoration(
                                                      color: subLeave
                                                          ? kCrimsonRed.withValues(alpha: 0.10)
                                                          : const Color(0xFF10B981)
                                                              .withValues(alpha: 0.10),
                                                      borderRadius: BorderRadius.circular(999),
                                                    ),
                                                    child: Text(
                                                      sub.text,
                                                      style: TextStyle(
                                                        fontSize: 10.5,
                                                        fontWeight: FontWeight.w500,
                                                        color: subLeave
                                                            ? kCrimsonRed
                                                            : const Color(0xFF10B981),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              }).toList(),
                                            ),
                                          ),
                                      ],
                                    ),
                                  );
                                }

                                final item = entry as ChatMessage;
                                if (item.kind == 'system') {
                                  final isLeave = item.systemType == 'leave';
                                  final isJoin = item.systemType == 'join';
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 4),
                                    child: Center(
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 12,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: isLeave
                                              ? kCrimsonRed.withValues(alpha: 0.12)
                                              : isJoin
                                                  ? const Color(0xFF10B981)
                                                      .withValues(alpha: 0.12)
                                                  : (isDark
                                                      ? const Color(0xFF262626)
                                                      : Colors.white),
                                          borderRadius: BorderRadius.circular(999),
                                          border: (!isLeave && !isJoin)
                                              ? Border.all(color: borderColor)
                                              : null,
                                        ),
                                        child: Text(
                                          item.text,
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w500,
                                            color: isLeave
                                                ? kCrimsonRed
                                                : isJoin
                                                    ? const Color(0xFF10B981)
                                                    : textSecondary,
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                }

                                final isMine = item.senderId == _myId ||
                                    (item.senderClientId != null &&
                                        item.senderClientId == _myClientId);
                                final dist = !isMine
                                    ? _distanceFromMe(item.senderLat, item.senderLng)
                                    : null;
                                final hasLetters =
                                    RegExp(r'\p{L}', unicode: true).hasMatch(item.text);
                                final trKey = '${item.id}_$_uiLang';
                                final translated = _translations[trKey];
                                final activeReactions = item.reactions.entries
                                    .where((e) => e.value.isNotEmpty)
                                    .toList();

                                final sideDotBtn = GestureDetector(
                                  onTap: () => _showMessageActionModal(
                                    item,
                                    isMine,
                                    hasLetters,
                                  ),
                                  child: Container(
                                    width: 28,
                                    height: 28,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isDark
                                          ? const Color(0xFF262626)
                                          : const Color(0xFFE2E8F0),
                                      border: Border.all(color: borderColor),
                                    ),
                                    child: Container(
                                      width: 7,
                                      height: 7,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: textSecondary,
                                      ),
                                    ),
                                  ),
                                );

                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 5),
                                  child: Column(
                                    crossAxisAlignment: isMine
                                        ? CrossAxisAlignment.end
                                        : CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          if (isMine) ...[
                                            sideDotBtn,
                                            const SizedBox(width: 8),
                                          ],
                                          ConstrainedBox(
                                            constraints: BoxConstraints(
                                              maxWidth: MediaQuery.of(context).size.width * 0.76,
                                            ),
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(
                                                horizontal: 14,
                                                vertical: 10,
                                              ),
                                              decoration: BoxDecoration(
                                                color: isMine
                                                    ? kBrandBlue
                                                    : (isDark
                                                        ? const Color(0xFF262626)
                                                        : Colors.white),
                                                borderRadius: BorderRadius.only(
                                                  topLeft: Radius.circular(isMine ? 18 : 4),
                                                  topRight: Radius.circular(isMine ? 4 : 18),
                                                  bottomLeft: const Radius.circular(18),
                                                  bottomRight: const Radius.circular(18),
                                                ),
                                                border: isMine
                                                    ? null
                                                    : Border.all(color: borderColor),
                                              ),
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  if (!isMine)
                                                    Padding(
                                                      padding: const EdgeInsets.only(bottom: 4),
                                                      child: Row(
                                                        mainAxisSize: MainAxisSize.min,
                                                        children: [
                                                          GestureDetector(
                                                            onTap: () {
                                                              if (item.senderClientId != null) {
                                                                setState(() {
                                                                  _dmDraftPeer = RoomUser(
                                                                    id: item.senderId ?? '',
                                                                    clientId: item.senderClientId!,
                                                                    username: item.senderName ?? 'User',
                                                                    color: item.senderColor ?? '#1A81E5',
                                                                  );
                                                                  _activeView = 'dm';
                                                                });
                                                              }
                                                            },
                                                            child: Text(
                                                              item.senderName ?? 'Kullanıcı',
                                                              style: TextStyle(
                                                                fontWeight: FontWeight.bold,
                                                                fontSize: 13.5,
                                                                color: _parseHexColor(item.senderColor),
                                                              ),
                                                            ),
                                                          ),
                                                          const SizedBox(width: 8),
                                                          if (dist != null)
                                                            Container(
                                                              padding: const EdgeInsets.symmetric(
                                                                horizontal: 6,
                                                                vertical: 1.5,
                                                              ),
                                                              decoration: BoxDecoration(
                                                                color: pillBg,
                                                                borderRadius: BorderRadius.circular(6),
                                                              ),
                                                              child: Text(
                                                                '${dist}m',
                                                                style: TextStyle(
                                                                  fontSize: 10.5,
                                                                  color: textSecondary,
                                                                ),
                                                              ),
                                                            ),
                                                          if (item.senderClientId != null) ...[
                                                            const SizedBox(width: 6),
                                                            GestureDetector(
                                                              onTap: () => _showReportConfirmModal(
                                                                item.senderClientId!,
                                                                item.senderName ?? 'Kullanıcı',
                                                              ),
                                                              child: const Icon(
                                                                Icons.shield_outlined,
                                                                size: 14,
                                                                color: kCrimsonRed,
                                                              ),
                                                            ),
                                                          ],
                                                        ],
                                                      ),
                                                    ),
                                                  if (item.replyTo != null)
                                                    Container(
                                                      margin: const EdgeInsets.only(bottom: 6),
                                                      padding: const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 4,
                                                      ),
                                                      decoration: BoxDecoration(
                                                        color: isMine
                                                            ? Colors.black.withValues(alpha: 0.15)
                                                            : pillBg,
                                                        borderRadius: BorderRadius.circular(8),
                                                      ),
                                                      child: Text(
                                                        '${item.replyTo!['senderName'] ?? ''}: ${item.replyTo!['text'] ?? ''}',
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: TextStyle(
                                                          fontSize: 11.5,
                                                          color: isMine ? Colors.white : textSecondary,
                                                        ),
                                                      ),
                                                    ),
                                                  Row(
                                                    mainAxisSize: MainAxisSize.min,
                                                    crossAxisAlignment: CrossAxisAlignment.end,
                                                    children: [
                                                      Flexible(
                                                        child: Text(
                                                          item.text,
                                                          style: TextStyle(
                                                            fontSize: 18,
                                                            fontWeight: FontWeight.w500,
                                                            color: isMine ? Colors.white : textPrimary,
                                                            height: 1.32,
                                                          ),
                                                        ),
                                                      ),
                                                      const SizedBox(width: 10),
                                                      Text(
                                                        _formatTime(item.timestamp),
                                                        style: TextStyle(
                                                          fontSize: 10,
                                                          color: isMine
                                                              ? Colors.white.withValues(alpha: 0.75)
                                                              : textSecondary,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                  if (translated != null)
                                                    Padding(
                                                      padding: const EdgeInsets.only(top: 6),
                                                      child: Text(
                                                        translated,
                                                        style: TextStyle(
                                                          fontSize: 15,
                                                          fontStyle: FontStyle.italic,
                                                          color: isMine
                                                              ? Colors.white.withValues(alpha: 0.9)
                                                              : kBrandBlue,
                                                        ),
                                                      ),
                                                    ),
                                                ],
                                              ),
                                            ),
                                          ),
                                          if (!isMine) ...[
                                            const SizedBox(width: 8),
                                            sideDotBtn,
                                          ],
                                        ],
                                      ),
                                      if (activeReactions.isNotEmpty)
                                        Padding(
                                          padding: EdgeInsets.only(
                                            top: 4,
                                            left: isMine ? 0 : 4,
                                            right: isMine ? 36 : 0,
                                          ),
                                          child: Wrap(
                                            spacing: 4,
                                            runSpacing: 4,
                                            children: activeReactions.map((entry) {
                                              final emo = entry.key;
                                              final users = entry.value;
                                              final iReacted = users.contains(_myUsername);
                                              return GestureDetector(
                                                onTap: () {
                                                  _emit('react_message', {
                                                    'messageId': item.id,
                                                    'emoji': emo,
                                                  });
                                                },
                                                child: Container(
                                                  padding: const EdgeInsets.symmetric(
                                                    horizontal: 8,
                                                    vertical: 2.5,
                                                  ),
                                                  decoration: BoxDecoration(
                                                    color: iReacted
                                                        ? kBrandBlue.withValues(alpha: 0.14)
                                                        : (isDark
                                                            ? const Color(0xFF262626)
                                                            : Colors.white),
                                                    borderRadius: BorderRadius.circular(999),
                                                    border: Border.all(
                                                      color: iReacted
                                                          ? kBrandBlue
                                                          : borderColor,
                                                    ),
                                                  ),
                                                  child: Row(
                                                    mainAxisSize: MainAxisSize.min,
                                                    children: [
                                                      Text(
                                                        emo,
                                                        style: const TextStyle(fontSize: 12),
                                                      ),
                                                      const SizedBox(width: 4),
                                                      Text(
                                                        '${users.length}',
                                                        style: TextStyle(
                                                          fontSize: 11,
                                                          fontWeight: FontWeight.w600,
                                                          color: iReacted
                                                              ? kBrandBlue
                                                              : textPrimary,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                              );
                                            }).toList(),
                                          ),
                                        ),
                                      if (!isMine && _activeView == 'room')
                                        Padding(
                                          padding: const EdgeInsets.only(top: 4, left: 6),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              GestureDetector(
                                                onTap: () {
                                                  setState(() => _replyingTo = item);
                                                  _inputFocusNode.requestFocus();
                                                },
                                                child: Row(
                                                  mainAxisSize: MainAxisSize.min,
                                                  children: [
                                                    Icon(
                                                      CupertinoIcons.arrowshape_turn_up_left,
                                                      size: 11.5,
                                                      color: textSecondary,
                                                    ),
                                                    const SizedBox(width: 4),
                                                    Text(
                                                      'Yanıtla',
                                                      style: TextStyle(
                                                        fontSize: 11,
                                                        fontWeight: FontWeight.w500,
                                                        color: textSecondary,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              if (hasLetters) ...[
                                                const SizedBox(width: 12),
                                                GestureDetector(
                                                  onTap: () => _translateMessage(item),
                                                  child: Row(
                                                    mainAxisSize: MainAxisSize.min,
                                                    children: [
                                                      Icon(
                                                        CupertinoIcons.globe,
                                                        size: 11.5,
                                                        color: textSecondary,
                                                      ),
                                                      const SizedBox(width: 4),
                                                      Text(
                                                        translated != null ? 'Orijinal' : 'Çevir',
                                                        style: TextStyle(
                                                          fontSize: 11,
                                                          fontWeight: FontWeight.w500,
                                                          color: textSecondary,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                              ],
                                            ],
                                          ),
                                        ),
                                    ],
                                  ),
                                );
                              },
                            ),
                    ),
                  ),
                ),

                if (_activeView == 'room' && _activeTypingNames.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 2, 18, 6),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: kBrandBlue,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              '${_activeTypingNames.join(', ')} yazıyor...',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                fontStyle: FontStyle.italic,
                                fontWeight: FontWeight.w500,
                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                // Yanıtlama önizleme çubuğu
                if (_replyingTo != null && _activeView == 'room')
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    color: pillBg,
                    child: Row(
                      children: [
                        const Icon(Icons.reply, size: 16, color: kBrandBlue),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '${_replyingTo!.senderName}: ${_replyingTo!.text}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                        GestureDetector(
                          onTap: () => setState(() => _replyingTo = null),
                          child: const Icon(Icons.close, size: 16),
                        ),
                      ],
                    ),
                  ),

                // 4. ALT MESAJ YAZMA ALANI (FOOTER)
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  decoration: BoxDecoration(
                    color: headerBg,
                    border: Border(top: BorderSide(color: borderColor)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _inputController,
                              focusNode: _inputFocusNode,
                              textInputAction: TextInputAction.send,
                              onChanged: _handleInputChanged,
                              onSubmitted: (_) => _handleSendMessage(),
                              decoration: InputDecoration(
                                hintText: _isBanned
                                    ? 'Bugün susturuldunuz'
                                    : _activeView == 'dm'
                                        ? '${_dmPeerName ?? 'Özel'} — fısıltı yazın...'
                                        : '${_selectedRadius}m — odasına mesaj yazın...',
                                filled: true,
                                fillColor: pillBg,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: borderColor),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: borderColor),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 42,
                            height: 42,
                            child: FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: kBrandBlue,
                                padding: EdgeInsets.zero,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                              onPressed: _handleSendMessage,
                              child: const Icon(Icons.send_rounded, size: 19, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          GestureDetector(
                            onTap: _showPlusDialog,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: kBrandBlue.withValues(alpha: isDark ? 0.15 : 0.10),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: kBrandBlue.withValues(alpha: 0.35),
                                ),
                              ),
                              child: Text(
                                _isPlus
                                    ? 'Plus • Sınırsız'
                                    : '$_remainingQuota/$_dailyLimit mesaj • Plus',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? kBrandBlueDarkText : kBrandBlue,
                                ),
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: _showStoryDialog,
                            child: Text(
                              'Beni Görüyor Musun?',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // MENZİL SEÇİCİ AÇILIR MENÜSÜ
            if (_showRadiusMenu)
              Positioned(
                top: 58,
                right: 56,
                child: Material(
                  elevation: 8,
                  borderRadius: BorderRadius.circular(16),
                  color: isDark ? const Color(0xFF262626) : Colors.white,
                  child: Container(
                    width: 170,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [100, 500, 1000, 5000].map((r) {
                        final locked = r > 100 && !_isPlus;
                        return ListTile(
                          dense: true,
                          title: Text(
                            r >= 1000 ? '${r ~/ 1000} km Menzil' : '$r m Menzil',
                            style: TextStyle(
                              fontWeight: _selectedRadius == r
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                              color: _selectedRadius == r ? kBrandBlue : textPrimary,
                            ),
                          ),
                          trailing: locked
                              ? const Text(
                                  'PLUS',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: kBrandBlue,
                                  ),
                                )
                              : (_selectedRadius == r
                                  ? const Icon(Icons.check, size: 16, color: kBrandBlue)
                                  : null),
                          onTap: () {
                            setState(() => _showRadiusMenu = false);
                            if (locked) {
                              _showPlusDialog();
                              return;
                            }
                            setState(() => _selectedRadius = r);
                            _joinRoomIfReady();
                          },
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ),

            // ODADAKİ KİŞİLER ÇEKMECESİ
            if (_showMembersDrawer)
              Positioned(
                top: 58,
                right: 12,
                child: Material(
                  elevation: 10,
                  borderRadius: BorderRadius.circular(18),
                  color: isDark ? const Color(0xFF262626) : Colors.white,
                  child: Container(
                    width: 260,
                    constraints: const BoxConstraints(maxHeight: 340),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Odadaki Kişiler (${_roomUsers.length})',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        const Divider(),
                        Flexible(
                          child: ListView.builder(
                            shrinkWrap: true,
                            itemCount: _roomUsers.length,
                            itemBuilder: (ctx, i) {
                              final u = _roomUsers[i];
                              final isMe = u.clientId == _myClientId;
                              final d = _distanceFromMe(u.lat, u.lng);
                              return ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  isMe ? '${u.username} (Sen)' : u.username,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: _parseHexColor(u.color),
                                  ),
                                ),
                                subtitle: d != null ? Text('${d}m uzakta') : null,
                                trailing: isMe
                                    ? null
                                    : TextButton(
                                        onPressed: () {
                                          setState(() {
                                            _showMembersDrawer = false;
                                            _dmDraftPeer = u;
                                            _activeView = 'dm';
                                          });
                                        },
                                        child: const Text('Özel Yaz'),
                                      ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // HAMBURGER MENÜ (#1A81E5 Mesaj Mavisi & #DC143C Crimson Red)
            if (_showHamburgerMenu)
              Positioned(
                top: 58,
                right: 12,
                child: Material(
                  elevation: 16,
                  borderRadius: BorderRadius.circular(20),
                  color: isDark ? const Color(0xFF262626) : Colors.white,
                  child: Container(
                    width: 294,
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.of(context).size.height * 0.78,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderColor),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // 1. PLUS & KANAL KUR KUTULARI
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              child: Column(
                                children: [
                                  InkWell(
                                    borderRadius: BorderRadius.circular(14),
                                    onTap: () {
                                      setState(() => _showHamburgerMenu = false);
                                      _showPlusDialog();
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: kBrandBlue.withValues(alpha: isDark ? 0.15 : 0.10),
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: kBrandBlue.withValues(alpha: isDark ? 0.40 : 0.30),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Row(
                                            children: [
                                              Icon(
                                                CupertinoIcons.sparkles,
                                                size: 17,
                                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                                              ),
                                              const SizedBox(width: 8),
                                              Text(
                                                _isPlus ? 'Mitemasuka Plus Aktif' : "Mitemasuka Plus'a Geç",
                                                style: TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 13,
                                                  color: isDark ? kBrandBlueDarkText : kBrandBlue,
                                                ),
                                              ),
                                            ],
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 2,
                                            ),
                                            decoration: BoxDecoration(
                                              color: kBrandBlue,
                                              borderRadius: BorderRadius.circular(999),
                                            ),
                                            child: Text(
                                              _isPlus ? 'VIP' : 'PLUS',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 10.5,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),

                                  InkWell(
                                    borderRadius: BorderRadius.circular(14),
                                    onTap: () {
                                      setState(() => _showHamburgerMenu = false);
                                      _showCreateChannelDialog();
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: kCrimsonRed.withValues(alpha: isDark ? 0.15 : 0.10),
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: kCrimsonRed.withValues(alpha: isDark ? 0.40 : 0.30),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(
                                            child: Row(
                                              children: [
                                                Icon(
                                                  CupertinoIcons.speaker_2,
                                                  size: 17,
                                                  color: isDark ? kCrimsonRedDarkText : kCrimsonRed,
                                                ),
                                                const SizedBox(width: 8),
                                                Expanded(
                                                  child: Text(
                                                    'Kanal Kur (Tek Yönlü Seslen)',
                                                    style: TextStyle(
                                                      fontWeight: FontWeight.w600,
                                                      fontSize: 12.5,
                                                      color: isDark
                                                          ? kCrimsonRedDarkText
                                                          : kCrimsonRed,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Column(
                                            crossAxisAlignment: CrossAxisAlignment.end,
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.symmetric(
                                                  horizontal: 8,
                                                  vertical: 2,
                                                ),
                                                decoration: BoxDecoration(
                                                  color: kCrimsonRed,
                                                  borderRadius: BorderRadius.circular(999),
                                                ),
                                                child: const Text(
                                                  'PRO',
                                                  style: TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                'Şimdilik Ücretsiz',
                                                style: TextStyle(
                                                  fontSize: 9.5,
                                                  fontWeight: FontWeight.w600,
                                                  color: isDark
                                                      ? const Color(0xFF9BB5A6)
                                                      : const Color(0xFF6B8577),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Divider(height: 16),

                            // 2. DİL SEÇİCİ (8 DİL GRID - WEB İLE BİREBİR)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          Icon(
                                            CupertinoIcons.globe,
                                            size: 16,
                                            color: isDark ? kBrandBlueDarkText : kBrandBlue,
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            'Dil / Language',
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w600,
                                              color: textPrimary,
                                            ),
                                          ),
                                        ],
                                      ),
                                      Text(
                                        _uiLang.toUpperCase(),
                                        style: TextStyle(
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.bold,
                                          color: textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  GridView.count(
                                    crossAxisCount: 4,
                                    shrinkWrap: true,
                                    physics: const NeverScrollableScrollPhysics(),
                                    mainAxisSpacing: 6,
                                    crossAxisSpacing: 6,
                                    childAspectRatio: 2.1,
                                    children: [
                                      for (final langItem in const [
                                        {'code': 'tr', 'flag': '🇹🇷', 'label': 'TR'},
                                        {'code': 'en', 'flag': '🇬🇧', 'label': 'EN'},
                                        {'code': 'ja', 'flag': '🇯🇵', 'label': 'JA'},
                                        {'code': 'de', 'flag': '🇩🇪', 'label': 'DE'},
                                        {'code': 'es', 'flag': '🇪🇸', 'label': 'ES'},
                                        {'code': 'fr', 'flag': '🇫🇷', 'label': 'FR'},
                                        {'code': 'ru', 'flag': '🇷🇺', 'label': 'RU'},
                                        {'code': 'ar', 'flag': '🇸🇦', 'label': 'AR'},
                                      ])
                                        InkWell(
                                          borderRadius: BorderRadius.circular(8),
                                          onTap: () async {
                                            final code = langItem['code']!;
                                            setState(() {
                                              _uiLang = code;
                                              _translations.clear();
                                            });
                                            final prefs = await SharedPreferences.getInstance();
                                            await prefs.setString('mitemasuka_lang', code);
                                          },
                                          child: Container(
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              color: _uiLang == langItem['code']
                                                  ? kBrandBlue
                                                  : (isDark
                                                        ? const Color(0xFF333333)
                                                        : const Color(0xFFF5F5F4)),
                                              borderRadius: BorderRadius.circular(8),
                                              border: Border.all(
                                                color: _uiLang == langItem['code']
                                                    ? kBrandBlue
                                                    : borderColor,
                                              ),
                                            ),
                                            child: Row(
                                              mainAxisAlignment: MainAxisAlignment.center,
                                              children: [
                                                Text(
                                                  langItem['flag']!,
                                                  style: const TextStyle(fontSize: 12),
                                                ),
                                                const SizedBox(width: 4),
                                                Text(
                                                  langItem['label']!,
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w700,
                                                    color: _uiLang == langItem['code']
                                                        ? Colors.white
                                                        : textPrimary,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 4),

                            // 3. OTOMATİK ÇEVİRİ
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: const Icon(
                                CupertinoIcons.globe,
                                size: 18,
                                color: Color(0xFF6E9482),
                              ),
                              title: const Text(
                                'Otomatik Çeviri (Ücretsiz)',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _autoTranslate
                                      ? const Color(0xFF6E9482).withValues(alpha: 0.16)
                                      : (isDark ? const Color(0xFF333333) : const Color(0xFFF0EFEA)),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _autoTranslate ? 'Açık' : 'Kapalı',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _autoTranslate ? const Color(0xFF6E9482) : textSecondary,
                                  ),
                                ),
                              ),
                              onTap: () => setState(() => _autoTranslate = !_autoTranslate),
                            ),
                            const Divider(height: 12),

                            // 4. MİTEMASUKA NEDİR? (Alt açıklamalı)
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -1),
                              leading: Icon(
                                CupertinoIcons.info_circle,
                                size: 18,
                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                              ),
                              title: const Text(
                                'Mitemasuka Nedir?',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                              subtitle: Text(
                                '"Beni görüyor musun?" hikayesi ve tanıtım',
                                style: TextStyle(fontSize: 10.5, color: textSecondary),
                              ),
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                _showStoryDialog();
                              },
                            ),

                            // 5. YAKININDAKİNİ EKLE (QR KOD) (Alt açıklamalı)
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -1),
                              leading: const Icon(
                                CupertinoIcons.qrcode,
                                size: 18,
                                color: Color(0xFF6E9482),
                              ),
                              title: const Text(
                                'Yakınındakini Ekle (QR Kod)',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                              subtitle: Text(
                                'Çevrendeki kişiler okutup odaya katılsın',
                                style: TextStyle(fontSize: 10.5, color: textSecondary),
                              ),
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                _showQrDialog();
                              },
                            ),
                            const Divider(height: 12),

                            // 6. TAKMA ADIMI DEĞİŞTİR (Kilit ikonlu)
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                CupertinoIcons.pencil,
                                size: 18,
                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                              ),
                              title: const Text(
                                'Takma Adımı Değiştir',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: !_isPlus
                                  ? Icon(CupertinoIcons.lock, size: 14, color: textSecondary)
                                  : null,
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                if (!_isPlus) {
                                  _showPlusDialog();
                                  return;
                                }
                                _showNicknameDialog();
                              },
                            ),

                            // 7. HAYALET MODU (Kilit ikonlu / Açık-Kapalı)
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: const Icon(
                                CupertinoIcons.eye_slash,
                                size: 18,
                                color: Color(0xFF8C7DA8),
                              ),
                              title: const Text(
                                'Hayalet Modu (Sessiz Giriş)',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: !_isPlus
                                  ? Icon(CupertinoIcons.lock, size: 14, color: textSecondary)
                                  : Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: _ghostMode
                                            ? const Color(0xFF8C7DA8).withValues(alpha: 0.18)
                                            : (isDark
                                                  ? const Color(0xFF333333)
                                                  : const Color(0xFFF0EFEA)),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text(
                                        _ghostMode ? 'Açık' : 'Kapalı',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _ghostMode
                                              ? const Color(0xFF8C7DA8)
                                              : textSecondary,
                                        ),
                                      ),
                                    ),
                              onTap: () {
                                if (!_isPlus) {
                                  setState(() => _showHamburgerMenu = false);
                                  _showPlusDialog();
                                  return;
                                }
                                _emit('set_ghost_mode', {'enabled': !_ghostMode});
                              },
                            ),
                            const Divider(height: 12),

                            // 8. BİLDİRİM AYARLARI (ODA / ÖZEL / GİRİŞ-ÇIKIŞ)
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                _roomNotifEnabled ? CupertinoIcons.bell : CupertinoIcons.bell_slash,
                                size: 18,
                                color: _roomNotifEnabled ? const Color(0xFF6E9482) : textSecondary,
                              ),
                              title: const Text(
                                'Oda Mesaj Bildirimi',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _roomNotifEnabled
                                      ? const Color(0xFF6E9482).withValues(alpha: 0.16)
                                      : (isDark ? const Color(0xFF333333) : const Color(0xFFF0EFEA)),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _roomNotifEnabled ? 'Açık' : 'Kapalı',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _roomNotifEnabled
                                        ? const Color(0xFF6E9482)
                                        : textSecondary,
                                  ),
                                ),
                              ),
                              onTap: () async {
                                setState(() => _roomNotifEnabled = !_roomNotifEnabled);
                                final prefs = await SharedPreferences.getInstance();
                                await prefs.setBool('mitemasuka_notif_room', _roomNotifEnabled);
                              },
                            ),
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                _whisperNotifEnabled
                                    ? CupertinoIcons.bell
                                    : CupertinoIcons.bell_slash,
                                size: 18,
                                color: _whisperNotifEnabled
                                    ? (isDark ? kBrandBlueDarkText : kBrandBlue)
                                    : textSecondary,
                              ),
                              title: const Text(
                                'Özel Fısıltı Bildirimi',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _whisperNotifEnabled
                                      ? kBrandBlue.withValues(alpha: 0.16)
                                      : (isDark ? const Color(0xFF333333) : const Color(0xFFF0EFEA)),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _whisperNotifEnabled ? 'Açık' : 'Kapalı',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _whisperNotifEnabled
                                        ? (isDark ? kBrandBlueDarkText : kBrandBlue)
                                        : textSecondary,
                                  ),
                                ),
                              ),
                              onTap: () async {
                                setState(() => _whisperNotifEnabled = !_whisperNotifEnabled);
                                final prefs = await SharedPreferences.getInstance();
                                await prefs.setBool(
                                  'mitemasuka_notif_whisper',
                                  _whisperNotifEnabled,
                                );
                              },
                            ),
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                _presenceNotifEnabled
                                    ? CupertinoIcons.bell
                                    : CupertinoIcons.bell_slash,
                                size: 18,
                                color: _presenceNotifEnabled
                                    ? const Color(0xFFC29B61)
                                    : textSecondary,
                              ),
                              title: const Text(
                                'Giriş / Çıkış Uyarısı',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _presenceNotifEnabled
                                      ? const Color(0xFFC29B61).withValues(alpha: 0.16)
                                      : (isDark ? const Color(0xFF333333) : const Color(0xFFF0EFEA)),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _presenceNotifEnabled ? 'Açık' : 'Kapalı',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _presenceNotifEnabled
                                        ? const Color(0xFFC29B61)
                                        : textSecondary,
                                  ),
                                ),
                              ),
                              onTap: () async {
                                setState(() => _presenceNotifEnabled = !_presenceNotifEnabled);
                                final prefs = await SharedPreferences.getInstance();
                                await prefs.setBool(
                                  'mitemasuka_notif_presence',
                                  _presenceNotifEnabled,
                                );
                              },
                            ),
                            const Divider(height: 12),

                            // 9. KURALLAR & ENGELLENENLER + YASAL BAĞLANTILAR
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: const Icon(
                                CupertinoIcons.shield,
                                size: 18,
                                color: Color(0xFFC29B61),
                              ),
                              title: const Text(
                                'Kurallar & Engellenenler',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: _blockedClientIds.isNotEmpty
                                  ? Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 7,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: kCrimsonRed.withValues(alpha: 0.16),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text(
                                        '${_blockedClientIds.length}',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: isDark ? kCrimsonRedDarkText : kCrimsonRed,
                                        ),
                                      ),
                                    )
                                  : null,
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                _showRulesAndBlockedDialog();
                              },
                            ),
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                CupertinoIcons.lock_shield,
                                size: 18,
                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                              ),
                              title: Text(
                                _uiLang == 'tr' ? 'Gizlilik Politikası' : 'Privacy Policy',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                _showLegalDialog('privacy');
                              },
                            ),
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: Icon(
                                CupertinoIcons.doc_text,
                                size: 18,
                                color: isDark ? kBrandBlueDarkText : kBrandBlue,
                              ),
                              title: Text(
                                _uiLang == 'tr' ? 'Kullanım Şartları' : 'Terms of Use',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              onTap: () {
                                setState(() => _showHamburgerMenu = false);
                                _showLegalDialog('terms');
                              },
                            ),
                            const Divider(height: 12),

                            // 10. SOHBET ZEMİNİ (6 RENK SEÇİCİ - WEB İLE BİREBİR)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'SOHBET ZEMİNİ',
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.6,
                                      color: textSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  GridView.count(
                                    crossAxisCount: 3,
                                    shrinkWrap: true,
                                    physics: const NeverScrollableScrollPhysics(),
                                    mainAxisSpacing: 6,
                                    crossAxisSpacing: 6,
                                    childAspectRatio: 2.2,
                                    children: [
                                      for (final bgOpt in const [
                                        {'id': 'ice', 'label': 'Buz Mavisi', 'dot': 0xFFEAF0F6},
                                        {'id': 'mist', 'label': 'Mavi Degrade', 'dot': 0xFFDCE7F3},
                                        {'id': 'slate', 'label': 'Koyu Gümüş', 'dot': 0xFFE2E6EC},
                                        {'id': 'dots', 'label': 'Radar Noktalı', 'dot': 0xFFE8EEF5},
                                        {'id': 'sand', 'label': 'Sıcak Kum', 'dot': 0xFFF3EFE6},
                                        {'id': 'mint', 'label': 'Adaçayı', 'dot': 0xFFE6EFEA},
                                      ])
                                        InkWell(
                                          borderRadius: BorderRadius.circular(8),
                                          onTap: () async {
                                            final id = bgOpt['id'] as String;
                                            setState(() => _chatBg = id);
                                            final prefs = await SharedPreferences.getInstance();
                                            await prefs.setString('mitemasuka_chat_bg', id);
                                          },
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6),
                                            decoration: BoxDecoration(
                                              color: _chatBg == bgOpt['id']
                                                  ? kBrandBlue.withValues(alpha: isDark ? 0.22 : 0.10)
                                                  : (isDark
                                                        ? const Color(0xFF333333)
                                                        : const Color(0xFFF5F5F4)),
                                              borderRadius: BorderRadius.circular(8),
                                              border: Border.all(
                                                color: _chatBg == bgOpt['id']
                                                    ? kBrandBlue
                                                    : borderColor,
                                              ),
                                            ),
                                            child: Row(
                                              children: [
                                                Container(
                                                  width: 11,
                                                  height: 11,
                                                  decoration: BoxDecoration(
                                                    color: Color(bgOpt['dot'] as int),
                                                    shape: BoxShape.circle,
                                                    border: Border.all(
                                                      color: Colors.black.withValues(alpha: 0.15),
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 4),
                                                Expanded(
                                                  child: Text(
                                                    bgOpt['label'] as String,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: TextStyle(
                                                      fontSize: 10,
                                                      fontWeight: FontWeight.w600,
                                                      color: _chatBg == bgOpt['id']
                                                          ? (isDark ? kBrandBlueDarkText : kBrandBlue)
                                                          : textPrimary,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const Divider(height: 12),

                            // 11. TEST MESAFE SİMÜLATÖRÜ
                            ListTile(
                              dense: true,
                              visualDensity: const VisualDensity(vertical: -2),
                              leading: const Icon(
                                CupertinoIcons.compass,
                                size: 18,
                                color: Color(0xFF6E9482),
                              ),
                              title: const Text(
                                'Test Mesafe Simülatörü',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                              trailing: Text(
                                _showSimBar ? 'Gizle' : 'Göster',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: textSecondary,
                                ),
                              ),
                              onTap: () {
                                setState(() {
                                  _showSimBar = !_showSimBar;
                                  _showHamburgerMenu = false;
                                });
                              },
                            ),
                            const Divider(height: 12),

                            // 12. İLETİŞİM ALANI
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'İLETİŞİM',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.6,
                                      color: textSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      GestureDetector(
                                        onTap: () => launchUrl(Uri.parse('mailto:info@mitemasuka.com')),
                                        child: Row(
                                          children: [
                                            Icon(CupertinoIcons.mail, size: 15, color: isDark ? kBrandBlueDarkText : kBrandBlue),
                                            const SizedBox(width: 6),
                                            Text(
                                              'info@mitemasuka.com',
                                              style: TextStyle(
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w600,
                                                color: textPrimary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      IconButton(
                                        icon: Icon(CupertinoIcons.doc_on_doc, size: 15, color: textSecondary),
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(),
                                        onPressed: () {
                                          Clipboard.setData(
                                            const ClipboardData(text: 'info@mitemasuka.com'),
                                          );
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            const SnackBar(
                                              content: Text('info@mitemasuka.com kopyalandı'),
                                            ),
                                          );
                                        },
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

            // NOKTA (●) BAĞLAM MENÜSÜ OVERLAY (Navigator FocusScope bozmadan açılır)
            if (_activeActionMessage != null)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() => _activeActionMessage = null),
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.45),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: GestureDetector(
                      onTap: () {},
                      child: _buildActionOverlayCard(_activeActionMessage!),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
