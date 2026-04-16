# 배포 구조 — Zero-Downtime Rolling Deploy

## 개요

이 프로젝트는 Docker Compose + Nginx + DNS Resolver를 조합하여 **무중단 배포(Zero-Downtime Deployment)**를 구현합니다.

기존의 Blue-Green 방식(두 벌의 컨테이너 + Nginx 설정 변경)에서 벗어나, **Nginx의 동적 DNS 해석**과 **Docker Compose의 scale 기능**만으로 무중단 배포를 달성합니다.

## 왜 이 방식인가?

### Blue-Green의 문제

```
# 기존 방식: blue/green 두 벌을 관리
upstream api-blog-backend {
    server api-blog-blue:8080;   ← 배포할 때마다 sed로 blue↔green 수정
}
```

- Nginx 설정 파일을 sed로 수정 → 실수 가능
- Nginx restart 필요 → 여러 서비스 동시 배포 시 충돌
- blue/green 컨테이너 이름 관리 복잡
- deploy 스크립트가 100줄+

### Rolling Deploy의 장점

```
# 새 방식: 서비스 이름만 있으면 됨
resolver 127.0.0.11 valid=5s;
set $api_blog http://api-blog:8080;
proxy_pass $api_blog;
```

- Nginx 설정 변경 불필요
- Nginx restart 불필요
- deploy 스크립트 20줄
- 서비스 간 배포 의존성 없음

## 핵심 원리

### 1. Docker 내부 DNS (127.0.0.11)

Docker 네트워크 안의 모든 컨테이너는 `127.0.0.11`이라는 **내장 DNS 서버**를 통해 서로를 찾습니다.

```
blog 컨테이너 → "api-blog 어디야?" → 127.0.0.11 → "172.18.0.5야"
```

컨테이너가 교체되면 IP가 바뀌는데, Docker DNS가 이를 자동으로 반영합니다.

### 2. Nginx의 변수(variable) 기반 proxy_pass

Nginx는 기본적으로 **시작할 때 한 번만** upstream을 DNS 해석합니다:

```nginx
# ❌ 정적 해석 — 시작 시 IP를 고정, 컨테이너 교체해도 옛날 IP를 봄
upstream api-blog-backend {
    server api-blog:8080;
}
```

하지만 `set` 변수를 사용하면 **매 요청마다** DNS를 다시 해석합니다:

```nginx
# ✅ 동적 해석 — 요청할 때마다 Docker DNS에 물어봄
resolver 127.0.0.11 valid=5s;

server {
    location / {
        set $api_blog http://api-blog:8080;
        proxy_pass $api_blog;
    }
}
```

`valid=5s`는 DNS 캐시를 5초만 유지하라는 뜻입니다. 컨테이너가 교체되면 최대 5초 내에 새 IP로 전환됩니다.

### 3. Docker Compose scale

`--scale` 옵션으로 같은 서비스의 컨테이너를 여러 개 띄울 수 있습니다:

```bash
# 기존 1개에 새 컨테이너 1개 추가 = 2개 동시 운영
docker compose up -d --no-recreate --scale api-blog=2

# 기존 컨테이너 제거 = 새 컨테이너 1개만 남음
docker compose up -d --scale api-blog=1
```

Docker DNS는 2개가 떠 있을 때 라운드로빈으로 분배하고, 기존 컨테이너가 제거되면 자동으로 새 컨테이너만 응답합니다.

## 배포 흐름

```
시간 →

[기존 컨테이너 v1]  ████████████████████░░░░░░░░  (삭제됨)
[새 컨테이너 v2]         ░░░░░████████████████████  (계속 운영)
                         ↑                    ↑
                    scale=2              scale=1
                    (2개 동시)           (1개로 줄임)
                         
Nginx DNS:          v1 IP              v2 IP
                         ↑ 두 개 다 응답   ↑ v2만 응답
```

1. **빌드**: 새 이미지 빌드 (`docker compose build`)
2. **Scale Up**: `--scale=2`로 새 컨테이너 추가 (기존 + 신규 동시 운영)
3. **대기**: 10초 (새 컨테이너가 완전히 기동될 시간)
4. **Scale Down**: `--scale=1`로 기존 컨테이너 자동 제거
5. **정리**: 미사용 이미지 + 빌드캐시 삭제

**전 과정에서 Nginx 설정 변경이나 restart가 없습니다.**

## 구성 파일

### Nginx (`infra/nginx/default.conf`)

