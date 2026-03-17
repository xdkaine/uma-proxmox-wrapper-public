import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeContent } from "@/components/home/home-content";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (!session.user?.isLoggedIn) {
    redirect("/login");
  }

  return (
    <HomeContent
      username={session.user.username}
      displayName={session.user.displayName || session.user.username}
    />
  );
}
