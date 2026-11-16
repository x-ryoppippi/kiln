import { css } from "kiln";

export const card = css({
  padding: 0,
  borderRadius: 4,
  "@media (min-width: 600px)": { padding: 8 },
  "@media (min-width: 900px)": { padding: 16 },
});
