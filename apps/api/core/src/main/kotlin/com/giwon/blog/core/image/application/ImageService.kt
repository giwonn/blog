package com.giwon.blog.core.image.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.image.domain.ImageStorage
import org.springframework.stereotype.Service
import java.util.*

@Service
class ImageService(
    private val imageStorage: ImageStorage,
) {
    companion object {
        private val ALLOWED_TYPES = setOf("image/png", "image/jpeg", "image/gif", "image/webp")
        private const val MAX_SIZE = 10 * 1024 * 1024L // 10MB
    }

    fun uploadToTemp(data: ByteArray, contentType: String, originalFilename: String?): String {
        if (contentType !in ALLOWED_TYPES) {
            throw BusinessException(ErrorCode.INVALID_IMAGE_TYPE)
        }
        if (data.size > MAX_SIZE) {
            throw BusinessException(ErrorCode.IMAGE_TOO_LARGE)
        }
        val extension = when (contentType) {
            "image/png" -> "png"
            "image/jpeg" -> "jpg"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            else -> "png"
        }
        val fileName = "${UUID.randomUUID()}.$extension"
        return imageStorage.uploadToTemp(fileName, data, contentType)
    }
}
