# Mimari ve bütünlük modeli

## Amaç

Sistem, mağazaya özel gizli varlıkları kaynak koddan ayırırken tekrar kullanılabilir bir ürün-kapak hattı sağlar. Sabit olan bölüm yerleşimdir; mağazaya göre ana karakter, mağaza profili ve ürün kataloğu değişir.

Temel sınır şudur:

```text
Git'teki paylaşılabilir kaynak
  + Git dışındaki mağaza profili
  + Git dışındaki karakter/galeri varlıkları
  + Git dışındaki Etsy kimlik bilgileri
                    │
                    ▼
          deterministik yerel paket
                    │
             insan incelemesi
                    │
                    ▼
          Etsy API: yalnız draft
                    │
                    ▼
          Etsy UI: elle yayınlama
```

## Bileşenler

| Dosya | Sorumluluk |
|---|---|
| `src/config.js` | Profil/katalog okuma, şema ve içerik kuralları, karakter hash'i, ürün seçimi |
| `src/layout.js` | Sürümü kilitli 1200×1500 HTML/CSS kapak düzeni ve güvenli metin kaçışlama |
| `src/fonts.js` | Anton ve Oswald fontlarını yerel `.runtime/fonts/` önbelleğine alma |
| `src/renderer.js` | Karakter boyutu kontrolü, kapak render'ı, contact sheet, review manifest ve dosya hash doğrulaması |
| `src/etsy-client.js` | PKCE OAuth, token yenileme, exact-shop kontrolü, draft oluşturma, görsel/personalization yükleme, API doğrulaması |
| `src/cli.js` | Salt-okunur komutlar ile açık yazma komutunun terminal arayüzü |
| `scripts/scan-secrets.mjs` | Commitlenebilir kaynakta sır ve özel veri kalıbı taraması |

## Yapılandırma katmanları

### Paylaşılabilir şablonlar

```text
config/shop.example.json
config/products.example.json
assets/example-character.svg
.env.example
```

Bu dosyalar gerçek kimlik bilgisi veya özel mağaza varlığı içermez.

### Yerel mağaza verisi

```text
.env
config/shop.local.json
config/products.local.json
local-assets/
```

`.gitignore` varsayılan-red yaklaşımı kullanır. Yalnız bilinen kaynak klasörleri allowlist ile Git'e açılır; yerel mağaza verisi ayrıca açıkça yok sayılır.

### Üretilen ve çalışma zamanı verisi

```text
output/<slug>/
.runtime/etsy-token.json
.runtime/<slug>/draft-state.json
.runtime/fonts/
```

Bunlar da Git'e girmez. Token ve durum JSON'ları oluşturulurken özel dosya izinleriyle yazılır.

## Sabit yerleşim

Tek desteklenen sürüm `reading-1200x1500-v1` değeridir.

| Parça | Geometri |
|---|---|
| Tuval/karakter | `1200×1500`, tam kaplama |
| Üst bant | `x=185, y=24, w=833, h=122` |
| Metin paneli | `x=120, y=500, w=960, h=660` |
| Birinci ana satır | panel içinde `y=48, h=145` |
| İkinci ana satır | panel içinde `y=245, h=145` |
| Beş yıldız | panel içinde `y=405, h=95` |
| Alt başlık | panel içinde `y=505, h=78` |

Karakterin kendisi ürün bazında değiştirilmez; bir mağaza profilinin tek `characterAsset` ve `characterSha256` değeri bütün seçili ürünlere uygulanır.

## İnceleme manifesti

`package` çıktısındaki `review-manifest.json` aşağıdaki bağları kaydeder:

- Mağaza slug'ı, beklenen mağaza ID'si, marka adı ve profil SHA-256'sı
- Katalog sürümü ve katalog SHA-256'sı
- Düzen sürümü ve bütün koordinatlar
- Karakter dosya yolu, SHA-256'sı ve 1200×1500 boyutu
- Her seçili ürünün ID, SKU, başlık, fiyat, etiket ve ürün SHA-256'sı
- Her üretilmiş ana kapağın yolu, SHA-256'sı ve boyutu
- Her ek galeri görselinin sırası, yolu, byte boyutu ve SHA-256'sı
- Contact sheet yolu ve SHA-256'sı
- Bütün bu alanlardan hesaplanan üst seviye `reviewHash`

