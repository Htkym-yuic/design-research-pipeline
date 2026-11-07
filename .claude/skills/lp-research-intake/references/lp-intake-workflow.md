# LP Intake Workflow

This workflow captures LP candidates into the user's design research system before analysis.

## Scope

Use this workflow for:
- taking LP candidates from LP Archive or another reference source
- assigning the next `LP-0000` ID
- capturing PC/SP screenshots
- saving source images to Dropbox
- creating Notion-ready lightweight JPEGs
- creating a temporary Notion page for later analysis

Do not include full design analysis unless the user explicitly asks to continue into analysis. Analysis and Creative Brief Studio AI knowledge sync are later stages.

## Canonical Locations

GitHub repository:
`https://github.com/Htkym-yuic/design-research-pipeline`

Dropbox base:
`/design/Design_Research_Library/LP_Research_Library/`

Default intake/review path:
`/design/Design_Research_Library/LP_Research_Library/99_Needs_Review/{YYYY-MM-DD}/`

Notion database:
`デザイン｜ホーム / 02｜デザインリサーチ / 01｜LPリサーチライブラリー`

Known Notion data source:
`collection://39624d4f-a671-8094-ba0c-000b11fefbd0`

## ID Rules

Use four-digit IDs: `LP-0001`, `LP-0214`, etc.

Before assigning IDs, check the current maximum already present in Notion or the relevant source of truth. Continue from the maximum plus one. In this system, legacy LP records already reached at least `LP-0213`, so new LP Archive test candidates began at `LP-0214`.

Do not restart numbering from the number of candidates in a single run.

## Source URL Rules

Record both:
- the actual captured LP URL
- the reference/detail URL when the source has one, such as an LP Archive detail page

Do not stop at a category or listing URL when a specific detail page or captured page URL is available.

For LP Archive, prefer:
- `参考URL`: actual captured LP URL
- body note or metadata: LP Archive detail URL
- `出典`: `LP Archive`

## Screenshot Set

Capture both PC and SP views.

Preferred full analysis display order when matching LP-0180-style records:
1. PC Full Page
2. PC First View
3. PC Section一覧
4. SP Full Page
5. SP First View
6. SP Section一覧

For temporary image-test pages, a lighter four-image set is acceptable:
1. PC First View
2. PC Sections / Full Map
3. SP First View
4. SP Sections / Full Map

The user's acceptable Notion format may differ from older LP-0180 records. It should still preserve the same review intent: first view and a page-wide map for PC and SP.

Keep source/original images in Dropbox. Use lightweight images for Notion.

If an SP full-page screenshot is wider than the intended mobile viewport, do not treat it as complete. Re-capture or rebuild the SP full page at the intended mobile width, normally 375 px, and verify the resulting image dimensions before updating Dropbox or Notion. For pages whose internal layout width expands during Playwright full-page capture, use stitched viewport screenshots rather than a single `fullPage` screenshot.

## Notion Image Rules

For Notion Free-plan safety, keep each uploaded image under 5 MB.

Preferred Notion images:
- JPEG
- about 720 px wide
- compressed enough to stay below 5 MB

Do not upload every raw PNG to Notion by default. Store raw/full PNGs and individual section PNGs in Dropbox, then put only the review images into Notion.

## Dropbox Rules

Create or use a folder for each LP item under the date intake folder, for example:
`.../99_Needs_Review/2026-09-26/lp-archive-candidates-LP-0214-LP-0221/LP-0214-awarefy/`

Keep:
- source metadata
- full screenshots
- first-view screenshots
- section or map screenshots
- Notion-ready JPEGs

Inside each LP item folder, separate the files by use:
- `metadata.json` remains at the item-folder root.
- `01_Normal_Images/` contains ordinary/source image files such as PNG first views, full-page screenshots, section indexes, section previews, and individual section folders.
- `02_Notion_Images/` contains only lightweight Notion-ready files such as `*_notion.jpg`.

This separation is part of the standard Dropbox intake shape. Do not leave normal PNGs and Notion JPEGs mixed together in the item-folder root after intake.

Avoid deleting old or duplicate Dropbox files unless the user explicitly asks. If deletion is requested, identify the files first and confirm the destructive action.

## Notion Page Rules

Create the intake page in `01｜LPリサーチライブラリー`.

For a temporary page before analysis:
- title should include the ID, brand/site name, and indicate it is temporary or image-test if appropriate
- `ステータス`: `未着手`
- `分析完了`: unchecked
- `Notion同期`: checked when the image test page has been created
- `CBS同期状態`: `未同期`
- `ナレッジ化ステータス`: `未着手`
- `取得日`: actual collection date
- `参考URL`: actual captured LP URL
- `出典`: source name such as `LP Archive`
- `Dropbox正本パス`: folder containing the source files

For body content, keep it light before analysis:
- short note that analysis is not yet included and the page may be deleted or overwritten
- basic source information
- four Notion-ready images in the preferred order
- note that originals are stored in Dropbox
- point to the item folder, where normal images and Notion-ready images are separated into `01_Normal_Images/` and `02_Notion_Images/`

## GitHub Pipeline Notes

The `design-research-pipeline` repo should eventually automate:
- candidate extraction
- screenshot capture
- lazy-load asset preloading
- ad/cookie overlay cleanup when safe
- Notion JPEG generation
- artifact upload
- later knowledge export

When the user asks to improve the pipeline, prefer making the repeatable steps automatic in the repo rather than relying on one-off local conversions.

If adding image conversion to GitHub Actions, use a cross-platform tool such as `sharp` instead of macOS-only `sips`.

Before calling an LP intake or corrected screenshot set complete, run the repository checks when they are available:

```bash
npm run knowledge:validate-lp -- --input <analysis.md または metadata.json>
npm run knowledge:crosscheck-lp -- --input <LPフォルダ>
```

`knowledge:crosscheck-lp` should pass against the Dropbox item folder before the user is told the Dropbox source set is complete. If it fails, report the concrete failure, fix the asset set when requested, and run it again.

## Current LP-0214 Test Pattern

The current test item is:
- `LP-0214`
- brand/site: `Awarefy`
- captured URL: `https://www.awarefy.com/app`
- LP Archive detail URL: `https://rdlp.jp/archives/otherdesign/lp/229261`

Its Notion test page used four lightweight images:
1. PC First View
2. PC Sections / Full Map
3. SP First View
4. SP Sections / Full Map

This example is a reference pattern, not a hardcoded target for future IDs.

## Current LP-0215 Completion Pattern

LP-0215 established the current validation pattern:
- SP Full Page must be 375 px wide for the mobile source set.
- Corrected SP images should be reflected to Dropbox first, then Notion content should be updated to remove stale “SP width unconfirmed” wording.
- The final Dropbox folder must pass `knowledge:crosscheck-lp` with 0 warnings before the SP asset correction is called complete.
- Commit and push repository changes when the user asks to close out the GitHub side.
