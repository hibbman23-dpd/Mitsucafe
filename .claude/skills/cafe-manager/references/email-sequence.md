# Reference — Email sequence (Onboarding / Winback / Launch)

> Defer phần lớn formatting đến skill `marketing:email-sequence`. Reference này giữ kissaten context + brand voice mapping.

## Phạm vi áp dụng

Mitsu hiện không có email list. Khi nào dùng:
1. **Zalo OA** (primary channel) — đã có, sequence dùng template tương tự
2. **Email** (future) — nếu user setup MailChimp / Klaviyo / GAS Mail tự build

Hầu hết tương tác customer dùng Zalo OA. Email cho:
- Receipt/Invoice (GAS đã có `generatePDFInvoice` + `sendInvoiceViaZalo`)
- Special launch (Tết, anniversary)
- B2B nếu có line wholesale/catering tương lai

## Sequence types

### 1. Onboarding sequence (sau khi follow Zalo OA / opt-in email)

3 message qua 7 ngày:

**Day 0** (immediate sau follow):
- Subject/preview: "Mừng bạn ghé Mitsu 🍵"
- Body: greeting + story かえる ngắn + voucher first order (vd "20% lần đầu trong 7 ngày")
- CTA: order link

**Day 3**:
- Subject: "Bạn thử món nào?"
- Body: top 3 SKU đầu danh sách + quick tasting note
- CTA: book table / order

**Day 7**:
- Subject: "1 tuần với かえる"
- Body: invite review (Google Maps) + giới thiệu loyalty stamp
- CTA: review link

### 2. Winback sequence (khách Hibernating — last_order >2.5× avg cycle)

2 message qua 10 ngày:

**Day 0** (winback trigger):
- Subject: "[Tên], lâu rồi không gặp 🐸"
- Body: thân, không guilt-trip, gentle 1 invite + voucher 15%
- CTA: order link

**Day 10** (nếu chưa quay lại):
- Subject: "Vẫn để dành ly trà cho bạn"
- Body: last call, mention SKU mới + voucher expire date
- CTA: order link

Sau day 10 không quay lại → move sang Lost segment, ngừng email regular.

### 3. Launch sequence (món mới)

**Pre-launch (D-3)**:
- Teaser visual mascot + 1 chi tiết về nguyên liệu

**Launch day (D0)**:
- Full reveal + early bird discount 24h

**D+3**:
- Social proof — share UGC nếu có hoặc internal photo + testimonial team

### 4. Receipt/Invoice (transactional)

Đã có `generatePDFInvoice` + send qua Zalo. Email backup nếu user setup REPORT_EMAIL.

KHÔNG cần sequence — single trigger.

## Brand voice mapping

Mọi message phải:
- Tone warm caregiver (xem `_brand-voice.md` §2)
- Length: Zalo 30-60 từ, Email 100-200 từ
- Signature: tagline VN/JP
- NEVER: spam "đặt ngay", "khuyến mãi cực sốc"
- Subject line: dưới 50 ký tự, có 1 emoji (optional)

## Implementation paths

### Path A: Zalo OA broadcast (đã có nền)
- Sử dụng `gas/Notify.gs:sendZaloNotify()` (currently stub)
- Phase 2 ONBOARDING.md track Zalo OA verification
- Skill draft message → user paste vào Zalo OA Manager → schedule send

### Path B: Klaviyo (recommended nếu serious email)
- MCP `klaviyo` đã connect
- Tạo flow trong Klaviyo UI, populate body với draft từ skill
- Skill output Klaviyo template variable format: `{{ first_name }}`, `{{ unsubscribe }}`

### Path C: GAS Mail (DIY, free, simple)
- Sử dụng MailApp.sendEmail (đã setup scope)
- Cần 1 sheet `EMAIL_QUEUE` để schedule
- Cho volume nhỏ (<100 emails/ngày)

Default cho MVP: **Path A (Zalo OA)** + skill draft text.

## Compose với marketing:email-sequence skill

Khi user nói "draft full winback sequence" → call skill `marketing:email-sequence` với kissaten params:

```
Tone: warm, caregiver, Japanese-Vietnamese fusion
Brand: Mitsu
Mascot: かえる (frog)
Tagline: "おかえりなさい — Mỗi ly là một chuyến trở về"
Avoid: "premium", "luxury", "đỉnh cao"
Audience: VN cafe customers, 18-35, Lâm Đồng + Đà Lạt
Channel: Zalo OA (60-80 từ) hoặc Email (150 từ)
```

Skill kia output sequence structure → kissaten skill convert sang final VN copy.

## Anti-patterns

- ❌ Email khuyến mãi không opt-in (spam)
- ❌ Subject ALL CAPS
- ❌ Body chỉ là image (a11y + spam filter)
- ❌ Voucher không expire date
- ❌ Cùng template cho mọi khách (ko personalize first name nếu có)
- ❌ Quên unsubscribe link (legal compliance)
- ❌ Cross channel cùng nội dung cùng ngày (Zalo + email cùng broadcast)
