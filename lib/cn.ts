export const cn = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" ");
