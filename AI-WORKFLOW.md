# AI Workflow & Engineering Documentation

## 1. AI Tooling Breakdown

- **Primary Tools Used:** Antigravity AI Coding Assistant (Gemini 3.6 Flash).
- **Delegated Tasks:** Architecture planning, synthetic grid dataset generator, Spatial Prim's MST topology reconstruction implementation, React Operator Console UI design, and Jest unit test suite generation.
- **Human Guidance & Review:** Mathematical verification of edge frontier boundary isolation, verification of sequence number deduplication, enforce guardrails on telemetry auto-verification.

---

## 2. Code Attribution Estimate

- **AI-Generated Code:** ~85%
- **Human Refined / Architected Logic:** ~15%

---

## 3. Concrete Cases of Catching AI Errors / Misleading Code

1. **Hallucinated Edge Direction in Graph Traversal:**
   - *AI Mistake:* Initially suggested reversing parent-child orientation during spatial MST construction, causing downstream traversal to walk upstream towards the substation.
   - *Correction:* Fixed root node anchoring to DT coordinates, ensuring radial tree flow always points from DT -> Pole -> Service Drop.

2. **Naïve Clock Skew Rejection:**
   - *AI Mistake:* Initially attempted strict timestamp comparison against `Date.now()`, rejecting telemetry with ±90s skew.
   - *Correction:* Replaced timestamp filtering with device-level monotonic sequence number (`seq`) tracking to accommodate device clock drift.

3. **Premature Manual Resolution:**
   - *AI Mistake:* Suggested allowing operators to override ticket closure without verifying pole state.
   - *Correction:* Added strict guardrail in `TicketEngine.resolveTicketManual()` to reject resolution if any affected pole reports `energized: false`.
