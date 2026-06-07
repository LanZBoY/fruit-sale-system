FROM node:22-alpine

WORKDIR /app

# argon2 需要編譯工具
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
