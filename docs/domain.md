# Domain notes: Medacta, kinematic alignment, and this territory

Context for anyone (human or agent) working on Territory OS. The app is built
for a **Medacta orthopedic device rep**, and a lot of its modelling decisions
only make sense once you know what the products actually are.

**Provenance matters here, so it is marked throughout:**

- **[vendor]** — Medacta's own public positioning, via search results.
- **[territory]** — inferred from the packing lists and photos Zack supplied.
  This is the ground truth for *his* inventory, not for Medacta generally.
- **[unverified]** — plausible, not confirmed. Do not build on it without asking.

`10-years-ka.medacta.com`, `medacta.com` and the surgical-technique PDFs on
`aws-media.medacta.com` all return **403 to automated fetches** — a WAF that
blocks non-browser clients across the whole domain. Video content is not
accessible to an agent at all. So none of the below is a first-hand reading of
the company site; it is search-result summaries plus Zack's own documents.

---

## 1. The thesis: kinematic alignment

**Mechanical alignment (MA)** is the traditional total-knee technique: cut the
bone to a neutral, standardised limb axis and release soft tissue until the
knee balances. **Kinematic alignment (KA)** instead resurfaces the knee to its
*pre-arthritic* state — restoring the patient's native joint line orientation
and their own kinematic axes, so the surrounding ligaments are left at their
natural tension rather than being released to fit a standard cut. [vendor]

This is the single most important thing to understand about the territory:
**KA is the product story**, and Medacta is the vendor that has committed to
it hardest. Reported outcomes include patient satisfaction approaching that of
total hip replacement, which is the usual benchmark for a "good" joint. [vendor]

Practically, for the rep: **the alignment philosophy changes what ships.** KA
and MA are different instrument sets for the same implant family, so "which
technique does this surgeon use" is a packing question, not just a clinical one.

## 2. Knee products

| Name | What it is |
| --- | --- |
| **GMK Sphere** | Launched 2011. Medial *ball-in-socket* insert — the medial compartment is constrained and stable, the lateral is unconstrained so the femur can roll back naturally. Designed from Freeman & Pinskerova's knee-kinematics work. Reported 99.35% survival at 6 years; 100,000+ implanted. [vendor] |
| **GMK SpheriKA** | Launched late 2023. Built on the Sphere ball-in-socket, but the **first implant optimised specifically for KA**. Funnel-shaped trochlear groove to accept a wider range of Q-angles for patient-specific patellofemoral tracking, plus bone coverage tuned for KA resections. [vendor] |
| **GMK Efficiency** | **Single-use** instrumentation — a complete disposable instrument solution, sold in **separate MA and KA versions**. Removes a reusable metal tray from the decontamination loop. [vendor] |
| **MyKnee** | Patient-matched cutting blocks, 3D-printed from the patient's own CT or MRI, reproducing the surgeon's preoperative plan. Can be combined with Efficiency or used against conventional instruments. [vendor] |
| **NextAR** | Augmented-reality surgical navigation platform. [vendor] |
| **GMK 3D Metal** | Cementless, 3D-printed porous tibial baseplate / components. The `500METAL` and `300METAL` lines in Zack's lists. [territory] |

### Why "single-use" matters to this app

`AcquisitionType` in `src/lib/types.ts` is `"consignment" | "loaner"`. There is
no notion of instrumentation that is **consumed rather than returned**.

But GMK Efficiency is single-use, and the codebase already carries Efficiency
data through the loaner path — the doc comment on `loaner_code` uses
`SPKAEFFR08` ("SpheriKA Efficiency Right 08") as its example, and `content_type`
uses `"Ins-Spherika Efficiency Right"`. If a disposable Efficiency set is being
tracked as a loaner tote, the app will start a return countdown and nag to ship
back something that goes in the bin. [unverified — **ask Zack before changing
anything**; he may deliberately track the outer tote as a returnable even when
the contents are not, and Medacta's commercial terms here are not public.]

## 3. Hip products

The app models `joint` as knee or hip, so briefly: Medacta's hip story is
**AMIS** (Anterior Minimally Invasive Surgery), an anterior approach developed
from 2004 that follows both an intermuscular and internervous path. Implants
include the **Mpact** hemispherical acetabular cup, the **Versafit** elliptical
cup, **MasterLoc** and the rectangular triple-tapered **P-family** stems.
**MyHip** is the planning/support offering. [vendor]

## 4. Set codes seen in this territory

Decoded from the packing-list filenames Zack supplied. **These are readings of
the naming pattern, not a published key** — treat as [territory] + [unverified]:

| Code | Reading |
| --- | --- |
| `GSKAIMPL` / `GSKAIMPR` | GMK Sphere KA Implants, Left / Right |
| `GSFETIL` / `GSFETIR` | GMK Sphere Femoral + Tibial, Left / Right |
| `GSTILVE` / `GSTIRVE` | GMK Sphere Tibia Left / Right |
| `SPHTINL` / `SPHTINR` | SpheriKA tibial inserts, Left / Right |
| `500SPTRL` / `500SPTRR`, `500KATRL` / `500KATRR` | 500-line Sphere / KA trays, Left / Right |
| `500METAL`, `300METAL` | 3D Metal cementless, 500 and 300 lines |
| `GINSERT` | Inserts |
| `PATRES` | Patella resurfacing |
| `TIAUG`, `TITIBAUG` | Tibial augments |
| `REVT`, `GRFEML` / `GRFEMR` | Revision tibia; revision femur Left / Right |
| `61BLKS`, `GEXT` | Blocks; extensions |
| `GMKS2.0` | GMK Sphere 2.0 |

Note the **left/right split runs through almost everything**. That is why
`catalog_items.side` exists and why the Sets page has separate Efficiency
Left/Right totes. A right-side tray is not a substitute for a left-side one,
and the readiness engine must never treat them as interchangeable.

## 5. What this means for the app

1. **Alignment philosophy is a packing variable.** A surgeon on KA and a
   surgeon on MA need different instrument sets for the same implant. Today
   `surgeon_preferences` can swap whole Sets, which covers this — but nothing
   records *why*, so the reason lives only in a note.
2. **Sides are not interchangeable.** Already modelled; keep it that way.
3. **Single-use vs reusable is a real distinction** the data model does not
   currently make. See the open question above.
4. **Insert thickness is the fine-tuning variable.** Sphere/SpheriKA use 1 mm
   increments across 13 femoral sizes specifically so the surgeon can tune
   ligament balance intraoperatively [vendor] — which is exactly why inserts get
   opened and swapped mid-case, and why the sticker-sheet flow has to be able
   to deduct something that was not on the original pack list.

## 6. To verify with Zack

- Are Efficiency sets returned or consumed? (§2)
- Is the `500` / `300` split a size line, a cementless-vs-cemented split, or
  something else?
- Which surgeons are KA and which are MA, and should that be a field on
  `surgeons` rather than a note?
