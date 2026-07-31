/**
 * 统一 UI 动画参数。
 *
 * CSS 侧（Tailwind 主题与 globals.css）对应：
 *   --duration-fast: 130ms  → MOTION_DURATION_FAST
 *   --duration-med: 160ms   → MOTION_DURATION_MEDIUM
 * 曲线统一使用 --ease: cubic-bezier(0.16, 1, 0.3, 1)。
 */

/** 浮层/对话框淡入缩放：0.13s，与 CSS --duration-fast 同档。 */
export const MOTION_DURATION_FAST = 0.13;

/** 列表滑入、Toast：0.16s，与 CSS --duration-med 同档。 */
export const MOTION_DURATION_MEDIUM = 0.16;

/** 侧栏抽屉等大位移元素：0.2s，比浮层稍慢以增强滑入感。 */
export const MOTION_DURATION_DRAWER = 0.2;

/** 统一缓动曲线（与 globals.css 的 --ease 一致）。 */
export const MOTION_EASE_SMOOTH: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** 侧栏抽屉滑入用缓动：先快后慢，位移类动画更自然。 */
export const MOTION_EASE_OUT = "easeOut" as const;

/** 树节点逐行展开的错峰间隔。 */
export const MOTION_STAGGER_STEP = 0.02;

/** 浮层弹入用低弹性弹簧：轻微 Q 弹，避免生硬 tween。 */
export const MOTION_SPRING_POP = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.9,
} as const;
