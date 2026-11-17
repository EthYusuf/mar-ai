---
name: potansiyel-analizi
description: Bir konunun, ürünün, markanın veya pazarın potansiyelini ölçer ve tahmin eder; ilgi trendi + 30 günlük tahmin çizgisi, potansiyel skoru, sezonsallık ve kampanya zamanlaması, ülke bazında çevrim içi kitle potansiyeli. Kullanıcı potansiyel, büyüme, gelecek, tahmin, "yükselişte mi", "ne zaman kampanya yapmalıyım", "hangi pazar/ülke" sorduğunda kullan.
---

# Potansiyel analizi iş akışı

Bu analiz metinle değil **çizgi grafiklerle** anlatılır. Araçların döndürdüğü `chart_ref` değerlerini
`mcp__panels__show_chart({ chart_ref })` ile çiz; sayıları elle kopyalama.

1. **Soruyu sınıflandır**
   - Konu/ürün/marka büyüyor mu, hangisinin potansiyeli yüksek → `mcp__potential__trend_potential`
     (1-4 konu, varsayılan 180 gün geçmiş + 30 gün tahmin).
   - Ne zaman kampanya yapmalı, mevsimsel mi → `mcp__potential__seasonality` (4 yıl).
   - Hangi ülke/pazar büyüyor, yurt dışına açılma → `mcp__potential__market_potential`
     (en fazla 4 ülke, varsayılan `online_population`, 2030 projeksiyonu).
   - Kapsamlı soruda ikisini birlikte kullan (örn. trend + sezonsallık).
2. **Doğru makaleyi kontrol et**: `trend_potential` / `seasonality` çıktısındaki `article` konuyla ilgisizse
   (örn. marka yerine aynı adlı film), `other_candidates` içinden doğrusunu `exact: true` ile yeniden çağır.
   Türkçe Wikipedia'da hacim düşükse (`data_quality` uyarısı) küresel konular için `lang: "en"` dene.
3. **Raporla**
   - `report_start` (örn. "Matcha vs kombucha · potansiyel ve 30 günlük tahmin").
   - `show_kpis`: her konu için potansiyel skoru (`value: "72/100"`, `meter: 72`, `sub`: faz),
     beklenen değişim (%), 30 günlük ilgi; sezonsallıkta zirve ayı ve kampanya penceresi;
     pazarda 2030 çevrim içi kitle ve yeni kullanıcı sayısı.
   - `show_chart({ chart_ref })`: ana tahmin grafiği; varsa ikinci grafik (`chart_refs.history`).
   - Gerekirse `show_table`: konuların metrikleri yan yana (skor, ivme, büyüme, beklenen değişim).
   - `show_insights`: 3-4 kısa, uygulanabilir madde (başlık + 1-2 cümle) ve `next_step`
     (örn. "En yüksek potansiyelli konu için Reels planla").
4. **Dürüstlük**: Wikipedia ilgisi arama hacmiyle aynı şey değildir, bir ilgi göstergesidir.
   Tahminler model öngörüsüdür; %80 aralıkla birlikte söyle. Pazar projeksiyonu ITU ve BM verisine dayanır.
5. Sohbette 3-4 cümlelik özet ver: kazanan konu/pazar, en önemli rakam, önerilen zamanlama.
