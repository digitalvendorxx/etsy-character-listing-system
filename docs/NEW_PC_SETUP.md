# Yeni bilgisayarda kurulum

Bu kurulum her yeni bilgisayarda temiz yapılır. Eski bilgisayardaki `.env`, `.runtime/`, tarayıcı profili, müşteri/sipariş verisi veya `output/` klasörü GitHub'a taşınmaz.

## 1. Gerekenler

- Git
- Node.js 20 veya üzeri
- İnternet erişimi
- Yeni mağazaya erişebilen Etsy hesabı
- Etsy Open API uygulamasının keystring bilgisi ve gerekiyorsa shared secret değeri
- Etsy uygulamasında izin verilmiş `http://localhost:3000/callback` yönlendirme adresi

Sürüm kontrolü:

```bash
git --version
node --version
npm --version
```

## 2. Private depoyu klonlayın

GitHub deposunun görünürlüğü **Private** olmalıdır.

```bash
git clone <PRIVATE_REPOSITORY_URL>
cd etsy-character-listing-system
npm install
npx playwright install chromium
```

Linux'ta Chromium sistem paketleri eksikse şu komut gerekebilir:

```bash
npx playwright install --with-deps chromium
```

İlk render sırasında Anton ve Oswald fontları Google Fonts deposundan `.runtime/fonts/` altına indirilir. Bu klasör paylaşılmaz.

## 3. Yerel dosyaları oluşturun

macOS veya Linux:

```bash
cp .env.example .env
cp config/shop.example.json config/shop.local.json
cp config/products.example.json config/products.local.json
mkdir -p local-assets/gallery
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item config/shop.example.json config/shop.local.json
Copy-Item config/products.example.json config/products.local.json
New-Item -ItemType Directory -Force local-assets/gallery
```

Bu dosyaların ve `local-assets/` klasörünün Git tarafından yok sayıldığını kontrol edin:

```bash
git status --short --ignored
```

`.env`, `config/*.local.json`, `local-assets/`, `.runtime/` ve `output/` hiçbir zaman commitlenmemelidir.

## 4. Karakteri yerleştirin

Onaylı ana karakter görselini örneğin şu yola koyun:

```text
local-assets/base-character.png
```

Görsel tam olarak 1200×1500 piksel olmalıdır. Desteklenen ana karakter biçimleri PNG, JPG/JPEG, WebP ve SVG'dir.

Boyutu ve hash'i tek komutla kontrol edin:

```bash
npm run character:inspect -- --file local-assets/base-character.png
```

macOS veya Linux'ta hash:

```bash
shasum -a 256 local-assets/base-character.png
```

Windows PowerShell'de hash:

```powershell
(Get-FileHash local-assets/base-character.png -Algorithm SHA256).Hash.ToLower()
```

`config/shop.local.json` içinde:

```json
{
  "characterAsset": "local-assets/base-character.png",
  "characterSha256": "hesaplanan-64-karakter-kucuk-harfli-sha256"
}
```

Ayrıntılar için [CHARACTER_ONBOARDING.md](CHARACTER_ONBOARDING.md) belgesini kullanın.

## 5. Mağaza profilini doldurun

`config/shop.local.json` içinde en az şu alanları yeni mağazaya göre değiştirin:

- `slug`: yalnız küçük harf, sayı ve tire; çıktı klasörünü de belirler.
- `expectedShopId`: yeni Etsy mağazasının sayısal ID'si.
- `brandName`: yeni mağazanın gerçek marka adı.
- `characterAsset` ve `characterSha256`: bir önceki adımın değerleri.
- `listingDefaults.taxonomyId`: ürün türü için geçerli Etsy taxonomy ID'si.
- Gerekliyse `shippingProfileId`, `returnPolicyId` ve `readinessStateId`.

Örnek dosyadaki `expectedShopId: 0` ve `taxonomyId: 0` yükleme için bilinçli olarak geçersizdir. Gerçek değerleri doğrulamadan taslak yükleme denemeyin.

## 6. Ürün kataloğunu düzenleyin

`config/products.local.json` içindeki örnekleri yeni mağazanın tekliflerine göre değiştirin. Her ürün için önemli kurallar:

