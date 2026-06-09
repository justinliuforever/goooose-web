import { permanentRedirect } from "next/navigation";

// §5: Poet is a per-project tool, no global hub. Old /poet lands on the account list.
export default function PoetLandingRedirect() {
  permanentRedirect("/accounts");
}
