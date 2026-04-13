package com.giwon.blog.core.book.domain

import jakarta.persistence.*
import java.time.LocalDate
import java.time.LocalDateTime

@Entity
@Table(name = "books")
class Book(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    var title: String,

    @Column(nullable = false, unique = true)
    var slug: String,

    @Column(nullable = false)
    var author: String,

    var publisher: String? = null,

    var thumbnailUrl: String? = null,

    @Column(columnDefinition = "TEXT")
    var description: String? = null,

    var isbn: String? = null,

    var readStartDate: LocalDate? = null,

    var readEndDate: LocalDate? = null,

    var rating: Int? = null,

    @Column(nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now(),
)
