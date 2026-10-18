# MiniTemas — 100m Konum Tabanlı Anlık Anonim Grup Sohbeti (PWA)

Birbirine fiziksel olarak yakın olan (**100m, 500m, 1km veya 5km** çapında) kullanıcıları Haversine formülü ile otomatik olarak aynı WebSocket odasına (`room`) atayan ve tıpkı bir WhatsApp grubu gibi anında anonim mesajlaşmalarını sağlayan Progressive Web App (PWA).

---

## Klasör Yapısı

```
/Users/suleymanzeyyatbaba/minitemas
├── server/                 # Node.js + Express + Socket.io + Haversine Backend (Port: 4000)
│   ├── package.json
│   └── server.js
└── client/                 # Next.js (App Router) + Tailwind CSS + PWA Frontend (Port: 3000)
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── public/
    │   ├── icon.svg
    │   ├── manifest.json
    │   └── sw.js
    ├── next.config.mjs
    ├── package.json
    ├── postcss.config.mjs
    ├── tailwind.config.ts
    └── tsconfig.json
```

---

## Kurulum ve Çalıştırma Rehberi

### 1. Backend Sunucusunu Başlatma (`Port: 4000`)

Yeni bir terminal açın ve `server` klasörüne girip paketleri kurarak başlatın:

```bash
cd /Users/suleymanzeyyatbaba/minitemas/server
npm install
npm start
```

### 2. Frontend (Next.js PWA) Uygulamasını Başlatma (`Port: 3000`)

İkinci bir terminal açın ve `client` klasörüne girip paketleri kurarak başlatın:

```bash
cd /Users/suleymanzeyyatbaba/minitemas/client
npm install
npm run dev
```

---

## Nasıl Test Edilir? (Tek Bilgisayarda Çoklu Kullanıcı ve Menzil Testi)

1. Tarayıcınızda **`http://localhost:3000`** adresini **2 veya 3 farklı sekmede (veya pencerede)** açın.
2. Her sekmeye otomatik olarak `User_482`, `User_119` gibi rastgele bir anonim isim ve renk atanacaktır.
3. Konum izni verdiğinizde (veya **"🧪 Test Konumu ile Hemen Giriş Yap"** butonuna tıkladığınızda) aynı 100m odasında buluşursunuz ve WhatsApp grubu gibi anlık yazışabilirsiniz.
4. **Menzilden Çıkma / Girme Testi:** Sağ üstteki **🧪 (Deney Tüpü)** ikonuna tıklayarak açılan çubuktan sekmelerden birinin konumunu **`+150m (100m Dışı)`** yapın. Diğer sekmede anında **`🔴 User_XXX uzaklaştı`** sistem mesajını, tekrar **`+45m (100m İçi)`** yaptığınızda ise **`🟢 User_XXX menzile girdi (45m)`** mesajını görebilirsiniz!
