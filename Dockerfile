FROM node:16-slim

WORKDIR usr/src/app
COPY . .
RUN npm install
RUN npx lerna bootstrap
CMD [ "npm", "run", "dev" ]
