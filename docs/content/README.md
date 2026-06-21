# Kho nội dung sinh bằng AI (Vertex Gemini) — DRAFT

Sinh bởi `ops/gen_content.js` (Vertex gemini-2.5-flash, project mitsucafe).
`menu-content-pack.json`: mỗi món có description_vi / name_jp / caption_ig.

⚠️ AI-generated → **CHỦ DUYỆT trước khi đăng/đưa lên menu** (giọng + chính xác).
Chạy lại đầy đủ: `node ops/gen_content.js` · test: `--limit=2` · từ API: `--live`.

## prelaunch-pack — bộ "SẮP KHAI TRƯƠNG" (đăng TRƯỚC ngày mở)
`ops/gen_prelaunch.js` → 13 bài / 4 giai đoạn (úp mở → lộ diện → hậu trường → đếm ngược).
Mỗi bài: platform, hook, caption, hashtag, gợi ý visual (Higgsfield/Canva), CTA.
Điền [chủ điền:...] (ngày khai trương, ưu đãi, địa chỉ) + duyệt giọng trước khi đăng.
