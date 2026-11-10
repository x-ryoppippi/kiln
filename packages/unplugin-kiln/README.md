# unplugin-kiln

Build-time compiler for [kiln](../kiln/README.md), powered by oxc. It compiles literal styles in `css(...)`, `styled(_, {...})` and `css={{...}}`, hoists them to module scope, and can extract them into a stylesheet.

```ts
import kiln from "unplugin-kiln/vite"; // or /rollup, /rolldown, /webpack, /rspack, /rsbuild, /esbuild, /bun, /farm, /unloader
import withKiln from "unplugin-kiln/next"; // Next.js, webpack and Turbopack
```

Options and the rules for what gets compiled are in the [kiln README](../kiln/README.md#compiler).
