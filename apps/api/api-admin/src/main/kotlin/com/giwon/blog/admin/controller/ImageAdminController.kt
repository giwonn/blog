package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.image.application.ImageService
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/admin/images")
class ImageAdminController(
    private val imageService: ImageService,
) {
    @PostMapping
    fun upload(@RequestParam("file") file: MultipartFile): ApiResponse<ImageUploadResponse> {
        val url = imageService.uploadToTemp(
            data = file.bytes,
            contentType = file.contentType ?: "application/octet-stream",
            originalFilename = file.originalFilename,
        )
        return ApiResponse(ImageUploadResponse(url))
    }
}

data class ImageUploadResponse(val url: String)
