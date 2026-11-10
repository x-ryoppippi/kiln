import { createFileRoute } from "@tanstack/react-router";
import { css } from "kiln";

// Used by the loader, which stays in this module, and by both components, which the router splits off.
const [card, CardStyles] = css({ padding: 12, borderRadius: 8, outline: "1px solid #d0d7de" });

export const Route = createFileRoute("/team")({
  loader: () => ({ members: ["Ada", "Grace", "Linus"], cardClass: card }),
  component: Team,
  errorComponent: TeamError,
});

function Team() {
  const { members, cardClass } = Route.useLoaderData();
  return (
    <main css={{ display: "grid", gap: 8 }}>
      <CardStyles />
      {members.map((name) => (
        <p key={name} className={cardClass} css={{ margin: 0, color: "#0969da" }}>
          {name}
        </p>
      ))}
    </main>
  );
}

function TeamError() {
  return (
    <p className={card} css={{ margin: 0, color: "#cf222e", letterSpacing: 1 }}>
      <CardStyles />
      The team could not be loaded.
    </p>
  );
}