Yalnız `reviewHash` alanının kendisi hesaplamanın dışında bırakılır. `createdAt` dahil paketteki diğer bütün alanlar hash'e dahildir; manifestteki herhangi bir değişiklik onayı geçersiz kılar.

Yükleme öncesinde manifestin kendi hash'i; ana kapak, galeri ve contact sheet dosyalarının güncel byte hash'leri tekrar doğrulanır. Katalogdaki ürün nesnesi de incelemedeki ürün hash'iyle karşılaştırılır.

Ek galeri görsellerinin hem yolları hem dosya hash'leri pinlenir. Contact sheet yalnız ana kapakları gösterdiği için galeri dosyaları yine de yüklemeden hemen önce ayrıca elle incelenmelidir.

## Etsy yazma kapısı

Yerel komutlar `validate`, `plan`, `render` ve `package` Etsy API'sine yazmaz. Etsy'ye yazan tek komut `etsy:draft` komutudur ve şu koşulların tümünü ister:

1. Açık `--apply` bayrağı.
2. Profildeki değerle birebir eşleşen pozitif `--expected-shop-id`.
3. Okunabilen ve iç hash'i doğru `--review-file`.
4. Manifestteki değerle birebir eşleşen `--review-hash`.
5. Değişmemiş profil, katalog, karakter, düzen, ürün, ana kapak, galeri ve contact sheet.
6. Etsy `/users/me` sonucunda eşleşen gerçek mağaza ID'si.
7. Aynı başlıkta mevcut draft, inactive veya active ilan bulunmaması.

Taslak oluşturulduktan sonra API sonucu şu özelliklerle doğrulanır:

- `shop_id` beklenen mağazadır.
- `state` tam olarak `draft` değeridir.
- Başlık beklenen başlıktır.
- Açıklama, 13 etiket, fiyat ve kişiselleştirme talimatı beklenen değerlerdir.
- Görsel sayısı ve sıraları tam olarak beklenen seti oluşturur; ana kapak 4:5 oranındadır.

Sistemde active state gönderen, ilanı yayınlayan veya etkinleştiren kod yolu yoktur.

## Durum ve idempotency

`.runtime/<slug>/draft-state.json`, ürün ID'sini Etsy listing ID'siyle eşler ve işlem aşamalarını kaydeder:

```text
create_attempting → draft_created → draft_verified
```

Bu kayıt kısmi hata sonrasında yeni bir ilan açmak yerine bilinen taslakla devam etmeye yardım eder. Mevcut başlık taraması da açık mükerrerliği engeller. Belirsiz bir hata halinde state dosyasını silmek güvenli bir çözüm değildir; önce Etsy'deki gerçek ilanla uzlaştırma gerekir.

Durum mağaza ID'sine; her paket de review hash, karakter hash'i, katalog hash/sürümü ve düzen sürümüne pinlenir. Her ürün kendi review ve ürün hash'ini taşır. Sonradan eklenen yeni ürünler yeni bir paketle ilerleyebilir; daha önce doğrulanmış ve değişmemiş ürünler yeniden yazılmadan atlanır. Aynı ürünün çelişen bir paketle değiştirilmesi istendiğinde sistem fail-closed durur ve manuel uzlaştırma ister.

## Ağ erişimi

- İlk render: font dosyalarını Google Fonts GitHub deposundan indirir.
- `auth`: Etsy OAuth sayfasını açar ve localhost callback sunucusunu kısa süreli çalıştırır.
- `whoami` ve `etsy:draft`: Etsy Open API'ye bağlanır.
- Diğer yerel komutların Etsy yazma yetkisi yoktur.

## Bilinçli olarak kapsam dışı

- Etsy'de otomatik yayınlama veya aktivasyon
- Sipariş işleme, müşteri mesajları veya müşteri verisi
- Eski mağaza ilanlarını, satış kanıtını veya değerlendirmeleri kopyalama
- Özel karakteri ya da üretilmiş görselleri GitHub'da saklama
- Galeri görsellerinin mevcut contact sheet içinde gösterilmesi
- Yanlış mağaza ID'sini otomatik tahmin etme veya düzeltme

Bu sınırlar taşınabilirliği korurken yanlış mağazaya yazma ve incelenmemiş içeriği yayınlama riskini azaltır.
