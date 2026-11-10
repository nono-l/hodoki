import { createFileRoute } from "@tanstack/react-router";
import { HodokiApp } from "@/components/HodokiApp";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <HodokiApp />;
}
