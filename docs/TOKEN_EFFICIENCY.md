# Làm việc với Claude (Code) tiết kiệm token — Kissaten Playbook

> Mục tiêu: tốn ít token nhất cho mỗi đơn vị việc hữu ích, mà **không** giảm chất lượng.
> Viết riêng cho dự án này (Lâm Hà Kissaten) + đã kiểm chứng bằng số liệu thật ngày 2026-06-09.
> Đây là tài liệu "cách làm việc với assistant", khác với spec hệ thống ở `docs/system/`.

---

## 0. TL;DR — 8 thói quen ăn tiền nhất

1. **CLAUDE.md mỏng** — đã làm: 6.478 → 1.353 token/session (−79%). Đừng nhồi lại.
2. **`/clear` khi đổi việc** — context cũ không liên quan = thuế token mỗi lượt sau đó.
3. **`/compact` ở ranh giới module** — nén lịch sử dài thay vì kéo lê.
4. **Chỉ đích danh file/path** thay vì "tìm chỗ xử lý đơn" → tôi `Read` trúng, không `Grep` quét cả repo.
5. **Đừng dán log/JSON khổng lồ** vào chat — lưu ra file rồi bảo tôi đọc dòng X–Y.
6. **Giữ phiên "ấm"** (gửi tin trong vòng 5 phút) để prompt cache không hết hạn.
7. **Đừng đổi model giữa phiên** & **đừng sửa CLAUDE.md vặt** giữa phiên — cả hai phá cache prefix.
8. **Tắt MCP/plugin không dùng** — mỗi cái nạp tên + mô tả vào mọi session.

---

## 1. Token đi đâu? (mental model)

Mỗi session, **trước khi bạn gõ chữ nào**, context đã chứa ~20.000–30.000 token gồm:

| Thành phần | Bạn kiểm soát được? | Ghi chú |
|---|---|---|
| System prompt của Claude Code | ❌ | Cố định |
| **CLAUDE.md** | ✅✅ | Đắt nhất *bạn* điều khiển → đã tối ưu |
| Memory (`MEMORY.md` + recall) | ✅ | Giữ index 1 dòng/memory |
| **Tên + mô tả skill/plugin** | ✅ | Nhiều plugin = nhiều mô tả nạp sẵn |
| **Schema tool MCP** | ⚠️ một phần | Trong Claude Code đã *defer* (xem §3) |
| Lịch sử hội thoại | ✅✅ | Dài thêm mỗi lượt → `/clear`, `/compact` |

> Quy tắc vàng của prompt cache: **tĩnh để đầu, động để cuối.** Mọi thứ ổn định (system, CLAUDE.md, schema) nằm đầu prompt và được cache; chỉ phần thay đổi (câu mới) bị tính giá đầy đủ.

---

## 2. Đánh giá danh sách kỹ thuật bạn đưa (đúng/sai cho Claude Code)

| Kỹ thuật bạn nêu | Có thật? | Áp dụng cho **Claude Code** ở dự án này? |
|---|---|---|
| **Prompt Caching** | ✅ Đúng, mạnh nhất | **Tự động** trong Claude Code (read = 0,1×, write 5' = 1,25×, TTL 5'). Bạn không bật/tắt — chỉ cần *không phá prefix* (xem §4). Phiên Opus dài $50–100 → $10–19 nhờ cache. |
| **CLAUDE.md ngắn / progressive loading** | ✅ Đúng | **Đã áp dụng hôm nay** (−79%). Đây là đòn bẩy số 1 bạn điều khiển trực tiếp. |
| **McPick / bật-tắt MCP động** | ✅ Ý tưởng đúng | Claude Code **đã defer tool MCP sẵn**: chỉ *tên* tool vào context, schema nạp khi cần qua cơ chế tìm-tool. Nên McPick phần lớn *thừa* ở đây. Việc cần làm: **gỡ hẳn MCP server/plugin không dùng** (cái defer vẫn tốn phần tên + mô tả). |
| **Index codebase thay vì đọc file** | ⚠️ Một nửa | Claude Code **không auto-index/auto-read** — tôi chỉ đọc khi gọi `Read/Grep/Glob`. Nên "đọc nhầm lockfile" hiếm xảy ra trừ khi *bạn bảo tôi* quét. Lợi ích MCP index ở đây nhỏ; thay vào đó hãy **chỉ đích danh** để tôi đọc trúng. |
| **`/context`, `/doctor`** | ✅ Đúng, có thật | Dùng `/context` để xem cái gì đang ngốn token; `/doctor` kiểm tra cài đặt. Rất nên dùng để tự soi. |
| **`.claudeignore`** | ❌ Sai với Claude Code | Claude Code **không** đọc `.claudeignore` (đó là khái niệm của Cursor). Cơ chế đúng: `.gitignore` + chặn đọc bằng `permissions.deny` trong `.claude/settings.json` (vd `"Read(./secret/**)"`). Nhưng vì tôi không auto-scan, nhu cầu này thấp. |
| **Dynamic Toolsets (Speakeasy)** | ✅ Có | Trùng ý với cơ chế defer sẵn có — không cần lắp thêm. |

