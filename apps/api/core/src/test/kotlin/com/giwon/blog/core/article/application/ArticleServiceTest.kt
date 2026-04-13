package com.giwon.blog.core.article.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.article.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import java.time.LocalDateTime

@ExtendWith(MockitoExtension::class)
class ArticleServiceTest {

    @Mock lateinit var articleReader: ArticleReader
    @Mock lateinit var articleWriter: ArticleWriter
    @Mock lateinit var articleDomainService: ArticleDomainService

    lateinit var cacheManager: CacheManager
    lateinit var articleService: ArticleService

    @BeforeEach
    fun setUp() {
        cacheManager = ConcurrentMapCacheManager("articles", "articleList")
        articleService = ArticleService(articleReader, articleWriter, articleDomainService, cacheManager)
    }

    // --- Helper ---

    private fun createArticle(
        id: Long = 1L,
        title: String = "제목",
        content: String = "내용",
        slug: String = "test-slug",
        status: ArticleStatus = ArticleStatus.PUBLIC,
        password: String? = null,
        publishedAt: LocalDateTime? = LocalDateTime.now().minusDays(1),
        seriesId: Long? = null,
        orderInSeries: Int? = null,
        bookId: Long? = null,
        orderInBook: Int? = null,
    ) = Article(
        id = id,
        title = title,
        content = content,
        slug = slug,
        status = status,
        password = password,
        publishedAt = publishedAt,
        seriesId = seriesId,
        orderInSeries = orderInSeries,
        bookId = bookId,
        orderInBook = orderInBook,
    )

    // --- 조회: findById ---

    @Nested
    inner class FindById {

        @Test
        fun `PUBLIC 글은 캐시에 저장한다`() {
            val article = createArticle(status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)

            articleService.findById(1L)
            articleService.findById(1L)

            verify(articleReader, times(1)).findById(1L)
        }

        @Test
        fun `LOCKED 글은 캐시에 저장한다`() {
            val article = createArticle(status = ArticleStatus.LOCKED, password = "1234")
            whenever(articleReader.findById(1L)).thenReturn(article)

            articleService.findById(1L)
            articleService.findById(1L)

            verify(articleReader, times(1)).findById(1L)
        }

        @Test
        fun `DRAFT 글은 캐시에 저장하지 않는다`() {
            val article = createArticle(status = ArticleStatus.DRAFT, publishedAt = null)
            whenever(articleReader.findById(1L)).thenReturn(article)

            articleService.findById(1L)
            articleService.findById(1L)

            verify(articleReader, times(2)).findById(1L)
        }

        @Test
        fun `PRIVATE 글은 캐시에 저장하지 않는다`() {
            val article = createArticle(status = ArticleStatus.PRIVATE)
            whenever(articleReader.findById(1L)).thenReturn(article)

            articleService.findById(1L)
            articleService.findById(1L)

            verify(articleReader, times(2)).findById(1L)
        }

        @Test
        fun `존재하지 않는 글 조회 시 예외`() {
            whenever(articleReader.findById(999L)).thenReturn(null)
            assertThrows<BusinessException> { articleService.findById(999L) }
        }
    }

    // --- 조회: findVisibleOnBlog ---

    @Nested
    inner class FindVisibleOnBlog {

        @Test
        fun `PUBLIC, LOCKED 상태 글만 조회한다`() {
            val pageable = PageRequest.of(0, 10)
            val articles = listOf(createArticle(status = ArticleStatus.PUBLIC))
            whenever(articleReader.findVisibleOnBlog(any())).thenReturn(PageImpl(articles))

            val result = articleService.findVisibleOnBlog(pageable)

            assertEquals(1, result.content.size)
        }

        @Test
        fun `캐시된 결과를 반환한다`() {
            val pageable = PageRequest.of(0, 10)
            val articles = listOf(createArticle(status = ArticleStatus.PUBLIC))
            whenever(articleReader.findVisibleOnBlog(any())).thenReturn(PageImpl(articles))

            articleService.findVisibleOnBlog(pageable)
            articleService.findVisibleOnBlog(pageable)

            verify(articleReader, times(1)).findVisibleOnBlog(any())
        }
    }

