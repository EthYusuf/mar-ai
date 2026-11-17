---
name: trend-radar
description: Gündem ve trend takibi; Google'da yükselen aramalar, haber taraması, bir konuya ilginin zaman içindeki değişimi ve tahmini, içerik fırsatları. Kullanıcı trend, gündem, "ne konuşuluyor", ilgi grafiği veya içerik fırsatı sorduğunda kullan.
---

# Trend radarı iş akışı

Rapor grafiklerle anlatılır: araçların döndürdüğü `chart_ref` değerlerini `mcp__panels__show_chart({ chart_ref })` ile çiz.

1. **Yükselen aramalar**: `mcp__trends__trending_now` (ülke varsayılan TR). Markayla ilgisiz/hassas konuları
   (trajedi, siyaset) içerik fırsatı olarak önerme. Dönen `chart_ref` arama hacmi grafiğidir.
2. **Konu derinliği**: seçtiğin 2-4 konu için
   - `mcp__potential__trend_potential`: ilgi çizgisi + 30 günlük tahmin, ivme, faz ve potansiyel skoru.
   - `mcp__trends__news_search` (period 7d/30d): haber akışı ve günlük haber yoğunluğu grafiği.
3. **Fırsat çıkar**: marka/sektörle doğal bağ kurulabilen 3-5 konu seç; potansiyel skoru ve faz zamanlamayı belirler
   (Yükseliyor / Yeni filizleniyor → hemen; Zirvede → hızlı ve kısa; Soğuyor → kaçın). Her biri için içerik açısı,
   format (Reels, carousel, story) ve zamanlama öner.
4. **Raporla**:
   - `report_start` ("Trend radarı — <tarih>").
   - `show_kpis`: izlenen trend sayısı, en yüksek potansiyel skoru (`meter`), en hızlı yükselen konu.
   - `show_chart({ chart_ref })`: önce trend_potential tahmin grafiği, sonra arama hacmi veya haber yoğunluğu.
   - `show_cards`: seçilen fırsatlar (title=konu, badge=faz veya hacim, body=açı, why=neden şimdi).
   - `show_insights` + next_step (örn. "1 numaralı fırsat için Reels planla").
5. Wikipedia verisinin Google aramalarıyla aynı şey olmadığını, ilgi göstergesi olduğunu belirt.
