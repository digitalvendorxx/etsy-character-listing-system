# Etsy taslak oluşturma ve elle yayınlama

Bu sistemin son otomatik adımı Etsy'de **taslak** ilan oluşturmaktır. Otomatik yayınlama veya etkinleştirme yoktur.

## Ön koşullar

- `config/shop.local.json` gerçek yeni mağazayı göstermeli.
- `expectedShopId` ve `taxonomyId` sıfırdan büyük, doğrulanmış değerler olmalı.
- `.env` yeni mağaza için geçerli Etsy API bilgilerini içermeli.
- Karakter hash'i eşleşmeli.
- Ürün metinleri ve tüm görseller elle incelenmiş olmalı.
- OAuth ile oturum açılmış mağaza, beklenen mağaza ID'siyle aynı olmalı.

## 1. Hedef mağazayı doğrulayın

İlk kullanımda:

```bash
npm run auth
npm run whoami
```

`whoami` sonucundaki mağaza ID'si ile profilinizdeki `expectedShopId` aynı değilse durun. Taslak komutu da bu eşleşmeyi API üzerinden yeniden kontrol eder.

## 2. Yerel planı kontrol edin

Bütün ürünler:

```bash
npm run validate -- --profile config/shop.local.json --catalog config/products.local.json
npm run plan -- --profile config/shop.local.json --catalog config/products.local.json --products all
```

Belirli ürünler:

```bash
npm run plan -- --profile config/shop.local.json --catalog config/products.local.json --products love-clarity-reading,career-path-reading
```

`--products` seçimi `all` veya virgülle ayrılmış ürün ID'leri kabul eder. Aynı ürün seçimini paketleme ve taslak oluşturma adımlarında da kullanın.

## 3. İnceleme paketini üretin

```bash
npm run package -- --profile config/shop.local.json --catalog config/products.local.json --products love-clarity-reading,career-path-reading
```

Paket şunları üretir:

```text
output/<slug>/contact-sheet.png
output/<slug>/<urun-id>/thumbnail.jpg
output/<slug>/review-manifest.json
```

Manifest; mağaza profili, katalog, düzen sürümü, karakter, seçilen ürünler ve ana kapak dosyalarının hash'lerini birbirine bağlar.

## 4. Elle inceleyin

Taslak komutuna geçmeden şu öğelerin tamamını kontrol edin:

- Doğru mağaza adı ve doğru `expectedShopId`
- Doğru karakter ve sabit metin yerleşimi
- Başlık, açıklama, fiyat ve 13 etiket
- Kişiselleştirme sorusu
- Ana kapaklarda yazım, taşma ve okunabilirlik
- Ürünle ilişkili tüm ek galeri görselleri
- Sağlık, hukuk, finans, garanti veya kesin sonuç iddialarının bulunmaması
- Eski mağazaya ait satış, puan veya müşteri kanıtının taşınmaması

`contact-sheet.png` ana kapakları topluca gösterir. Ek galeri dosyaları mevcut contact sheet'e dahil değildir; onları dosya olarak ayrıca açın.

Herhangi bir şeyi değiştirirseniz eski manifesti kullanmayın. `package` komutunu yeniden çalıştırıp yeni `reviewHash` alın.

## 5. Review hash'i alın

`output/<slug>/review-manifest.json` içindeki `reviewHash` alanını kopyalayabilirsiniz. Terminalden yalnız değeri yazdırmak için:

```bash
node --input-type=module -e "import fs from 'node:fs'; const m=JSON.parse(fs.readFileSync('output/new-fal-shop/review-manifest.json','utf8')); console.log(m.reviewHash)"
```

Komuttaki `new-fal-shop` bölümünü profilinizin `slug` değeriyle değiştirin.

## 6. Yalnız taslak oluşturun

macOS veya Linux örneği:

```bash
npm run etsy:draft -- \
  --profile config/shop.local.json \
  --catalog config/products.local.json \
  --products love-clarity-reading,career-path-reading \
  --apply \
  --expected-shop-id 12345678 \
  --review-file output/new-fal-shop/review-manifest.json \
  --review-hash REVIEW_MANIFEST_ICINDEKI_64_KARAKTER_HASH
```

