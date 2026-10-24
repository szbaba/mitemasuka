import { LangCode } from './i18n';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  effectiveDate: string;
  version: string;
  openInBrowserLabel: string;
  closeLabel: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<
  LangCode,
  { privacy: LegalDoc; terms: LegalDoc }
> = {
  tr: {
    privacy: {
      title: 'Gizlilik Politikası',
      effectiveDate: 'Yürürlük Tarihi: 24 Ekim 2026',
      version: 'Sürüm: v1.0',
      openInBrowserLabel: 'Resmi Web Sayfasında Aç',
      closeLabel: 'Kapat',
      sections: [
        {
          heading: '1. Genel Bakış',
          paragraphs: [
            'Mitemasuka ("Uygulama", "Hizmet", "biz"), yakın çevrenizdeki insanlarla aynı menzil odasında gerçek zamanlı ve geçici (ephemeral) olarak iletişim kurmanızı sağlayan konum tabanlı bir sosyal iletişim platformudur.',
            'Gizliliğiniz, Mitemasuka mimarisinin temel taşıdır: uygulamayı kullanmak için telefon numarası, e-posta adresi, ad-soyad veya şifre ile hesap oluşturmanız gerekmez.',
          ],
        },
        {
          heading: '2. İşlenen Veriler ve Kullanım Amaçları',
          paragraphs: [
            'Hizmetin çalışabilmesi için yalnızca aşağıdaki minimum teknik veriler anlık olarak işlenir:',
          ],
          bullets: [
            'Anlık Konum Bilgisi (GPS): Yalnızca açık izninizle cihazınızın anlık koordinatları alınır. Bu bilgi sadece seçtiğiniz menzildeki (100m, 500m, 1 km veya 5 km) aktif odaya bağlanmanız ve odadaki diğer kullanıcılarla aranızdaki yaklaşık mesafenin hesaplanması için kullanılır. Geçmiş konum hareketleriniz (location history) kayıt altına alınmaz ve kalıcı bir veritabanında depolanmaz.',
            'Rastgele Cihaz Kimliği ve Takma Ad (Rumuz): Kayıt zorunluluğu olmadan sohbet edebilmeniz için cihazınızda yerel ve rastgele bir oturum kimliği (clientId) ile geçici bir rumuz (ör. User_101 veya kendi belirlediğiniz takma ad) oluşturulur.',
            'Oda Mesajları ve 1-e-1 Özel Fısıltılar (Geçici İletişim): Paylaşılan mesajlar yalnızca o anda odada bulunan kullanıcılara gerçek zamanlı iletilir. 1-e-1 özel sohbetler kalıcı olarak arşivlenmez; taraflardan biri odadan ayrıldığında veya özel sohbeti sonlandırdığında oturum verisi silinir.',
            'Mikrofon ve Kamera İzinleri: Mikrofon yalnızca sesli dikte ve canlı altyazı özelliğini kullandığınızda konuşmanızı metne dönüştürmek amacıyla anlık kullanılır; sunucularımıza hiçbir ses kaydı yüklenmez. Kamera yalnızca yakın çevredeki bir odaya QR kod okutarak katılmak istediğinizde anlık tarama için kullanılır; görüntü kaydı alınmaz.',
            'Güvenlik ve Moderasyon Kayıtları: Topluluk güvenliğini sağlamak amacıyla kullanıcı bildirimleri (report), engelleme tercihleri ve küfür/kötüye kullanım filtreleme kayıtları geçici güvenlik belleğinde tutulur.',
          ],
        },
        {
          heading: '3. Veri Paylaşımı ve Üçüncü Taraf Hizmetler',
          paragraphs: [
            'Mitemasuka, kullanıcı verilerini reklam ağlarına veya veri aracılarına satmaz ve kiralamaz. Hizmetin çalışması için yalnızca şu altyapılar kullanılır:',
          ],
          bullets: [
            'Cloudflare, Inc. (Edge & Durable Objects): Gerçek zamanlı WebSocket iletişimi ve geçici oda yönlendirmesi şifreli (TLS/WSS) bağlantı üzerinden sağlanır.',
            'Anlık Çeviri Servisi: Otomatik veya manuel çeviri özelliğini kullandığınızda, yalnızca çevrilmesini istediğiniz mesaj metni dil dönüşümü amacıyla işlenir.',
            'Yasal Yükümlülükler: Yürürlükteki yasalar çerçevesinde yetkili adli makamların usulüne uygun resmi talepleri halinde yasal yükümlülükler yerine getirilir.',
          ],
        },
        {
          heading: '4. Veri Saklama Süresi ve Veri Silme / Sıfırlama Hakkı',
          paragraphs: [
            'Oda içi mesajlar ve özel sohbetler kalıcı veritabanında tutulmaz; aktif oda oturumu sona erdiğinde bellekten otomatik olarak temizlenir.',
          ],
          bullets: [
            'Cihazınızda yerel olarak tutulan rumuz, dil, tema ve engellenenler listesini uygulama verilerini temizleyerek veya uygulamayı kaldırarak istediğiniz an anında silebilirsiniz.',
            'Oturum kimliğinizle ilişkili tüm geçici sunucu kayıtlarının silinmesi için info@mitemasuka.com adresine e-posta gönderebilirsiniz; talebiniz en geç 48 saat içinde sonuçlandırılır.',
          ],
        },
        {
          heading: '5. Çocukların Gizliliği ve Yaş Sınırı',
          paragraphs: [
            'Mitemasuka, konum tabanlı anlık kullanıcı etkileşimi içerdiğinden 13 yaş ve üzeri (veya bulunduğunuz ülkedeki dijital rıza yaşı üzerindeki) kullanıcılar için tasarlanmıştır. 13 yaş altındaki bireylerden bilerek veri toplanmaz; tespiti halinde ilgili oturum derhal sonlandırılır.',
          ],
        },
        {
          heading: '6. Politika Güncellemeleri ve İletişim',
          paragraphs: [
            'Bu Gizlilik Politikası gerektiğinde güncellenebilir. Güncel metin her zaman https://mitemasuka.com/legal/privacy/ adresinde ve uygulama içi menüde yayınlanır.',
            'İletişim E-postası: info@mitemasuka.com',
          ],
        },
      ],
    },
    terms: {
      title: 'Kullanım Şartları (EULA)',
      effectiveDate: 'Yürürlük Tarihi: 24 Ekim 2026',
      version: 'Sürüm: v1.0',
      openInBrowserLabel: 'Resmi Web Sayfasında Aç',
      closeLabel: 'Kapat',
      sections: [
        {
          heading: '1. Şartların Kabulü',
          paragraphs: [
            'Mitemasuka mobil uygulamasını veya web istemcisini ("Uygulama") açarak, konum izni vererek veya herhangi bir menzil odasına katılarak işbu Kullanım Şartlarını ve Topluluk Kurallarını ("Şartlar") okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan edersiniz. Şartları kabul etmiyorsanız Uygulamayı kullanmamalısınız.',
          ],
        },
        {
          heading: '2. Hizmetin Niteliği',
          paragraphs: [
            'Mitemasuka, kullanıcıların bulundukları fiziksel konuma göre 100 metre ile 5 kilometre arasındaki menzil odalarında çevredeki diğer kişilerle yazılı mesajlaşmasını, 1-e-1 özel fısıltı göndermesini ve tek yönlü canlı anons kanallarını dinlemesini sağlayan gerçek zamanlı bir iletişim platformudur.',
          ],
        },
        {
          heading: '3. Kullanıcı Tarafından Oluşturulan İçerik (UGC) ve Sıfır Tolerans Politikası',
          paragraphs: [
            'Mitemasuka\'da paylaşılan her türlü metin, takma ad ve anonsun sorumluluğu tamamen mesajı gönderen kullanıcıya aittir. Topluluk güvenliği gereği aşağıdaki davranışlara karşı Sıfır Tolerans Politikası uygulanır:',
          ],
          bullets: [
            'Küfür, hakaret, aşağılama, nefret söylemi veya ayrımcılık içeren ifadeler,',
            'Diğer kullanıcıları taciz etmek, tehdit etmek, ısrarlı takip (stalking) veya zorbalık yapmak,',
            'Müstehcen, pornografik, şiddet içerikli veya yasa dışı paylaşımlar,',
            'Spam, dolandırıcılık, yanıltıcı bağlantı paylaşımı veya izinsiz ticari reklam,',
            'Başkalarının kişisel verilerini (telefon numarası, açık adres vb.) rızaları olmaksızın odada ifşa etmek (doxxing).',
          ],
        },
        {
          heading: '4. Otomatik Filtreleme, Bildirme (Report), Engelleme (Block) ve Karantina Sistemi',
          paragraphs: [
            'Apple App Store güvenlik standartları (Guideline 1.2) doğrultusunda Mitemasuka\'da dört katmanlı koruma mekanizması çalışır:',
          ],
          bullets: [
            'Otomatik Küfür ve Argo Filtresi: Uygunsuz kelimeler sistem tarafından gerçek zamanlı taranır ve odaya iletilmeden önce otomatik olarak maskelenir veya engellenir.',
            'Anında Kullanıcı Engelleme (Block): Herhangi bir mesajın yanındaki işlem menüsünden rahatsızlık duyduğunuz kişiyi tek dokunuşla engelleyebilirsiniz. Engellediğiniz kişinin mesajları ve özel sohbet istekleri ekranınızdan anında kaldırılır.',
            'İçerik ve Kullanıcı Bildirme (Report): Kural ihlali yapan kullanıcıları mesaj menüsündeki "Bildir / Engelle" seçeneğiyle anında raporlayabilirsiniz.',
            'Otomatik Susturma (Auto-Mute) ve 24 Saat İçinde Müdahale: Aynı odada 3 farklı kullanıcı tarafından bildirilen bir kullanıcının mesaj gönderme yetkisi sistem tarafından otomatik olarak 24 saat süreyle askıya alınır (susturulur). Bildirilen tüm ihlal kayıtları moderasyon ekibimiz tarafından en geç 24 saat içinde incelenir; ihlali doğrulanan cihaz kimlikleri platformdan kalıcı olarak uzaklaştırılır.',
          ],
        },
        {
          heading: '5. Mitemasuka Plus ve Uygulama İçi Özellikler',
          paragraphs: [
            'Uygulama; günlük mesaj kotasının kaldırılması, 500m / 1 km / 5 km geniş menzil odalarına erişim, özel rumuz belirleme ve hayalet mod (sessiz giriş) gibi ek özellikler içeren Mitemasuka Plus seçenekleri sunabilir. Tanıtım dönemlerinde bu özellikler ücretsiz olarak kullanıma açılabilir; ücretli aboneliklerin devreye alınması halinde tüm ödemeler ve iptal süreçleri ilgili uygulama mağazasının (Apple App Store / Google Play) standart abonelik kurallarına tabidir.',
          ],
        },
        {
          heading: '6. Fiziksel Güvenlik Uyarısı ve Sorumluluk Sınırı',
          paragraphs: [
            'Mitemasuka yakın çevredeki anonim kişilerle iletişim kurmanızı sağlar. Uygulama üzerinden tanıştığınız kişilerle fiziksel dünyada iletişime geçmeniz halinde kişisel güvenliğinize dikkat etmeniz, özel bilgilerinizi paylaşmamanız ve her zaman kamuya açık güvenli alanları tercih etmeniz kendi sorumluluğunuzdadır. Hizmet "olduğu gibi" (as-is) sunulmakta olup, kullanıcıların birbirlerine karşı gerçekleştirdiği eylemlerden Mitemasuka sorumlu tutulamaz.',
          ],
        },
        {
          heading: '7. Hizmet Değişiklikleri ve Fesih',
          paragraphs: [
            'Mitemasuka, topluluk kurallarını ihlal eden kullanıcıların erişimini önceden bildirimde bulunmaksızın kısıtlama veya tamamen sonlandırma hakkını saklı tutar.',
          ],
        },
        {
          heading: '8. İletişim ve Bildirim Hattı',
          paragraphs: [
            'Kullanım şartları, içerik şikâyetleri veya teknik destek talepleriniz için bize her zaman ulaşabilirsiniz:',
            'E-posta: info@mitemasuka.com · Web: https://mitemasuka.com',
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: 'Privacy Policy',
      effectiveDate: 'Effective Date: October 24, 2026',
      version: 'Version: v1.0',
      openInBrowserLabel: 'Open Official Web Page',
      closeLabel: 'Close',
      sections: [
        {
          heading: '1. Overview',
          paragraphs: [
            'Mitemasuka ("App", "Service", "we", "us") is a location-based proximity communication platform that enables real-time, ephemeral conversation with people nearby in the same range room.',
            'Privacy is the foundation of Mitemasuka: you do not need to register an account with a phone number, email address, full name, or password to use the App.',
          ],
        },
        {
          heading: '2. Data We Process and Purpose of Processing',
          paragraphs: [
            'Only the following minimal technical data is processed transiently to operate the Service:',
          ],
          bullets: [
            'Real-Time Location Data (GPS): With your explicit permission, the App accesses your device\'s current coordinates solely to connect you to the active proximity room (100m, 500m, 1 km, or 5 km) and calculate approximate distance (in meters) between participants. We do not log or store historical location tracks in any persistent database.',
            'Random Device Identifier & Nickname: To enable registration-free chat, a random local session identifier (clientId) and a temporary nickname (e.g., User_101 or a custom nickname you choose) are generated on your device.',
            'Room Messages & 1-on-1 Private Whispers (Ephemeral Communication): Messages are delivered in real time only to users currently in the room. 1-on-1 private chats are never permanently archived; when either party leaves the room or ends the private chat, the session data is erased.',
            'Microphone & Camera Permissions: The microphone is used solely on-device for live speech-to-text dictation and live broadcast captions when activated by you; no audio recordings are uploaded to or stored on our servers. The camera is used solely for scanning QR codes to join a nearby room; no images or videos are recorded.',
            'Safety & Moderation Logs: To protect community safety, user reports, block preferences, and profanity/abuse filter triggers are maintained in temporary security memory.',
          ],
        },
        {
          heading: '3. Data Sharing and Third-Party Services',
          paragraphs: [
            'Mitemasuka does not sell or rent user data to advertising networks or data brokers. Only the following infrastructure is used to provide the Service:',
          ],
          bullets: [
            'Cloudflare, Inc. (Edge & Durable Objects): Provides encrypted (TLS/WSS) real-time WebSocket routing and ephemeral room coordination.',
            'Instant Translation Service: When you use automatic or manual message translation, only the text of the message being translated is processed for language conversion.',
            'Legal Compliance: We may disclose information if strictly required by applicable law or valid legal process from competent authorities.',
          ],
        },
        {
          heading: '4. Data Retention and Your Right to Delete / Reset Data',
          paragraphs: [
            'Room messages and private whispers are not stored in permanent databases and are automatically cleared from memory when the active room session ends.',
          ],
          bullets: [
            'You can immediately erase your locally stored nickname, language, theme, and blocked user list at any time by clearing the App data or uninstalling the App.',
            'You may also request deletion of any temporary server-side session records associated with your device identifier by emailing info@mitemasuka.com; requests are completed within 48 hours.',
          ],
        },
        {
          heading: '5. Children\'s Privacy and Age Requirement',
          paragraphs: [
            'Because Mitemasuka involves location-based real-time user interaction, the Service is intended for users aged 13 and older (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect data from children under 13.',
          ],
        },
        {
          heading: '6. Policy Updates and Contact',
          paragraphs: [
            'This Privacy Policy may be updated from time to time. The latest version is always available at https://mitemasuka.com/legal/privacy/ and inside the in-app menu.',
            'Contact Email: info@mitemasuka.com',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Use (EULA)',
      effectiveDate: 'Effective Date: October 24, 2026',
      version: 'Version: v1.0',
      openInBrowserLabel: 'Open Official Web Page',
      closeLabel: 'Close',
      sections: [
        {
          heading: '1. Acceptance of Terms',
          paragraphs: [
            'By opening the Mitemasuka mobile application or web client ("App"), granting location access, or joining any proximity room, you acknowledge that you have read, understood, and agreed to be bound by these Terms of Use and Community Guidelines ("Terms"). If you do not agree to these Terms, do not use the App.',
          ],
        },
        {
          heading: '2. Description of Service',
          paragraphs: [
            'Mitemasuka is a real-time proximity communication platform that allows users to exchange text messages, send 1-on-1 private whispers, and listen to one-way live announcement channels within range rooms between 100 meters and 5 kilometers based on physical location.',
          ],
        },
        {
          heading: '3. User-Generated Content (UGC) and Zero-Tolerance Policy',
          paragraphs: [
            'Each user is solely responsible for the text, nickname, and announcements they share on Mitemasuka. To ensure community safety, we enforce a strict Zero-Tolerance Policy against objectionable content and abusive behavior, including:',
          ],
          bullets: [
            'Profanity, insults, defamation, hate speech, or discriminatory remarks,',
            'Harassment, threats, stalking, intimidation, or bullying of other users,',
            'Obscene, pornographic, sexually explicit, violent, or illegal content,',
            'Spam, scams, deceptive links, or unauthorized commercial solicitation,',
            'Publishing another person\'s private information (phone number, home address, etc.) without consent (doxxing).',
          ],
        },
        {
          heading: '4. Automated Filtering, Reporting, Blocking, and Quarantine System',
          paragraphs: [
            'In full compliance with Apple App Store Guideline 1.2 (User-Generated Content), Mitemasuka operates a four-layer protection system:',
          ],
          bullets: [
            'Automated Profanity & Abuse Filter: Objectionable words are scanned in real time and automatically masked or blocked before reaching the room.',
            'Instant User Blocking (Block): You can block any user with a single tap from the message action menu. All messages and private chat requests from a blocked user are immediately hidden from your screen.',
            'Content & User Reporting (Report): You can report any abusive user or objectionable message immediately using the "Report / Block" action on any message.',
            'Automatic Quarantine (Auto-Mute) & 24-Hour Moderation Guarantee: Any user reported by 3 different participants in a room is automatically muted for 24 hours by the system. All reports are reviewed by our moderation team within 24 hours (and immediately in cases of urgent safety threats), and offending device identifiers are permanently banned.',
          ],
        },
        {
          heading: '5. Mitemasuka Plus and In-App Features',
          paragraphs: [
            'The App may offer Mitemasuka Plus features such as unlimited daily messages, access to 500m / 1 km / 5 km extended range rooms, custom nicknames, and ghost mode (silent entry). During promotional periods, these features may be provided free of charge; when paid subscriptions are active, billing and cancellation are governed by the standard terms of your app store (Apple App Store / Google Play).',
          ],
        },
        {
          heading: '6. Physical Safety Notice and Limitation of Liability',
          paragraphs: [
            'Mitemasuka connects you with nearby anonymous individuals. You are solely responsible for exercising caution, protecting your personal information, and remaining in safe public spaces if you choose to interact in person with anyone nearby. The Service is provided "as is" without warranties of any kind.',
          ],
        },
        {
          heading: '7. Termination of Access',
          paragraphs: [
            'Mitemasuka reserves the right to restrict, mute, or permanently terminate access for any user who violates these Terms without prior notice.',
          ],
        },
        {
          heading: '8. Contact & Abuse Reporting',
          paragraphs: [
            'For legal inquiries, abuse reports, or technical support, please contact us at:',
            'Email: info@mitemasuka.com · Web: https://mitemasuka.com',
          ],
        },
      ],
    },
  },
  ja: {
    privacy: {
      title: 'プライバシーポリシー',
      effectiveDate: '発効日: 2026年10月24日',
      version: 'バージョン: v1.0',
      openInBrowserLabel: '公式Webページで開く',
      closeLabel: '閉じる',
      sections: [
        {
          heading: '1. 概要',
          paragraphs: [
            'Mitemasuka（以下「本アプリ」）は、近くにいる人と同じ距離ルーム内でリアルタイムかつ一時的（エフェメラル）に会話できる位置情報ベースのコミュニケーションプラットフォームです。',
            '電話番号、メールアドレス、氏名、パスワードによるアカウント登録は一切不要です。',
          ],
        },
        {
          heading: '2. 取得する情報と利用目的',
          paragraphs: ['サービス提供のため、以下の最小限の技術データのみを一時的に処理します：'],
          bullets: [
            '現在地情報（GPS）：ユーザーの明示的な許可がある場合にのみ、選択した範囲（100m、500m、1km、5km）のルームへの接続および参加者間の概算距離計算のために現在地を使用します。過去の移動履歴は保存されません。',
            'ランダムな端末識別子とニックネーム：登録不要で利用できるよう、端末内でランダムなセッションID（clientId）と一時的なニックネームを生成します。',
            'ルームメッセージと1対1プライベートチャット：メッセージは現在ルームにいる参加者にのみリアルタイム配信されます。1対1チャットは永続保存されず、退室または終了時に消去されます。',
            'マイクとカメラの権限：マイクは音声入力・ライブ字幕機能の使用時のみテキスト変換のために使用され、音声データはサーバーに保存されません。カメラはQRコード読み取り時のみ使用されます。',
            '安全・モデレーション記録：通報（レポート）、ブロック設定、不適切語句フィルターの記録を一時的なセキュリティメモリで管理します。',
          ],
        },
        {
          heading: '3. 第三者提供と外部サービス',
          paragraphs: ['ユーザーデータを広告ネットワークやデータブローカーに販売・貸与することはありません。'],
          bullets: [
            'Cloudflare, Inc.：暗号化されたリアルタイムWebSocket通信と一時的なルーム制御に使用します。',
            '翻訳機能：自動または手動翻訳を使用した際、対象テキストのみが翻訳処理されます。',
          ],
        },
        {
          heading: '4. データ保持期間と削除・リセット権',
          paragraphs: ['チャット内容は永続データベースに保存されず、セッション終了時に自動消去されます。アプリデータの消去または info@mitemasuka.com へのご連絡により、いつでもデータ削除を要請できます（48時間以内に対応）。'],
        },
        {
          heading: '5. 年齢制限（13歳以上）',
          paragraphs: ['本アプリは13歳以上のユーザーを対象としています。13歳未満の児童から意図的にデータを収集することはありません。'],
        },
        {
          heading: '6. お問い合わせ',
          paragraphs: ['メール: info@mitemasuka.com · URL: https://mitemasuka.com/legal/privacy/'],
        },
      ],
    },
    terms: {
      title: '利用規約 (EULA)',
      effectiveDate: '発効日: 2026年10月24日',
      version: 'バージョン: v1.0',
      openInBrowserLabel: '公式Webページで開く',
      closeLabel: '閉じる',
      sections: [
        {
          heading: '1. 規約への同意',
          paragraphs: ['Mitemasuka（以下「本アプリ」）を開き、位置情報を許可またはルームに参加することで、本利用規約およびコミュニティガイドラインに同意したものとみなされます。'],
        },
        {
          heading: '2. ユーザー生成コンテンツ（UGC）とゼロ・トレランス方針',
          paragraphs: ['投稿内容の責任は投稿者本人に帰属します。以下の行為は一切容認されません（ゼロ・トレランス）：'],
          bullets: [
            '暴言、誹謗中傷、ヘイトスピーチ、差別的表現',
            '嫌がらせ、脅迫、ストーカー行為、いじめ',
            'わいせつ、暴力的、または違法なコンテンツの共有',
            'スパム、詐欺、無断広告、他人の個人情報の晒し行為（ドクシング）',
          ],
        },
        {
          heading: '3. 自動フィルター・通報・ブロック・自動ミュート機能',
          paragraphs: ['Apple App Store ガイドライン 1.2 に準拠し、以下の4段階の安全機能を提供します：'],
          bullets: [
            '不適切語句の自動フィルタリング：不適切な言葉は送信前に自動でマスクまたはブロックされます。',
            '即時ブロック機能：不快なユーザーをワンタップでブロックし、メッセージを即座に非表示にできます。',
            '通報（レポート）機能：メッセージメニューの「通報 / ブロック」から違反ユーザーを即座に通報できます。',
            '自動ミュートと24時間以内の審査：同一ルーム内で3人の異なるユーザーから通報されたアカウントは24時間自動的に発言停止（ミュート）となります。すべての通報は24時間以内に審査され、悪質な端末IDは永久停止されます。',
          ],
        },
        {
          heading: '4. 免責事項・安全上の注意',
          paragraphs: ['周囲の匿名ユーザーとやり取りする際は、個人情報を共有せず、自身の安全に十分ご注意ください。本サービスは「現状有姿」で提供されます。'],
        },
        {
          heading: '5. お問い合わせ・違反通報窓口',
          paragraphs: ['メール: info@mitemasuka.com · Web: https://mitemasuka.com'],
        },
      ],
    },
  },
  de: {
    privacy: {
      title: 'Datenschutzerklärung',
      effectiveDate: 'Gültig ab: 24. Oktober 2026',
      version: 'Version: v1.0',
      openInBrowserLabel: 'Offizielle Webseite öffnen',
      closeLabel: 'Schließen',
      sections: [
        {
          heading: '1. Überblick',
          paragraphs: [
            'Mitemasuka („App“, „Dienst“, „wir“) ist eine standortbasierte Echtzeit-Kommunikationsplattform für temporäre (ephemere) Gespräche mit Personen in Ihrer unmittelbaren Umgebung.',
            'Für die Nutzung ist keine Registrierung mit Telefonnummer, E-Mail-Adresse, Klarnamen oder Passwort erforderlich.',
          ],
        },
        {
          heading: '2. Verarbeitete Daten und Zwecke',
          paragraphs: ['Wir verarbeiten nur minimale technische Daten vorübergehend:'],
          bullets: [
            'Echtzeit-Standort (GPS): Nur mit Ihrer ausdrücklichen Zustimmung, um Sie mit dem aktiven Raum im gewählten Radius (100m, 500m, 1 km, 5 km) zu verbinden. Es werden keine Standortverläufe dauerhaft gespeichert.',
            'Zufällige Geräte-ID & Spitzname: Auf Ihrem Gerät wird lokal eine zufällige Sitzungs-ID (clientId) und ein temporärer Rufname erzeugt.',
            'Raumnachrichten & Private 1-zu-1-Flüsternachrichten: Nachrichten werden nur in Echtzeit übermittelt und nach Sitzungsende gelöscht.',
            'Mikrofon & Kamera: Das Mikrofon wird ausschließlich für die Live-Spracheingabe verwendet (keine Speicherung von Audioaufnahmen). Die Kamera dient nur zum Scannen von Raum-QR-Codes.',
          ],
        },
        {
          heading: '3. Datenweitergabe & Löschung',
          paragraphs: [
            'Wir verkaufen keine Nutzerdaten. Die Echtzeit-Übertragung erfolgt verschlüsselt über Cloudflare Edge. Sie können lokale Daten jederzeit löschen oder per E-Mail an info@mitemasuka.com die Löschung temporärer Sitzungsdaten anfordern (Bearbeitung innerhalb von 48 Stunden).',
          ],
        },
        {
          heading: '4. Altersbeschränkung & Kontakt',
          paragraphs: [
            'Der Dienst richtet sich an Nutzer ab 13 Jahren (bzw. dem gesetzlichen Mindestalter Ihres Landes). Kontakt: info@mitemasuka.com',
          ],
        },
      ],
    },
    terms: {
      title: 'Nutzungsbedingungen (EULA)',
      effectiveDate: 'Gültig ab: 24. Oktober 2026',
      version: 'Version: v1.0',
      openInBrowserLabel: 'Offizielle Webseite öffnen',
      closeLabel: 'Schließen',
      sections: [
        {
          heading: '1. Geltungsbereich',
          paragraphs: ['Durch die Nutzung von Mitemasuka erklären Sie sich mit diesen Nutzungsbedingungen und Gemeinschaftsrichtlinien einverstanden.'],
        },
        {
          heading: '2. Null-Toleranz-Richtlinie für nutzergenerierte Inhalte (UGC)',
          paragraphs: ['Für folgende Verstöße gilt eine strikte Null-Toleranz-Politik:'],
          bullets: [
            'Beleidigungen, Hassrede, Diskriminierung oder Verleumdung,',
            'Belästigung, Bedrohung, Stalking oder Mobbing,',
            'Obszöne, pornografische, gewaltverherrlichende oder illegale Inhalte,',
            'Spam, Betrug oder die unbefugte Veröffentlichung privater Daten Dritter (Doxxing).',
          ],
        },
        {
          heading: '3. Filterung, Melden (Report), Blockieren (Block) & Automatische Stummschaltung',
          paragraphs: ['Gemäß Apple App Store Richtlinie 1.2 bietet Mitemasuka vier Schutzebenen:'],
          bullets: [
            'Automatischer Wortfilter gegen Schimpfwörter in Echtzeit.',
            'Sofortiges Blockieren störender Nutzer mit einem Fingertipp.',
            'Meldefunktion („Melden / Blockieren“) direkt an jeder Nachricht.',
            'Automatische 24h-Stummschaltung ab 3 Meldungen verschiedener Nutzer im Raum sowie Prüfung aller Meldungen innerhalb von 24 Stunden.',
          ],
        },
        {
          heading: '4. Haftungsausschluss & Kontakt',
          paragraphs: ['Die Nutzung erfolgt auf eigene Verantwortung. Kontakt & Beschwerden: info@mitemasuka.com'],
        },
      ],
    },
  },
  es: {
    privacy: {
      title: 'Política de Privacidad',
      effectiveDate: 'Fecha de entrada en vigor: 24 de octubre de 2026',
      version: 'Versión: v1.0',
      openInBrowserLabel: 'Abrir página web oficial',
      closeLabel: 'Cerrar',
      sections: [
        {
          heading: '1. Descripción general',
          paragraphs: [
            'Mitemasuka ("la Aplicación") es una plataforma de comunicación efímera y en tiempo real basada en la proximidad. No requiere registro con número de teléfono, correo electrónico, nombre real ni contraseña.',
          ],
        },
        {
          heading: '2. Datos procesados',
          paragraphs: ['Solo procesamos de forma transitoria los datos mínimos necesarios:'],
          bullets: [
            'Ubicación en tiempo real (GPS): Únicamente con su permiso explícito para conectarle a la sala de proximidad (100m, 500m, 1 km, 5 km). No almacenamos historial de ubicaciones.',
            'Identificador aleatorio y apodo: Se genera localmente un clientId aleatorio y un apodo temporal.',
            'Mensajes y susurros privados 1 a 1: Los mensajes son efímeros y no se archivan permanentemente.',
            'Micrófono y cámara: El micrófono solo se usa para dictado por voz en vivo (sin guardar grabaciones). La cámara solo se usa para escanear códigos QR.',
          ],
        },
        {
          heading: '3. Eliminación de datos y contacto',
          paragraphs: [
            'No vendemos datos a terceros. Puede borrar sus datos locales en cualquier momento o solicitar la eliminación de registros temporales escribiendo a info@mitemasuka.com (respuesta en 48 horas). Servicio para mayores de 13 años.',
          ],
        },
      ],
    },
    terms: {
      title: 'Términos de Uso (EULA)',
      effectiveDate: 'Fecha de entrada en vigor: 24 de octubre de 2026',
      version: 'Versión: v1.0',
      openInBrowserLabel: 'Abrir página web oficial',
      closeLabel: 'Cerrar',
      sections: [
        {
          heading: '1. Aceptación de los Términos',
          paragraphs: ['Al utilizar Mitemasuka usted acepta estos Términos de Uso y Normas de la Comunidad.'],
        },
        {
          heading: '2. Política de Tolerancia Cero (Contenido Generado por Usuarios)',
          paragraphs: ['Está estrictamente prohibido publicar contenido ofensivo o abusivo:'],
          bullets: [
            'Insultos, discurso de odio, discriminación o difamación,',
            'Acoso, amenazas, intimidación o bullying,',
            'Contenido obsceno, pornográfico, violento o ilegal,',
            'Spam, fraude o divulgación de datos privados de terceros (doxxing).',
          ],
        },
        {
          heading: '3. Filtro automático, Reporte, Bloqueo y Silencio Automático',
          paragraphs: ['En cumplimiento con la directriz 1.2 de Apple App Store:'],
          bullets: [
            'Filtro automático de lenguaje inapropiado en tiempo real.',
            'Bloqueo instantáneo de usuarios molestos con un solo toque.',
            'Botón de reporte ("Reportar / Bloquear") en cada mensaje.',
            'Silencio automático por 24 horas al recibir 3 reportes de distintos usuarios en la sala y revisión de reportes en menos de 24 horas.',
          ],
        },
        {
          heading: '4. Contacto',
          paragraphs: ['Soporte y reportes: info@mitemasuka.com · https://mitemasuka.com'],
        },
      ],
    },
  },
  fr: {
    privacy: {
      title: 'Politique de Confidentialité',
      effectiveDate: 'Date d’entrée en vigueur : 24 octobre 2026',
      version: 'Version : v1.0',
      openInBrowserLabel: 'Ouvrir la page web officielle',
      closeLabel: 'Fermer',
      sections: [
        {
          heading: '1. Présentation',
          paragraphs: [
            'Mitemasuka (« l’Application ») est une plateforme de communication de proximité éphémère en temps réel. Aucune inscription avec numéro de téléphone, adresse e-mail, nom réel ou mot de passe n’est requise.',
          ],
        },
        {
          heading: '2. Données traitées',
          paragraphs: ['Seules les données techniques minimales suivantes sont traitées de manière transitoire :'],
          bullets: [
            'Position en temps réel (GPS) : Uniquement avec votre autorisation explicite pour vous connecter au salon de proximité (100m, 500m, 1 km, 5 km). Aucun historique de déplacement n’est conservé.',
            'Identifiant aléatoire et pseudo : Un identifiant local (clientId) et un pseudo temporaire sont générés sur votre appareil.',
            'Messages et chuchotements privés 1-à-1 : Les discussions sont éphémères et supprimées à la fin de la session.',
            'Microphone et caméra : Le microphone sert uniquement à la dictée vocale instantanée (aucun enregistrement stocké). La caméra sert uniquement à scanner les QR codes.',
          ],
        },
        {
          heading: '3. Suppression des données et contact',
          paragraphs: [
            'Aucune donnée n’est vendue à des tiers. Vous pouvez réinitialiser vos données locales à tout moment ou écrire à info@mitemasuka.com (traitement sous 48h). Application réservée aux personnes âgées de 13 ans et plus.',
          ],
        },
      ],
    },
    terms: {
      title: 'Conditions d’Utilisation (EULA)',
      effectiveDate: 'Date d’entrée en vigueur : 24 octobre 2026',
      version: 'Version : v1.0',
      openInBrowserLabel: 'Ouvrir la page web officielle',
      closeLabel: 'Fermer',
      sections: [
        {
          heading: '1. Acceptation des Conditions',
          paragraphs: ['En utilisant Mitemasuka, vous acceptez les présentes Conditions d’Utilisation et Règles de la Communauté.'],
        },
        {
          heading: '2. Tolérance Zéro (Contenu Généré par les Utilisateurs)',
          paragraphs: ['Nous appliquons une politique de tolérance zéro contre tout comportement abusif :'],
          bullets: [
            'Insultes, discours haineux, discrimination ou diffamation,',
            'Harcèlement, menaces, intimidation ou cyberharcèlement,',
            'Contenu obscène, pornographique, violent ou illégal,',
            'Spam, escroquerie ou divulgation d’informations personnelles d’autrui (doxxing).',
          ],
        },
        {
          heading: '3. Filtrage, Signalement, Blocage et Mise en sourdine automatique',
          paragraphs: ['Conformément à la directive 1.2 de l’Apple App Store :'],
          bullets: [
            'Filtre automatique anti-injures en temps réel.',
            'Blocage instantané de tout utilisateur indésirable en un geste.',
            'Signalement immédiat via le menu « Signaler / Bloquer » sur chaque message.',
            'Mise en sourdine automatique de 24h dès 3 signalements distincts dans le salon et examen par notre équipe sous 24 heures.',
          ],
        },
        {
          heading: '4. Contact',
          paragraphs: ['Contact et signalements : info@mitemasuka.com · https://mitemasuka.com'],
        },
      ],
    },
  },
  ru: {
    privacy: {
      title: 'Политика конфиденциальности',
      effectiveDate: 'Дата вступления в силу: 24 октября 2026 г.',
      version: 'Версия: v1.0',
      openInBrowserLabel: 'Открыть официальную веб-страницу',
      closeLabel: 'Закрыть',
      sections: [
        {
          heading: '1. Общие положения',
          paragraphs: [
            'Mitemasuka («Приложение») — это платформа для мгновенного временного общения с людьми поблизости. Для использования не требуется регистрация по номеру телефона, электронной почте, имени или паролю.',
          ],
        },
        {
          heading: '2. Обрабатываемые данные',
          paragraphs: ['Мы временно обрабатываем только минимальные технические данные:'],
          bullets: [
            'Текущая геопозиция (GPS): Используется только с вашего согласия для подключения к комнате выбранного радиуса (100м, 500м, 1 км, 5 км). История перемещений не сохраняется.',
            'Случайный ID устройства и никнейм: Локально создается случайный идентификатор (clientId) и временный псевдоним.',
            'Сообщения и личный шепот 1-на-1: Сообщения передаются в реальном времени и не архивируются в постоянной базе данных.',
            'Микрофон и камера: Микрофон используется только для голосового ввода текста (аудиозаписи не сохраняются). Камера используется только для сканирования QR-кодов.',
          ],
        },
        {
          heading: '3. Удаление данных и контакты',
          paragraphs: [
            'Мы не продаем данные третьим лицам. Вы можете очистить локальные данные в любой момент или запросить удаление сессионных данных по адресу info@mitemasuka.com (в течение 48 часов). Возрастное ограничение: 13+.',
          ],
        },
      ],
    },
    terms: {
      title: 'Условия использования (EULA)',
      effectiveDate: 'Дата вступления в силу: 24 октября 2026 г.',
      version: 'Версия: v1.0',
      openInBrowserLabel: 'Открыть официальную веб-страницу',
      closeLabel: 'Закрыть',
      sections: [
        {
          heading: '1. Принятие условий',
          paragraphs: ['Используя Mitemasuka, вы соглашаетесь с настоящими Условиями использования и Правилами сообщества.'],
        },
        {
          heading: '2. Политика нулевой терпимости (UGC)',
          paragraphs: ['Строго запрещены следующие действия:'],
          bullets: [
            'Оскорбления, нецензурная лексика, разжигание ненависти и дискриминация,',
            'Преследование, угрозы, травля (буллинг) других пользователей,',
            'Непристойный, порнографический, жестокий или незаконный контент,',
            'Спам, мошенничество и публикация чужих личных данных без согласия.',
          ],
        },
        {
          heading: '3. Фильтрация, жалобы, блокировка и авто-мут',
          paragraphs: ['В соответствии с требованиями Apple App Store (п. 1.2):'],
          bullets: [
            'Автоматический фильтр нецензурной лексики в реальном времени.',
            'Мгновенная блокировка нежелательных пользователей в одно касание.',
            'Кнопка «Пожаловаться / Заблокировать» в меню каждого сообщения.',
            'Автоматическая блокировка отправки сообщений на 24 часа при жалобах от 3 разных участников комнаты и проверка всех жалоб модераторами в течение 24 часов.',
          ],
        },
        {
          heading: '4. Контакты',
          paragraphs: ['Поддержка и жалобы: info@mitemasuka.com · https://mitemasuka.com'],
        },
      ],
    },
  },
  ar: {
    privacy: {
      title: 'سياسة الخصوصية',
      effectiveDate: 'تاريخ السريان: 24 أكتوبر 2026',
      version: 'الإصدار: v1.0',
      openInBrowserLabel: 'فتح الصفحة الرسمية',
      closeLabel: 'إغلاق',
      sections: [
        {
          heading: '1. نظرة عامة',
          paragraphs: [
            'تطبيق Mitemasuka ("التطبيق") هو منصة تواصل فوري ومؤقت تعتمد على القرب الجغرافي. لا يتطلب التطبيق إنشاء حساب برقم هاتف أو بريد إلكتروني أو اسم حقيقي أو كلمة مرور.',
          ],
        },
        {
          heading: '2. البيانات التي تتم معالجتها',
          paragraphs: ['تتم معالجة الحد الأدنى فقط من البيانات التقنية بشكل مؤقت:'],
          bullets: [
            'الموقع الجغرافي الفوري (GPS): يُستخدم فقط بإذن صريح منك للاتصال بغرفة النطاق المحدد (100م، 500م، 1 كم، 5 كم). لا يتم حفظ سجل تحركاتك.',
            'معرّف الجهاز العشوائي واللقب: يتم إنشاء معرّف جلسة عشوائي (clientId) ولقب مؤقت محلياً على جهازك.',
            'رسائل الغرفة والمحادثات الخاصة (1 إلى 1): الرسائل مؤقتة ولا يتم أرشفتها بشكل دائم؛ وتُحذف فور انتهاء الجلسة.',
            'الميكروفون والكاميرا: يُستخدم الميكروفون فقط للإملاء الصوتي الفوري وتحويل الكلام إلى نص دون حفظ أي تسجيلات صوتية. تُستخدم الكاميرا فقط لمسح رمز QR.',
          ],
        },
        {
          heading: '3. حذف البيانات والتواصل',
          paragraphs: [
            'نحن لا نبيع بيانات المستخدمين لأي طرف ثالث. يمكنك مسح بياناتك المحلية في أي وقت أو طلب حذف سجلات الجلسة المؤقتة عبر البريد info@mitemasuka.com (خلال 48 ساعة). التطبيق مخصص لمن هم بعمر 13 عاماً فأكثر.',
          ],
        },
      ],
    },
    terms: {
      title: 'شروط الاستخدام (EULA)',
      effectiveDate: 'تاريخ السريان: 24 أكتوبر 2026',
      version: 'الإصدار: v1.0',
      openInBrowserLabel: 'فتح الصفحة الرسمية',
      closeLabel: 'إغلاق',
      sections: [
        {
          heading: '1. قبول الشروط',
          paragraphs: ['باستخدامك لتطبيق Mitemasuka، فإنك توافق على شروط الاستخدام وقواعد المجتمع هذه.'],
        },
        {
          heading: '2. سياسة عدم التسامح مطلقاً (محتوى المستخدمين UGC)',
          paragraphs: ['يُحظر تماماً نشر أي محتوى مسيء أو مخالف، بما في ذلك:'],
          bullets: [
            'الشتائم أو الإهانات أو خطاب الكراهية أو التمييز،',
            'المضايقة أو التهديد أو التنمر على المستخدمين الآخرين،',
            'المحتوى الإباحي أو العنيف أو غير القانوني،',
            'الرسائل المزعجة (Spam) أو الاحتيال أو نشر البيانات الشخصية للآخرين دون إذن.',
          ],
        },
        {
          heading: '3. الفلترة التلقائية والإبلاغ والحظر والكتم التلقائي',
          paragraphs: ['وفقاً لمعايير Apple App Store (البند 1.2):'],
          bullets: [
            'فلتر تلقائي للكلمات المسيئة في الوقت الفعلي.',
            'حظر فوري لأي مستخدم مزعج بلمسة واحدة.',
            'ميزة "إبلاغ / حظر" متاحة في قائمة كل رسالة.',
            'كتم تلقائي لمدة 24 ساعة عند تلقي 3 بلاغات من مستخدمين مختلفين في الغرفة، ومراجعة جميع البلاغات خلال 24 ساعة.',
          ],
        },
        {
          heading: '4. التواصل',
          paragraphs: ['للدعم والإبلاغ: info@mitemasuka.com · https://mitemasuka.com'],
        },
      ],
    },
  },
};
