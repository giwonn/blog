package com.giwon.blog.api.controller

import com.giwon.blog.api.config.TestContainersConfig
import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.LocalDate

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfig::class)
class SidebarControllerIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `GET sidebar_visitors - 방문자 통계를 반환한다`() {
        mockMvc.get("/sidebar/visitors")
            .andExpect {
                status { isOk() }
                jsonPath("$.data.total") { isNumber() }
                jsonPath("$.data.today") { isNumber() }
                jsonPath("$.data.yesterday") { isNumber() }
            }
    }

    @Test
    fun `GET sidebar_popular-articles - 인기글 목록을 반환한다`() {
        mockMvc.get("/sidebar/popular-articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.data") { isArray() }
            }
    }
}
