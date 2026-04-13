import { Container } from "@/components/ui/Container";
import { ReadingProgressBar } from "@/components/ui/ReadingProgressBar";
import { Article } from "@/features/articles/Article";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ series?: string; book?: string }>;

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { series, book } = await searchParams;

  return (
    <>
      <ReadingProgressBar />
      <Container className="py-10">
        <Article slug={slug} seriesSlug={series} bookSlug={book} />
      </Container>
    </>
  );
}
