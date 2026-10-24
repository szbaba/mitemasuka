# Mitemasuka (見てますか?) — iOS Geliştirici & App Store Yükleme Rehberi (`iosApili`)

Bu klasör (`iosApili`), **Mitemasuka Protokolü API (`wss://ws.mitemasuka.com/api/v1/protocol/connect`)** üzerinden çalışan bağımsız **Mitemasuka iOS** uygulama paketidir.

---

## BÖLÜM 1: Yazılımcı İçin Teknik Mimari ve Geliştirme Kuralları

Bu proje üzerinde arayüz (UI/UX), animasyonlar, yeni ekranlar, iOS native entegrasyonları veya ek özellikler konusunda **tamamen özgürce geliştirme yapabilirsiniz.**

Web (`mitemasuka.com`) ve Android kullanıcılarıyla **aynı 100m / 500m / 1km / 5km odalarında** kesintisiz buluşmaya devam etmek için yalnızca aşağıdaki **API Bağlantı Protokolü** korunmalıdır:

### 1. Bağlantı Noktaları ve Kimlik Doğrulama (`lib/main.dart`)
* **WebSocket Endpoint:**
  `wss://ws.mitemasuka.com/api/v1/protocol/connect?clientId=<CLIENT_ID>&region=<REGION_KEY>&apiKey=mk_live_ios_protocol_2026_v1`
* **Zorunlu Header:**
  `X-Mitemasuka-Key: mk_live_ios_protocol_2026_v1`
* **Bölge Anahtarı (`regionKey`) Hesaplaması (Değiştirilmemelidir):**
  Aynı coğrafi bölgedeki kullanıcıların aynı Cloudflare Durable Object (`MitemasukaHub`) üzerinde buluşması için bölge anahtarı şu formülle hesaplanır:
  ```dart
  'reg_${(lat * 2).round()}_${(lng * 2).round()}'
  ```
* **REST Uç Noktaları:**
  * `GET https://ws.mitemasuka.com/api/v1/protocol/config` (`X-Mitemasuka-Key` ile sunucu ve kural bilgisi)
  * `POST https://ws.mitemasuka.com/api/v1/protocol/report` (`X-Mitemasuka-Key` ile kullanıcı şikayet/bildirme)
  * `POST https://mitemasuka.com/api/translate` (Mesaj çevirisi)

### 2. Korunması Gereken WebSocket Olayları (`{ "event": "...", "data": ... }`)

#### İstemciden Sunucuya Gönderilenler (`Client -> Server`):
* `update_location`: `{ "lat": double, "lng": double, "radius": 100 | 500 | 1000 | 5000 }`
* `send_message`: `{ "text": String, "replyTo": Map?, "whisperToClientId": String? }`
* `typing`: `true | false`
* `dm_accept`: `{}` (1'e 1 özel mesaj isteğini kabul etme)
* `dm_close`: `{ "reason": "rejected" | "closed" }` (1'e 1 özel mesajı sonlandırma)
* `set_nickname`: `{ "nickname": String }`
* `set_ghost_mode`: `{ "enabled": bool }`
* `activate_plus`: `{ "plan": "daily" | "weekly" | "monthly" }`
* `report_user`: `{ "targetClientId": String }`

#### Sunucudan İstemciye Gelenler (`Server -> Client`):
* `identity`: Kullanıcı kimliği, renk, Plus durumu ve günlük kalan mesaj kotası
* `joined_room`: Odaya giriş onayı, geçmiş mesajlar (`history`) ve aktif özel sohbet (`dmSession`)
* `room_users`: Odadaki aktif kullanıcıların listesi, koordinatları ve çevrede uygulama yüklü cihaz sayısı (`nearbyInstalledCount`)
* `chat_message`: Yeni oda mesajı veya 1'e 1 özel mesaj (`whisperToClientId` doluysa özel mesajdır)
* `system_message`: Odaya katılma/ayrılma ve sistem bildirimleri
* `dm_state` / `dm_error`: 1'e 1 özel görüşme durum güncellemeleri
* `user_typing`: Odada yazmakta olan kullanıcı bilgisi
* `nearby_channels`: Çevredeki tek yönlü anons (megafon) kanalları
* `paywall_trigger`: Ücretsiz limit veya menzil kısıtlaması uyarısı

> **Özet:** Yukarıdaki WebSocket JSON şeması korunduğu sürece, uygulamanın görsel tasarımını, bileşen yapısını veya iOS özelliklerini istediğiniz gibi geliştirebilirsiniz.

---

## BÖLÜM 2: Xcode ile Derleme ve App Store Connect'e Yükleme

### 1. Projeyi Hazırlama (Terminal)
```bash
cd iosApili
flutter clean
flutter pub get
cd ios && pod install && cd ..
```

### 2. Xcode İmzalama (Signing)
1. `iosApili/ios/Runner.xcworkspace` dosyasını **Xcode** ile açın:
   ```bash
   open ios/Runner.xcworkspace
   ```
2. Sol menüden **Runner** -> **Signing & Capabilities** sekmesine gelin.
3. **Automatically manage signing** seçeneğini işaretleyin ve **Team** kısmından kendi **Apple Developer** hesabınızı seçin.
4. **Bundle Identifier** alanı `com.mitemasuka.app` olarak ayarlıdır (veya kendi tercih ettiğiniz temiz bir Bundle ID kullanabilirsiniz).
5. Üst menüden hedef cihaz olarak **Any iOS Device (arm64)** seçin ve **Product -> Archive** adımıyla paketi App Store Connect'e yükleyin.

### 3. App Store Connect Bilgileri ve Apple İnceleme (UGC) Uyumluluğu
* **Uygulama Adı:** Mitemasuka
* **Destek & Gizlilik Politikası URL:** `https://mitemasuka.com`
* **Apple Kural 1.2 (UGC) Notu:** Uygulama içerisinde ilk açılışta Topluluk Kuralları (EULA) onayı, mesajlar üzerinde kalkan ikonuyla **Kullanıcı Bildirme (Report)** ve **Kullanıcı Engelleme (Block)** mekanizmaları hazır bulunmaktadır. Yaptığınız geliştirmelerde bu üç UGC öğesini korumanız App Store onayı için önemlidir.
