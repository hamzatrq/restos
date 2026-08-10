import type { Preview } from "@storybook/react-vite";
import { installFontFaces } from "../src/fonts/index";
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
      // 27-F26 — the face as BYTES, not just a name. Storybook is where `27-F35`'s comprehension
      // claims are written, and a story rendered in the wrong face is evidence about the wrong
      // artifact: tabular digits and a distinct `I`/`l` are the properties the FR selected for,
      // and neither survives a fallback. Idempotent, so HMR does not stack copies.
      installFontFaces();
      document.body.style.fontFamily = typography["text-body"].fontFamily;
      document.body.style.color = color["fgColor-default"];
      return Story();
    },
  ],
};
export default preview;
