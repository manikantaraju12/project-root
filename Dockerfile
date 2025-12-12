# Use a Debian-based Node image to avoid apk issues on some hosts
FROM node:18-bullseye

# Install system build tools and git
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the project
COPY . .

# Precompile contracts (speeds up tests inside the container)
RUN npx hardhat compile

# Default command runs the test suite
CMD ["npx", "hardhat", "test"]
