import { getArticle, getArticleNeighbors } from "@/actions/articles";
import { MDXContent } from "@/lib/mdx";
import { TableOfContents } from "@/components/mdx/TableOfContents";
import { Container } from "@/components/ui/Container";
import { Utterances } from "@/components/ui/Utterances";
import { ArticleNeighborNav } from "@/features/articles/components/ArticleNeighborNav";
import { notFound } from "next/navigation";
import Link from "next/link";

interface ArticleDetailProps {
  slug: string;
  seriesSlug?: string;
  bookSlug?: string;
}

export async function Article({ slug, seriesSlug, bookSlug }: ArticleDetailProps) {
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  const neighbors = await getArticleNeighbors(slug, seriesSlug, bookSlug);

  return (
    <Container className="relative !px-0 py-10">
      <article className="prose dark:prose-invert max-w-[calc(100%-4rem)] mx-auto">
        {seriesSlug && (
          <div className="mb-4">
            <Link href={`/series/${seriesSlug}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline no-underline">
              &larr; 시리즈로 돌아가기
            </Link>
          </div>
        )}
        {bookSlug && (
          <div className="mb-4">
            <Link href={`/books/${bookSlug}`} className="text-sm text-green-600 dark:text-green-400 hover:underline no-underline">
              &larr; 독후감으로 돌아가기
            </Link>
          </div>
        )}
        <h1 className="mb-4 text-3xl md:text-4xl lg:text-5xl font-bold">{article.title}</h1>
        <div className="mb-8 text-gray-500">{article.date}</div>
        <MDXContent source={article.content} />
        <ArticleNeighborNav neighbors={neighbors} seriesSlug={seriesSlug} bookSlug={bookSlug} />
        <div className="mt-16">
          <Utterances />
        </div>
      </article>
      <aside className="hidden min-[1380px]:block absolute top-0 bottom-0 left-full min-[1460px]:left-[calc(100%+3rem)] w-64 transition-[left] duration-300 ease-in-out">
        <div className="sticky top-16">
          <TableOfContents content={article.content} />
        </div>
      </aside>
    </Container>
  );
}
