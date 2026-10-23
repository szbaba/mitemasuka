import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

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
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json, {String kind = 'chat'}) {
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
  String _myUsername = 'Baglaniyor...';
  bool _isPlus = false;
  bool _ghostMode = false;
  bool _isBanned = false;
  int _dailyLimit = 20;
  int _remainingQuota = 20;

  bool _isConnected = false;
  WebSocketChannel? _channel;
  StreamSubscription? _wsSub;
  Timer? _reconnectTimer;

  double? _baseLat;
  double? _baseLng;
  double _simOffsetMeters = 0;
  bool _showSimBar = false;

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
  String _uiLang = 'tr';
  bool _autoTranslate = true;
  final Map<String, String> _translations = {};
  final Set<String> _translatingIds = {};
  Set<String> _blockedClientIds = {};

  @override
  void initState() {
    super.initState();
    _initializeApp();
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _wsSub?.cancel();
    _channel?.sink.close();
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

    setState(() {
      _myClientId = cid;
      _blockedClientIds = blocked.toSet();
      _uiLang = savedLang;
    });

    if (!eula && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showEulaModal();
      });
    }

    await _initLocation();
    _connectWebSocket();
  }

  double get _effectiveLat => (_baseLat ?? 41.0082) + (_simOffsetMeters / 111320.0);
  double get _effectiveLng => _baseLng ?? 28.9784;

  String get _regionKey {
    if (_baseLat != null && _baseLng != null) {
      return 'reg_${(_baseLat! * 2).round()}_${(_baseLng! * 2).round()}';
    }
    return 'global-hub-v1';
  }

  Future<void> _initLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _baseLat = 41.0082;
          _baseLng = 28.9784;
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() {
          _baseLat = 41.0082;
          _baseLng = 28.9784;
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      setState(() {
        _baseLat = pos.latitude;
        _baseLng = pos.longitude;
      });
      _joinRoomIfReady();
    } catch (_) {
      setState(() {
        _baseLat ??= 41.0082;
        _baseLng ??= 28.9784;
      });
      _joinRoomIfReady();
    }
  }

  void _connectWebSocket() {
    _wsSub?.cancel();
    _channel?.sink.close();

    final uri = Uri.parse(
      '$_wsBaseUrl?clientId=${Uri.encodeComponent(_myClientId)}&region=${Uri.encodeComponent(_regionKey)}',
    );

    try {
      final ch = WebSocketChannel.connect(uri);
      _channel = ch;
      setState(() {
        _isConnected = true;
      });

      _wsSub = ch.stream.listen(
        (raw) {
          _handleWsMessage(raw.toString());
        },
        onDone: () {
          if (!mounted) return;
          setState(() {
            _isConnected = false;
          });
          _scheduleReconnect();
        },
        onError: (_) {
          if (!mounted) return;
          setState(() {
            _isConnected = false;
          });
          _scheduleReconnect();
        },
      );

      _joinRoomIfReady();
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) _connectWebSocket();
    });
  }

  void _emit(String event, [Map<String, dynamic>? data]) {
    if (_channel == null) return;
    try {
      _channel!.sink.add(jsonEncode({'event': event, 'data': data ?? {}}));
    } catch (_) {}
  }

  void _joinRoomIfReady() {
    if (!_isConnected || _baseLat == null || _baseLng == null) return;
    _emit('join_room', {
      'lat': _effectiveLat,
      'lng': _effectiveLng,
      'radius': _selectedRadius,
    });
  }

  void _handleWsMessage(String raw) {
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final event = decoded['event']?.toString() ?? '';
      final data = decoded['data'];

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
        setState(() {
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
        setState(() {
          _roomUsers = users;
          _nearbyInstalledCount = math.max(users.length, installed);
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
          _translateMessage(msg);
        }
        _scrollToBottom();
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

  Future<void> _translateMessage(ChatMessage msg) async {
    final key = '${msg.id}_$_uiLang';
    if (_translations.containsKey(key) || _translatingIds.contains(key)) return;
    setState(() {
      _translatingIds.add(key);
    });
    try {
      final resp = await http.post(
        Uri.parse('$_httpBaseUrl/api/translate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'text': msg.text, 'targetLang': _uiLang}),
      );
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        final tr = data['translatedText']?.toString() ?? '';
        if (tr.isNotEmpty && tr.trim().toLowerCase() != msg.text.trim().toLowerCase()) {
          setState(() {
            _translations[key] = tr;
          });
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
    if (lat == null || lng == null) return null;
    const R = 6371e3;
    final p1 = _effectiveLat * math.pi / 180;
    final p2 = lat * math.pi / 180;
    final dp = (lat - _effectiveLat) * math.pi / 180;
    final dl = (lng - _effectiveLng) * math.pi / 180;
    final a = math.sin(dp / 2) * math.sin(dp / 2) +
        math.cos(p1) * math.cos(p2) * math.sin(dl / 2) * math.sin(dl / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return (R * c).round();
  }

  void _handleSendMessage() {
    final text = _inputController.text.trim();
    if (text.isEmpty || !_isConnected || _isBanned) return;

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
      final a = _dmSession!['aClientId']?.toString();
      final b = _dmSession!['bClientId']?.toString();
      return a == _myClientId ? b : a;
    }
    return _dmDraftPeer?.clientId;
  }

  String? get _dmPeerName {
    if (_dmSession != null) {
      final a = _dmSession!['aClientId']?.toString();
      return a == _myClientId
          ? _dmSession!['bName']?.toString()
          : _dmSession!['aName']?.toString();
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
          'Mitemasuka Topluluk Kurallari',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        content: const SingleChildScrollView(
          child: Text(
            'Mitemasuka, 100 metre cevrenizdeki gercek kisilerle anlik iletisim kurmanizi saglar.\n\n'
            '• Taciz, kufur, nefret soylemi ve spam kesinlikle yasaktir.\n'
            '• Rahatsiz edici kullanicilari mesaj uzerindeki kalkan ikonuyla bildirebilir veya engelleyebilirsiniz.\n'
            '• 3 farkli kisi tarafindan bildirilen kullanicilar o gun boyunca otomatik olarak susturulur.',
            style: TextStyle(fontSize: 14, height: 1.45),
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
            child: const Text('Kabul Ediyorum ve Basla'),
          ),
        ],
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
                '$targetName — Kullaniciyi Bildir',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const Text(
          'Bu kisiyi topluluk kurallarini ihlal ettigi icin bildiriyorsunuz. Odada 3 farkli kisi bildirirse kullanici o gun boyunca otomatik olarak susturulur.',
          style: TextStyle(fontSize: 13.5, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Iptal'),
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
              _emit('report_user', {'targetClientId': targetClientId});
              setState(() {
                _blockedClientIds.add(targetClientId);
              });
              final prefs = await SharedPreferences.getInstance();
              await prefs.setStringList(
                'mitemasuka_blocked',
                _blockedClientIds.toList(),
              );
              if (ctx.mounted) Navigator.of(ctx).pop();
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
          'Yakinindakini Ekle (QR Kod)',
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
              'Cevrendeki kisiler kamerasiyla okutup indirmeden aninda ayni 100m odasina katilabilir.',
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
            'Ayni Mekandayiz, Ama Birbirimizi Goruyor Muyuz?\n\n'
            'Japoncada "Mitemasu ka?" (見てますか?), "Beni goruyor musun? / Etrafina bakiyor musun?" anlamina gelir.\n\n'
            '• 100 Metre Gerceklik Cemberi: Sadece fiziksel olarak seninle ayni 100 metrede bulunan kisileri tek bir canli sohbet odasinda bulusturur.\n'
            '• Web ve Mobil Ayni Odada: Uygulamadan veya mitemasuka.com uzerinden giren herkes ayni odada aninda yazisir.',
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
          'Mitemasuka Plus (Simdilik Ucretsiz)',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: const Text(
          'Lansman doneminde tum Plus ozellikleri ucretsizdir:\n\n'
          '• 500 m ve 1 km genis menzil secimi\n'
          '• Sinirsiz gunluk mesaj hakki\n'
          '• Ozel takma ad (Nickname) belirleme\n'
          '• Hayalet Modu (Sessiz giris/cikis)',
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
              child: const Text('Ucretsiz Plus Aktif Et'),
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
          'Takma Adimi Degistir',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        content: TextField(
          controller: ctrl,
          maxLength: 20,
          decoration: const InputDecoration(
            hintText: 'Yeni takma adiniz...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Iptal'),
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

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                // 1. ÜST BAR (HEADER)
                Container(
                  padding: const EdgeInsets.only(left: 4, right: 12, top: 6, bottom: 6),
                  decoration: BoxDecoration(
                    color: headerBg,
                    border: Border(bottom: BorderSide(color: borderColor)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Sol: Karga Logo (84x84, hafif sola yaslı)
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _activeView = 'room';
                            _showHamburgerMenu = false;
                            _showRadiusMenu = false;
                            _showMembersDrawer = false;
                          });
                        },
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 72,
                              height: 54,
                              alignment: Alignment.centerLeft,
                              child: ClipOval(
                                child: Image.asset(
                                  'assets/logo-karga.png',
                                  width: 64,
                                  height: 64,
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                            Positioned(
                              bottom: 4,
                              right: 10,
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
                      ),

                      // Sağ Kontrol Butonları: Aktif/Yüklü, Menzil, Gece Modu, Menü
                      Row(
                        children: [
                          // 2/8 Aktif/Çevredeki Kişiler Butonu
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
                              height: 36,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.people_outline,
                                    size: 16,
                                    color: Color(0xFF10B981),
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    '${_roomUsers.length}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: textPrimary,
                                    ),
                                  ),
                                  Text(
                                    '/$_nearbyInstalledCount',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // Menzil Seçici (100m / 500m / 1km)
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
                              height: 36,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
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
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: textPrimary,
                                    ),
                                  ),
                                  const SizedBox(width: 2),
                                  Icon(
                                    Icons.keyboard_arrow_down,
                                    size: 16,
                                    color: textSecondary,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // Gece / Gündüz Butonu
                          InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: widget.onToggleTheme,
                            child: Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Icon(
                                isDark ? Icons.wb_sunny_outlined : Icons.dark_mode_outlined,
                                size: 18,
                                color: isDark ? Colors.amber : textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // Hamburger Menü Butonu
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
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: pillBg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: borderColor),
                              ),
                              child: Icon(
                                _showHamburgerMenu ? Icons.close : Icons.menu,
                                size: 19,
                                color: textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Simülasyon Çubuğu (Açık ise)
                if (_showSimBar)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    color: isDark ? const Color(0xFF262626) : const Color(0xFFEFF6FF),
                    child: Row(
                      children: [
                        const Icon(Icons.science_outlined, size: 16, color: kBrandBlue),
                        const SizedBox(width: 8),
                        Text(
                          'Simulasyon: +${_simOffsetMeters.round()}m',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        Expanded(
                          child: Slider(
                            value: _simOffsetMeters,
                            min: 0,
                            max: 250,
                            divisions: 25,
                            activeColor: kBrandBlue,
                            onChanged: (v) {
                              setState(() => _simOffsetMeters = v);
                            },
                            onChangeEnd: (_) => _joinRoomIfReady(),
                          ),
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
                      // Sola yapışık oda bilgi kulakçığı
                      GestureDetector(
                        onTap: () => setState(() => _activeView = 'room'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
                            '${_selectedRadius >= 1000 ? '${_selectedRadius ~/ 1000}km' : '${_selectedRadius}m'} · ${_roomUsers.length} aktif · Cevrede $_nearbyInstalledCount kiside yuklu',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: textSecondary,
                            ),
                          ),
                        ),
                      ),

                      // Sağa yapışık Özel (DM) kulakçığı
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
                              Text(
                                'Ozel',
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

                // 3. ANA SOHBET AKIŞI
                Expanded(
                  child: _activeView == 'dm' && _dmPeerClientId == null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              'Ozel mesajlasmak icin odadaki bir kullanicinin ismine dokunun.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: textSecondary, fontSize: 14),
                            ),
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          itemCount: visibleMessages.length,
                          itemBuilder: (ctx, idx) {
                            final item = visibleMessages[idx];
                            if (item.kind == 'system') {
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
                                      color: isJoin
                                          ? const Color(0xFF10B981).withValues(alpha: 0.12)
                                          : kCrimsonRed.withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      item.text,
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w500,
                                        color: isJoin
                                            ? const Color(0xFF10B981)
                                            : kCrimsonRed,
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

                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 5),
                              child: Column(
                                crossAxisAlignment: isMine
                                    ? CrossAxisAlignment.end
                                    : CrossAxisAlignment.start,
                                children: [
                                  ConstrainedBox(
                                    constraints: BoxConstraints(
                                      maxWidth: MediaQuery.of(context).size.width * 0.84,
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
                                                      item.senderName ?? 'Kullanici',
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
                                                        item.senderName ?? 'Kullanici',
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
                                          Text(
                                            item.text,
                                            style: TextStyle(
                                              fontSize: 18,
                                              fontWeight: FontWeight.w500,
                                              color: isMine ? Colors.white : textPrimary,
                                              height: 1.32,
                                            ),
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
                                          const SizedBox(height: 2),
                                          Align(
                                            alignment: Alignment.bottomRight,
                                            child: Text(
                                              _formatTime(item.timestamp),
                                              style: TextStyle(
                                                fontSize: 10,
                                                color: isMine
                                                    ? Colors.white.withValues(alpha: 0.75)
                                                    : textSecondary,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                  // Başkasının mesajı altında Yanıtla & Çevir
                                  if (!isMine && _activeView == 'room')
                                    Padding(
                                      padding: const EdgeInsets.only(top: 3, left: 6),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          GestureDetector(
                                            onTap: () {
                                              setState(() => _replyingTo = item);
                                              _inputFocusNode.requestFocus();
                                            },
                                            child: Text(
                                              'Yanitla',
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w500,
                                                color: textSecondary,
                                              ),
                                            ),
                                          ),
                                          if (hasLetters) ...[
                                            const SizedBox(width: 12),
                                            GestureDetector(
                                              onTap: () => _translateMessage(item),
                                              child: Text(
                                                'Cevir',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w500,
                                                  color: textSecondary,
                                                ),
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
                              onSubmitted: (_) => _handleSendMessage(),
                              decoration: InputDecoration(
                                hintText: _isBanned
                                    ? 'Bugun susturuldunuz'
                                    : _activeView == 'dm'
                                        ? '${_dmPeerName ?? 'Ozel'} — fisilti yazin...'
                                        : '${_selectedRadius}m — odasina mesaj yazin...',
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
                                    ? 'Plus • Sinirsiz'
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
                              'Beni Goruyor Musun?',
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
                      children: [100, 500, 1000].map((r) {
                        final locked = r > 100 && !_isPlus;
                        return ListTile(
                          dense: true,
                          title: Text(
                            r >= 1000 ? '1 km Menzil' : '$r m Menzil',
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
                          'Odadaki Kisiler (${_roomUsers.length})',
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
                                        child: const Text('Ozel Yaz'),
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
                  elevation: 12,
                  borderRadius: BorderRadius.circular(20),
                  color: isDark ? const Color(0xFF262626) : Colors.white,
                  child: Container(
                    width: 288,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Column(
                            children: [
                              // 1. Kutu: Mitemasuka Plus (#1A81E5)
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
                                            Icons.auto_awesome,
                                            size: 17,
                                            color: isDark ? kBrandBlueDarkText : kBrandBlue,
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            _isPlus ? 'Mitemasuka Plus Aktif' : "Plus'a Gec",
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

                              // 2. Kutu: Kanal Kur (#DC143C Crimson Red)
                              InkWell(
                                borderRadius: BorderRadius.circular(14),
                                onTap: () {
                                  setState(() => _showHamburgerMenu = false);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Canli Anons Kanali kurulumu aciliyor...'),
                                    ),
                                  );
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
                                              Icons.campaign_outlined,
                                              size: 18,
                                              color: isDark ? kCrimsonRedDarkText : kCrimsonRed,
                                            ),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: Text(
                                                'Kanal Kur (Tek Yonlu Seslen)',
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
                                            'Simdilik Ucretsiz',
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

                        // Menü Satırları
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.translate, size: 18, color: Color(0xFF6E9482)),
                          title: const Text('Otomatik Ceviri (Ucretsiz)', style: TextStyle(fontSize: 13)),
                          trailing: Text(
                            _autoTranslate ? 'Acik' : 'Kapali',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.bold,
                              color: _autoTranslate ? const Color(0xFF6E9482) : textSecondary,
                            ),
                          ),
                          onTap: () => setState(() => _autoTranslate = !_autoTranslate),
                        ),
                        ListTile(
                          dense: true,
                          leading: Icon(
                            Icons.info_outline,
                            size: 18,
                            color: isDark ? kBrandBlueDarkText : kBrandBlue,
                          ),
                          title: const Text('Mitemasuka Nedir?', style: TextStyle(fontSize: 13)),
                          onTap: () {
                            setState(() => _showHamburgerMenu = false);
                            _showStoryDialog();
                          },
                        ),
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.qr_code, size: 18, color: Color(0xFF6E9482)),
                          title: const Text('Yakinindakini Ekle (QR Kod)', style: TextStyle(fontSize: 13)),
                          onTap: () {
                            setState(() => _showHamburgerMenu = false);
                            _showQrDialog();
                          },
                        ),
                        ListTile(
                          dense: true,
                          leading: Icon(
                            Icons.edit_outlined,
                            size: 18,
                            color: isDark ? kBrandBlueDarkText : kBrandBlue,
                          ),
                          title: const Text('Takma Adimi Degistir', style: TextStyle(fontSize: 13)),
                          onTap: () {
                            setState(() => _showHamburgerMenu = false);
                            if (!_isPlus) {
                              _showPlusDialog();
                              return;
                            }
                            _showNicknameDialog();
                          },
                        ),
                        ListTile(
                          dense: true,
                          leading: const Icon(
                            Icons.visibility_off_outlined,
                            size: 18,
                            color: Color(0xFF8C7DA8),
                          ),
                          title: const Text(
                            'Hayalet Modu (Sessiz Giris)',
                            style: TextStyle(fontSize: 13),
                          ),
                          trailing: Text(
                            _ghostMode ? 'Acik' : 'Kapali',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.bold,
                              color: _ghostMode ? const Color(0xFF8C7DA8) : textSecondary,
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
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.science_outlined, size: 18, color: kBrandBlue),
                          title: const Text('Mesafe Simulasyonu (Test)', style: TextStyle(fontSize: 13)),
                          trailing: Text(
                            _showSimBar ? 'Gizle' : 'Goster',
                            style: TextStyle(fontSize: 11, color: textSecondary),
                          ),
                          onTap: () {
                            setState(() {
                              _showSimBar = !_showSimBar;
                              _showHamburgerMenu = false;
                            });
                          },
                        ),
                        const Divider(height: 12),
                        // İletişim: info@mitemasuka.com
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              GestureDetector(
                                onTap: () => launchUrl(Uri.parse('mailto:info@mitemasuka.com')),
                                child: Row(
                                  children: [
                                    Icon(Icons.mail_outline, size: 15, color: textSecondary),
                                    const SizedBox(width: 6),
                                    Text(
                                      'info@mitemasuka.com',
                                      style: TextStyle(fontSize: 12, color: textSecondary),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: Icon(Icons.copy, size: 15, color: textSecondary),
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                onPressed: () {
                                  Clipboard.setData(
                                    const ClipboardData(text: 'info@mitemasuka.com'),
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('info@mitemasuka.com kopyalandi'),
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
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
