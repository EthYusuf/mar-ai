---
name: reels-planlama
description: Instagram Reels, TikTok veya YouTube Shorts için kısa video planı, senaryo, kanca (hook), storyboard, açıklama metni ve hashtag hazırlama. Kullanıcı Reels/TikTok/Shorts fikri, video senaryosu veya içerik takvimi istediğinde kullan.
---

# Reels planlama iş akışı

1. **Bağlamı topla**: ürün/hizmet, hedef kitle, ton, süre (varsayılan 30 sn), platform. Eksikse makul varsayım yap ve belirt.
2. **İlham ve kanıt** (hızlı tut):
   - Gerekirse `mcp__adlibrary__meta_ads_search` (media=video) ile sektördeki video reklam kancalarına bak.
   - `mcp__trends__trending_now` ile gündemden yararlanılabilecek bir konu var mı kontrol et (zorlama).
   - Konu mevsimselse `mcp__potential__seasonality` ile yayın zamanını, yükselen bir konuysa `mcp__potential__trend_potential` ile potansiyelini doğrula; grafiği `show_chart({ chart_ref })` ile rapora ekle.
   - Rakip hesap verilmişse `mcp__instagram__instagram_profile` ile Reels performansına bak.
3. **Kancalar**: ilk 2 saniye için 3 farklı tipte kanca yaz (Soru, Gösterim, Merak, Şok, Sosyal kanıt). Her birine 0-100 arası "AI tahmini" kanca gücü puanı ver (netlik, merak, görsel güç, ilk saniyede ürün/yüz).
4. **Storyboard**: 5-8 sahne; sahneler 0'dan toplam süreye kesintisiz. Kalıp: Kanca → Sorun → Ürün → Gösterim → Sonuç → Çağrı (CTA). Her sahne: çekim tipi, ekran yazısı (kısa!), görüntü tarifi, ses/dış ses. Altyazıyla sessiz izlemeye uygun olsun.
5. **Raporla**:
   - `report_start` (başlık: "“<konsept adı>” — <ürün> Reels planı").
   - `show_storyboard`: hooks, scenes, caption (soru ile bitsin), 5-10 hashtag (geniş + niş karışık), music (tür/BPM/an), posting_tip.
   - İsteğe bağlı `show_text`: çekim listesi veya tam senaryo.
   - `show_insights`: plana dair 3 kısa gerekçe + next_step (örn. "15 saniyelik versiyonu hazırla").
6. Telifli müzik adı verme; tür ve tempo öner, platformun ses kütüphanesine yönlendir.
