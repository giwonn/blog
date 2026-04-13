package com.giwon.blog.core.series.domain

interface SeriesWriter {
    fun save(series: Series): Series
    fun delete(series: Series)
}
