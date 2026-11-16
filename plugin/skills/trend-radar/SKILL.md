---
name: trend-radar
description: Gündem ve trend takibi; yükselen aramalar, haber taraması, bir konuya ilginin zaman içindeki değişimi ve içerik fırsatları. Kullanıcı trend, gündem, "ne konuşuluyor", ilgi grafiği veya içerik fırsatı sorduğunda kullan.
---

# Trend radarı iş akışı

1. **Yükselen aramalar**: `mcp__trends__trending_now` (ülke varsayılan TR). Markayla ilgisiz/hassas konuları (trajedi, siyaset) içerik fırsatı olarak önerme.
2. **Konu derinliği**: ilgili konular için `mcp__trends__news_search` (period 7d/30d) ve `mcp__trends__interest_over_time` (Wikipedia ilgisi, en fazla 5 terim).
3. **Fırsat çıkar**: marka/sektörle doğal bağ kurulabilen 3-5 konu seç; her biri için içerik açısı, format (Reels, carousel, story) ve zamanlama öner.
4. **Raporla**:
   - `report_start` ("Trend radarı — <tarih>").
   - `show_kpis`: izlenen trend sayısı, en yüksek arama hacmi, en hızlı yükselen konu.
   - `show_chart` (line): ilgi zaman serisi (haftalık); (bar) haber kaynakları veya trend hacimleri.
   - `show_cards`: seçilen fırsatlar (title=konu, badge=hacim, body=açı, why=neden şimdi).
   - `show_insights` + next_step (örn. "1 numaralı fırsat için Reels planla").
5. Wikipedia verisinin Google aramalarıyla aynı şey olmadığını, ilgi göstergesi olduğunu belirt.
