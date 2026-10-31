# Translations

Q7 Chat ships with 17 languages. Translation files live in `langs/` and are plain JSON objects with string keys.

## Current languages

| Code | Language | Direction |
| --- | --- | --- |
| `en` | English | LTR |
| `tr` | Türkçe | LTR |
| `de` | Deutsch | LTR |
| `zh` | 中文（普通话） | LTR |
| `ja` | 日本語 | LTR |
| `ko` | 한국어 | LTR |
| `fr` | Français | LTR |
| `es` | Español | LTR |
| `pt` | Português | LTR |
| `ru` | Русский | LTR |
| `pl` | Polski | LTR |
| `uk` | Українська | LTR |
| `hi` | हिन्दी | LTR |
| `id` | Bahasa Indonesia | LTR |
| `it` | Italiano | LTR |
| `nl` | Nederlands | LTR |
| `ar` | العربية | RTL |

## Adding a language

1. Copy `langs/en.json` to `langs/<code>.json`. Use a lowercase ISO 639-1 code.
2. Translate every value. Do not change keys, key order, or `{placeholder}` tokens.
3. Add the language to `LANGS` in `lib/i18n.tsx`:

   ```ts
   { code: "sv", name: "Svenska" }
   ```

4. Add a lazy loader in the same file:

   ```ts
   sv: () => import("../langs/sv.json")
   ```

5. If the language is right-to-left, extend the direction check in `I18nProvider`.
6. Run `npm test`. `tests/i18n.test.ts` checks:
   - one file per registered language, and no extra files;
   - identical key order across all files;
   - no empty values;
   - identical placeholder sets.

## Editing existing translations

- Keep the key order exactly as in `en.json`.
- Keep placeholders such as `{n}`, `{name}` or `{code}` unchanged.
- Preserve punctuation style where it affects layout, but adapt quotes and spacing to the target language.
- Do not translate product names such as Q7 Chat, Q7 code or Q7RP.
- Prefer short strings: the rail, mobile navigation and buttons have limited space.

## Review checklist

- [ ] `npm test` passes.
- [ ] The language appears in Settings → Language.
- [ ] The app reloads with the new dictionary.
- [ ] Long strings do not overflow the rail or mobile nav.
- [ ] RTL languages flip the layout correctly.
- [ ] Dates, durations and file sizes read naturally.

## Machine translation

Machine translation is acceptable as a starting point, but a native speaker should review anything shipped to users. Security-sensitive strings (key verification, backup warnings, encryption claims) deserve extra care.