    // --- 조회: findBySlugForBlog ---

    @Nested
    inner class FindBySlugForBlog {

        @Test
        fun `PUBLIC 글은 비밀번호 없이 조회 성공`() {
            val article = createArticle(slug = "my-slug", status = ArticleStatus.PUBLIC)
            whenever(articleReader.findBySlug("my-slug")).thenReturn(article)

            val result = articleService.findBySlugForBlog("my-slug", null)
            assertEquals("제목", result.title)
        }

        @Test
        fun `LOCKED 글은 비밀번호 없으면 예외`() {
            val article = createArticle(slug = "locked-slug", status = ArticleStatus.LOCKED, password = "1234")
            whenever(articleReader.findBySlug("locked-slug")).thenReturn(article)

            val ex = assertThrows<BusinessException> { articleService.findBySlugForBlog("locked-slug", null) }
            assertEquals(ErrorCode.ARTICLE_PASSWORD_REQUIRED, ex.errorCode)
        }

        @Test
        fun `LOCKED 글은 비밀번호 틀리면 예외`() {
            val article = createArticle(slug = "locked-slug", status = ArticleStatus.LOCKED, password = "1234")
            whenever(articleReader.findBySlug("locked-slug")).thenReturn(article)

            val ex = assertThrows<BusinessException> { articleService.findBySlugForBlog("locked-slug", "wrong") }
            assertEquals(ErrorCode.ARTICLE_PASSWORD_INCORRECT, ex.errorCode)
        }

        @Test
        fun `LOCKED 글은 비밀번호 맞으면 조회 성공`() {
            val article = createArticle(slug = "locked-slug", status = ArticleStatus.LOCKED, password = "1234")
            whenever(articleReader.findBySlug("locked-slug")).thenReturn(article)

            val result = articleService.findBySlugForBlog("locked-slug", "1234")
            assertEquals("제목", result.title)
        }

        @Test
        fun `DRAFT 글은 조회 불가`() {
            val article = createArticle(slug = "draft-slug", status = ArticleStatus.DRAFT, publishedAt = null)
            whenever(articleReader.findBySlug("draft-slug")).thenReturn(article)

            assertThrows<BusinessException> { articleService.findBySlugForBlog("draft-slug", null) }
        }

        @Test
        fun `PRIVATE 글은 조회 불가`() {
            val article = createArticle(slug = "private-slug", status = ArticleStatus.PRIVATE)
            whenever(articleReader.findBySlug("private-slug")).thenReturn(article)

            assertThrows<BusinessException> { articleService.findBySlugForBlog("private-slug", null) }
        }

        @Test
        fun `존재하지 않는 slug 조회 시 예외`() {
            whenever(articleReader.findBySlug("no-slug")).thenReturn(null)

            assertThrows<BusinessException> { articleService.findBySlugForBlog("no-slug", null) }
        }
    }

    // --- 작성 ---

    @Nested
    inner class Create {

        @Test
        fun `PUBLIC 상태로 생성하면 publishedAt이 설정된다`() {
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }
            whenever(articleReader.existsBySlug("new-slug")).thenReturn(false)

            val result = articleService.create(
                title = "제목",
                content = "내용",
                slug = "new-slug",
                status = ArticleStatus.PUBLIC,
            )

            assertNotNull(result.publishedAt)
            assertEquals(ArticleStatus.PUBLIC, result.status)
        }

        @Test
        fun `DRAFT 상태로 생성하면 publishedAt이 null이다`() {
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }
            whenever(articleReader.existsBySlug("draft-slug")).thenReturn(false)

            val result = articleService.create(
                title = "제목",
                content = "내용",
                slug = "draft-slug",
                status = ArticleStatus.DRAFT,
            )

