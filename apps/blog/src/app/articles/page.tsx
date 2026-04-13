import { Container } from "@/components/ui/Container";
import { ArticleList } from "@/features/articles/ArticleList";
import { Suspense } from "react";

type SearchParams = Promise<{ filter?: string }>;

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter } = await searchParams;

  return (
    <Container className="py-10">
      <Suspense fallback={<div>로딩 중...</div>}>
        <ArticleList filter={filter} />
      </Suspense>
    </Container>
  );
}
