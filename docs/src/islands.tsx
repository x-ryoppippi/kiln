import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";

const components = import.meta.glob<{ default: ComponentType<Record<string, unknown>> }>("./components/*.tsx", {
  eager: true,
});

// ox-content renders each PascalCase tag in an .mdx page as an empty island host; mount the component of that name.
for (const host of document.querySelectorAll<HTMLElement>("[data-ox-island]")) {
  const Component = components[`./components/${host.dataset.oxIsland}.tsx`]?.default;
  if (!Component) continue;
  const props = host.dataset.oxProps ? (JSON.parse(host.dataset.oxProps) as Record<string, unknown>) : {};
  createRoot(host).render(<Component {...props} />);
}
