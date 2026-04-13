package com.giwon.blog.api.controller

import com.giwon.blog.api.config.TestContainersConfig
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.infrastructure.persistence.ArticleJpaRepository
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.cache.CacheManager
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfig::class)
class ArticleControllerIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var articleJpaRepository: ArticleJpaRepository

    @Autowired
    lateinit var cacheManager: CacheManager

    @BeforeEach
    fun setUp() {
        articleJpaRepository.deleteAll()
        cacheManager.cacheNames.forEach { cacheManager.getCache(it)?.clear() }
    }

    @Test
    fun `GET articles - 글 목록을 페이지네이션으로 조회한다`() {
        articleJpaRepository.save(Article(title = "첫 번째 글", content = "내용1"))
        articleJpaRepository.save(Article(title = "두 번째 글", content = "내용2"))

        mockMvc.get("/articles") {
            param("page", "0")
            param("size", "10")
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.content.length()") { value(2) }
            jsonPath("$.data.content[0].title") { exists() }
            jsonPath("$.data.page.totalElements") { value(2) }
        }
    }

    @Test
    fun `GET articles_{id} - 글 상세를 조회한다`() {
        val saved = articleJpaRepository.save(Article(title = "테스트 글", content = "테스트 내용"))

        mockMvc.get("/articles/${saved.id}")
            .andExpect {
                status { isOk() }
                jsonPath("$.data.title") { value("테스트 글") }
                jsonPath("$.data.content") { value("테스트 내용") }
            }
    }

    @Test
    fun `GET articles_{id} - 존재하지 않는 글 조회 시 404를 반환한다`() {
        mockMvc.get("/articles/999")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.message") { value("게시글을 찾을 수 없습니다") }
            }
    }

    @Test
    fun `GET articles - 빈 목록을 조회한다`() {
        mockMvc.get("/articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.data.content") { isEmpty() }
                jsonPath("$.data.page.totalElements") { value(0) }
            }
    }
}
