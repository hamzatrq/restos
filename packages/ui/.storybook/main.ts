import type { StorybookConfig } from "@storybook/react-vite";

// 21 §2: `packages/ui` is a CLOSED vocabulary. Storybook is where each entry proves it —
// every component states its posture, its target size, and what it expects a non-reader to
// be able to do with it (27-F35's ≥85% comprehension gate is run against these stories).
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: { name: "@storybook/react-vite", options: {} },
};
export default config;