```nginx
resolver 127.0.0.11 valid=5s;

server {
    listen 8080;
    client_max_body_size 15M;
    location / {
        set $api_blog http://api-blog:8080;
        proxy_pass $api_blog;
        # ... proxy headers
    }
}

server {
    listen 8081;
    client_max_body_size 15M;
    location / {
        set $api_admin http://api-admin:8081;
        proxy_pass $api_admin;
    }
}

server {
    listen 3000;
    location / {
        set $blog http://blog:3000;
        proxy_pass $blog;
    }
}

server {
    listen 3001;
    location / {
        set $admin http://admin:3000;
        proxy_pass $admin;
    }
}
```

### Docker Compose (예: `apps/api/docker-compose.prod.yml`)

```yaml
services:
  api-blog:
    build:
      context: ../../
      dockerfile: apps/api/Dockerfile.api-blog
    image: api-blog:latest
    restart: unless-stopped
    expose:
      - "8080"
    networks:
      - blog-network
    # container_name 없음 — scale 시 자동 넘버링 (api-blog-1, api-blog-2)
```

`container_name`을 지정하지 않는 것이 핵심입니다. 지정하면 같은 이름으로 2개를 띄울 수 없습니다.

### Deploy 스크립트 (예: `infra/scripts/deploy-api.sh`)

```bash
#!/bin/bash
set -e
COMPOSE="apps/api/docker-compose.prod.yml"

# 1. 빌드
docker compose -f "$COMPOSE" build api-blog api-admin

# 2. Scale up (기존 + 신규 = 2개)
docker compose -f "$COMPOSE" up -d --no-recreate --scale api-blog=2
sleep 10

# 3. Scale down (신규만 = 1개)
docker compose -f "$COMPOSE" up -d --scale api-blog=1
```

`--no-recreate`: 기존 컨테이너를 건드리지 않고 새 컨테이너만 추가
`--scale=1`: Docker가 오래된 컨테이너를 먼저 제거

## 네트워크 구조

```
인터넷
  │
  ▼
[Cloudflare Tunnel]
  │
  ├─ :3000 ──▶ [Nginx Reverse Proxy] ──resolver──▶ [blog]
  ├─ :3001 ──▶ [Nginx Reverse Proxy] ──resolver──▶ [admin]
  │             ├─ :8080 (expose) ──resolver──▶ [api-blog]
  │             └─ :8081 (expose) ──resolver──▶ [api-admin]
  │
  └─ blog-network (Docker internal)
       ├── api-blog (Hono/Bun :8080)
       ├── api-admin (Hono/Bun :8081)
       ├── blog (Next.js :3000)
       ├── admin (Next.js :3000)
       ├── giwon-blog-db (PostgreSQL)
       └── giwon-blog-redis (Redis)
```

- 외부 노출 포트: **3000** (blog), **3001** (admin)만 publish
- API 포트 8080/8081은 `expose`만 (Docker 네트워크 내부에서만 접근)
- Nginx의 network alias `giwon-blog-api-blog`, `giwon-blog-api-admin`으로 프론트엔드가 API에 접근

## CI/CD (Jenkins)

### 트리거 방식

GitHub Webhook → Jenkins Generic Webhook Trigger → 변경 경로에 따라 해당 job만 실행

| Job | 트리거 경로 | Deploy 스크립트 |
|-----|------------|----------------|
| api | `apps/api/`, `package.json`, `bun.lock` | `deploy-api.sh` |
| blog | `apps/blog/`, `package.json`, `bun.lock` | `deploy-frontend.sh blog` |
| admin | `apps/admin/`, `package.json`, `bun.lock` | `deploy-frontend.sh admin` |

### 배포 독립성

각 서비스가 **독립적으로** 배포됩니다:
- API만 바꾸면 → api job만 실행
- blog만 바꾸면 → blog job만 실행
- 전부 바꾸면 → 3개 동시 실행해도 충돌 없음 (Nginx 설정 변경이 없으므로)

## 디스크 관리

30GB 루트 파티션에서 Docker 이미지/빌드캐시가 빠르게 차오를 수 있습니다.

deploy 스크립트가 **성공/실패 무관하게** 항상 정리합니다:

```bash
trap cleanup EXIT  # 스크립트 종료 시 항상 실행

cleanup() {
    docker image prune -a -f   # 미사용 이미지 삭제
    docker builder prune -a -f # 빌드캐시 전부 삭제
}
```
