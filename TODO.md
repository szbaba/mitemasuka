# Mitemasuka (見てますか?) — Yapılacaklar Listesi ve 4 Adımlı Plan

> **Güvenlik Yedeği Notu:** API çalışmalarına başlamadan önceki çalışan tam yedek `/Users/suleymanzeyyatbaba/minitemas (API öncesi).zip` adresinde kayıtlıdır.

---

## 4 Adımlı `iosApili` ve Mitemasuka API Planı

### Adım 1: Merkezi Sunucuda (`worker/index.js`) API Kapısının Hazırlanması ✅
- [x] **Mevcut Yapıyı Koruma:** Şu an çalışan Web (`mitemasuka.com`) ve Android uygulamamızın kullandığı doğrudan bağlantılara hiç dokunulmadı.
- [x] **Yeni İzole API Geçidi (`/api/v1/protocol/...`):**
  - `GET /api/v1/protocol/connect` (WebSocket ile 100m, 500m, 1km, 5km odalarına bağlanma, mesajlaşma, odadakileri görme)
  - `POST /api/v1/protocol/report` (Apple Kural 1.2 UGC uyumluluğu için bildirme)
  - `GET /api/v1/protocol/config` (Oda kuralları ve yapılandırma)
- [x] **API Anahtarı (`X-Mitemasuka-Key`) ve Kota/Moderasyon:**
  - API üzerinden gelen bağlantılar da aynı Durable Object odasına yönlendirildi ve canlıda doğrulandı.

### Adım 2: `iosApili/` Klasörünün Oluşturulması (İzole iOS Paketi) ✅
- [x] Orijinal `mobile/` klasörüne dokunulmadan, proje ana dizininde `/Users/suleymanzeyyatbaba/minitemas/iosApili` adıyla bağımsız bir Flutter iOS proje klasörü oluşturuldu.
- [x] `iosApili/` içerisindeki bağlantı kodu yalnızca **Adım 1'deki yeni API kapısını (`/api/v1/protocol/connect`)** ve `X-Mitemasuka-Key` anahtarını kullanacak şekilde ayarlandı.
- [x] Uygulama adı **"Mitemasuka"** (`com.mitemasuka.app`) olarak korundu; içinde `android/` klasörü veya eski projelerden hiçbir iz bırakılmadı.
- [x] iOS Simülatöründe çalıştırılarak Web (`User_538`) ve Android (`Sbaba`) ile aynı odada anlık mesajlaştığı canlı olarak test edildi ve doğrulandı.

### Adım 3: `iosApili/` Klasörünün Yakınımıza Teslim Edilmesi ve Yayınlanması
- [x] `iosApili/APP_STORE_YUKLEME_REHBERI.md` kurulum ve App Store yükleme kılavuzu hazırlandı.
- [ ] Paket yakınımıza teslim edilecek; yakınımız kendi bilgisayarından/ortamından kendi Apple Developer hesabıyla **"Mitemasuka"** adıyla App Store'a yükleyecek.

### Adım 4: Orijinal Projenin Gelişimi ve Gelecek Güncellemeler
- [ ] Orijinal `client/` (Web) ve `mobile/` (Android + orijinal iOS) klasörlerimiz ana projemiz olarak bağımsız şekilde gelişmeye devam edecek.
- [ ] İleride orijinal projeye eklenen yeni özellikler istendiğinde `iosApili/` klasörüne aktarılacak ve yeni sürüm olarak App Store'a yüklemesi için yakınımıza verilecek.
