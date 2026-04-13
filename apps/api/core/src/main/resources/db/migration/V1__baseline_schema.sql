-- V1: Baseline schema (original state before series/books feature)
-- On existing databases, this will be skipped via baselineOnMigrate=true / baselineVersion=1

CREATE TABLE articles (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT false,
    password VARCHAR(255),
    published_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE page_views (
    id BIGSERIAL PRIMARY KEY,
    path VARCHAR(255) NOT NULL,
    ip_address VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255),
    referrer VARCHAR(255),
    session_id VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    country VARCHAR(255),
    city VARCHAR(255),
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE visitor_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255),
    first_visit_at TIMESTAMP NOT NULL,
    last_visit_at TIMESTAMP NOT NULL,
    page_view_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE article_stats (
    id BIGSERIAL PRIMARY KEY,
    article_id BIGINT NOT NULL UNIQUE,
    view_count BIGINT NOT NULL,
    aggregated_at TIMESTAMP NOT NULL
);

CREATE TABLE daily_article_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    article_id BIGINT NOT NULL,
    view_count BIGINT NOT NULL,
    UNIQUE (date, article_id)
);

CREATE TABLE daily_visitor_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    visitor_count BIGINT NOT NULL
);

CREATE TABLE settings (
    id BIGINT PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE batch_job_log (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    error_message TEXT,
    target_date DATE
);
