# base image for local development
FROM node:20
WORKDIR /app
COPY dist ./dist
COPY node_modules ./node_modules
CMD ["node", "./dist/index.js"]
