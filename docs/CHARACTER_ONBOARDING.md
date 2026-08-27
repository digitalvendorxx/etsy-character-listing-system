# Yeni ana karakter ekleme

Ana karakter, bütün ürün kapaklarının tam zeminidir. Ürünler değişse de metin bölgeleri ve kapak geometrisi `reading-1200x1500-v1` düzeninde sabit kalır.

## Görsel sözleşmesi

- Boyut tam olarak **1200×1500 piksel** olmalıdır.
- Desteklenen biçimler: PNG, JPG/JPEG, WebP ve SVG.
- Görsel dikey Etsy kapak kompozisyonu için hazırlanmalıdır.
- Karakterin yüzü ve önemli detayları orta metin panelinin arkasında kaybolmayacak şekilde yerleştirilmelidir.
- Görsel yeni mağazada kullanım hakkına sahip olduğunuz, onaylı bir varlık olmalıdır.
- Özel karakter dosyası `local-assets/` altında tutulmalı ve Git'e eklenmemelidir.

Örnek `assets/example-character.svg` yalnız yer tutucudur; gerçek mağaza karakteri değildir.

## Sabit metin bölgeleri

Koordinatlar sol üst köşeden piksel cinsindendir.

| Bölge | x | y | Genişlik | Yükseklik |
|---|---:|---:|---:|---:|
| Tuval | 0 | 0 | 1200 | 1500 |
| Üst bant | 185 | 24 | 833 | 122 |
| Ana metin paneli | 120 | 500 | 960 | 660 |
| Birinci başlık, panel içinde | 0 | 48 | 960 | 145 |
| İkinci başlık, panel içinde | 0 | 245 | 960 | 145 |
| Yıldızlar, panel içinde | 0 | 405 | 960 | 95 |
| Alt başlık, panel içinde | 0 | 505 | 960 | 78 |

Karakter görseli tam tuvali kaplar. Bu koordinatları ürün bazında değiştiren bir katalog alanı yoktur; aynı görünümün korunması bilinçli bir kuraldır.

## 1. Dosyayı yerleştirin

```text
local-assets/base-character.png
```

Gerekirse farklı bir dosya adı kullanabilirsiniz; profil yolu bununla aynı olmalıdır.

## 2. SHA-256 değerini hesaplayın

macOS veya Linux:

```bash
shasum -a 256 local-assets/base-character.png
```

Tüm işletim sistemlerinde proje içinden boyut ve hash kontrolü:

```bash
npm run character:inspect -- --file local-assets/base-character.png
```

Windows PowerShell:

```powershell
(Get-FileHash local-assets/base-character.png -Algorithm SHA256).Hash.ToLower()
```

Hash, onaylanan karakter dosyasının parmak izidir. Aynı adla başka bir görsel konursa sistem değişikliği fark eder.

## 3. Profili güncelleyin

`config/shop.local.json`:

```json
{
  "layoutVersion": "reading-1200x1500-v1",
  "characterAsset": "local-assets/base-character.png",
  "characterSha256": "hesaplanan-64-karakter-kucuk-harfli-sha256"
}
```

`layoutVersion` değerini değiştirmeyin. Bu depoda desteklenen sürüm `reading-1200x1500-v1` değeridir.

## 4. Tek ürünle görsel prova yapın

Önce katalogdaki bir ürün ID'sini seçin:

```bash
npm run validate -- --profile config/shop.local.json --catalog config/products.local.json
npm run render -- --profile config/shop.local.json --catalog config/products.local.json --products love-clarity-reading
```

`render` şu kontrolleri yapar:

- Karakter dosyası açılabiliyor mu?
- Karakter SHA-256'sı profille eşleşiyor mu?
- Boyut tam 1200×1500 mü?
- Üretilen JPEG yine 1200×1500 mü?

Üretilen dosyayı burada inceleyin:

```text
output/<slug>/<urun-id>/thumbnail.jpg
```

Özellikle yüzün, ellerin ve ana görsel detaylarının üst bant ile orta panelin arkasında nasıl göründüğünü kontrol edin.

## 5. Kapak metinlerini ayarlayın

Her ürünün `thumbnail` alanı şu biçimdedir:

```json
{
  "thumbnail": {
    "topBanner": "PERSONALIZED READING",
    "lines": ["LOVE CLARITY", "TAROT READING"],
    "subtitle": "Honest Relationship Guidance",
    "accentColor": "#E85D8E"
  }
}
```

- `lines` tam iki öğe içermelidir.
- Her ana satır en fazla 24 karakter olabilir.
- Metin gerektiğinde küçültülür; yine de kısa ve okunur metin tercih edin.
- `accentColor`, ikinci ana başlığın rengidir ve `#RRGGBB` biçiminde olmalıdır.
- Üst bant, ana satırlar ve alt başlık otomatik büyük harfle render edilir.

## 6. Tüm kataloğu paketleyin

```bash
npm run package -- --profile config/shop.local.json --catalog config/products.local.json --products all
```

`output/<slug>/contact-sheet.png` üzerinden bütün ürünlerin aynı karakter ve aynı düzeni kullandığını topluca kontrol edin.

## Karakter değiştiğinde

Bir piksel bile değişse hash değişir. Şu sırayı yeniden uygulayın:

1. Yeni karakteri görsel olarak onaylayın.
2. Yeni SHA-256'yı profile yazın.
3. `validate` ve `render` çalıştırın.
4. `package` ile yeni contact sheet ve manifest üretin.
5. Yeni `reviewHash` değerini kullanın.

Eski manifest veya eski `reviewHash` ile yükleme yapılmaz. Bu, yanlış karakterin yanlış mağazaya gitmesini önleyen fail-closed davranıştır.

## Ek galeri görselleri

Ürün kataloğunda ek görsel yolları yalnız şu klasörden kabul edilir:

```json
{
  "gallery": [
    "local-assets/gallery/how-it-works.jpg",
    "local-assets/gallery/delivery-details.png"
  ]
}
```

Etsy yüklemesi için galeri görselleri PNG veya JPG/JPEG olmalı ve her biri 20 MB'den küçük olmalıdır. Paket bu dosyaların byte hash'lerini manifeste alır ve yükleme öncesi tekrar doğrular. Contact sheet yalnız üretilen ana kapağı gösterdiğinden ek galeri görsellerini taslak oluşturmadan hemen önce ayrıca elle kontrol edin.
