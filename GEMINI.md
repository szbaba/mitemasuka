# Mitemasuka (見てますか?) — Proje Hafızası ve Mobil & App Store Sıfır İz Stratejisi

## 1. Mevcut Mimari (API-First / Headless)
- **Web İstemcisi:** `client/` (Next.js, `mitemasuka.com` üzerinde yayında).
- **Merkezi Sunucu (API & WebSocket):** `worker/index.js` (Cloudflare Workers + Durable Objects) ve `server/server.js`.
- Web uygulaması ve yapılacak **Flutter (iOS & Android)** mobil uygulaması **aynı merkezi sunucuya (`worker/index.js`)** bağlanır. Web'den giren kullanıcı ile mobil uygulamadan giren kullanıcı aynı 100m odasında birbirini görür ve anında mesajlaşır.

## 2. Mobil Uygulama Stratejisi (1. Yol — Tam Native Flutter)
- Basit WebView sarmalayıcı (Apple Kural 4.2 reddi riski) yerine, mevcut Cloudflare API'mize bağlanan **%100 native Flutter (iOS + Android)** uygulaması geliştirilecek.
- **Native Özellikler:** Arka planda yakın çevre aktif oda bildirimi (Push Notification), kamera ile QR kod okuma, mikrofon/canlı sesli dikte, uygulama içi satın alma (Plus/PRO) ve Apple Kural 1.2 (UGC) uyumluluğu (EULA onayı, onay balonlu bildirme/report, engelleme/block, günlük susturma/küfür filtresi).

## 3. Apple Developer Hesabı & "Sıfır İz" (Zero-Fingerprint) İzolasyon Kuralları (ASLA UNUTULMAYACAK)
Kullanıcının eski Apple Developer hesabı kapatıldığı (terminated) için, uygulama bir yakınının Apple Developer hesabı üzerinden yayınlanacaktır. Yakınının hesabının Apple tarafından eski hesapla ilişkilendirilmemesi (flaglenmemesi) için şu 5 kural **kesinlikle ve istisnasız** uygulanacaktır:

1. **Bu Mac'teki Xcode'a Yakınının Apple Hesabı ASLA Girilmeyecek:**
   - Bu Mac'in donanım kimliği (UUID/UDID) eski hesapla ilişkili olduğu için Xcode'a yeni hesap bağlanmayacak ve bu Mac'ten `Archive / Upload to App Store` yapılmayacak.
   - Tüm geliştirme ve testler bu Mac'te **Apple hesabı olmadan** Xcode iOS Simülatöründe ve Android üzerinde yapılacak.
   - App Store Connect'e paket gönderimi (**IPA / Archive Upload**) yalnızca **bulut derleyici (Codemagic / GitHub Actions temiz macOS sunucusu)** üzerinden veya yakınının kendi bilgisayarından yapılacak.
2. **Eski Projelerden Sıfır Kod ve Sıfır Firebase Paylaşımı:**
   - Kapatılan hesaptaki eski projelerden (örn. eski Flutter projeleri, eski Firebase yapılandırmaları, sertifikalar veya paket adları) tek satır bile kullanılmayacak. Mitemasuka tamamen bağımsız Cloudflare altyapısını kullanmaya devam edecek.
3. **Yepyeni ve Bağımsız Bundle ID:**
   - Eski hesaptaki isimlendirme kalıbına (`com.suleyman...` vb.) benzemeyen, tamamen temiz bir Bundle ID (ör. `com.mitemasuka.app` veya yakınının adına uygun paket adı) kullanılacak.
4. **Domain, İletişim ve Ödeme Bilgisi İzolasyonu:**
   - `mitemasuka.com` eski Apple hesabında hiç kullanılmadığı için temizdir.
   - App Store Connect'te kullanılacak **Destek E-postası, Telefon Numarası, Kredi Kartı ve Banka Hesabı (IBAN)** tamamen yakınına ait olacak; eski hesapta kullanılmış hiçbir iletişim veya ödeme bilgisi girilmeyecek.
5. **IP ve Tarayıcı İzolasyonu:**
   - Yakını App Store Connect paneline kendi cihazından ve kendi internetinden (veya mobil verisinden) girecek; bu bilgisayardaki tarayıcılardan App Store Connect'e giriş yapılmayacak.
