/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // 预览区 HTML 由 markdown-it 生成、用注入的主题 CSS 渲染，
  // 不能被 Tailwind 的 preflight reset 影响，因此禁用 preflight。
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
