package com.giwon.blog.core.image.domain

interface ImageStorage {
    fun upload(name: String, data: ByteArray, contentType: String): String
    fun uploadToTemp(name: String, data: ByteArray, contentType: String): String
    fun move(sourceUrl: String, targetDir: String): String
    fun delete(url: String)
}
