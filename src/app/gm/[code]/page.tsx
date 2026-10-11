import { GameMaster } from "@/components/GameMaster";

export default async function GmPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GameMaster code={code.toUpperCase()} />;
}
