# Base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 8080

# Start command (development mode with host binding)
CMD ["npm", "run", "dev", "--", "--host", "--port", "8080"]
