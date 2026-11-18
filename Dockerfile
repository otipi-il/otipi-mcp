# Runs the Otipi MCP server over stdio. No dependencies: Node.js only.
# Set OTIPI_KEY (sk_test_... is free) to use the tools; without it the server
# still starts and lists its tools.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.json ./
COPY src ./src
ENTRYPOINT ["node", "src/index.js"]
