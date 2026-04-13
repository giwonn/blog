import { Container } from "@/components/ui/Container";
import { SeriesDetail } from "@/features/series/SeriesDetail";

type Params = Promise<{ slug: string }>;

export default async function SeriesDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Container className="py-10">
      <SeriesDetail slug={slug} />
    </Container>
  );
}
