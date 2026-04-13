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
import java.time.LocalDateTime

@ExtendWith(MockitoExtension::class)
class NeighborArticleServiceTest {

    @Mock lateinit var articleReader: ArticleReader
    @Mock lateinit var neighborReader: ArticleNeighborReader

    lateinit var neighborArticleService: NeighborArticleService

    @BeforeEach
    fun setUp() {
        neighborArticleService = NeighborArticleService(articleReader, neighborReader)
    }

    private fun createArticle(
        id: Long = 1L,
        slug: String = "test-slug",
        seriesId: Long? = null,
        orderInSeries: Int? = null,
        bookId: Long? = null,
        orderInBook: Int? = null,
    ) = Article(
        id = id,
        title = "제목",
        content = "내용",
        slug = slug,
        status = ArticleStatus.PUBLIC,
        publishedAt = LocalDateTime.now().minusDays(1),
        seriesId = seriesId,
        orderInSeries = orderInSeries,
        bookId = bookId,
        orderInBook = orderInBook,
    )

    @Nested
    inner class FindNeighbors {

        @Test
        fun `존재하지 않는 slug이면 예외`() {
            whenever(articleReader.findBySlug("no-slug")).thenReturn(null)

            val ex = assertThrows<BusinessException> {
                neighborArticleService.findNeighbors("no-slug", null, null)
            }
            assertEquals(ErrorCode.ARTICLE_NOT_FOUND, ex.errorCode)
        }

        @Test
        fun `seriesSlug가 있고 글이 시리즈에 속하면 시리즈 내 이웃을 반환한다`() {
            val article = createArticle(seriesId = 10L, orderInSeries = 2)
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(
                previous = ArticleNeighbor(2L, "이전 글", "prev-slug"),
                next = ArticleNeighbor(3L, "다음 글", "next-slug"),
            )
            whenever(neighborReader.findNeighborsInSeries(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", "my-series", null)

            assertEquals(expected, result)
            verify(neighborReader).findNeighborsInSeries(article)
            verify(neighborReader, never()).findNeighborsByPublishedAt(any())
            verify(neighborReader, never()).findNeighborsInBook(any())
        }

        @Test
        fun `bookSlug가 있고 글이 책에 속하면 책 내 이웃을 반환한다`() {
            val article = createArticle(bookId = 5L, orderInBook = 3)
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(
                previous = ArticleNeighbor(4L, "이전 글", "prev-slug"),
                next = null,
            )
            whenever(neighborReader.findNeighborsInBook(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", null, "my-book")

            assertEquals(expected, result)
            verify(neighborReader).findNeighborsInBook(article)
            verify(neighborReader, never()).findNeighborsByPublishedAt(any())
            verify(neighborReader, never()).findNeighborsInSeries(any())
        }

        @Test
        fun `seriesSlug와 bookSlug 모두 없으면 publishedAt 기준 이웃을 반환한다`() {
            val article = createArticle()
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(
                previous = null,
                next = ArticleNeighbor(5L, "다음 글", "next-slug"),
            )
            whenever(neighborReader.findNeighborsByPublishedAt(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", null, null)

            assertEquals(expected, result)
            verify(neighborReader).findNeighborsByPublishedAt(article)
        }

        @Test
        fun `seriesSlug가 있어도 글이 시리즈에 속하지 않으면 publishedAt 기준`() {
            val article = createArticle(seriesId = null)
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(previous = null, next = null)
            whenever(neighborReader.findNeighborsByPublishedAt(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", "some-series", null)

            verify(neighborReader).findNeighborsByPublishedAt(article)
        }

        @Test
        fun `bookSlug가 있어도 글이 책에 속하지 않으면 publishedAt 기준`() {
            val article = createArticle(bookId = null)
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(previous = null, next = null)
            whenever(neighborReader.findNeighborsByPublishedAt(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", null, "some-book")

            verify(neighborReader).findNeighborsByPublishedAt(article)
        }

        @Test
        fun `seriesSlug가 bookSlug보다 우선순위가 높다`() {
            val article = createArticle(seriesId = 10L, orderInSeries = 1, bookId = 5L, orderInBook = 2)
            whenever(articleReader.findBySlug("test-slug")).thenReturn(article)

            val expected = ArticleNeighbors(previous = null, next = null)
            whenever(neighborReader.findNeighborsInSeries(article)).thenReturn(expected)

            val result = neighborArticleService.findNeighbors("test-slug", "my-series", "my-book")

            verify(neighborReader).findNeighborsInSeries(article)
            verify(neighborReader, never()).findNeighborsInBook(any())
        }
    }
}