**Kết luận:** danh sách của bạn *hợp lý về nguyên lý*, nhưng 2 điểm lệch khi soi vào Claude Code: (a) MCP đã defer sẵn nên "McPick" ít giá trị; (b) `.claudeignore` không tồn tại ở đây. Đòn bẩy thật sự lớn = **CLAUDE.md + quản lý phiên (clear/compact/cache) + gỡ plugin thừa**.

---

## 3. MCP & Plugin — cái thực sự ngốn ở máy bạn

- Dự án này **không có `.mcp.json`** → các MCP server bạn thấy (Canva, Figma, computer-use, Gmail, Desktop Commander…) đến từ **cấu hình global**, dùng chung mọi project.
- Tin tốt: Claude Code **defer** chúng — chỉ tên tool vào context, schema nạp lúc gọi. Đây chính là "McPick native".
- Tin cần làm: **tên + mô tả của skill/plugin vẫn nạp mỗi session.** Bạn đang cài *rất nhiều* plugin (small-business, design, data-agent-kit, anthropic-skills, firecrawl, superpowers…). Plugin nào **không dùng cho quán** thì gỡ:
  - Xem/tắt: lệnh `/plugin` (hoặc `/config`), hoặc sửa file cấu hình plugin global.
  - Giữ lại cụm thực sự dùng: `cafe-manager` + các skill `/post /promo /khach /sang /tuan …`, `firecrawl` (nếu bật), `superpowers`.
- MCP server "cho vui" mà không dùng trong phiên → ngắt kết nối; mỗi cái vẫn tốn phần định danh.

---

## 4. Giữ prompt cache "ấm" (đừng tự bắn vào chân)

Cache hết hạn sau ~5 phút *không hoạt động*; mỗi lượt mới reset đồng hồ → phiên đang làm việc liên tục thì cache gần như miễn phí phần tĩnh. Những thứ **phá cache (5× giá lượt đó)**:

- ❌ Sửa CLAUDE.md / system prompt **giữa phiên** (đổi prefix tĩnh).
- ❌ Đổi model giữa phiên (Opus ↔ Sonnet) — cache theo model.
- ❌ Chèn biến động (timestamp, random id) vào phần đầu cố định.
- ❌ Bật/tắt thêm MCP **giữa phiên** (đổi danh sách tool ở đầu).

→ Làm các thay đổi cấu trúc (như sửa CLAUDE.md) **đầu phiên hoặc phiên riêng**, không rải giữa lúc đang code.

---

## 5. Cách ra lệnh để tôi tốn ít token (quan trọng nhất với bạn)

**Tốt — đích danh, đóng phạm vi:**
- "Sửa `gas/Loyalty.gs` hàm `addStamp`, đọc `docs/system/loyalty-stamps.md` trước."
- "Trong `web/kaeru.html`, đổi nút đặt hàng dòng ~120."
- "Đọc `docs/system/sheets-schema.md` rồi thêm cột X vào tab CUSTOMERS."

