import type { Config } from "tailwindcss";
const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"), panel: c("panel"), container: c("container"), raised: c("raised"), highest: c("highest"),
        line: c("line"), ink: c("text"), muted: c("muted"), accent: c("accent"), local: c("local"), danger: c("danger"),
        pc: c("pc"), onpc: c("onpc"), sc: c("sc"), onsc: c("onsc"), tc: c("tc"), ontc: c("ontc"),
      },
      fontFamily: { sans: ['"Google Sans Flex"', '"Google Sans"', '"Roboto Flex"', "Roboto", '"Avenir Next"', '"Segoe UI Variable"', "system-ui", "-apple-system", "sans-serif"] },
      // Material 3 shape scale
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "20px", "2xl": "24px", "3xl": "28px" },
      transitionTimingFunction: { spring: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    },
  },
  plugins: [],
};
export default config;
