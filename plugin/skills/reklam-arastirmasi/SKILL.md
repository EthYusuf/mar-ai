---
name: reklam-arastirmasi
description: Rakip veya sektör reklam araştırması (Meta/Instagram/Facebook reklamları). Kullanıcı reklam analizi, rakip reklamları, kreatif inceleme, "hangi reklamlar çalışıyor", CTA veya reklam mesajı sorduğunda kullan.
---

# Reklam araştırması iş akışı

1. **Kapsamı netleştir** (sormadan makul varsayım yap): anahtar kelime/marka, ülke (varsayılan TR), platform (varsayılan tümü), yalnızca aktif reklamlar.
2. **Veri topla**
   - `mcp__adlibrary__meta_ads_search` ile 25-40 reklam oku. Marka odaklıysa `advertiser` filtresi kullan.
   - Kreatifleri görsel olarak yorumlamak için bir kez `mcp__adlibrary__meta_ads_screenshot` çağır.
   - Gerekirse rakibin sitesini `mcp__web__site_audit` ile denetle (Meta/TikTok pikseli → ücretli sosyal medya reklamı veriyor demektir).
3. **Analiz et**
   - Format dağılımı (video / görsel / carousel), en sık CTA'lar, hedef alan adları.
   - Yayında kalma süresi: uzun süre yayında kalan reklamlar genellikle kârlıdır → "kazanan" reklamlar.
   - Mesaj temaları: indirim, ücretsiz kargo, sosyal kanıt, merak, problem-çözüm… Her temayı örnekle destekle.
   - Kancalar: reklam metninin ilk cümlesi.
4. **Raporla** (panel araçları)
   - `report_start` → başlık: "<konu> reklam analizi", alt başlık: kapsam.
   - `show_kpis`: okunan reklam, aktif reklam, ortalama yayın süresi (gün), en sık format.
   - `show_chart` (bar): format dağılımı; (bar) en çok reklam veren markalar; gerekirse (column) CTA dağılımı.
   - `show_cards`: en uzun yayında kalan 3-6 reklam — title=reklamveren, badge="Yayında N gün", image=reklam görseli, quote=kanca, body=metin, why=neden işe yarıyor, url=library_url.
   - `show_insights`: 3-5 uygulanabilir içgörü + next_step (örn. "Bu içgörülerle Reels planla").
5. Sohbette 3-5 cümlelik özet ver. Harcama/gösterim verisi Meta tarafından paylaşılmadığını gerekirse belirt.
