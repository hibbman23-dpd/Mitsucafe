---
description: Quarterly expansion strategy brainstorm — 4-axis matrix opportunity
---

Invoke skill `cafe-manager` với chế độ **expansion-strategy**.

Workflow:
1. Skill load `references/expansion-strategy.md` + `references/menu-engineering.md` + `references/demand-forecast.md`
2. Hỏi user:
   - Quý nào (Q1-Q4 YYYY)?
   - Cash position hiện tại (VND)?
   - Lâm Hà revenue MoM growth rate?
   - Capacity used (%)?
   - Constraint: thời gian, sức người, vốn vay?
   - Risk appetite: conservative / balanced / aggressive?
3. Output 4-axis evaluation:
   - **A. Penetrate Lâm Hà**
   - **B. New location**
   - **C. Product extension**
   - **D. Diversify**
   Mỗi axis có:
   - Pros / Cons
   - Cost estimate
   - Risk score (1-5)
   - ROI horizon
   - Star rating (⭐-⭐⭐⭐⭐⭐)
4. Tóm tắt action plan quý tới:
   - Focus 1 axis chính
   - Top 3 sub-bets cụ thể
   - Checkpoint review (vd "decision Q4: open Bảo Lộc?")
5. Save `docs/strategy/QX-YYYY.md`

Mặc định:
- Conservative bias cho solo operator first year
- Defer New Location nếu cash < 400M VND
- Defer Franchise nếu chưa 12+ months track record
- Prefer penetration + product extension trước

Multi-axis warning: nếu user chọn focus >1 axis cùng quý → flag risk (focus 1 axis 1 quý).

User input optional: `$ARGUMENTS` free-form vd "Q3 2026, cash 200M, growth 12%".