            assertNull(result.publishedAt)
        }

        @Test
        fun `LOCKED 상태로 생성하면 publishedAt이 설정된다`() {
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }
            whenever(articleReader.existsBySlug("locked-slug")).thenReturn(false)

            val result = articleService.create(
                title = "제목",
                content = "내용",
                slug = "locked-slug",
                status = ArticleStatus.LOCKED,
                password = "1234",
            )

            assertNotNull(result.publishedAt)
        }

        @Test
        fun `중복 slug로 생성하면 예외`() {
            whenever(articleReader.existsBySlug("dup-slug")).thenReturn(true)

            val ex = assertThrows<BusinessException> {
                articleService.create(
                    title = "제목",
                    content = "내용",
                    slug = "dup-slug",
                    status = ArticleStatus.PUBLIC,
                )
            }
            assertEquals(ErrorCode.ARTICLE_SLUG_DUPLICATE, ex.errorCode)
        }

        @Test
        fun `PUBLIC 생성 시 캐시에 올린다`() {
            val saved = createArticle(id = 1L, slug = "cached-slug", status = ArticleStatus.PUBLIC)
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenReturn(saved)
            whenever(articleReader.existsBySlug("cached-slug")).thenReturn(false)

            articleService.create(
                title = "제목",
                content = "내용",
                slug = "cached-slug",
                status = ArticleStatus.PUBLIC,
            )

            assertNotNull(cacheManager.getCache("articles")?.get(1L))
        }

        @Test
        fun `DRAFT 생성 시 캐시에 안 올린다`() {
            val saved = createArticle(id = 1L, slug = "draft-slug", status = ArticleStatus.DRAFT, publishedAt = null)
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenReturn(saved)
            whenever(articleReader.existsBySlug("draft-slug")).thenReturn(false)

            articleService.create(
                title = "제목",
                content = "내용",
                slug = "draft-slug",
                status = ArticleStatus.DRAFT,
            )

            assertNull(cacheManager.getCache("articles")?.get(1L))
        }

        @Test
        fun `seriesId와 bookId를 설정할 수 있다`() {
            whenever(articleDomainService.processNewImages(eq("내용"), any())).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }
            whenever(articleReader.existsBySlug("series-slug")).thenReturn(false)

            val result = articleService.create(
                title = "제목",
                content = "내용",
                slug = "series-slug",
                status = ArticleStatus.PUBLIC,
                seriesId = 10L,
                orderInSeries = 3,
                bookId = 5L,
                orderInBook = 2,
            )

            assertEquals(10L, result.seriesId)
            assertEquals(3, result.orderInSeries)
            assertEquals(5L, result.bookId)
            assertEquals(2, result.orderInBook)
        }
    }

    // --- 수정 ---

    @Nested
    inner class Update {

        @Test
        fun `PUBLIC 글 수정 시 캐시 Write-Through`() {
            val article = createArticle(status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)
            whenever(articleDomainService.processNewImages(eq("수정"), eq(1L))).thenReturn("수정")
            whenever(articleWriter.save(any<Article>())).thenReturn(article)

            articleService.update(
                id = 1L,
                title = "수정",
                content = "수정",
                slug = "test-slug",
                status = ArticleStatus.PUBLIC,
            )

            articleService.findById(1L)
            verify(articleReader, times(1)).findById(1L)
        }

        @Test
        fun `PRIVATE로 수정하면 캐시에서 제거`() {
            val article = createArticle(status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)
            whenever(articleDomainService.processNewImages(eq("내용"), eq(1L))).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }

            cacheManager.getCache("articles")?.put(1L, CachedArticle.from(article))

            articleService.update(
                id = 1L,
                title = "제목",
                content = "내용",
                slug = "test-slug",
                status = ArticleStatus.PRIVATE,
            )

            assertNull(cacheManager.getCache("articles")?.get(1L))
        }

        @Test
        fun `DRAFT에서 PUBLIC으로 전환 시 publishedAt이 설정된다`() {
            val article = createArticle(status = ArticleStatus.DRAFT, publishedAt = null)
            whenever(articleReader.findById(1L)).thenReturn(article)
            whenever(articleDomainService.processNewImages(eq("내용"), eq(1L))).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }

            val result = articleService.update(
                id = 1L,
                title = "제목",
                content = "내용",
                slug = "test-slug",
                status = ArticleStatus.PUBLIC,
            )

            assertNotNull(result.publishedAt)
        }

        @Test
        fun `slug 변경 시 중복이면 예외`() {
            val article = createArticle(slug = "old-slug", status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)
            whenever(articleReader.existsBySlug("dup-slug")).thenReturn(true)

            val ex = assertThrows<BusinessException> {
                articleService.update(
                    id = 1L,
                    title = "제목",
                    content = "내용",
                    slug = "dup-slug",
                    status = ArticleStatus.PUBLIC,
                )
            }
            assertEquals(ErrorCode.ARTICLE_SLUG_DUPLICATE, ex.errorCode)
        }

        @Test
        fun `slug 변경 없으면 중복 체크 안 한다`() {
            val article = createArticle(slug = "same-slug", status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)
            whenever(articleDomainService.processNewImages(eq("내용"), eq(1L))).thenReturn("내용")
            whenever(articleWriter.save(any<Article>())).thenAnswer { it.arguments[0] }

            articleService.update(
                id = 1L,
                title = "제목",
                content = "내용",
                slug = "same-slug",
                status = ArticleStatus.PUBLIC,
            )

            verify(articleReader, never()).existsBySlug(any())
        }

        @Test
        fun `존재하지 않는 글 수정 시 예외`() {
            whenever(articleReader.findById(999L)).thenReturn(null)

            assertThrows<BusinessException> {
                articleService.update(
                    id = 999L,
                    title = "제목",
                    content = "내용",
                    slug = "slug",
                    status = ArticleStatus.PUBLIC,
                )
            }
        }
    }

    // --- 삭제 ---

    @Nested
    inner class Delete {

        @Test
        fun `캐시에서 제거한다`() {
            val article = createArticle(status = ArticleStatus.PUBLIC)
            whenever(articleReader.findById(1L)).thenReturn(article)

            articleService.findById(1L)
            assertNotNull(cacheManager.getCache("articles")?.get(1L))

            articleService.delete(1L)
            assertNull(cacheManager.getCache("articles")?.get(1L))
        }
    }

    // --- Article 엔티티 속성 ---

    @Nested
    inner class ArticleProperties {

        @Test
        fun `PUBLIC 상태는 블로그에 보인다`() {
            val article = createArticle(status = ArticleStatus.PUBLIC)
            assertTrue(article.isVisibleOnBlog)
        }

        @Test
        fun `LOCKED 상태는 블로그에 보인다`() {
            val article = createArticle(status = ArticleStatus.LOCKED, password = "1234")
            assertTrue(article.isVisibleOnBlog)
        }

        @Test
        fun `DRAFT 상태는 블로그에 안 보인다`() {
            val article = createArticle(status = ArticleStatus.DRAFT, publishedAt = null)
            assertFalse(article.isVisibleOnBlog)
        }

        @Test
        fun `PRIVATE 상태는 블로그에 안 보인다`() {
            val article = createArticle(status = ArticleStatus.PRIVATE)
            assertFalse(article.isVisibleOnBlog)
        }

        @Test
        fun `LOCKED + password면 비밀번호 보호`() {
            val article = createArticle(status = ArticleStatus.LOCKED, password = "1234")
            assertTrue(article.isPasswordProtected)
        }

        @Test
        fun `LOCKED + password null이면 비밀번호 비보호`() {
            val article = createArticle(status = ArticleStatus.LOCKED, password = null)
            assertFalse(article.isPasswordProtected)
        }
    }
}
