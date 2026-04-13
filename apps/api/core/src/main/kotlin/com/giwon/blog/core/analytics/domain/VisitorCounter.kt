package com.giwon.blog.core.analytics.domain

import java.time.LocalDate

interface VisitorCounter {
    /** 해당 날짜의 방문자 SET에 세션 추가. 이미 있으면 false, 새로우면 true */
    fun addVisitor(date: LocalDate, sessionId: String): Boolean

    /** 해당 날짜의 고유 방문자 수 */
    fun getVisitorCount(date: LocalDate): Long
}
