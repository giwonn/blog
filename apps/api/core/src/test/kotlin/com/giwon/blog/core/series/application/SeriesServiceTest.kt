package com.giwon.blog.core.series.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.series.domain.Series
import com.giwon.blog.core.series.domain.SeriesReader
import com.giwon.blog.core.series.domain.SeriesWriter
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*

@ExtendWith(MockitoExtension::class)
class SeriesServiceTest {

    @Mock lateinit var seriesReader: SeriesReader
    @Mock lateinit var seriesWriter: SeriesWriter

    lateinit var seriesService: SeriesService

    @BeforeEach
    fun setUp() {
        seriesService = SeriesService(seriesReader, seriesWriter)
    }

    // --- Helper ---

    private fun createSeries(
        id: Long = 1L,
        title: String = "시리즈 제목",
        slug: String = "test-series",
        description: String? = "시리즈 설명",
        thumbnailUrl: String? = null,
    ) = Series(
        id = id,
        title = title,
        slug = slug,
        description = description,
        thumbnailUrl = thumbnailUrl,
    )

    // --- 생성 ---

    @Nested
    inner class Create {

        @Test
        fun `정상적으로 시리즈를 생성한다`() {
            whenever(seriesReader.existsBySlug("new-series")).thenReturn(false)
            whenever(seriesWriter.save(any<Series>())).thenAnswer { it.arguments[0] }

            val result = seriesService.create(
                title = "새 시리즈",
                slug = "new-series",
                description = "설명",
                thumbnailUrl = null,
            )

            assertEquals("새 시리즈", result.title)
            assertEquals("new-series", result.slug)
            assertEquals("설명", result.description)
            verify(seriesWriter).save(any<Series>())
        }

        @Test
        fun `중복 slug로 생성하면 예외`() {
            whenever(seriesReader.existsBySlug("dup-slug")).thenReturn(true)

            val ex = assertThrows<BusinessException> {
                seriesService.create(
                    title = "시리즈",
                    slug = "dup-slug",
                    description = null,
                    thumbnailUrl = null,
                )
            }
            assertEquals(ErrorCode.SERIES_SLUG_DUPLICATE, ex.errorCode)
        }
    }

    // --- 조회: findBySlug ---

    @Nested
    inner class FindBySlug {

        @Test
        fun `slug로 시리즈를 조회한다`() {
            val series = createSeries(slug = "my-series")
            whenever(seriesReader.findBySlug("my-series")).thenReturn(series)

            val result = seriesService.findBySlug("my-series")

            assertEquals("시리즈 제목", result.title)
            assertEquals("my-series", result.slug)
        }

        @Test
        fun `존재하지 않는 slug 조회 시 예외`() {
            whenever(seriesReader.findBySlug("no-slug")).thenReturn(null)

            val ex = assertThrows<BusinessException> {
                seriesService.findBySlug("no-slug")
            }
            assertEquals(ErrorCode.SERIES_NOT_FOUND, ex.errorCode)
        }
    }

    // --- 조회: findById ---

    @Nested
    inner class FindById {

        @Test
        fun `존재하지 않는 id 조회 시 예외`() {
            whenever(seriesReader.findById(999L)).thenReturn(null)

            val ex = assertThrows<BusinessException> {
                seriesService.findById(999L)
            }
            assertEquals(ErrorCode.SERIES_NOT_FOUND, ex.errorCode)
        }
    }

    // --- 수정 ---

    @Nested
    inner class Update {

        @Test
        fun `정상적으로 시리즈를 수정한다`() {
            val series = createSeries(slug = "old-slug")
            whenever(seriesReader.findById(1L)).thenReturn(series)
            whenever(seriesReader.existsBySlug("new-slug")).thenReturn(false)
            whenever(seriesWriter.save(any<Series>())).thenAnswer { it.arguments[0] }

            val result = seriesService.update(
                id = 1L,
                title = "수정된 제목",
                slug = "new-slug",
                description = "수정된 설명",
                thumbnailUrl = "https://example.com/thumb.jpg",
            )

            assertEquals("수정된 제목", result.title)
            assertEquals("new-slug", result.slug)
            assertEquals("수정된 설명", result.description)
            assertEquals("https://example.com/thumb.jpg", result.thumbnailUrl)
        }

        @Test
        fun `slug 변경 시 중복이면 예외`() {
            val series = createSeries(slug = "old-slug")
            whenever(seriesReader.findById(1L)).thenReturn(series)
            whenever(seriesReader.existsBySlug("dup-slug")).thenReturn(true)

            val ex = assertThrows<BusinessException> {
                seriesService.update(
                    id = 1L,
                    title = "제목",
                    slug = "dup-slug",
                    description = null,
                    thumbnailUrl = null,
                )
            }
            assertEquals(ErrorCode.SERIES_SLUG_DUPLICATE, ex.errorCode)
        }

        @Test
        fun `slug 변경 없으면 중복 체크 안 한다`() {
            val series = createSeries(slug = "same-slug")
            whenever(seriesReader.findById(1L)).thenReturn(series)
            whenever(seriesWriter.save(any<Series>())).thenAnswer { it.arguments[0] }

            seriesService.update(
                id = 1L,
                title = "수정",
                slug = "same-slug",
                description = null,
                thumbnailUrl = null,
            )

            verify(seriesReader, never()).existsBySlug(any())
        }
    }

    // --- 삭제 ---

    @Nested
    inner class Delete {

        @Test
        fun `정상적으로 시리즈를 삭제한다`() {
            val series = createSeries()
            whenever(seriesReader.findById(1L)).thenReturn(series)

            seriesService.delete(1L)

            verify(seriesWriter).delete(series)
        }

        @Test
        fun `존재하지 않는 시리즈 삭제 시 예외`() {
            whenever(seriesReader.findById(999L)).thenReturn(null)

            val ex = assertThrows<BusinessException> {
                seriesService.delete(999L)
            }
            assertEquals(ErrorCode.SERIES_NOT_FOUND, ex.errorCode)
        }
    }

    // --- 전체 조회 ---

    @Nested
    inner class FindAll {

        @Test
        fun `전체 시리즈 목록을 조회한다`() {
            val seriesList = listOf(
                createSeries(id = 1L, slug = "series-1"),
                createSeries(id = 2L, slug = "series-2"),
            )
            whenever(seriesReader.findAll()).thenReturn(seriesList)

            val result = seriesService.findAll()

            assertEquals(2, result.size)
        }
    }
}
