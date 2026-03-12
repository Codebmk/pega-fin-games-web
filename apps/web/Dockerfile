FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY . .

WORKDIR /app/apps/web
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
