import type { Preview } from "@storybook/react-vite";
import { color, typography } from "../src/tokens/index";

// 27-F19: light theme is the DEFAULT on every surface. Positive polarity wins on acuity and
// proofreading for younger and older adults alike, and the advantage is largest at small
// character sizes — which is where the POS lives. Dark is a per-site KDS opt-in only.
const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        surface: { name: "surface (default)", value: color["bgColor-surface"] },
        raised: { name: "raised", value: color["bgColor-surface-raised"] },
      },
    },
  },
  initialGlobals: { backgrounds: { value: "surface" } },
  decorators: [
    (Story) => {
      document.body.style.fontFamily = typography["text-body"].fontFamily;
      document.body.style.color = color["fgColor-default"];
      return Story();
    },
  ],
};
export default preview;
