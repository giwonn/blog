package com.giwon.blog.core.article.domain

import com.giwon.blog.core.image.domain.ImageStorage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*

@ExtendWith(MockitoExtension::class)
class ArticleDomainServiceTest {

    @Mock
    lateinit var imageStorage: ImageStorage

    lateinit var articleDomainService: ArticleDomainService

    @BeforeEach
    fun setUp() {
        articleDomainService = ArticleDomainService(imageStorage)
    }

    @Test
    fun `processNewImages - temp URL을 permanent로 이동하고 본문 URL을 치환한다`() {
        val content = "![alt](http://localhost:8080/images/temp/abc.png) 텍스트"
        whenever(imageStorage.move("http://localhost:8080/images/temp/abc.png", "articles/1"))
            .thenReturn("http://localhost:8080/images/articles/1/abc.png")

        val result = articleDomainService.processNewImages(content, 1L)

        verify(imageStorage).move("http://localhost:8080/images/temp/abc.png", "articles/1")
        assertEquals("![alt](http://localhost:8080/images/articles/1/abc.png) 텍스트", result)
    }

    @Test
    fun `processNewImages - temp URL이 없으면 그대로 반환한다`() {
        val content = "![alt](http://localhost:8080/images/articles/1/existing.png)"

        val result = articleDomainService.processNewImages(content, 1L)

        assertEquals(content, result)
        verify(imageStorage, never()).move(any(), any())
    }

    @Test
    fun `cleanupDeletedImages - 삭제된 이미지를 ImageStorage에서 제거한다`() {
        val oldContent = "![a](http://localhost:8080/images/articles/1/a.png) ![b](http://localhost:8080/images/articles/1/b.png)"
        val newContent = "![a](http://localhost:8080/images/articles/1/a.png)"

        articleDomainService.cleanupDeletedImages(oldContent, newContent)

        verify(imageStorage).delete("http://localhost:8080/images/articles/1/b.png")
        verify(imageStorage, never()).delete("http://localhost:8080/images/articles/1/a.png")
    }

    @Test
    fun `cleanupAllImages - 글의 모든 이미지를 삭제한다`() {
        val content = "![a](http://localhost:8080/images/articles/1/a.png) ![b](http://localhost:8080/images/articles/1/b.png)"

        articleDomainService.cleanupAllImages(content)

        verify(imageStorage).delete("http://localhost:8080/images/articles/1/a.png")
        verify(imageStorage).delete("http://localhost:8080/images/articles/1/b.png")
    }
}
