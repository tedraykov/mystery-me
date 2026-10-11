import { Presenter } from "@/components/Presenter";

/** The TV screen. It has no player cookie; the secret key in the link is what lets it in. */
export default async function PresentPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ k?: string; lang?: string }>;
}) {
  const { code } = await params;
  const { k, lang } = await searchParams;
  return <Presenter code={code.toUpperCase()} presenterKey={k ?? ""} lang={lang} />;
}