**Tốn token — mơ hồ, buộc tôi quét:**
- "Tìm chỗ xử lý loyalty đâu đó rồi sửa." → tôi phải Grep cả repo.
- "Có gì sai trong hệ thống không?" → mở rộng vô định.
- Dán nguyên 500 dòng log vào chat → lưu file, chỉ tôi dòng cần.

**Mẹo theo dự án:**
- Index ở `CLAUDE.md §0` đã map *mảng → file*. Bạn chỉ cần nói tên mảng ("đụng campaign promo"), tôi tự đọc `docs/system/campaign-promo.md`. Không cần dán nội dung.
- Việc fan-out lớn (quét nhiều file, rà tên skill) → bảo tôi **dùng subagent**: nó chạy context riêng và chỉ trả *kết luận*, không đổ cả đống file vào phiên chính.
- Xong 1 module → `/compact`. Đổi sang việc không liên quan → `/clear`.

---

## 6. Việc đã làm hôm nay (đo được)

- Tách `CLAUDE.md` (710 dòng) → **index 105 dòng** + 9 file `docs/system/*` nạp on-demand.
- **−5.125 token/session (−79,1%)**, nội dung verbatim không mất (24.739 ≥ 22.675 chars; phần dư là header điều hướng).
- Nguyên tắc "nguồn sự thật" giữ nguyên: index trỏ rõ mảng → file; mỗi file là SSOT của mảng đó.
- Revert nếu cần: `git checkout -- CLAUDE.md && rm -rf docs/system` (chưa commit).

---

## 7. Phụ lục — bật firecrawl (hiện chưa cài)

Bạn gõ `/firecrawl` nhưng máy **chưa có** binary `firecrawl` lẫn `FIRECRAWL_API_KEY`, nên hôm nay tôi dùng `WebSearch` native (rẻ hơn, có sẵn) để lấy dữ liệu cộng đồng. Muốn bật firecrawl:

1. Lấy API key tại dashboard Firecrawl → `export FIRECRAWL_API_KEY=fc-xxxx` (thêm vào `~/.zshrc`).
2. Cài CLI: `npm i -g @mendable/firecrawl-cli` (hoặc theo README plugin), kiểm tra `firecrawl --version`.
3. Khi đã có key, các skill `/firecrawl-search`, `/firecrawl-scrape`, `/firecrawl-crawl` chạy được; luôn ghi kết quả ra `.firecrawl/` (`-o`) để **không phình context**, rồi lọc bằng `jq`.

> Lưu ý token: `WebSearch` đủ cho hỏi-đáp nhanh. Chỉ dùng firecrawl khi cần *scrape/crawl sâu* nhiều trang — và luôn đẩy output ra file, đừng để cả trang đổ vào hội thoại.

---

## 8. Cheat-sheet dán cạnh máy

```
NÊN                                   TRÁNH
─────────────────────────────────────────────────────────────
/clear khi đổi chủ đề                 Để 1 phiên ôm 5 việc khác nhau
/compact sau mỗi module               Kéo lịch sử dài vô tận
Chỉ đích danh file + docs/system/X    "Tìm đâu đó rồi sửa"
Lưu log/JSON ra file, trỏ dòng        Dán nguyên khối lớn vào chat
Sửa CLAUDE.md đầu phiên/phiên riêng   Sửa CLAUDE.md giữa lúc đang code (phá cache)
Giữ 1 model suốt phiên                Đổi Opus↔Sonnet giữa chừng
Gỡ plugin/MCP không dùng              Cài "cho vui" rồi để đó
/context để soi token                 Đoán mò chỗ tốn
Subagent cho fan-out lớn              Tự quét cả repo trong phiên chính
```

*Nguồn cộng đồng tham khảo:*
- [Manage costs — Claude Code Docs](https://code.claude.com/docs/en/costs)
- [54% context reduction (johnlindquist gist)](https://gist.github.com/johnlindquist/849b813e76039a908d962b2f0923dc9a)
- [Prompt caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [How prompt caching works in Claude Code](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
- [12 ways to cut tokens (Firecrawl)](https://www.firecrawl.dev/blog/claude-code-token-efficiency)
- [Optimize Claude Code token usage (ClaudeLog)](https://claudelog.com/faqs/how-to-optimize-claude-code-token-usage/)
