FROM node:22-alpine AS build

WORKDIR /app

COPY package.json yarn.lock vite.config.ts ./
COPY src ./src

RUN yarn install

RUN yarn build

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
