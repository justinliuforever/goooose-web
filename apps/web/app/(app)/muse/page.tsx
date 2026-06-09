import { permanentRedirect } from "next/navigation";

// §5: Muse is a per-project tool, no global hub. Old /muse lands on the account list.
export default function MuseLandingRedirect() {
  permanentRedirect("/accounts");
}
