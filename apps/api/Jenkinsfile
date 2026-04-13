pipeline {
    agent any

    environment {
        NETWORK_NAME = 'blog-network'
    }

    triggers {
        githubPush()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Ensure Network Exists') {
            steps {
                script {
                    sh "docker network create ${NETWORK_NAME} || true"
                }
            }
        }

        stage('Ensure Nginx') {
            steps {
                script {
                    sh "docker compose -f docker-compose.yml up -d nginx postgres"
                }
            }
        }

        stage('DB Migrate') {
            steps {
                sh '''
                    docker run --rm --network blog-network \
                        -v $(pwd)/core/src/main/resources/db/migration:/flyway/sql \
                        flyway/flyway:latest \
                        -url=jdbc:postgresql://postgres:5432/giwon_blog \
                        -user=giwon -password=giwon1234 \
                        -locations=filesystem:/flyway/sql \
                        -baselineOnMigrate=true \
                        -baselineVersion=1 \
                        repair
                    docker run --rm --network blog-network \
                        -v $(pwd)/core/src/main/resources/db/migration:/flyway/sql \
                        flyway/flyway:latest \
                        -url=jdbc:postgresql://postgres:5432/giwon_blog \
                        -user=giwon -password=giwon1234 \
                        -locations=filesystem:/flyway/sql \
                        -baselineOnMigrate=true \
                        -baselineVersion=1 \
                        migrate
                '''
            }
        }

        stage('Blue-Green Deploy') {
            steps {
                script {
                    sh "chmod +x scripts/deploy.sh && ./scripts/deploy.sh"
                }
            }
        }
    }

    post {
        success {
            echo 'Deployment successful!'
        }
        failure {
            echo 'Deployment failed!'
        }
    }
}
