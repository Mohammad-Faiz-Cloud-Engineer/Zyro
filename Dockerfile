FROM node:20-alpine

# Hugging Face Spaces specific instructions
# Set working directory
WORKDIR /app

# Copy package config
COPY package.json ./

# Because there are no dependencies, we can skip npm install
# But it is here if you ever add dependencies
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
