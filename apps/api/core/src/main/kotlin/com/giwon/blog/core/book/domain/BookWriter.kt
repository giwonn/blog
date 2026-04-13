package com.giwon.blog.core.book.domain

interface BookWriter {
    fun save(book: Book): Book
    fun delete(book: Book)
}
