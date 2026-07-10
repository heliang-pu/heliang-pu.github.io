# Portfolio Technical Optimization Design

## Objective

Improve the current static portfolio's crawl correctness, mobile usability, accessibility, media loading, and asset size without changing the visual identity or making unverified factual edits.

The resulting site must remain a framework-free GitHub Pages site served from the repository root.

## Confirmed Scope

### Included

- Correct the production hostname in `robots.txt` and `sitemap.xml`.
- Make the mobile visual order match the DOM and keyboard focus order.
- Prevent the language and theme controls from covering identity text at 320 CSS pixels.
- Provide an accessible compact mobile navigation while keeping the existing desktop sidebar.
- Load each demo video only after an explicit play action and keep a direct-link fallback.
- Give every generated play button a unique, localized accessible name.
- Remove whole-container and metric-count animations that temporarily hide or falsify key content.
- Complete reduced-motion and dark-theme skip-link handling.
- Correct the favicon request and the small 404-page overflow.
- Downsample the two oversized school emblems without changing their appearance at rendered size.
- Recompress the existing two-page PDF resume without changing its text, page geometry, or visual layout.
- Add dependency-free contract tests for the static files and perform browser QA at desktop, tablet, and mobile widths.

### Excluded

- Changing the English name, education status, employer, email address, project claims, or other personal facts.
- Rewriting project copy or inventing evaluation protocols for the headline metrics.
- Creating a new English resume or modifying resume content.
- Adding a framework, build pipeline, analytics, third-party JavaScript, or a new hosting provider.
- A broad visual redesign or reordering the desktop content sections.

## Design Decisions

### 1. Crawl Configuration

`robots.txt` will advertise `https://heliang-pu.github.io/sitemap.xml`. The sitemap will contain only `https://heliang-pu.github.io/` and will omit the manually maintained `lastmod` field so it cannot become misleading again.

A contract test will fail if `aurorabot-ai.github.io` appears in either file or if the sitemap host differs from the canonical host in `index.html`.

### 2. Responsive Structure and Focus Order

Desktop keeps the current two-column sidebar and main-content presentation.

At widths up to 980 pixels:

- The desktop sidebar is hidden.
- The `.main` element is no longer moved with a negative `order` value.
- A real mobile navigation appears before the main content in both DOM and visual order.
- The mobile navigation uses native `<details>` and `<summary>` elements, followed by the existing section anchors and contact/profile links. It works without JavaScript and is keyboard accessible.
- Language and theme buttons are grouped in a `.site-controls` container. The container is fixed at the upper right on desktop and participates in normal document flow on mobile, so it cannot overlap the identity card at 320 pixels.

The mobile sequence will be: controls, identity, compact navigation, main content. The desktop sequence and appearance remain sidebar plus main content.

At tablet widths, the five-step pipeline will change to a two- or three-column grid rather than five narrow columns. At narrow mobile widths it will become one column. Existing cards retain their current styling.

### 3. Video Loading and Failure Handling

All nine `<video>` elements will explicitly use `preload="none"`. Their `<source>` elements keep the release URL in `data-src`, preventing browser prefetch before user intent.

The IntersectionObserver that currently assigns video sources will be removed. The generated overlay button will:

1. Copy `data-src` to `src` on first activation.
2. Call `load()` and request playback.
3. Keep the native video controls available.
4. Preserve a direct GitHub Release link as a no-JavaScript or playback-failure fallback.

The overlay button's accessible name will be derived from the localized `<video aria-label>`, making all nine controls unique. `applyLang()` will refresh both video and overlay-button labels after a language switch.

The implementation will not change video files or hosting in this patch. The known `application/octet-stream` response from GitHub Releases remains a documented hosting limitation.

### 4. Motion, Contrast, and Stable Content

The hero and top-level sections will no longer begin fully transparent. The metric values will remain at their final values instead of counting upward from zero. Decorative trajectory and hover effects may remain.

When `prefers-reduced-motion: reduce` is active, smooth scrolling will be disabled in addition to the existing animation and transition reductions.

In dark mode, the focused skip link will use dark text on the bright teal background so its contrast meets the normal-text target.

The generated play buttons will remain visible to keyboard and screen-reader users and will have names that identify the corresponding demo.

### 5. Static Asset Optimization

The two 512-by-512 school emblems will be downsampled to 128-by-128 PNG files at the same paths. Transparency and visible appearance at the current 46-pixel render size must be preserved. Each resulting file must be below 80 KiB.

The existing PDF resume will be recompressed to a target of at most 3 MiB, with an aspirational target of 2 MiB. Acceptance requires:

- Two pages before and after.
- Identical page dimensions.
- Extracted text remains present.
- Rendered before/after page images show no clipped text, missing images, or visibly destructive compression.

If those requirements cannot be met, the original PDF remains unchanged.

The favicon will use the existing local icon asset instead of the emoji data URL that still causes `/favicon.ico` fallback requests in the tested browser.

### 6. 404 and Metadata Maintenance

The 404 page body will use border-box sizing and a small-viewport-height unit so its padding does not create a 48-pixel vertical overflow.

The visible "Last updated" month will be updated to `2026.07`, matching this published technical update. No automatic date generation will be introduced.

## Testing Strategy

### Automated Static Contracts

A new `tests/site-contract.test.mjs` file will use only Node's built-in `node:test`, `assert`, and filesystem modules. It will verify:

- canonical, robots, and sitemap hosts agree;
- the old AuroraBot hostname is absent;
- nine videos use `preload="none"` and deferred `data-src` values;
- the eager IntersectionObserver video-loading path is absent;
- mobile navigation exists and desktop sidebar is hidden at the mobile breakpoint;
- reduced-motion disables smooth scrolling;
- generated play buttons use localized video labels;
- both school emblems are 128 by 128 and under 80 KiB;
- the resume PDF is under 3 MiB after successful recompression; page count, text extraction, and visual fidelity are verified in artifact QA rather than by the dependency-free Node test;
- referenced local assets exist.

Each behavior-changing test will be written and observed failing before the corresponding implementation is added.

### Browser QA

The final site will be tested at approximately 1440x900, 768x900, 390x844, and 320x568. The checks are:

- correct title and meaningful first screen;
- no horizontal overflow;
- no framework overlay or relevant console error;
- keyboard focus follows visible mobile order;
- mobile controls do not overlap identity text;
- mobile navigation reaches the requested section;
- language and theme toggles update visible and accessible state;
- a demo video receives its source only after play activation;
- no video source is assigned merely by scrolling near the Demo section;
- the custom 404 returns a usable centered layout without vertical overflow.

### Artifact QA

The optimized school emblems and both resume pages will be rendered and visually inspected before committing. The live deployment will be compared with the pushed commit after GitHub Pages updates.

## Delivery

Implementation will be committed intentionally on `main` and pushed to `origin/main`, as requested. The final handoff will include the commit identifier, pushed branch, verification results, any item deliberately left unchanged, and the live deployment status.
