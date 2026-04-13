package com.giwon.blog.core.image.infrastructure.storage

import com.giwon.blog.core.image.domain.ImageStorage
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

@Component
class LocalImageStorage(
    @Value("\${image.storage.path:/data/blog/images}") private val storagePath: String,
    @Value("\${image.storage.public-url:http://localhost:8080/images}") private val publicUrl: String,
) : ImageStorage {

    override fun upload(name: String, data: ByteArray, contentType: String): String {
        val dir = Paths.get(storagePath)
        Files.createDirectories(dir)
        Files.write(dir.resolve(name), data)
        return "$publicUrl/$name"
    }

    override fun uploadToTemp(name: String, data: ByteArray, contentType: String): String {
        val dir = Paths.get(storagePath, "temp")
        Files.createDirectories(dir)
        Files.write(dir.resolve(name), data)
        return "$publicUrl/temp/$name"
    }

    override fun move(sourceUrl: String, targetDir: String): String {
        val relativePath = sourceUrl.removePrefix("$publicUrl/")
        val sourcePath = Paths.get(storagePath, relativePath)
        val targetDirPath = Paths.get(storagePath, targetDir)
        Files.createDirectories(targetDirPath)
        val fileName = sourcePath.fileName.toString()
        val targetPath = targetDirPath.resolve(fileName)
        Files.move(sourcePath, targetPath, StandardCopyOption.REPLACE_EXISTING)
        return "$publicUrl/$targetDir/$fileName"
    }

    override fun delete(url: String) {
        val relativePath = url.removePrefix("$publicUrl/")
        val file = Paths.get(storagePath, relativePath)
        Files.deleteIfExists(file)
    }
}