- Benzersiz `id` ve `sku`
- 20–140 karakter başlık
- En az 180 karakter açıklama
- Tam 13 adet, benzersiz ve en fazla 20 karakterlik Etsy etiketi
- Pozitif fiyat
- En az 30 karakter kişiselleştirme talimatı
- Kapakta tam iki başlık satırı; her satır en fazla 24 karakter
- `#RRGGBB` biçiminde vurgu rengi
- Ek görseller varsa yalnız `local-assets/gallery/...` yolları

Eski mağazanın satış sayısı, puanı, müşteri yorumu, teslim süresi veya sonuç vaadini kopyalamayın. Yeni mağazada doğrulanmamış hiçbir iddia kullanmayın.

## 7. Etsy uygulama bilgilerini girin

`.env` dosyası örneği:

```dotenv
ETSY_KEYSTRING=
ETSY_SHARED_SECRET=
ETSY_REDIRECT_URI=http://localhost:3000/callback
ETSY_SCOPES=listings_r,listings_w,shops_r
SHOP_PROFILE=config/shop.local.json
PRODUCT_CATALOG=config/products.local.json
```

İlk iki boş değeri yalnız yerel `.env` dosyasında gerçek bilgilerle doldurun. Bu dosyayı terminal çıktısına, ekran görüntüsüne, destek mesajına veya Git'e koymayın.

## 8. Yerel doğrulama yapın

```bash
npm run validate -- --profile config/shop.local.json --catalog config/products.local.json
npm run plan -- --profile config/shop.local.json --catalog config/products.local.json --products all
npm run render -- --profile config/shop.local.json --catalog config/products.local.json --products all
npm test
npm run security:scan
```

`validate` ve `render`, karakter boyutunu gerçekten açıp kontrol eder. Boyut 1200×1500 değilse işlem durur. `validate`, `plan` ve `render` Etsy'ye yazmaz.

## 9. Etsy'ye bağlanın

```bash
npm run auth
npm run whoami
```

`auth`, tarayıcıda Etsy izin ekranını açar ve callback'i yerelde bekler. Token `.runtime/etsy-token.json` altında tutulur ve commitlenmez.

`whoami` sonucundaki mağaza ID'sini `config/shop.local.json` içindeki `expectedShopId` ile rakam rakam karşılaştırın. Eşleşmiyorsa devam etmeyin; doğru Etsy hesabıyla yeniden yetkilendirin.

## 10. İlk inceleme paketini hazırlayın

```bash
npm run package -- --profile config/shop.local.json --catalog config/products.local.json --products all
```

Şunları elle inceleyin:

- `output/<slug>/contact-sheet.png`
- `output/<slug>/<urun-id>/thumbnail.jpg`
- `output/<slug>/review-manifest.json`
- Katalogdaki başlık, açıklama, fiyat, etiket ve kişiselleştirme metinleri
- Kullanılan ek galeri görselleri

Taslak oluşturma adımları [PUBLISHING.md](PUBLISHING.md) belgesindedir. Sistem taslağı Etsy'ye yükledikten sonra bile yayınlama Etsy arayüzünde elle yapılır.

## Sorun giderme

### `character hash mismatch`

Karakter dosyası, profil yazıldıktan sonra değişmiştir veya yanlış hash kopyalanmıştır. Dosyayı yeniden onaylayın, SHA-256'yı yeniden hesaplayın ve yeni bir inceleme paketi üretin.

### `base character is ... expected 1200x1500`

Karakter görselini dışarıda tam 1200×1500 piksele dönüştürün. Sistem farklı en-boy oranını sessizce kabul etmez.

### Playwright tarayıcısı bulunamadı

```bash
npx playwright install chromium
```

### Font indirme hatası

İnternet erişimini ve GitHub raw içerik alanına erişimi kontrol edin; ardından `render` veya `package` komutunu yeniden çalıştırın.

### Mağaza ID'si eşleşmiyor

İşlem güvenli biçimde durmuştur. Profildeki ID'yi tahmin ederek değiştirmeyin; `npm run whoami` çıktısı ve Etsy mağaza hesabını doğrulayın.
