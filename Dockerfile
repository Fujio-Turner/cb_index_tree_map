FROM node:22-alpine
WORKDIR /app
COPY server.js index.html ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
