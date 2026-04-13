import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Article, ArticleNeighbors, ArticleRequest, ArticleFilter } from "./types";
import { VISIBLE_STATUSES } from "./types";
import type { Page } from "../../pagination";

function nowIso(): string {
  return new Date().toISOString();
}

function isVisible(status: Article["status"]): boolean {
  return VISIBLE_STATUSES.includes(status);
}

export async function findAllPaginated(page: number, size: number): Promise<Page<Article>> {
  return await repo.findAllPaginated(page, size);
}

export async function findVisibleByFilterPaginated(
  filter: ArticleFilter,
  page: number,
  size: number,
): Promise<Page<Article>> {
  return await repo.findVisibleByFilterPaginated(filter, page, size);
}

export async function findById(id: number): Promise<Article> {
  const article = await repo.findById(id);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  return article;
}

export async function findBySlug(slug: string): Promise<Article> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  return article;
}

/**
 * Public-blog read with visibility + password gating. Mirrors the Kotlin
 * `ArticleService.findBySlugForBlog`. Hidden statuses (DRAFT, PRIVATE)
 * return 404 to avoid leaking existence.
 */
export async function findBySlugForBlog(slug: string, password: string | null): Promise<Article> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (!isVisible(article.status)) {
    throw BusinessError.from("ARTICLE_NOT_FOUND");
  }
  if (article.status === "LOCKED" && article.password !== null) {
    if (password === null) {
      throw BusinessError.from("ARTICLE_PASSWORD_REQUIRED");
    }
    if (password !== article.password) {
      throw BusinessError.from("ARTICLE_PASSWORD_INCORRECT");
    }
  }
  return article;
}

/**
 * Returns previous/next neighbors. The `seriesSlug` and `bookSlug` params
 * are markers — their values are not used, only their presence determines
 * which mode to dispatch. Mirrors the Kotlin NeighborArticleService.
 */
export async function findNeighbors(
  slug: string,
  seriesSlug: string | null,
  bookSlug: string | null,
): Promise<ArticleNeighbors> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (seriesSlug !== null && article.seriesId !== null) {
    return await repo.findNeighborsInSeries(article);
  }
  if (bookSlug !== null && article.bookId !== null) {
    return await repo.findNeighborsInBook(article);
  }
  return await repo.findNeighborsByPublishedAt(article);
}

export async function create(req: ArticleRequest): Promise<Article> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
  }
  const now = nowIso();
  const publishedAt = isVisible(req.status) ? now : null;
  return await repo.insert(req, publishedAt, now);
}

export async function update(id: number, req: ArticleRequest): Promise<Article> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
    }
  }
  const now = nowIso();
  // publishedAt auto-set: DRAFT/PRIVATE → PUBLIC/LOCKED transition with
  // existing.publishedAt == null → set to now.
  let publishedAt = existing.publishedAt;
  const wasNotVisible = !isVisible(existing.status);
  const willBeVisible = isVisible(req.status);
  if (wasNotVisible && willBeVisible && publishedAt === null) {
    publishedAt = now;
  }
  return await repo.update(id, req, publishedAt, now);
}

export async function deleteArticle(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  await repo.deleteById(id);
}
