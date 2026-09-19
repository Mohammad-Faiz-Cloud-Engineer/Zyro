FROM node:20-alpine

# Hugging Face Spaces specific instructions
# Set working directory
WORKDIR /app

# Copy package config
COPY package.json ./

# No runtime dependencies today, so this is effectively a no-op besides creating node_modules.
# Kept so adding dependencies later does not require a Dockerfile change.
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Hugging Face Spaces runs on port 7860 by default
ENV PORT=7860
EXPOSE 7860

# Give permissions to the standard node user (UID 1000) for security
RUN chown -R node:node /app
USER node

# Start the proxy server
CMD ["npm", "start"]
