# Direction B Final (`b3`): "Ink and Marigold"

Keeps the lean `b2` layout intact while switching to the **Ink and Marigold** palette and applying all seven review fixes, plus the new `feedback-behavioral.html` screen. No blue, violet, indigo, purple, or teal appears anywhere.

---

## 1. Palette & Verified WCAG AA Contrast Ratios

| Role | Token | Hex | Pairing | Contrast | WCAG |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Canvas / Card / Stone | `--bg-canvas` / `--bg-card` / `--bg-stone` | `#F7F5F0` / `#FFFFFF` / `#EFECE6` | Hairline border `#E0DCD3` (strong `#C8C3B8`) | — | — |
| Main Ink & Primary Button | `--ink` / `--on-ink` | `#1C1B19` (hover `#33312D`) / `#FFFFFF` | `#FFFFFF` on `#1C1B19` | **17.21:1** | AAA |
| Secondary Button | `--bg-card` / `--ink` border | `#FFFFFF` with `1.5px solid #1C1B19` | `#1C1B19` on `#FFFFFF` | **17.21:1** | AAA |
| Body / Muted Text | `--body` / `--muted` | `#44423D` / `#5C5952` | on `#FFFFFF` (on `#EFECE6`) | **10.04:1** (**8.51:1**) / **6.99:1** (**5.93:1**) | AAA / AA |
| Marigold on Light Surfaces | `--marigold` | `#995300` (hover `#7D4300`) | on `#FFFFFF` / `#F7F5F0` / `#EFECE6` | **5.85:1** / **5.37:1** / **4.96:1** | AA |
| Marigold Play Button (Light) | `--marigold` / `--on-ink` | `#FFFFFF` on `#995300` | Light-surface audio player CTA | **5.85:1** | AA |
| Dark Card & Text on Dark | `--dark-bg` / `--dark-ink` / `--dark-muted` | `#161513` (inset `#22201D`) / `#F7F5F0` / `#CFCAC2` | on `#161513` (`--dark-muted` on `#22201D`) | **16.75:1** / **11.19:1** (**9.97:1**) | AAA |
| Bright Marigold (Dark Card Only) | `--marigold-dark` | `#F2A93B` | on `#161513` / `#22201D` | **9.14:1** / **8.14:1** | AAA |
| Bright Marigold Play Button (Dark) | `--ink` on `--marigold-dark` | `#1C1B19` on `#F2A93B` | Dark polished-answer Play button | **8.62:1** | AAA |
| Sample-Feedback Notice (Neutral) | `--bg-stone` / `--ink` | `#1C1B19` on `#EFECE6` (border `#C8C3B8`) | Neutral stone box with small `i` icon | **14.60:1** | AAA |
| Success (Mock Answered) | `--success` / `--success-tint` | `#235B3A` on `#ECF3EE` (border `#BDD4C4`) | `#235B3A` on `#ECF3EE` (`#FFFFFF` on `#235B3A`) | **7.08:1** (**7.99:1**) | AAA |
| Destructive (Discard) | `--danger` / `--danger-tint` | `#9A1C2E` on `#FDF2F4` (border `#F2BDC5`) | `#9A1C2E` on `#FDF2F4` | **7.44:1** | AAA |
| Disabled Button | `--disabled-bg` / `--disabled-text` | `#E6E2DA` (border `#C8C3B8`) / `#504D47` | `#504D47` on `#E6E2DA` | **6.52:1** | AA |

### Sparing Use of Marigold
Marigold is restricted strictly to focal cues—never large fills or body copy:
- Audio **Play** buttons and audio progress bars (`#995300` on light, `#F2A93B` on dark).
- **`Sample focus for this retry`** uppercase label on `practice.html`.
- Active **current step** indicator in the `mock-interview.html` 3-turn stepper.
- **Link hover underline** and dark-card keyword/label highlights (`#F2A93B`).

---

## 2. Review Fixes Applied

1. **Dedicated Behavioral feedback screen (`feedback-behavioral.html`)**: Removed the Behavioral note from the technical `feedback.html` screen and created `feedback-behavioral.html` showing the Behavioral question (*Ownership and impact*), the **Structure outline** card (*Situation → Your decision → Result → What you learned*) in place of the sample polished answer, and the behavioral follow-up (*"Which decision in this project was yours, and why did you make it?"*).
2. **Answered `✓` icon in mock-interview stepper**: Restored a crisp `✓` checkmark icon inside the muted green badge on Turn 1 (*Behavioral · Answered*).
3. **Clean mobile collapsed feedback bar**: On 390 px mobile, the collapsed bar above feedback shows only the topic (*Debugging and testing* / *Ownership and impact*) without a truncated `"An …"` stub; desktop shows topic + prompt.
4. **Desktop question strip scroll buttons & mobile `<select>` chevron**: Added 44 × 44 px left/right scroll buttons flanking the overflowing desktop question strip, and replaced the default mobile `<select>` arrow with a custom SVG chevron and `pr-10` right padding.
5. **Stable `/practice` header navigation**: Kept `Home` and `Mock interview` stable across `practice.html`, `feedback.html`, and `feedback-behavioral.html`, adding `Session recap` on both practice and feedback screens once an attempt exists.
6. **Plain rubric rows**: Removed the hollow circles on `feedback.html` and `feedback-behavioral.html` so rubric items clearly read as static text to check rather than clickable checkboxes.
7. **Mobile & finished-round nits**: Made mobile recap CTAs full-width stacked buttons, organized mobile mock-interview action buttons into a tidy full-width/2-column grid, and replaced the red *"Discard round"* button in the finished-round self-review with a neutral **"Start new round"** button.
