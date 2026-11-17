---
name: rakip-analizi
description: Rakip markaların sosyal medya (Instagram, YouTube) ve web sitesi karşılaştırması; etkileşim oranı, içerik stratejisi, paylaşım sıklığı, pazarlama altyapısı. Kullanıcı rakip analizi, hesap karşılaştırma veya benchmark istediğinde kullan.
---

# Rakip analizi iş akışı

Rapor grafiklerle anlatılır: araçların döndürdüğü `chart_ref` / `chart_refs` değerlerini `mcp__panels__show_chart({ chart_ref })` ile çiz.

1. **Rakipleri belirle**: kullanıcı verdiyse onları kullan; yalnızca marka adı verdiyse sitesini `mcp__web__web_read` ile açıp sosyal hesap bağlantılarını (social_profiles) bul.
2. **Veri topla** (en fazla 4 rakip):
   - Instagram: `mcp__instagram__instagram_compare` (posts_per_account 3-4) veya tek tek `instagram_profile` (posts 6).
   - YouTube: `mcp__youtube__youtube_compare`.
   - Web: her rakip için `mcp__web__site_audit` (reklam pikselleri, SEO temel sağlığı).
   - Gündem: `mcp__trends__news_search` ile son 30 günün haberleri (isteğe bağlı).
   - Marka ilgisi: `mcp__potential__trend_potential` ile markaların Wikipedia ilgisi ve 30 günlük tahmini (marka sayfası varsa).
3. **Analiz**: takipçi büyüklüğü ≠ başarı; etkileşim oranını, Reels payını, paylaşım sıklığını ve en iyi performanslı içerik tiplerini karşılaştır. Pikseller hangi reklam kanallarının kullanıldığını gösterir.
4. **Raporla**:
   - `report_start` ("Rakip analizi: A vs B vs C").
   - `show_kpis`: en yüksek etkileşim oranı, en sık paylaşan, en büyük kitle.
   - `show_chart({ chart_ref })`: instagram_compare `chart_refs` (etkileşim oranı, takipçi), youtube_compare `chart_refs` (medyan izlenme, beğeni oranı), lider kanalın youtube_channel `chart_ref` çizgisi (video başına izlenme + sonraki video beklentisi) ve varsa marka ilgisi tahmini.
   - `show_table`: tüm metrikler yan yana.
   - `show_cards`: her rakibin en iyi gönderisi/videosu (image=küçük resim, url).
   - `show_insights`: fırsatlar ve boşluklar + next_step.
5. Instagram ziyaretçi erişimini sınırlarsa bunu belirt ve eldeki verilerle devam et.
