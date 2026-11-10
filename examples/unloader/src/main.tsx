import { renderToString } from "react-dom/server";

import { App } from "./App.tsx";

export function render(stylesheets: readonly string[]): string {
  const document = renderToString(
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>kiln example</title>
        {stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <div id="root">
          <App bundler="unloader" />
        </div>
      </body>
    </html>,
  );
  return `<!doctype html>\n${document}\n`;
}
