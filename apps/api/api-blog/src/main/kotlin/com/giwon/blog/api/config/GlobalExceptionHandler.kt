package com.giwon.blog.api.config

import com.giwon.blog.common.exception.BusinessException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException::class)
    fun handleBusinessException(e: BusinessException): ResponseEntity<Map<String, String>> {
        return ResponseEntity
            .status(e.errorCode.status)
            .body(mapOf("message" to e.errorCode.message))
    }
}
