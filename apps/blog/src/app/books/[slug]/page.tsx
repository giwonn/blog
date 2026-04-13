import { Container } from "@/components/ui/Container";
import { BookDetail } from "@/features/books/BookDetail";

type Params = Promise<{ slug: string }>;

export default async function BookDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Container className="py-10">
      <BookDetail slug={slug} />
    </Container>
  );
}
