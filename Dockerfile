# Use the official Node.js 10 image.
# https://hub.docker.com/_/node
FROM node:14.15.0-alpine3.12

# RUN apk add --no-cache tzdata
ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install production dependencies.
RUN npm install

# Copy local code to the container image.
ADD . /usr/src/app
RUN npm run compile
# ADD ./monitorConfig.yml ./build/src/CosmosMonitor
# TypeScript
# RUN npx tsc

# Run the web service on container startup.
CMD [ "npm", "start" ]
