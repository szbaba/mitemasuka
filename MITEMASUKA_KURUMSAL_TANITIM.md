# MİTEMASUKA (見てますか?)
### “Beni Görüyor Musun?” — Yeni Nesil Hiper-Yerel İletişim ve Canlı Yayın Platformu
**Kurumsal Tanıtım, Teknoloji Mimarisi ve Stratejik Kullanım Senaryoları Dosyası**  
**Canlı Platform:** [https://mitemasuka.com](https://mitemasuka.com)

---

## 1. Yönetici Özeti (Executive Summary)

**Mitemasuka** (`https://mitemasuka.com`), fiziksel olarak aynı mekânı veya coğrafi alanı paylaşan insanları, herhangi bir mobil uygulama indirme, üyelik formu doldurma veya telefon numarası gibi kişisel verileri paylaşma zorunluluğu olmadan saniyeler içinde birbirine bağlayan **hiper-yerel (hyper-local)** bir gerçek zamanlı iletişim ve canlı yayın platformudur.

Modern dünyada yüzlerce insan aynı üniversite amfisinde, konferans salonunda, konserde, miting alanında, turist kafilesinde veya afet toplanma alanında yan yana bulunmasına rağmen, aralarında anlık bir iletişim köprüsü kurulamamaktadır. Geleneksel mesajlaşma uygulamaları (WhatsApp, Telegram vb.) telefon numarası paylaşımı ve önceden oluşturulmuş grup linkleri gerektirirken; **Mitemasuka** doğrudan tarayıcı üzerinden konum bazlı dinamik odalar ve tek yönlü canlı altyazı kanalları oluşturarak bu bariyeri tamamen ortadan kaldırır.

> **Temel Değer Önerisi:** Uygulama indirmeden, kayıt olmadan, telefon numarası vermeden; sadece bulunduğun konumdaki (**100m – 5km**) insanlarla anında mesajlaş veya tek yönlü **canlı sesli altyazı kanalıyla** binlerce kişiye aynı anda seslen.

---

## 2. İsmin Felsefesi: “Mitemasuka (見てますか?)”

Projenin geliştirme sürecinde yaşanan sıra dışı bir teknolojik tesadüf, platformun felsefesini ve küresel marka kimliğini doğurmuştur. İlk aşamada *“MiniTemas”* olarak adlandırılan projenin sesli dikte sistemiyle yazılması sırasında, yapay zeka ses tanıma motoru Türkçe söylenen *“MiniTemas”* ifadesini Japonca **“見てますか? (*Mitemasu ka?*)”** olarak algılamıştır.

Japoncada **“Beni görüyor musun? / Bakıyor musun?”** anlamına gelen bu ifade, platformun varoluş amacını tek bir cümlede özetlemektedir: Fiziksel olarak aynı ortamda bulunan, birbirinin yanından geçen ancak dijital dünyada birbirini göremeyen insanların birbirine sorduğu en temel insani soru: **“Beni görüyor musun?”**

---

## 3. Çözülen Temel Problemler

* **Uygulama İndirme Yorgunluğu (App Fatigue):** Kullanıcılar birkaç saatlik bir konferans, konser, müze gezisi veya kampüs etkinliği için telefonlarına yüzlerce megabaytlık yeni bir uygulama indirip hesap açmak istememektedir. Mitemasuka, Progressive Web App (PWA) mimarisi sayesinde QR kod okutularak veya adres yazılarak **1 saniye içinde** doğrudan çalışır.
* **Kişisel Veri ve Mahremiyet Endişesi:** Aynı ortamdaki kişilerle iletişim kurmak için telefon numarası, ad-soyad veya sosyal medya profili paylaşmak ciddi bir güvenlik ve gizlilik riskidir. Mitemasuka, kullanıcılara geçici ve anonim kimlikler (*Örn: Gezgin_482*) atayarak sıfır kişisel veriyle güvenli iletişim sağlar.
* **Kalabalık Etkinliklerde Sesin Ulaşmaması ve Erişilebilirlik:** Mitinglerde, açık hava konserlerinde, büyük amfilerde veya gürültülü turistik gezilerde konuşmacının sesi arka sıralara ulaşmamakta; işitme engelli veya ağır işiten bireyler ise süreçten tamamen kopmaktadır. Mitemasuka’nın **“Tek Yönlü Megafon ve Canlı Sesli Altyazı”** teknolojisi bu sorunu kökten çözer.

---

## 4. Platform Modülleri ve Teknolojik Yetenekler

### 4.1. Hiper-Yerel Anonim Meydan (100m • 500m • 1km • 5km)
Sistem, kullanıcının GPS koordinatlarını **Haversine jeo-uzamsal algoritması** ile milisaniyeler içinde işleyerek seçilen yarıçap içindeki tüm kullanıcıları aynı sanal odada buluşturur. Kullanıcı hareket ettikçe veya menzilini değiştirdikçe oda yapısı dinamik olarak güncellenir. Odada yanıtla/alıntıla (*quote reply*), anlık emoji tepkileri ve son 25 mesaj geçmişi gibi modern mesajlaşma özellikleri eksiksiz sunulur.

### 4.2. Tek Yönlü Kanal (Megafon) ve Canlı Sesli Altyazı Sistemi
Konuşmacılar, rehberler, akademisyenler ve etkinlik organizatörleri için geliştirilen bu modül, belirlenen menzil içindeki (100 metreden 5 kilometreye kadar) herkesin ekranının en üstünde **“🔴 CANLI KANAL”** bildirimi oluşturur:
* **Canlı Sesli Dikte (Speech-to-Text):** Konuşmacı telefonunun mikrofonunu açıp konuştuğunda, söyledikleri gerçek zamanlı olarak metne dönüştürülür ve menzildeki yüzlerce/binlerce dinleyicinin ekranına **canlı altyazı** olarak akar.
* **Gürültüsüz Tek Yönlü Akış:** Dinleyiciler yayın akışına mesaj yazarak ekranı kirletemez; yalnızca gerçek zamanlı alkış, kalp ve beğeni (`👏 🔥 ❤️ 👍`) tepkileri göndererek konuşmacıya geri bildirimde bulunabilir.

### 4.3. Birebir Özel Fısıltı (Whisper) ve Hayalet Modu
Genel meydandaki kalabalığı meşgul etmeden, odadaki belirli bir kullanıcıyla kilitli **1'e 1 özel sohbet (Özel Fısıltı)** başlatılabilir. Ayrıca **“Hayalet Modu”** sayesinde kullanıcılar odaya giriş/çıkış bildirimi göndermeden ve *yazıyor* ibaresi görünmeden sessizce ortamı takip edebilir.

### 4.4. Otonom Topluluk Moderasyonu ve Güvenlik
Anonim ortamların en büyük riski olan spam ve rahatsız edici davranışlara karşı Mitemasuka, dağıtık bir moderasyon algoritması kullanır: Odadaki **3 farklı kullanıcı** tarafından şikayet edilen bir cihaz kimliği (*Client ID*), yönetici müdahalesine gerek kalmaksızın otomatik olarak susturulur. Ayrıca her kullanıcı dilediği kişiyi kendi ekranında tek dokunuşla kalıcı olarak engelleyebilir.

---

## 5. Sektörel Kullanım Senaryoları (Use Cases)

| Sektör / Alan | Önerilen Menzil | Kullanım Amacı ve Sağlanan Katma Değer |
| :--- | :---: | :--- |
| **Turizm ve Müze Rehberliği** | **100 m Çap** | Donanımsal kulaklık/telsiz dağıtma maliyetini sıfırlar. Rehber konuşurken turistler kendi telefonlarından canlı yazılı/sesli anlatımı takip eder. |
| **Üniversite, Akademi ve Seminerler** | **100 m – 500 m Çap** | Amfilerde ve kongre salonlarında öğrencilerin çekinmeden soru sormasını, ders notu paylaşmasını ve hocanın anlatımını canlı altyazıyla takip etmesini sağlar. |
| **Konser, Tiyatro ve Festivaller** | **500 m – 1 km Çap** | Sahne programı duyuruları, şarkı sözleri, kayıp eşya anonsları ve katılımcıların etkinlik alanında sosyalleşmesi için anlık iletişim ağı kurar. |
| **Mitingler ve Kamusal Buluşmalar** | **1 km – 5 km Çap** | Ses sisteminin ulaşamadığı en arka sıralardaki on binlerce kişiye konuşmacının sözlerini anlık metin ve duyuru olarak ulaştırır. |
| **Engelsiz Yaşam (Erişilebilirlik)** | **Tüm Menziller** | İşitme engelli vatandaşların kamusal etkinliklerde, belediye meclislerinde, derslerde ve sosyal alanlarda konuşulanları canlı metin olarak okumasını sağlar. |
| **Afet ve Acil Durum İletişimi (Ar-Ge)** | **5 km + Hibrit Ağ** | Kriz anlarında mahalle/bölge bazlı acil koordinasyon kanalı oluşturur; Faz-2 kapsamında çevrimdışı kurtarma sinyalleri ve Bluetooth Mesh köprüsü sunar. |

---

## 6. Teknoloji ve Bulut Altyapı Mimarisi

Mitemasuka, geleneksel tek merkezli sunucular yerine **Cloudflare Edge Computing** ve **Durable Objects** mimarisi üzerinde çalışmaktadır:
* **Küresel Uç Nokta (Edge) Ağı:** Dünya genelinde 300'den fazla veri merkezinde çalışan sunucusuz (*serverless*) mimari sayesinde, kullanıcılar kendilerine coğrafi olarak en yakın veri merkezine milisaniyeler içinde bağlanır.
* **WebSocket Gerçek Zamanlı Veri Akışı (`wss://ws.mitemasuka.com`):** Sayfa yenilemeye gerek kalmadan konum değişimleri, mesajlar, fısıltılar ve canlı sesli altyazı paketleri çift yönlü şifreli WebSocket tünelleri üzerinden anlık olarak iletilir.
* **Sıfır Kurulum (Zero-Install PWA):** iOS (Safari/Chrome), Android ve masaüstü tarayıcıların tamamında ek bir eklenti gerektirmeden çalışır; ana ekrana eklenerek tam ekran mobil uygulama deneyimi sunar.

---

## 7. Sürdürülebilir İş ve Gelir Modeli

Platform, hem bireysel kullanıcıların organik büyümesini destekleyen hem de kurumsal/etkinlik bazlı yüksek katma değerli gelir üreten çift kanallı (**B2C + B2B**) hibrit bir gelir modeline sahiptir:

| Paket / Modül | Kapsam ve Özellikler | Hedef Kitle |
| :--- | :--- | :--- |
| **Ücretsiz Standart Kullanım** | 100 metre menzil, günlük 15 ücretsiz mesaj hakkı, canlı kanalları ücretsiz dinleme ve altyazı okuma. | Tüm Bireysel Kullanıcılar / Dinleyiciler |
| **Mitemasuka Plus (VIP)** | Sınırsız mesaj hakkı, 500m / 1km / 5km menzil odalarına erişim, 1'e 1 Özel Fısıltı, Özel Takma Ad ve Hayalet Modu. | Aktif Sosyal Kullanıcılar (Günlük / Haftalık / Aylık) |
| **Tek Yönlü Kanal (100m - 500m)** | Sınıf, Tur Rehberi, Seminer ve Kampüs yayınları için Canlı Sesli Altyazı ve Duyuru Kanalı (`99 ₺` – `199 ₺`). | Eğitmenler, Tur Rehberleri, Kulüpler |
| **Tek Yönlü Kanal (1km - 5km)** | Konser, Konferans, Festival ve Mitingler için geniş çaplı Canlı Altyazı ve Anons Kanalı (`499 ₺` – `1.499 ₺`). | Organizatörler, Belediyeler, Kurumlar |

---

## 8. Canlı Platform Erişimi

Mitemasuka şu anda canlı olarak yayındadır ve herhangi bir kurulum gerektirmeden akıllı telefon veya bilgisayar üzerinden anında deneyimlenebilir:

* **Canlı Web Adresi:** [https://mitemasuka.com](https://mitemasuka.com)
