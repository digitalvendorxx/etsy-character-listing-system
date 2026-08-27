# Etsy Character Listing System

Bu depo, yeni bir Etsy mağazası için aynı görsel düzeni koruyup yalnızca ana karakteri ve ürün metinlerini değiştirerek ilan görselleri üretir. Ürünleri yerelde doğrular, 1200×1500 kapak görsellerini hazırlar ve açık onayla Etsy'de **taslak** ilan oluşturur.

Sistem Etsy'de ilan yayınlamaz veya etkinleştirmez. Son kontrol ve yayınlama her zaman Etsy arayüzünde elle yapılır.

## Güvenlik sınırı

- GitHub deposu **private** tutulmalıdır.
- `.env`, Etsy tokenları, mağaza kimliğine özel yerel ayarlar, özel karakter görseli, galeri görselleri ve üretilen `output/` dosyaları Git'e girmez.
- Taslak oluşturma; `--apply`, tam mağaza ID'si ve elle incelenmiş paketin `reviewHash` değeri olmadan çalışmaz.
- Oturum açılmış Etsy mağazasının ID'si beklenen ID ile aynı değilse işlem durur.
- Karakter, düzen, katalog, ürün veya incelenmiş ana görsel değişirse eski onay geçersiz olur.
- Eski mağazaya ait satış, puan, hız veya sonuç iddiaları yeni mağazaya taşınmaz.

## Akış

```text
özel karakter + mağaza ayarı + ürün kataloğu
                       │
              validate / plan
                       │
              render / package
                       │
     contact sheet + review-manifest.json
                       │
                 elle inceleme
                       │
   upload-draft + exact shop ID + review hash
                       │
              Etsy taslak ilanları
                       │
          Etsy arayüzünde elle yayınlama
```

## Hızlı başlangıç

Node.js 20 veya üzeri gerekir.

```bash
npm install
npx playwright install chromium
cp .env.example .env
cp config/shop.example.json config/shop.local.json
cp config/products.example.json config/products.local.json
mkdir -p local-assets/gallery
```

Ardından:

1. Onaylı 1200×1500 karakter görselini `local-assets/` altına koyun.
2. `npm run character:inspect -- --file local-assets/base-character.png` ile boyut ve SHA-256 değerini doğrulayıp hash'i `config/shop.local.json` içindeki `characterSha256` alanına yazın.
3. Yeni mağazanın `expectedShopId`, `brandName`, `taxonomyId` ve gerekli ilan varsayılanlarını doldurun.
4. `.env` içine yeni mağaza için kullanılan Etsy uygulama bilgilerini yazın.
5. Ürünleri `config/products.local.json` içinde düzenleyin.

İlk yerel kontrol:

```bash
npm run validate -- --profile config/shop.local.json --catalog config/products.local.json
npm run plan -- --profile config/shop.local.json --catalog config/products.local.json --products all
npm run package -- --profile config/shop.local.json --catalog config/products.local.json --products all
```

Bu üç komut Etsy'ye yazmaz. Üretilen dosyalar `output/<magaza-slug>/` altında kalır ve Git tarafından yok sayılır.

Yeni bilgisayar kurulumu için [docs/NEW_PC_SETUP.md](docs/NEW_PC_SETUP.md), karakter değiştirmek için [docs/CHARACTER_ONBOARDING.md](docs/CHARACTER_ONBOARDING.md), taslak yükleme adımları için [docs/PUBLISHING.md](docs/PUBLISHING.md) belgesini izleyin.

## Komutlar

| Komut | Ne yapar | Etsy'ye yazar mı? |
|---|---|---:|
| `npm run validate -- [argümanlar]` | Ayarları, karakter hash'ini ve katalog kurallarını doğrular | Hayır |
| `npm run plan -- [argümanlar]` | Seçilecek ürünleri ve planı gösterir | Hayır |
| `npm run render -- [argümanlar]` | Sabit düzende ana kapak görsellerini üretir | Hayır |
| `npm run package -- [argümanlar]` | Görselleri, contact sheet'i ve onay manifestini üretir | Hayır |
| `npm run character:inspect -- --file <dosya>` | Karakterin gerçek boyutunu ve SHA-256 değerini gösterir | Hayır |
| `npm run auth` | Etsy OAuth yetkilendirmesini yerelde tamamlar | İlan yazmaz |
| `npm run whoami` | Yetkilendirilmiş Etsy hesabı/mağazasını gösterir | Hayır |
| `npm run etsy:draft -- [argümanlar]` | Yalnızca açık onaylanan ürünleri taslak olarak oluşturur | Evet, yalnız taslak |
| `npm test` | Otomatik testleri çalıştırır | Hayır |
| `npm run security:scan` | Commitlenebilir dosyalarda sır ve özel veri kalıbı arar | Hayır |

Ortak argümanlar:

```text
--profile <shop.local.json>
--catalog <products.local.json>
--products all|urun-id[,urun-id]
```

`etsy:draft` ayrıca şu dört zorunlu korumayı ister:

```text
--apply
--expected-shop-id <sayisal-magaza-id>
--review-file <review-manifest.json>
--review-hash <64-karakter-sha256>
```

Bu projede `activate`, `publish` veya benzeri otomatik yayın komutu yoktur.

## Dizinler

| Yol | Amaç | Git durumu |
|---|---|---|
| `config/*.example.json` | Paylaşılabilir şablonlar | Commitlenir |
| `config/*.local.json` | Gerçek mağaza ve ürün ayarları | Commitlenmez |
| `assets/example-character.svg` | Paylaşılabilir örnek yer tutucu | Commitlenir |
| `local-assets/` | Özel karakter ve galeri görselleri | Commitlenmez |
| `output/` | Üretilmiş kapaklar ve inceleme paketi | Commitlenmez |
| `.runtime/` | OAuth tokenı ve taslak işlem durumu | Commitlenmez |

Teknik tasarım ve bütünlük zinciri için [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) belgesine bakın.
