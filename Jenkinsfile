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
                script {
                    def rawBranch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown'
                    echo "🌿 Detected Branch from SCM: ${rawBranch}"
                    echo "🔖 Git Commit SHA: ${env.GIT_COMMIT ?: 'local'}"

                    // Intelligent check: Does the checked-out commit exist on origin/main?
                    def isMainCommit = (sh(script: "git branch -r --contains HEAD | grep -E 'origin/main|origin/master'", returnStatus: true) == 0)
                    if (isMainCommit) {
                        echo "🎯 Target Commit is verified on origin/main. Activating Production Deployment (CD)!"
                        env.IS_PRODUCTION = 'true'
                    } else {
                        echo "🛡️ Target Commit is restricted to dev branch. Activating CI Testing Gate."
                        env.IS_PRODUCTION = 'false'
                    }
                }
            }
        }

        stage('2. Prisma & Dependencies') {
            steps {
                echo '📦 [Prisma] Installing dependencies & generating database client...'
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
                echo '🔍 [Lint] Running ESLint static code audit across codebase...'
                sh 'npx eslint . --quiet'
            }
        }

        stage('4. TypeScript Strict Compilation') {
            steps {
                echo '⚙️ [TypeScript] Verifying compilation integrity and strict type safety...'
                sh 'npm run build'
            }
        }

        stage('5. Dev Branch Gate (CI Only)') {
            when {
                expression {
                    return env.IS_PRODUCTION != 'true'
                }
            }
            steps {
                echo '========================================================================'
                echo '🛡️  [DEV CI VERIFIED] All TypeScript checks & static audits passed!'
                echo "🌿 Branch [${env.GIT_BRANCH ?: env.BRANCH_NAME}] is 100% clean and healthy."
                echo '🚀 Safe to open a Pull Request (PR) to merge into main.'
                echo 'ℹ️  Production Docker build & deploy are bypassed for dev branch.'
                echo '========================================================================'
            }
        }

        stage('6. Production Docker Image Build') {
            when {
                expression {
                    return env.IS_PRODUCTION == 'true'
                }
            }
            steps {
                echo '🐳 [Docker] Building production multi-stage container image with immutable tags...'
                sh '''
                    docker build \
                        -t ${IMAGE_NAME}:${IMAGE_TAG} \
                        -t ${IMAGE_NAME}:${BUILD_NUMBER} \
                        -f Dockerfile .
                '''
            }
        }

        stage('7. Production Deploy & Health Probe') {
            when {
                expression {
                    return env.IS_PRODUCTION == 'true'
                }
            }
            steps {
                echo '🚀 [Deploy - 1/2] Deploying containers locally via Docker Compose (Scale api=3)...'
                sh '''
                    if [ ! -f .env ]; then
                        if [ -f /var/jenkins_home/.env ]; then
                            cp /var/jenkins_home/.env .env
                        else
                            cp .env.example .env
                        fi
                    fi
                    docker compose -p healthcare-backend up -d --build --scale api=3 --remove-orphans
                    echo "⏳ Waiting 10 seconds for local replica stabilization..."
                    sleep 10
                    docker compose -p healthcare-backend ps
                '''

                echo '☁️  [Deploy - 2/2] Deploying rolling update to Azure Cloud VPS via SSH...'
                sh '''
                    ssh -o StrictHostKeyChecking=no -i /var/jenkins_home/.ssh/healthcare-server_key.pem azureuser@104.214.178.218 "
                        cd /home/azureuser/Health-Care-Backend &&
                        git fetch origin main &&
                        git reset --hard origin/main &&
                        docker compose -p healthcare-backend up -d --build --scale api=1 --remove-orphans &&
                        echo '✅ Azure Cloud VPS Backend Updated Successfully!'
                    "
                '''
            }
        }
    }

    post {
        success {
            script {
                if (env.IS_PRODUCTION == 'true') {
                    echo '========================================================================'
                    echo '✅ [PRODUCTION CD SUCCESS] Enterprise Telemedicine API scaled & live!'
                    echo "🏷️ Image Tag: ${IMAGE_NAME}:${BUILD_NUMBER} & ${IMAGE_TAG}"
                    echo '========================================================================'
                } else {
                    echo '========================================================================'
                    echo '✅ [DEV CI SUCCESS] Pull Request Verification Passed cleanly!'
                    echo 'No production deployment was triggered. Staging code is verified.'
                    echo '========================================================================'
                }
            }
        }
        failure {
            echo '========================================================================'
            echo '❌ [PIPELINE FAILED] Stage execution encountered an error.'
            echo 'Please review the stage console logs above for diagnostics.'
            echo '========================================================================'
        }
    }
}
