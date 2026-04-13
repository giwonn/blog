package com.giwon.blog.common.exception

class BusinessException(val errorCode: ErrorCode) : RuntimeException(errorCode.message)
