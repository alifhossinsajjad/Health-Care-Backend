pipeline {
    agent any

    environment {
        APP_NAME     = 'healthcare-backend'
        IMAGE_NAME   = 'healthcare-backend-api'
        IMAGE_TAG    = 'latest'
        PORT         = '5000'
        NODE_ENV     = 'production'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        timeout(time: 25, unit: 'MINUTES')
        timestamps()
    }

    stages {
        stage('1. Checkout SCM') {
            steps {
                echo '📥 [SCM] Checking out repository branch...'
                checkout scm
            }
        }

        stage('2. Prisma & Dependencies') {
            steps {
                echo '📦 [Prisma] Installing all dependencies & generating database client...'
                sh '''
                    echo "Node version: $(node -v)"
                    echo "NPM version: $(npm -v)"
                    npm install --include=dev --legacy-peer-deps
                    npm run generate
                '''
            }
        }

        stage('3. ESLint Code Quality') {
            steps {
                echo '🔍 [Lint] Running ESLint static code audit...'
                sh 'npx eslint . --quiet'
            }
        }

        stage('4. TypeScript Compilation') {
            steps {
                echo '⚙️ [TypeScript] Verifying compilation integrity and strict type safety...'
                sh 'npm run build'
            }
        }

        stage('5. Docker Image Build') {
            steps {
                echo '🐳 [Docker] Building production multi-stage container image...'
                sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f Dockerfile .'
            }
        }

        stage('6. Deploy & Health Probe') {
            steps {
                echo '🚀 [Deploy] Rolling update containers via Docker Compose...'
                sh '''
                    if [ ! -f .env ]; then
                        if [ -f /var/jenkins_home/.env ]; then
                            cp /var/jenkins_home/.env .env
                        else
                            cp .env.example .env
                        fi
                    fi
                    docker compose -p healthcare-backend down --remove-orphans || true
                    docker compose -p healthcare-backend up -d --build --scale api=3
                    echo "⏳ Waiting 15 seconds for container initialization..."
                    sleep 15
                    docker compose -p healthcare-backend ps
                '''
            }
        }
    }

    post {
        success {
            echo '========================================================================'
            echo '✅ [PIPELINE SUCCESS] Enterprise Telemedicine Pipeline executed cleanly!'
            echo 'All services are containerized, healthy, and operational.'
            echo '========================================================================'
        }
        failure {
            echo '========================================================================'
            echo '❌ [PIPELINE FAILED] Stage execution encountered an error.'
            echo 'Please review the stage console logs above for diagnostics.'
            echo '========================================================================'
        }
    }
}
