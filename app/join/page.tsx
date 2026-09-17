import { Suspense } from "react";
import { JoinFlow } from "./join-flow";

export const metadata = { title: "Get started", description: "Mushy is invite-only. Get in with a friend's link or grab a spot on the list." };

const BOT_NUMBER = process.env.NEXT_PUBLIC_BOT_NUMBER ?? "+12053968556";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinFlow botNumber={BOT_NUMBER} />
    </Suspense>
  );
}