Windows PowerShell örneği:

```powershell
npm run etsy:draft -- --profile config/shop.local.json --catalog config/products.local.json --products love-clarity-reading,career-path-reading --apply --expected-shop-id 12345678 --review-file output/new-fal-shop/review-manifest.json --review-hash REVIEW_MANIFEST_ICINDEKI_64_KARAKTER_HASH
```

`12345678`, `new-fal-shop`, ürün ID'leri ve hash yerine kendi doğrulanmış değerlerinizi yazın.

Komut şu işlemleri yapar:

1. Profil ve kataloğu yüklemeye hazır kurallarla doğrular.
2. `--expected-shop-id` ile profil mağaza ID'sini karşılaştırır.
3. Manifest ve ana kapak dosyalarının değişmediğini doğrular.
4. OAuth ile bağlı gerçek Etsy mağazasını API'den kontrol eder.
5. Aynı başlıkta mevcut draft, inactive veya active ilan varsa durur.
6. İlanı draft olarak oluşturur, ana görseli ve varsa galeriyi yükler, kişiselleştirmeyi ekler.
7. Etsy'den ilan durumunun hâlâ `draft` ve görsellerin mevcut olduğunu doğrular.

`--apply` yazılmadıkça Etsy'ye hiçbir taslak yazılmaz.

## 7. Etsy arayüzünde son kontrol ve yayın

Taslaklar oluşturulduktan sonra Etsy Shop Manager'da her ilanı açın ve en az şunları kontrol edin:

- Kapak ve galeri sırası
- Kırpma ve mobil görünüm
- Başlık, açıklama ve etiketler
- Fiyat ve mağaza para birimi
- Taxonomy/kategori
- Dijital veya fiziksel ürün ayarları
- Teslim/processing, iade ve yenileme ayarları
- Kişiselleştirme alanı
- Etsy politika ve mağaza kurallarına uygunluk

Yayınlama veya etkinleştirme bu incelemeden sonra **Etsy arayüzünde elle** yapılır. Depoda `publish` veya `activate` komutu yoktur.

## Hata ve tekrar çalıştırma

İşlem durumu `.runtime/<slug>/draft-state.json` altında yerel olarak tutulur. Bu dosya Git'e girmez. Kısmi hata sonrasında dosyayı gelişigüzel silmeyin; aynı ürünü iki kere açma riski doğabilir.

- `authenticated Etsy shop ... does not match`: Yanlış Etsy hesabı yetkilendirilmiştir; yazma yapılmadan hedef hesabı düzeltin.
- `review hash does not match`: Yanlış veya eski hash kullanılmıştır; manifesti yeniden inceleyin.
- `character or layout changed after manual review`: Yeniden `package` çalıştırıp yeni paketi inceleyin.
- `product ... changed after review`: Katalog değişmiştir; yeni paket gerekir.
- `listing title already exists`: Sistem olası mükerrer ilanda durmuştur. Etsy'deki mevcut ilanı ve yerel state'i elle uzlaştırın.
- `draft verification failed`: Etsy Shop Manager'da taslağın oluşup oluşmadığını kontrol etmeden komutu tekrar çalıştırmayın.
- `product ... is pinned to a different review package`: Aynı ürün daha önce farklı içerikle işlenmiştir. Dosyayı silerek zorlamayın; mevcut taslağı ve state'i elle uzlaştırın.

Yeni ürün eklediğinizde kataloğun `catalogVersion` değerini artırın, yeni paketi inceleyin ve aynı ürün seçimiyle `etsy:draft` çalıştırın. Önceden `draft_verified` olmuş ve içeriği değişmemiş ürünler yeniden yazılmadan atlanır; yalnız yeni ürünler için taslak oluşturulur.

Hata halinde güvenli kural: önce Etsy'deki gerçek durumu okuyun, sonra farklı ve kanıta dayalı bir çözüm uygulayın. Kör tekrar yapmayın.
