# ==============================================================================
# Enterprise Jenkins CI/CD Controller with Embedded Docker & Node.js 22 LTS
# Healthcare Telemedicine Microservices Pipeline
# ==============================================================================

FROM jenkins/jenkins:lts

USER root

# Install essential dependencies, Docker CLI, and Docker Compose
RUN apt-get update && apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    docker.io \
    docker-cli \
    docker-compose \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS & npm for native pipeline test & build execution
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Add jenkins user to docker group to grant container management privileges
RUN usermod -aG docker jenkins || true

USER jenkins
