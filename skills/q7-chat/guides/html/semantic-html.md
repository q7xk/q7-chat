# Semantic HTML in Q7 Chat

Use native HTML elements with built-in semantics and behavior instead of custom `div`/`span` implementations.

## Prefer native interactive elements

Use `<button>` for actions, `<a href>` for navigation, `<input>`, `<textarea>`, `<select>`, `<dialog>`, and `<details>`/`<summary>` where appropriate. Native elements provide keyboard operability, focus management, and screen-reader announcements for free.

## Use landmark elements

Wrap regions in `<header>`, `<nav>`, `<main>`, `<section>`, `<aside>`, and `<footer>`. The chat shell should have one `<main id="main-content">` and a `<nav>` for the rail/mobile navigation.

## Headings and structure

Use a single `<h1>` per page and a logical heading hierarchy (`<h2>` → `<h3>`) so screen-reader users can navigate by heading.

## Language and direction

Set `lang` and `dir` on `<html>` based on the active language (`ar`, `fa` → `rtl`). Q7 Chat supports Arabic and Persian RTL.

```tsx
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' || lang === 'fa' ? 'rtl' : 'ltr';
```

## Fallback strategies

If a custom widget cannot reuse a native element, apply the correct ARIA role, `aria-label`, keyboard handlers, and focus management to approximate native behavior.
