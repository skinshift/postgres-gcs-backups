FROM node:16-alpine AS build

WORKDIR /root

RUN apk add --update --no-cache npm

COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install

RUN npm run build

RUN npm prune --production

FROM node:16-alpine

WORKDIR /root

COPY --from=build /root/node_modules ./node_modules
COPY --from=build /root/dist ./dist

RUN apk add --update --no-cache postgresql-client~=15

ENTRYPOINT ["node", "dist/index.js"]